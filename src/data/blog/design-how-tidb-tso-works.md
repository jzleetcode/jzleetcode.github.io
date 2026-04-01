---
author: JZ
pubDatetime: 2026-03-28T06:23:00Z
modDatetime: 2026-03-28T06:23:00Z
title: System Design - How TiDB TSO (Timestamp Oracle) Works
tags:
  - design-system
  - design-concurrency
description:
  "How TiDB's Timestamp Oracle (TSO) works: architecture, 64-bit timestamp layout, allocation algorithm, etcd persistence, client batching, and source code walkthrough from the tikv/pd repository."
---

## Table of contents

## Context

In a single-machine database, ordering events is simple: a single clock decides what happened first. In a distributed database like TiDB, nodes are spread across different machines, each with its own clock. These clocks drift apart (a problem called **clock skew**), so you cannot rely on any single node's wall-clock time to order transactions globally.

TiDB's transaction model is based on Google's [Percolator](https://research.google/pubs/large-scale-incremental-processing-using-distributed-transactions-and-notifications/) paper (2010). Percolator requires a **globally ordered timestamp** so that every transaction can get a unique, monotonically increasing number. This number decides:

- Which version of a row a transaction can see (**MVCC** — Multi-Version Concurrency Control).
- Whether two transactions conflict.
- When old versions can be garbage collected.

TiDB calls this timestamp generator the **TSO** (Timestamp Oracle). It lives inside the **Placement Driver** (PD), the central coordination server of a TiDB cluster.

```
                          TiDB Cluster Architecture

  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  │   TiDB      │   │   TiDB      │   │   TiDB      │    SQL layer
  │   Server    │   │   Server    │   │   Server    │    (stateless)
  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
         │                 │                 │
         │    GetTS()      │    GetTS()      │    GetTS()
         │                 │                 │
         └────────────┐    │    ┌────────────┘
                      │    │    │
                      v    v    v
                   ┌──────────────┐
                   │      PD      │
                   │  ┌────────┐  │
                   │  │  TSO   │  │    timestamp oracle
                   │  └────────┘  │
                   └──────┬───────┘
                          │
                   ┌──────┴───────┐
                   │    etcd      │    persists timestamp
                   │   (window)   │    window for safety
                   └──────────────┘

         ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
         │    TiKV     │  │    TiKV     │  │    TiKV     │   storage
         │    Store    │  │    Store    │  │    Store    │   layer
         └─────────────┘  └─────────────┘  └─────────────┘
```

Every TiDB server asks PD for a timestamp before starting or committing a transaction. PD hands back a 64-bit number that is guaranteed to be larger than any previously issued number. Let's look at how that number is structured.

## The 64-bit Timestamp Layout

A TSO timestamp is a single 64-bit unsigned integer split into two parts:

```
 Bit 63                    Bit 18  Bit 17                Bit 0
 ┌────────────────────────────────┬─────────────────────────────┐
 │         physical part          │       logical part          │
 │          (46 bits)             │        (18 bits)            │
 │   milliseconds since epoch     │   counter within the ms     │
 └────────────────────────────────┴─────────────────────────────┘
```

- **Physical part (upper 46 bits):** Unix timestamp in milliseconds. 46 bits gives us $2^{46}$ milliseconds $\approx$ 2,230 years from epoch, far beyond practical need.
- **Logical part (lower 18 bits):** An incrementing counter for timestamps issued within the same millisecond. 18 bits means up to $2^{18} = 262{,}144$ unique timestamps per millisecond.

Here is how the PD codebase encodes and decodes this in [`pkg/utils/tsoutil/tsoutil.go`](https://github.com/tikv/pd/blob/master/pkg/utils/tsoutil/tsoutil.go):

```go
const (
    physicalShiftBits = 18
    logicalBits       = (1 << physicalShiftBits) - 1 // 0x3FFFF
)

// ComposeTS builds a 64-bit timestamp from physical (ms) and logical parts.
func ComposeTS(physical, logical int64) uint64 {
    return uint64(physical)<<18 | uint64(logical)&0x3FFFF
}

// ParseTSUint64 extracts the physical and logical parts from a 64-bit timestamp.
func ParseTSUint64(ts uint64) (physical uint64, logical uint64) {
    logical = ts & logicalBits
    physical = ts >> physicalShiftBits
    return physical, logical
}
```

You can inspect a TSO value directly in SQL:

```sql
BEGIN;
SELECT @@tidb_current_ts;
-- e.g., 453338254815633409

-- extract physical part (ms since epoch)
SELECT @ts >> 18;

-- extract logical part
SELECT @ts & 0x3FFFF;

-- or use the built-in function
SELECT TIDB_PARSE_TSO(453338254815633409);
-- returns the wall-clock time
ROLLBACK;
```

## Architecture: PD Server and the TSO Allocator

The timestamp oracle is not a standalone service (though it can be deployed as a **TSO microservice** in newer versions). By default, it runs inside PD. Here is how the pieces fit together:

```
 ┌──────────────────────────────────────────┐
 │               PD Server                  │
 │                                          │
 │  ┌──────────────────────────────────┐    │
 │  │          Allocator               │    │
 │  │  ┌────────────────────────────┐  │    │
 │  │  │    timestampOracle         │  │    │
 │  │  │                            │  │    │
 │  │  │  physical: time.Time       │  │    │
 │  │  │  logical:  int64           │  │    │
 │  │  │  lastSavedTime: time.Time  │  │    │
 │  │  └────────────────────────────┘  │    │
 │  │                                  │    │
 │  │  allocatorUpdater goroutine      │    │
 │  │  (ticks every 50ms by default)   │    │
 │  └──────────────────────────────────┘    │
 │                                          │
 │  ┌──────────────────────────────────┐    │
 │  │  Leadership (via etcd lease)     │    │
 │  │  Only the leader serves TSO      │    │
 │  └──────────────────────────────────┘    │
 └──────────────────────────────────────────┘
```

**Key rule: only one PD node allocates timestamps at any time.** PD nodes elect a leader using etcd leases. Only the leader (or the TSO primary in microservice mode) runs the `Allocator`. This single-writer design is how TiDB avoids issuing duplicate or out-of-order timestamps.

The `Allocator` struct in [`pkg/tso/allocator.go`](https://github.com/tikv/pd/blob/master/pkg/tso/allocator.go) creates a background goroutine that periodically advances the physical clock:

```go
func (a *Allocator) allocatorUpdater() {
    defer a.wg.Done()

    tsTicker := time.NewTicker(a.cfg.GetTSOUpdatePhysicalInterval())
    defer tsTicker.Stop()

    for {
        select {
        case <-tsTicker.C:
            if !a.isServing() || !a.IsInitialize() {
                continue
            }
            if err := a.UpdateTSO(); err != nil {
                a.Reset(true)
                continue
            }
        case <-a.ctx.Done():
            a.Reset(false)
            return
        }
    }
}
```

Every tick (default 50ms), the allocator calls `UpdateTSO()`, which advances the in-memory physical time so that new timestamps can be allocated. Between ticks, timestamps are generated by incrementing the logical counter.

## The Core Algorithm

The heart of TSO lives in [`pkg/tso/tso.go`](https://github.com/tikv/pd/blob/master/pkg/tso/tso.go). Two functions work together:

### `generateTSO` — handing out timestamps

When a client requests `count` timestamps, `generateTSO` runs under a lock:

```go
func (t *timestampOracle) generateTSO(ctx context.Context, count int64) (physical int64, logical int64) {
    t.tsoMux.Lock()
    defer t.tsoMux.Unlock()
    if t.tsoMux.physical.Equal(typeutil.ZeroTime) {
        return 0, 0
    }
    physical = t.tsoMux.physical.UnixNano() / int64(time.Millisecond)
    t.tsoMux.logical += count
    logical = t.tsoMux.logical
    return physical, logical
}
```

The caller gets back `(physical_ms, logical)`. It then uses `ComposeTS` to build the final 64-bit value. The client actually receives a **range**: if it asked for `count = 5` and got back logical `= 10`, it owns timestamps with logical values 6, 7, 8, 9, 10 (all sharing the same physical).

### `updateTimestamp` — advancing the clock

The periodic tick calls `updateTimestamp`. This function decides **whether** and **how** to advance the physical time. It has three paths:

```
                    updateTimestamp()
                          │
                          v
                ┌─────────────────────┐
                │  jetLag = now -     │
                │       prevPhysical  │
                └─────────┬───────────┘
                          │
              ┌───────────┼───────────────┐
              │           │               │
              v           v               v
     jetLag > 1ms    logical >       otherwise
                     maxLogical/2
              │           │               │
              v           v               v
      ┌───────────┐ ┌──────────┐  ┌────────────┐
      │ sync to   │ │ advance  │  │  skip      │
      │ wall      │ │ physical │  │  (no etcd  │
      │ clock     │ │ by 1ms   │  │   write)   │
      │ (now)     │ │ to get   │  │            │
      │           │ │ more     │  │            │
      │           │ │ logical  │  │            │
      │           │ │ space    │  │            │
      └───────────┘ └──────────┘  └────────────┘
```

Here is the relevant source code, simplified for clarity:

```go
func (t *timestampOracle) updateTimestamp(purpose updatePurpose) (bool, error) {
    prevPhysical, prevLogical := t.getTSO()
    now := time.Now()
    jetLag := now.Sub(prevPhysical)

    var next time.Time
    if jetLag > updateTimestampGuard { // > 1ms
        // Path A: wall clock moved forward enough, sync to it
        next = now
    } else if prevLogical > maxLogical/2 { // > 131072
        // Path B: running low on logical space, force advance by 1ms
        next = prevPhysical.Add(time.Millisecond)
    } else {
        // Path C: plenty of logical space left, do nothing
        return false, nil
    }

    // If the etcd window is too tight, extend it
    if t.getLastSavedTime().Sub(next) <= updateTimestampGuard {
        if purpose != intervalUpdate {
            return true, nil // overflow updates cannot write to etcd
        }
        save := next.Add(t.saveInterval)
        if err := t.saveTimestamp(save); err != nil {
            return false, err
        }
        t.lastSavedTime.Store(save)
    }

    // Advance the in-memory physical time (never goes backward)
    return t.setTSOPhysical(next), nil
}
```

**Path A** is the normal case: wall clock advanced by at least 1ms since the last tick, so we jump forward.

**Path B** is a safety valve: even if the wall clock hasn't moved, we've used more than half of the 262,144 logical slots, so we proactively advance the physical time by 1ms to avoid running out.

**Path C** means everything is fine — enough logical space remains, no need to touch etcd.

## Handling Logical Overflow

What happens when the logical counter actually reaches $2^{18}$ (262,144)? This means we've exhausted all timestamps for the current millisecond. The `getTS` function handles this by retrying:

```go
func (t *timestampOracle) getTS(ctx context.Context, count uint32) (pdpb.Timestamp, error) {
    var resp pdpb.Timestamp
    for i := range maxRetryCount { // maxRetryCount = 10
        resp.Physical, resp.Logical = t.generateTSO(ctx, int64(count))

        if overflowedLogical(resp.GetLogical()) {
            // Logical part exceeded 2^18, need a new physical tick
            t.updateTimestamp(overflowUpdate)
            time.Sleep(t.updatePhysicalInterval)
            continue // retry with the new physical time
        }

        return resp, nil
    }
    return resp, errors.New("exceeded max retry")
}
```

A critical safety detail: **overflow-triggered updates are not allowed to write to etcd.** Why? If PD is receiving a burst of requests that keep overflowing, writing to etcd on every overflow would hammer etcd with writes and could cause cascading latency. Instead, only the regular periodic tick (`intervalUpdate`) persists to etcd. The overflow path just advances the in-memory clock and waits for the next periodic tick to persist.

## Persistence: etcd as the Safety Net

The in-memory `physical` and `logical` values are volatile. If PD crashes and restarts, those values are lost. etcd provides the safety net.

### The "window" concept

PD does not write every single timestamp to etcd. Instead, it saves a **timestamp window** — a time value that is always **ahead** of the current in-memory physical time:

```
 Timeline ──────────────────────────────────────────────────>

              in-memory                 saved in etcd
              physical                  (window edge)
                 │                          │
                 v                          v
   ─────────────●────────────────────────────●──────────────
                 │      saveInterval        │
                 │    (default 3 seconds)   │
                 │<────────────────────────>│

   Invariant: physical < savedTime (always)
```

If PD crashes and restarts, it loads the saved window from etcd and starts allocating from there. This means some timestamps in the gap are "wasted" (never issued), but **no timestamp is ever issued twice**. Wasting a few timestamps is a small price for crash safety.

### Startup: `syncTimestamp`

When a PD node becomes leader, it runs `syncTimestamp` before serving any requests:

```go
func (t *timestampOracle) syncTimestamp() error {
    last, err := t.storage.LoadTimestamp(t.keyspaceGroupID)
    if err != nil {
        return err
    }

    next := time.Now()

    // If system clock is behind the saved timestamp, start from saved + 1ms
    if next.Sub(last) < updateTimestampGuard {
        next = last.Add(updateTimestampGuard)
    }

    // Save a new window ahead of "next"
    save := next.Add(t.saveInterval)
    if err = t.saveTimestamp(save); err != nil {
        return err
    }
    t.lastSavedTime.Store(save)

    // Set the in-memory physical time
    t.setTSOPhysical(next)
    return nil
}
```

This handles the scenario where the system clock went backward (e.g., NTP correction). Instead of issuing timestamps in the past, PD starts from the saved value plus 1ms.

### Persisting to etcd: leadership check

The `SaveTimestamp` function in [`pkg/storage/endpoint/tso.go`](https://github.com/tikv/pd/blob/master/pkg/storage/endpoint/tso.go) runs inside an **etcd transaction** that checks two things:

1. **The caller is still the leader** (compares the leadership key).
2. **The new timestamp is strictly greater** than the previously saved one.

```go
func (se *StorageEndpoint) SaveTimestamp(ctx context.Context, groupID uint32, ts time.Time,
    leadership *election.Leadership) error {
    return se.RunInTxn(ctx, func(txn kv.Txn) error {
        // Verify leadership
        leaderValue, err := txn.Load(leadership.GetLeaderKey())
        if leaderValue != leadership.GetLeaderValue() {
            return errors.New("not leader")
        }
        // Verify monotonicity
        value, _ := txn.Load(keypath.TimestampPath(groupID))
        previousTS := parseTimestamp(value)
        if previousTS != ZeroTime && ts.Sub(previousTS) <= 0 {
            return errors.New("new timestamp <= previous")
        }
        // Persist
        data := Uint64ToBytes(uint64(ts.UnixNano()))
        return txn.Save(keypath.TimestampPath(groupID), string(data))
    })
}
```

If a stale leader tries to save (e.g., the old leader had a network partition), the transaction fails because the leadership key no longer matches. This prevents split-brain issues.

## Client-Side Batching

Each TiDB server embeds a PD client. When a transaction calls `GetTS()`, the request does not immediately fly off as a gRPC call. Instead, the client **batches** multiple requests together:

```
  TiDB Server
  ┌──────────────────────────────────────────────────┐
  │                                                  │
  │  goroutine A ──> GetTS()──┐                      │
  │                           │                      │
  │  goroutine B ──> GetTS()──┼──> tsoDispatcher     │
  │                           │   (collects a batch) │
  │  goroutine C ──> GetTS()──┘         │            │
  │                                     │            │
  │                            wait up to            │
  │                         MaxTSOBatchWaitInterval  │
  │                            (default 0)           │
  │                                     │            │
  │                                     v            │
  │                        ┌─────────────────┐       │
  │                        │  single gRPC:   │       │
  │                        │  GetTS(count=3) │       │
  │                        └────────┬────────┘       │
  └─────────────────────────────────┼────────────────┘
                                    │
                                    v
                             ┌─────────────┐
                             │     PD      │
                             │   (TSO)     │
                             └──────┬──────┘
                                    │
                         returns (physical, logical=X)
                                    │
                                    v
                     goroutine A gets (physical, X-2)
                     goroutine B gets (physical, X-1)
                     goroutine C gets (physical, X)
```

The [`client/clients/tso/dispatcher.go`](https://github.com/tikv/pd/blob/master/client/clients/tso/dispatcher.go) file implements this. The `tsoDispatcher` collects pending `GetTS()` requests from a channel, waits briefly for more to arrive (configurable via `MaxTSOBatchWaitInterval`), then sends a single gRPC call with the total count. When the response comes back, it distributes the timestamp range across all waiting goroutines.

This batching dramatically reduces the number of RPCs. Under high concurrency, hundreds of goroutines share a single round-trip to PD.

## How TSO Ensures Monotonicity

Five mechanisms work together to guarantee timestamps never go backward:

```
  Guarantee                         Where it is enforced
  ──────────────────────────────    ──────────────────────────────
  1. Single allocator               PD leader election (etcd lease)
  2. Physical only moves forward    setTSOPhysical() checks
                                    next > current before updating
  3. Logical increments under lock  generateTSO() holds tsoMux.Lock
  4. etcd window is monotonic       SaveTimestamp() transaction
                                    rejects new <= previous
  5. Physical < saved time          updateTimestamp() extends window
                                    before advancing physical
```

If any single mechanism fails (e.g., a stale leader tries to write), one of the others catches it. This defense-in-depth approach makes TSO robust against clock skew, network partitions, and leader failovers.

## Performance Considerations

With the default `tso-update-physical-interval` of **50ms**, PD can issue up to:

$$\frac{2^{18}}{0.05} = \frac{262{,}144}{0.05} = 5{,}242{,}880 \text{ timestamps/sec}$$

That's over **5 million timestamps per second** from a single PD leader. For most workloads, this is more than enough.

If you need more, you can lower the interval down to **1ms**, yielding up to 262 million timestamps per second. The trade-off is roughly **10% more CPU** usage on the PD node, based on PingCAP's benchmarks.

**NTP matters.** PD logs a warning when the jet lag (difference between wall clock and in-memory physical time) exceeds `3 * updatePhysicalInterval` and 150ms:

```
[WARN] clock offset, jet-lag: 200ms, prev-physical: ..., now: ...
```

If you see this, check your NTP configuration. Large clock jumps force PD to issue timestamps with unnecessarily large physical gaps, which wastes logical space and can trigger overflow retries.

## How TSO Fits into TiDB Transactions

Here is a simplified view of a TiDB transaction with TSO calls:

```
   Client          TiDB Server            PD (TSO)             TiKV
     │                 │                     │                   │
     │   BEGIN         │                     │                   │
     │────────────────>│                     │                   │
     │                 │    GetTS()          │                   │
     │                 │────────────────────>│                   │
     │                 │    start_ts = 100   │                   │
     │                 │<────────────────────│                   │
     │                 │                     │                   │
     │   SELECT ...    │                     │                   │
     │────────────────>│                     │                   │
     │                 │   Get(key, ts=100)  │                   │
     │                 │────────────────────────────────────────>│
     │                 │   value@version<=100│                   │
     │                 │<────────────────────────────────────────│
     │   result        │                     │                   │
     │<────────────────│                     │                   │
     │                 │                     │                   │
     │   UPDATE ...    │                     │                   │
     │────────────────>│   (buffered)        │                   │
     │                 │                     │                   │
     │   COMMIT        │                     │                   │
     │────────────────>│    GetTS()          │                   │
     │                 │────────────────────>│                   │
     │                 │   commit_ts = 200   │                   │
     │                 │<────────────────────│                   │
     │                 │                     │                   │
     │                 │   Prewrite(key, start_ts=100)           │
     │                 │────────────────────────────────────────>│
     │                 │   ok                │                   │
     │                 │<────────────────────────────────────────│
     │                 │   Commit(key, commit_ts=200)            │
     │                 │────────────────────────────────────────>│
     │                 │   ok                │                   │
     │                 │<────────────────────────────────────────│
     │   ok            │                     │                   │
     │<────────────────│                     │                   │
```

1. **BEGIN:** TiDB requests a `start_ts` from PD. This is the transaction's "snapshot" — it can only see data committed before `start_ts`.
2. **Reads:** TiKV uses `start_ts` to find the correct MVCC version of each key.
3. **Writes:** Buffered in TiDB until commit.
4. **COMMIT:** TiDB requests a `commit_ts` from PD, then runs a two-phase commit (2PC):
   - **Prewrite:** Locks the keys and writes tentative values at `commit_ts`.
   - **Commit:** Makes the writes visible to other transactions.

Because `commit_ts > start_ts` is always guaranteed by TSO monotonicity, transactions are properly serialized. A later transaction always sees the effects of an earlier committed transaction.

## References

1. TiDB docs, Timestamp Oracle (TSO) [doc](https://docs.pingcap.com/tidb/stable/tso)
2. Large-scale Incremental Processing Using Distributed Transactions and Notifications (Percolator) [paper](https://research.google/pubs/large-scale-incremental-processing-using-distributed-transactions-and-notifications/)
3. tikv/pd TSO implementation [`pkg/tso/tso.go`](https://github.com/tikv/pd/blob/master/pkg/tso/tso.go)
4. tikv/pd TSO allocator [`pkg/tso/allocator.go`](https://github.com/tikv/pd/blob/master/pkg/tso/allocator.go)
5. tikv/pd TSO utilities [`pkg/utils/tsoutil/tsoutil.go`](https://github.com/tikv/pd/blob/master/pkg/utils/tsoutil/tsoutil.go)
6. tikv/pd TSO storage [`pkg/storage/endpoint/tso.go`](https://github.com/tikv/pd/blob/master/pkg/storage/endpoint/tso.go)
7. tikv/pd TSO client dispatcher [`client/clients/tso/dispatcher.go`](https://github.com/tikv/pd/blob/master/client/clients/tso/dispatcher.go)
8. TSO configuration file reference [doc](https://docs.pingcap.com/tidb/stable/tso-configuration-file)
9. TiDB transaction overview [doc](https://docs.pingcap.com/tidb/stable/transaction-overview)
