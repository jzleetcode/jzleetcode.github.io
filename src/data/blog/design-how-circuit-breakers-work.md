---
author: JZ
pubDatetime: 2026-06-21T08:00:00Z
modDatetime: 2026-06-21T08:00:00Z
title: System Design - How Circuit Breakers Work in Distributed Systems
tags:
  - design-system
  - design-reliability
description:
  "How circuit breakers protect distributed systems from cascading failures: state machine design, failure detection, recovery probing, and a source code walkthrough of real implementations."
---

## Table of contents

## Context

Imagine a microservices architecture where Service A calls Service B, which calls Service C. One day, Service C's database gets overloaded and starts timing out. Without protection, here is what happens:

```
  Service A        Service B        Service C        Database
     |                |                |                |
     |--- request --->|                |                |
     |                |--- request --->|                |
     |                |                |--- query ---->|
     |                |                |               | (overloaded)
     |                |                |     ...60s... |
     |                |                |<-- timeout ---|
     |                |<-- timeout ----|                |
     |<-- timeout ----|                |                |
     |                |                |                |
     (meanwhile, threads pile up in A and B,
      memory grows, queues fill, and eventually
      A and B crash too)
```

This is a **cascading failure**. One slow dependency takes down the entire call chain. Every request that A sends to B just piles up as blocked threads, consuming connection pools, memory, and CPU — even though the result will inevitably be an error.

The **circuit breaker** pattern, popularized by Michael Nygard in *Release It!* (2007), prevents this cascade. The idea is borrowed directly from electrical engineering: when a circuit draws too much current, a breaker trips and cuts the connection, protecting the rest of the system from damage.

## The State Machine

A circuit breaker is a finite state machine with three states:

```
                         success
                    +---------------+
                    |               |
                    v               |
              +----------+         |
              |  CLOSED  |         |
              | (normal) |         |
              +----+-----+         |
                   |               |
          failure threshold        |
              exceeded             |
                   |               |
                   v               |
             +-----------+         |
             |   OPEN    |         |
             | (failing) |         |
             +-----+-----+        |
                   |               |
            timeout expires        |
                   |               |
                   v               |
           +-------------+         |
           | HALF-OPEN   |---------+
           | (probing)   |
           +------+------+
                  |
              failure
                  |
                  v
             +-----------+
             |   OPEN    |
             | (restart  |
             |  timer)   |
             +-----------+
```

**CLOSED** — Normal operation. Requests flow through. The breaker counts failures. When failures exceed a threshold (e.g., 5 failures in 10 seconds), it **trips** to OPEN.

**OPEN** — Requests are **immediately rejected** without calling the downstream service. This is the key insight: instead of waiting 60 seconds for a timeout, the caller gets an instant error. After a configured timeout (e.g., 30 seconds), the breaker transitions to HALF-OPEN.

**HALF-OPEN** — The breaker allows a limited number of **probe requests** through. If they succeed, the downstream is considered recovered and the breaker resets to CLOSED. If they fail, it trips back to OPEN and the timer restarts.

## Why Not Just Use Timeouts?

Timeouts help individual requests, but they don't prevent resource exhaustion. Consider:

```
  Without circuit breaker:              With circuit breaker:
  (timeout = 5s)                        (open after 5 failures)

  Request 1: wait 5s... timeout         Request 1: wait 5s... timeout
  Request 2: wait 5s... timeout         Request 2: wait 5s... timeout
  Request 3: wait 5s... timeout         Request 3: wait 5s... timeout
  Request 4: wait 5s... timeout         Request 4: wait 5s... timeout
  Request 5: wait 5s... timeout         Request 5: wait 5s... timeout
  Request 6: wait 5s... timeout                    [BREAKER TRIPS]
  Request 7: wait 5s... timeout         Request 6: 0ms -> fail fast
  Request 8: wait 5s... timeout         Request 7: 0ms -> fail fast
  ...                                   Request 8: 0ms -> fail fast
  (threads accumulate, pool             ...
   exhausted, service dies)             (resources freed immediately,
                                         service stays healthy)
```

