---
author: JZ
pubDatetime: 2026-10-10T18:32:00Z
modDatetime: 2026-10-10T18:32:00Z
title: System Design - How TiDB Async Commit Works in Source Code
tags:
  - design-system
  - design-database
  - design-tidb
  - design-concurrency
description: "A focused source walkthrough of TiDB Async Commit: how a SQL COMMIT reaches tikv/client-go, how TiKV stores async-commit lock metadata and a minimum commit timestamp, and why TiDB can acknowledge before background lock finalization."
---

## Table of contents

- [What is being optimized?](#what-is-being-optimized)
- [Follow COMMIT through the code](#follow-commit-through-the-code)
- [How the async path is selected](#how-the-async-path-is-selected)
- [What TiKV records during prewrite](#what-tikv-records-during-prewrite)
- [When the SQL statement can return](#when-the-sql-statement-can-return)
- [Configuration to know](#configuration-to-know)
- [References](#references)

## What Is Being Optimized?

TiDB uses optimistic transactions backed by TiKV. In ordinary two-phase commit, the client first asks TiKV regions to prewrite locks, then obtains a commit timestamp and sends a commit request. A previous [2PC overview](./design-how-two-phase-commit-works.md) explains that general protocol and TiDB's primary-key model.

This post looks at a narrower implementation detail: **Async Commit** can let the SQL client report success after all participating regions have accepted their prewrite requests, without waiting for the usual timestamp-and-commit exchange. The transaction's commit timestamp is constrained by metadata collected during prewrite. Lock finalization can then continue in the background.

That is not the same as merely committing secondary keys asynchronously after a conventional primary-key commit. In this optimized path, the client can acknowledge the transaction before it sends the background commit requests. To see how that is safe, follow five source types: TiDB's `session` and `LazyTxn`, the `twoPhaseCommitter` in `tikv/client-go`, and TiKV's `Prewriter` and `Lock`.

One repository boundary matters: TiDB calls its transaction client, but the protocol coordinator is implemented in the separate [`tikv/client-go`](https://github.com/tikv/client-go) repository. TiKV receives the requests and applies the MVCC changes. This walkthrough follows both the `pingcap/tidb` and `tikv/tikv` sides rather than implying that the entire protocol lives in TiDB's SQL repository.

## Follow COMMIT Through the Code

At the SQL layer, `session.doCommit` runs checks and eventually calls `commitTxnWithTemporaryData`. The session's `LazyTxn.Commit` marks the transaction as committing and delegates to the underlying transaction. The TiDB transaction driver then calls the `tikv/client-go` transaction's `Commit` method.

```text
SQL: COMMIT
   |
   v
TiDB session.doCommit()
   |
   v
LazyTxn.Commit() -> TiDB transaction driver -> client-go KVTxn.Commit()
                                                     |
                                                     v
                                      twoPhaseCommitter.execute()
                                                     |
                         PREWRITE requests by region, with async metadata
                                                     |
                                                     v
                                          TiKV Prewriter
                                      writes MVCC Lock records
                                                     |
                         all prewrites succeed; choose a safe commit_ts
                                                     |
                           return success to the SQL caller
                                                     |
                         client-go commits locks in the background
```

TiDB's `session.doCommit` and `LazyTxn.Commit` are deliberately thin at the storage boundary. The code that decides whether to attempt Async Commit and prepares the request lives in `tikv/client-go`'s `twoPhaseCommitter`.

## How the Async Path Is Selected

`twoPhaseCommitter.execute` does not blindly use Async Commit for every transaction. It checks eligibility before prewrite. The current client code excludes cases such as local-scope transactions, shared locks, pipelined transactions, a configured commit-timestamp upper-bound check, and binlog writes. It also applies transaction key-count and total-key-size limits.

When eligible, the committer sets the async flag. The prewrite request for the primary includes the transaction's secondary keys; the requests for all participating regions carry the async-commit option. TiKV returns a `min_commit_ts` for each prewrite. The client keeps the maximum value it learns, because the final timestamp must satisfy every participating lock's lower bound.

If TiKV returns zero for a minimum commit timestamp, the client can fall back to the ordinary commit path. That fallback is a correctness feature: the optimization is optional, and an ineligible transaction still has a normal protocol to use.

## What TiKV Records During Prewrite

TiKV's `Prewriter` handles a region's prewrite command and uses the prewrite action to build a lock. An async-commit lock records more than “this key is busy”:

- The transaction's `start_ts` identifies the snapshot that began the transaction.
- `min_commit_ts` is a lower bound: the transaction must not become visible at an earlier timestamp.
- `use_async_commit` identifies the protocol used for this lock.
- The primary lock carries the secondary-key list needed to reason about the transaction as a whole.

While constructing the lock, TiKV calculates a safe lower bound using the concurrency manager's observed timestamp and the transaction timestamps. The source computes a value at least one greater than the relevant observed, start, and for-update timestamps. The exact value can differ by key or region; the client takes the maximum returned value for a single transaction-wide `commit_ts`.

```text
Primary region                         Other region(s)
---------------                        ---------------
Lock(primary key)                      Lock(secondary key)
  start_ts                               start_ts
  min_commit_ts                          min_commit_ts
  use_async_commit                       use_async_commit
  secondaries = [k2, k3, ...]            primary = k1
```

The lock metadata is the bridge between an early client response and later storage cleanup. A reader or recovery path that encounters a lock can use the primary/secondary information and timestamp constraints to resolve the transaction; correctness does not depend on the original TiDB session remaining alive to finish every lock conversion.

## When the SQL Statement Can Return

After every prewrite succeeds, client-go uses the maximum collected `min_commit_ts` as the transaction's commit timestamp. If the async path remains valid, `twoPhaseCommitter.execute` marks the transaction successful for its caller and spawns background work to send commit requests for the mutations. Those requests turn lock records into committed MVCC writes and finish cleanup.

So the latency improvement is at the acknowledgment boundary: the caller does not wait for the extra foreground commit phase. The protocol still has storage work to finish, and the locks carry enough metadata for readers and recovery to handle the interval before that work completes.

This is also distinct from one-phase commit (1PC). TiKV's prewrite command documents 1PC as a different option for a transaction contained in one region. Async Commit is useful across regions when its eligibility checks pass; 1PC is a separate path with separate constraints.

## Configuration to Know

- `tidb_enable_async_commit` controls whether TiDB allows the client to try the optimization. The current TiDB system-variable documentation lists it as enabled by default for new clusters, while clusters upgraded from older versions can retain it as disabled. Check the effective session/global value rather than assuming every cluster has the same setting.
- `tikv-client.async-commit` limits such as key count and total key size also matter. The client source checks them before choosing the protocol; the system variable does not force an oversized transaction onto the optimized path.
- TiKV's `enable-async-apply-prewrite` is a separate server-side latency option documented as disabled by default. It affects when TiKV responds relative to applying prewrite work; it does not select the transaction protocol, so do not confuse it with `tidb_enable_async_commit`.
- `tidb_enable_1pc` is a separate optimization for the one-region case. It is not another name for Async Commit.

For a quick mental model: the SQL variable permits trying Async Commit, client-go checks the transaction's shape and limits, and TiKV persists the lock metadata that makes the early acknowledgment safe.

## References

The source links below pin the walkthrough to the repository revisions inspected for this article.

1. TiDB [`session.doCommit` and `session.CommitTxn`](https://github.com/pingcap/tidb/blob/788ad51619dd42c2e84c2e329a6e0a5e9a6461e6/pkg/session/session.go#L533-L594), and [`LazyTxn.Commit`](https://github.com/pingcap/tidb/blob/788ad51619dd42c2e84c2e329a6e0a5e9a6461e6/pkg/session/txn.go#L406-L448).
2. `tikv/client-go` [`twoPhaseCommitter.checkAsyncCommit`](https://github.com/tikv/client-go/blob/6a6e26b50af442e33fdaf139e5df796fce3c26c1/txnkv/transaction/2pc.go#L1577-L1608), [`execute` protocol selection](https://github.com/tikv/client-go/blob/6a6e26b50af442e33fdaf139e5df796fce3c26c1/txnkv/transaction/2pc.go#L1741-L1821), and [Async Commit acknowledgment/background commit](https://github.com/tikv/client-go/blob/6a6e26b50af442e33fdaf139e5df796fce3c26c1/txnkv/transaction/2pc.go#L2045-L2068).
3. `tikv/client-go` [async request fields and `min_commit_ts` response handling](https://github.com/tikv/client-go/blob/6a6e26b50af442e33fdaf139e5df796fce3c26c1/txnkv/transaction/prewrite.go#L191-L201) and [fallback behavior](https://github.com/tikv/client-go/blob/6a6e26b50af442e33fdaf139e5df796fce3c26c1/txnkv/transaction/prewrite.go#L653-L675).
4. TiKV [`Prewrite` request shape](https://github.com/tikv/tikv/blob/5f7037a4adfb9d18e3c44778ab051bb55a3a233c/src/storage/txn/commands/prewrite.rs#L46-L79), [async lock construction and timestamp calculation](https://github.com/tikv/tikv/blob/5f7037a4adfb9d18e3c44778ab051bb55a3a233c/src/storage/txn/actions/prewrite.rs#L698-L726), and [`Lock` metadata and encoding](https://github.com/tikv/tikv/blob/5f7037a4adfb9d18e3c44778ab051bb55a3a233c/components/txn_types/src/lock.rs#L87-L104).
5. [TiDB system variables](https://docs.pingcap.com/tidb/stable/system-variables/#tidb_enable_async_commit), [TiKV configuration](https://docs.pingcap.com/tidb/stable/tikv-configuration-file/), and [TiDB transaction overview](https://docs.pingcap.com/tidb/stable/transaction-overview/).