The circuit breaker **fails fast**, returning errors in microseconds instead of seconds. This keeps thread pools clear, response times low, and prevents the caller from dragging down the entire system.

## Counting Failures: Sliding Window

A naive failure counter (increment on failure, reset on success) doesn't capture the **rate** of failures well. Most production circuit breakers use a **sliding window**:

```
  Time-based sliding window (10 seconds, 10 buckets of 1s each)

  Bucket:  [t-9] [t-8] [t-7] [t-6] [t-5] [t-4] [t-3] [t-2] [t-1] [t-0]
  Fails:     0     1     0     2     3     5     4     6     8     7
  Success:   10    9     10    8     7     5     6     4     2     3
                                                              ^
                                              recent failures spike

  Total failures in window: 36
  Total requests in window: 100
  Failure rate: 36% -- if threshold is 50%, still closed
                        if threshold is 30%, trips open
```

Netflix's Hystrix (now in maintenance mode but hugely influential) used a bucketed ring buffer. Each bucket holds counts for a 1-second interval. As time advances, old buckets are discarded and new ones are created. This gives you a rolling view of the error rate without storing every individual request.

### The Ring Buffer Implementation

Here is how a sliding window counter typically works:

```
  Ring buffer (10 buckets, 1s each)

  Index:    0    1    2    3    4    5    6    7    8    9
          +----+----+----+----+----+----+----+----+----+----+
  Counts: | 3  | 1  | 0  | 5  | 2  |    |    |    |    |    |
          +----+----+----+----+----+----+----+----+----+----+
                                     ^
                                current (time % numBuckets)

  On new request at time T:
    bucket = (T / bucketDuration) % numBuckets
    if bucket is stale (belongs to a past rotation):
        reset bucket to zero
    increment bucket[success] or bucket[failure]
```

This is O(1) per request and O(n) to compute the aggregate — where n is the number of buckets, typically 10.

## Source Code: `gobreaker`

[`sony/gobreaker`](https://github.com/sony/gobreaker) is a widely-used Go circuit breaker. Let's trace through its core logic.

### State Representation

From [`gobreaker.go`](https://github.com/sony/gobreaker/blob/master/gobreaker.go):

```go
type State int

const (
    StateClosed   State = iota
    StateHalfOpen
    StateOpen
)

type CircuitBreaker struct {
    name          string
    maxRequests   uint32       // max allowed in half-open
    interval      time.Duration // sliding window size (closed state)
    timeout       time.Duration // how long to stay open
    readyToTrip   func(counts Counts) bool
    onStateChange func(name string, from State, to State)

    mutex      sync.Mutex
    state      State
    generation uint64
    counts     Counts
    expiry     time.Time
}

type Counts struct {
    Requests             uint32
    TotalSuccesses       uint32
    TotalFailures        uint32
    ConsecutiveSuccesses uint32
    ConsecutiveFailures  uint32
}
```

The `readyToTrip` function is the policy: you decide when the breaker should open. The default is "5 consecutive failures," but you can use any logic (error rate > 60%, total failures > 10, etc.).

### The Execute Path

When you call `cb.Execute(func() (interface{}, error))`, this is the flow:

```go
func (cb *CircuitBreaker) Execute(req func() (interface{}, error)) (interface{}, error) {
    // Step 1: Can we proceed?
    generation, err := cb.beforeRequest()
    if err != nil {
        return nil, err  // OPEN state -> immediate ErrOpenState
    }

    // Step 2: Run the actual call
    result, err := req()

    // Step 3: Record the outcome
    cb.afterRequest(generation, err == nil)
    return result, err
}
```

### `beforeRequest` — The Gate

```go
func (cb *CircuitBreaker) beforeRequest() (uint64, error) {
    cb.mutex.Lock()
    defer cb.mutex.Unlock()

    state, generation := cb.currentState(time.Now())

    if state == StateOpen {
        return generation, ErrOpenState
    }
    if state == StateHalfOpen && cb.counts.Requests >= cb.maxRequests {
        return generation, ErrTooManyRequests
    }

    cb.counts.Requests++
    return generation, nil
}
```

Three cases:
1. **CLOSED** — increment request counter, let it through.
2. **OPEN** — return `ErrOpenState` immediately. The caller gets an error in microseconds.
3. **HALF-OPEN** — allow through only if we haven't hit `maxRequests` probes yet.

### `afterRequest` — Recording Outcomes

```go
func (cb *CircuitBreaker) afterRequest(before uint64, success bool) {
    cb.mutex.Lock()
    defer cb.mutex.Unlock()

    now := time.Now()
    state, generation := cb.currentState(now)
    if generation != before {
        return // state changed while request was in flight, discard
    }

    if success {
        cb.onSuccess(state, now)
    } else {
        cb.onFailure(state, now)
    }
}

func (cb *CircuitBreaker) onFailure(state State, now time.Time) {
    switch state {
    case StateClosed:
        cb.counts.TotalFailures++
        cb.counts.ConsecutiveFailures++
        cb.counts.ConsecutiveSuccesses = 0
        if cb.readyToTrip(cb.counts) {
            cb.setState(StateOpen, now)
        }
    case StateHalfOpen:
        cb.setState(StateOpen, now)  // any failure in half-open -> back to open
    }
}

func (cb *CircuitBreaker) onSuccess(state State, now time.Time) {
    switch state {
    case StateClosed:
        cb.counts.TotalSuccesses++
        cb.counts.ConsecutiveSuccesses++
        cb.counts.ConsecutiveFailures = 0
    case StateHalfOpen:
        cb.counts.TotalSuccesses++
        cb.counts.ConsecutiveSuccesses++
        cb.counts.ConsecutiveFailures = 0
        if cb.counts.ConsecutiveSuccesses >= cb.maxRequests {
            cb.setState(StateClosed, now)  // enough probes succeeded -> close
        }
    }
}
```

Notice: in HALF-OPEN, **any single failure** immediately trips back to OPEN, but it requires `maxRequests` consecutive successes to close. This asymmetry is intentional — we're cautious about declaring recovery.

### State Transitions via Generations

The `generation` counter is a clever trick for handling races:

```go
func (cb *CircuitBreaker) currentState(now time.Time) (State, uint64) {
    switch cb.state {
    case StateClosed:
        if !cb.expiry.IsZero() && cb.expiry.Before(now) {
            cb.toNewGeneration(now)  // reset counts for new window
        }
    case StateOpen:
        if cb.expiry.Before(now) {
            cb.setState(StateHalfOpen, now)  // timeout expired -> half-open
        }
    }
    return cb.state, cb.generation
}
```

When the state changes, `generation` increments. If a request started in one generation but completes in another (because the state changed while it was in-flight), `afterRequest` detects the mismatch and discards the result. This prevents a slow request from the "old" open period from accidentally tripping the breaker again after it has already reset.

## Resilience4j: The JVM Equivalent

[Resilience4j](https://github.com/resilience4j/resilience4j) is the modern Java circuit breaker (successor to Hystrix). Its sliding window implementation uses two strategies:

```
  Count-based window:              Time-based window:
  (last N calls)                   (last N seconds)

  Ring of N measurements:          Ring of N partial aggregations:
  [success][failure][success]      [bucket_0][bucket_1]...[bucket_N-1]
  [failure][success]...            each bucket = 1 second of data

  Trip when:                       Trip when:
  failure_rate > threshold%        failure_rate > threshold%
  (over last N calls)              (over last N seconds)
```

From [`CircuitBreakerStateMachine.java`](https://github.com/resilience4j/resilience4j/blob/master/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java):

```java
public class CircuitBreakerStateMachine implements CircuitBreaker {
    private final AtomicReference<CircuitBreakerState> stateReference;

    // State transitions
    public void transitionToOpenState() {
        stateTransition(OPEN, newState -> new OpenState(this, newState));
    }

    public void transitionToHalfOpenState() {
        stateTransition(HALF_OPEN, newState -> new HalfOpenState(this));
    }

    public void transitionToClosedState() {
        stateTransition(CLOSED, newState -> new ClosedState(this));
    }
}
```

Each state is its own class implementing a `CircuitBreakerState` interface. The OPEN state schedules a timer for the transition to HALF-OPEN. The CLOSED state maintains the sliding window and checks the threshold on every call.

## Production Patterns

### Pattern 1: Fallback on Open

When the breaker is open, don't just throw an error — provide a **degraded response**:

```
  Normal flow:                    Degraded flow (breaker open):

  User -> API -> Recommendation   User -> API -> [breaker open]
                  Service                         |
                    |                              v
                    v                      Return cached/default
              ML model                    recommendations from
              inference                   a pre-computed list
```

```go
result, err := cb.Execute(func() (interface{}, error) {
    return recommendationService.GetPersonalized(userID)
})
if err != nil {
    // Fallback: return popular items instead of personalized ones
    return popularItemsCache.Get()
}
```

### Pattern 2: Per-Host Breakers

A single logical service may run on multiple hosts. A circuit breaker per host is more granular:

```
                    Service B
              +-------------------+
              |  Host 1 (healthy) |  <-- breaker CLOSED
              |  Host 2 (healthy) |  <-- breaker CLOSED
  Service A --+  Host 3 (DOWN)    |  <-- breaker OPEN
              |  Host 4 (healthy) |  <-- breaker CLOSED
              +-------------------+

  Requests skip Host 3 but continue to Hosts 1, 2, 4.
  Much better than breaking the entire Service B connection.
```

### Pattern 3: Circuit Breaker + Retry + Timeout

These three patterns compose in a specific order:

```
  +--------------------------------------------------+
  |  Circuit Breaker (outermost)                     |
  |                                                  |
  |   +------------------------------------------+  |
  |   |  Retry (with backoff, max 3 attempts)    |  |
  |   |                                          |  |
  |   |   +----------------------------------+   |  |
  |   |   |  Timeout (per attempt, e.g. 2s)  |   |  |
  |   |   |                                  |   |  |
  |   |   |   actual HTTP call               |   |  |
  |   |   |                                  |   |  |
  |   |   +----------------------------------+   |  |
  |   |                                          |  |
  |   +------------------------------------------+  |
  |                                                  |
  +--------------------------------------------------+

  Order matters:
  - Timeout wraps individual calls (2s per attempt)
  - Retry wraps timeout (3 attempts * 2s = 6s worst case)
  - Circuit breaker wraps retry (if 6s * N requests all fail,
    trip the breaker and stop trying entirely)
```

If you put the circuit breaker inside the retry, the retry would keep hitting a tripped breaker. If you put the timeout outside the retry, you'd timeout the entire retry sequence rather than individual attempts.

### Pattern 4: Bulkhead + Circuit Breaker

A **bulkhead** limits concurrency to a dependency. Combined with a circuit breaker:

```
  Thread Pool (bulkhead = 10 threads)
  +----+----+----+----+----+----+----+----+----+----+
  | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 |T10|
  +----+----+----+----+----+----+----+----+----+----+
    |    |    |    |    |    |         (3 idle)
    v    v    v    v    v    v
  +--Circuit Breaker-----------+
  |  calls to Service X        |
  +----------------------------+

  Even if Service X is slow:
  - At most 10 threads are blocked (bulkhead)
  - After threshold failures, breaker opens (circuit breaker)
  - Remaining 90 threads serve other dependencies
```

The bulkhead prevents a slow dependency from consuming all threads, and the circuit breaker detects the failure and stops sending requests entirely.

## Tuning Guide

Choosing the right parameters requires understanding your traffic and SLOs:

```
  Parameter           Typical Range        Trade-off
  -----------------  -------------------  ----------------------------------
  Failure threshold   50-80% error rate    Too low: false trips on transient
                      or 5-10 consecutive  Too high: slow to protect
                      failures

  Open timeout        10-60 seconds        Too short: probe too early, trip again
                                           Too long: stay degraded unnecessarily

  Half-open probes    1-5 requests         Too few: one lucky success closes
                                           Too many: slow recovery

  Sliding window      10-60 seconds        Too short: noisy, trips on bursts
                      or 10-100 calls      Too long: slow to detect failures
```

A common starting point:
- **Failure rate threshold:** 50% over a 10-second window
- **Open duration:** 30 seconds
- **Half-open probes:** 3 consecutive successes required
- **Sliding window:** count-based, last 20 calls

## Common Pitfalls

**1. Shared breakers across unrelated paths.** If `/api/search` and `/api/checkout` both go through one breaker to Service B, a failure in search trips the breaker for checkout too. Use separate breakers per logical operation.

**2. Not distinguishing error types.** A 400 Bad Request means your request was wrong — it's not the downstream's fault. Only count 5xx errors, timeouts, and connection failures. Don't count client errors or business-logic rejections.

**3. No monitoring.** A tripped breaker is an operational event. Alert on state changes:

```
  circuit_breaker_state{service="payment", state="open"} 1
  circuit_breaker_state{service="payment", state="closed"} 0
  circuit_breaker_transitions_total{service="payment", to="open"} 47
```

**4. Fixed open duration in all environments.** In testing, 30 seconds is an eternity. Make the timeout configurable and short in dev/staging.

## Real-World: How Envoy Implements Outlier Detection

Envoy proxy implements a form of circuit breaking called **outlier detection** at the infrastructure level. Instead of application code, the proxy automatically ejects unhealthy hosts:

```
  Load Balancer (Envoy)
  +--------------------------------------------------+
  |                                                  |
  |  Upstream cluster: "service-b"                   |
  |                                                  |
  |  Host 10.0.1.1:8080  [healthy]   weight: 100    |
  |  Host 10.0.1.2:8080  [healthy]   weight: 100    |
  |  Host 10.0.1.3:8080  [EJECTED]   weight: 0      |
  |  Host 10.0.1.4:8080  [healthy]   weight: 100    |
  |                                                  |
  |  Outlier detection config:                       |
  |    consecutive_5xx: 5                            |
  |    interval: 10s                                 |
  |    base_ejection_time: 30s                       |
  |    max_ejection_percent: 50                      |
  |                                                  |
  +--------------------------------------------------+
```

Key difference from application-level breakers: Envoy ejects individual hosts, not the entire service. And `max_ejection_percent` ensures you never eject more than half the hosts — even if they're all failing, you keep trying some of them to detect recovery.

## Summary

A circuit breaker is a state machine that sits between a caller and a dependency. It monitors failure rates, and when things go wrong, it **fails fast** — protecting both the caller (from resource exhaustion) and the dependency (from being overwhelmed by retries during recovery).

```
  Without breaker:                    With breaker:

  Failure                             Failure
    |                                   |
    v                                   v
  Timeout accumulation                Breaker trips (fast)
    |                                   |
    v                                   v
  Thread exhaustion                   Instant errors returned
    |                                   |
    v                                   v
  Cascading failure                   System stays healthy
    |                                   |
    v                                   v
  Full outage                         Auto-recovery probe
                                        |
                                        v
                                      Gradual restoration
```

The pattern is simple but the details matter: what counts as a failure, how wide the window is, how many probes to send, and what fallback to provide. Get these right, and your distributed system gains an immune response — detecting infection early and isolating it before it spreads.

## References

1. Michael Nygard, *Release It!* (2007) — the book that popularized the circuit breaker pattern for software
2. Martin Fowler, Circuit Breaker [article](https://martinfowler.com/bliki/CircuitBreaker.html)
3. sony/gobreaker — Go circuit breaker implementation [`gobreaker.go`](https://github.com/sony/gobreaker/blob/master/gobreaker.go)
4. Resilience4j — JVM circuit breaker [docs](https://resilience4j.readme.io/docs/circuitbreaker)
5. Netflix Hystrix (archived) — original Java circuit breaker [wiki](https://github.com/Netflix/Hystrix/wiki/How-it-Works)
6. Envoy proxy outlier detection [docs](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/outlier)
7. Microsoft Azure — Circuit Breaker pattern [docs](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)
