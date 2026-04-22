---
author: JZ
pubDatetime: 2026-04-22T08:00:00Z
modDatetime: 2026-04-22T08:00:00Z
title: System Design - How Rate Limiting Works
featured: true
tags:
  - design-system
  - design-concurrency
description:
  "How rate limiting works: token bucket, leaky bucket, fixed window counter, and sliding window log/counter algorithms with ASCII diagrams, source code walkthrough from Nginx, Guava, and Redis, and practical trade-offs."
---

## Table of contents

## Why Rate Limiting?

Imagine you run a popular API. On a normal day, your servers handle 1,000 requests per second comfortably. One morning, a single client starts sending 50,000 requests per second — maybe a bug in their retry logic, maybe a denial-of-service attack. Without any protection, this flood drowns your servers, and **all** users suffer.

Rate limiting is the bouncer at the door. It counts how many requests each client has made recently and says "slow down" when they exceed a threshold. The goals are:

1. **Protect shared resources** — prevent one noisy client from degrading service for everyone.
2. **Enforce fairness** — ensure each client gets a reasonable share.
3. **Control costs** — cloud resources cost money; unbounded traffic means unbounded bills.
4. **Meet SLAs** — upstream dependencies (databases, third-party APIs) have their own limits.

```
Without rate limiting:

  Client A ============================>
  Client B ============================>     Server
  Client C ============================>  +---------+
  Client D ============================>  | OVERLOAD|
  Client E ============================>  | 503 503 |
  Client F ============================>  +---------+

With rate limiting:

  Client A ======>
  Client B ======>                          Server
  Client C ======>   [Rate Limiter]      +---------+
  Client D ==X        limit: 100/s       | Healthy |
  Client E ==X        429 Too Many       |  200 OK |
  Client F ==X                           +---------+
```

The HTTP status code **429 Too Many Requests** ([RFC 6585](https://datatracker.ietf.org/doc/html/rfc6585#section-4)) is the standard way to tell clients they've been throttled. A well-behaved rate limiter also sends a `Retry-After` header telling the client when to try again.

## Where Rate Limiting Lives

Rate limiting can be applied at multiple layers of a system:

```
  Client
    |
    v
+-------------------+
|  API Gateway /    |   Layer 1: edge rate limiting (Nginx, Envoy, AWS API Gateway)
|  Load Balancer    |   - per-IP, per-API-key limits
+--------+----------+
         |
         v
+-------------------+
|  Application      |   Layer 2: application-level (middleware in your web framework)
|  Server           |   - per-user, per-endpoint limits
+--------+----------+
         |
         v
+-------------------+
|  Database /       |   Layer 3: backend protection (connection pools, query throttling)
|  Downstream API   |   - per-service limits
+-------------------+
```

Each layer protects a different resource. Edge limiting stops floods before they reach your servers. Application limiting enforces business rules (e.g., free-tier users get 100 requests/hour). Backend limiting prevents your database from being overwhelmed.

Now let's look at the four most common algorithms.

## Algorithm 1: Fixed Window Counter

The simplest approach. Divide time into fixed windows (e.g., 1-minute intervals). Maintain a counter for each window. Increment on each request. Reject if the counter exceeds the limit.

```
  Window: 1 minute, Limit: 5 requests

  Time -->  12:00:00          12:01:00          12:02:00
            |--- window 1 ---|--- window 2 ---|--- window 3 ---|

  Requests: x x x x x X X    x x              x x x x x X
                      ^ ^                                  ^
                      rejected (count > 5)                 rejected
  Counter:  1 2 3 4 5 6 7    1 2              1 2 3 4 5 6
                    reset->0       reset->0          reset->0
```

### The Boundary Problem

Fixed windows have a well-known flaw: **burst at the boundary**. If a client sends 5 requests at 12:00:59 and 5 more at 12:01:00, they've sent 10 requests in 2 seconds while the limit is 5 per minute.

```
  The boundary burst problem:

          window 1                    window 2
  |---------------------------|-------------------------------|
                         5 reqs   5 reqs
                           ||       ||
                    12:00:59          12:01:01
                         <-- 2 seconds -->

  Both windows see count <= 5, so all 10 pass.
  But 10 requests in 2 seconds violates the spirit of "5 per minute."
```

Despite this flaw, fixed window counters are used widely because they're trivial to implement with a single counter per key. Redis makes this a one-liner:

```python
# Fixed window in Redis (pseudocode)
def is_allowed(client_id: str, limit: int, window_seconds: int) -> bool:
    key = f"rate:{client_id}:{int(time.time()) // window_seconds}"
    count = redis.incr(key)          # atomic increment, returns new value
    if count == 1:
        redis.expire(key, window_seconds)  # auto-cleanup after window ends
    return count <= limit
```

**Complexity:** Time $O(1)$ per request, Space $O(n)$ where $n$ is the number of active clients.

## Algorithm 2: Sliding Window Log

To fix the boundary problem, keep a **log of timestamps** for each request. When a new request arrives, remove all entries older than the window, then check if the remaining count is under the limit.

```
  Window: 60 seconds, Limit: 5

  Request log for client A (sorted timestamps):

  [12:00:10, 12:00:25, 12:00:40, 12:00:55, 12:01:05]

  New request at 12:01:10:
    1. Remove entries before 12:01:10 - 60s = 12:00:10
       -> remove 12:00:10 (it's exactly at the boundary, remove it)
       -> log becomes [12:00:25, 12:00:40, 12:00:55, 12:01:05]
    2. Count = 4, limit = 5
    3. 4 < 5 -> ALLOW, add 12:01:10 to log
       -> log becomes [12:00:25, 12:00:40, 12:00:55, 12:01:05, 12:01:10]
```

This is precise — no boundary bursts — but storing every timestamp is memory-intensive. For a client making 1,000 requests per minute, you store 1,000 timestamps per client.

In Redis, you can implement this with a sorted set:

```python
# Sliding window log in Redis
def is_allowed(client_id: str, limit: int, window_seconds: int) -> bool:
    now = time.time()
    key = f"rate:{client_id}"
    pipe = redis.pipeline()
    pipe.zremrangebyscore(key, 0, now - window_seconds)  # remove old entries
    pipe.zadd(key, {str(now): now})                       # add current request
    pipe.zcard(key)                                        # count remaining
    pipe.expire(key, window_seconds)                       # auto-cleanup
    results = pipe.execute()
    return results[2] <= limit
```

**Complexity:** Time $O(\log n)$ per request (sorted set operations), Space $O(n \cdot r)$ where $r$ is the request rate per client.

## Algorithm 3: Sliding Window Counter

A clever hybrid that combines the efficiency of fixed windows with the accuracy of sliding windows. Keep counters for the **current** and **previous** windows. Estimate the count in the sliding window using a weighted sum.

```
  Window: 60 seconds, Limit: 10

  Previous window (12:00 - 12:01): 8 requests
  Current window  (12:01 - 12:02): 3 requests so far

  Request arrives at 12:01:45 (75% through current window):

  Estimated count = prev * (1 - elapsed%) + current
                  = 8    * (1 - 0.75)     + 3
                  = 8    * 0.25           + 3
                  = 2    + 3
                  = 5

  5 <= 10 -> ALLOW

  Visually:

  |-------- prev window --------|-------- curr window ---------|
  12:00                   12:01 |                        12:02
                                |    *request at 12:01:45
                          25% of|    75% elapsed
                          prev  |
                          counts|
```

The intuition: if we're 75% through the current window, approximately 25% of the previous window's requests are still "within" our sliding window. This is an approximation, but Cloudflare's experiments showed it has **only 0.003% of requests wrongly allowed or rate-limited** compared to an exact sliding window.

This is the approach used by **Nginx** in its `ngx_http_limit_req_module`. Let's look at the core logic from [`ngx_http_limit_req_module.c`](https://github.com/nginx/nginx/blob/master/src/http/modules/ngx_http_limit_req_module.c):

```c
// Simplified from ngx_http_limit_req_lookup()
// lr->excess tracks how many requests exceed the allowed rate

ms = (ngx_msec_int_t) (now - lr->last);  // time since last request

if (ms < -60000) {
    ms = 1;  // clock went backward, treat as 1ms
} else if (ms < 0) {
    ms = 0;
}

// "excess" decays over time: subtract (elapsed_ms * rate)
// this is the "leaky bucket" / sliding window hybrid
excess = lr->excess - ctx->rate * ms / 1000 + 1000;
// ctx->rate is in units of requests per 1000 milliseconds

if (excess < 0) {
    excess = 0;  // floor at zero
}

if ((ngx_uint_t) excess > limit->burst) {
    return NGX_BUSY;  // reject: over the burst limit
}

lr->excess = excess;
lr->last = now;
```

Nginx uses a "leaky bucket as a meter" model: `excess` counts how many requests are above the steady-state rate. It drains at the configured rate as time passes. If `excess` exceeds the `burst` parameter, the request is rejected.

**Complexity:** Time $O(1)$ per request, Space $O(n)$ — just two counters per client.

## Algorithm 4: Token Bucket

The token bucket is perhaps the most widely used rate limiting algorithm. Picture a bucket that holds tokens. Tokens are added at a fixed rate. Each request consumes one token. If the bucket is empty, the request is rejected (or queued).

```
  Token Bucket: capacity = 5, refill rate = 1 token/second

  Time 0s: bucket = [* * * * *]  (full, 5 tokens)

  Request at 0.0s: take 1 token -> bucket = [* * * *  ]  (4 tokens) ALLOW
  Request at 0.1s: take 1 token -> bucket = [* * *    ]  (3 tokens) ALLOW
  Request at 0.2s: take 1 token -> bucket = [* *      ]  (2 tokens) ALLOW
  Request at 0.3s: take 1 token -> bucket = [*        ]  (1 token)  ALLOW
  Request at 0.4s: take 1 token -> bucket = [         ]  (0 tokens) ALLOW

  Request at 0.5s: bucket empty!  REJECT (429 Too Many Requests)
  Request at 0.6s: bucket empty!  REJECT

  ...1 second passes, 1 token added...

  Request at 1.5s: take 1 token -> bucket = [         ]  (0 tokens) ALLOW
```

The key properties of a token bucket:

- **Allows bursts:** A full bucket lets a client send up to `capacity` requests instantly.
- **Steady-state rate:** Over time, the client can only sustain `refill_rate` requests per second.
- **Two knobs:** `capacity` (burst size) and `refill_rate` (sustained rate) are independently configurable.

### Google Guava's RateLimiter

Google's Guava library provides a widely-used token bucket implementation in Java. The core class is [`SmoothRateLimiter`](https://github.com/google/guava/blob/master/guava/src/com/google/common/util/concurrent/SmoothRateLimiter.java). Here is how the `acquire()` path works, simplified from the source:

```java
// From Guava's SmoothRateLimiter (simplified)

// Called when a caller wants to acquire permits
public double acquire(int permits) {
    long microsToWait = reserve(permits);
    sleepMicrosUninterruptibly(microsToWait);  // block until tokens available
    return 1.0 * microsToWait / SECONDS.toMicros(1L);
}

// Reserve tokens, return how long the caller must wait
final long reserve(int permits) {
    synchronized (mutex()) {
        return reserveAndGetWaitLength(permits, readSafeMicros());
    }
}

// Core logic: refill tokens based on elapsed time, then consume
void resync(long nowMicros) {
    if (nowMicros > nextFreeTicketMicros) {
        // Calculate how many tokens we've earned since last request
        double newPermits = (nowMicros - nextFreeTicketMicros) / coolDownIntervalMicros();
        // Cap at max (bucket capacity)
        storedPermits = min(maxPermits, storedPermits + newPermits);
        nextFreeTicketMicros = nowMicros;
    }
}
```

A clever detail: Guava's `RateLimiter` uses **lazy refill**. It doesn't run a background thread to add tokens. Instead, when a request arrives, it calculates how many tokens should have been added since the last request based on elapsed time. This makes it zero-cost when idle.

```
  Lazy refill example:

  Bucket capacity: 10, rate: 2 tokens/sec

  Time 0.0s: acquire(1) -> storedPermits = 10, take 1 -> 9
  Time 0.5s: acquire(1) -> elapsed 0.5s, earn 1 token -> 10, take 1 -> 9
  ...
  Time 100s: acquire(1) -> elapsed 99.5s, earn 199 tokens
                           but cap at 10 -> 10, take 1 -> 9

  No background thread needed!
```

### Amazon and Stripe

AWS API Gateway and Stripe both use token bucket. AWS exposes two parameters in their [throttling documentation](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html):
- **Rate** (tokens per second): the steady-state throughput
- **Burst** (bucket size): the maximum concurrent requests

Stripe's API returns rate limit headers that map directly to token bucket state:

```
HTTP/1.1 200 OK
RateLimit-Limit: 100          # bucket capacity
RateLimit-Remaining: 42       # tokens left
RateLimit-Reset: 1624550400   # when bucket refills
```

**Complexity:** Time $O(1)$ per request, Space $O(n)$.

## Algorithm 5: Leaky Bucket

The leaky bucket is the dual of the token bucket. Instead of tokens filling a bucket, **requests fill the bucket** and drain out at a fixed rate, like water leaking from a hole in the bottom.

```
  Leaky Bucket: capacity = 5, drain rate = 1 request/second

        Incoming requests
             |  |  |
             v  v  v
         +----------+
         |  req 3   |  <- newest
         |  req 2   |
         |  req 1   |  <- oldest, draining next
         +----||----+
              ||
              vv        drain: process 1 request/second
           [output]
```

The key difference from token bucket: **leaky bucket smooths output**. Requests are processed at a perfectly constant rate, no matter how bursty the input is. Token bucket allows bursts up to the bucket capacity; leaky bucket never does.

```
  Token Bucket vs Leaky Bucket:

  Input:      ****      ****      ****     (bursts of 4)
               |         |         |
  Token       ****      ****      ****     (bursts pass through)
  Bucket:                                  allows burst up to capacity

  Leaky       * * * *   * * * *   * * * *  (smooth, constant rate)
  Bucket:                                  smooths all bursts
```

The leaky bucket is essentially a **FIFO queue** with a fixed drain rate. When the queue is full, new requests are dropped. This is exactly how network traffic shaping works — and it's the model behind Nginx's `limit_req` with the `nodelay` option disabled.

**Complexity:** Time $O(1)$ per request, Space $O(b)$ where $b$ is the bucket/queue capacity.

## Comparison

```
+---------------------+-------+--------+---------+---------+
|                     | Fixed | Sliding| Token   | Leaky   |
|                     |Window | Window | Bucket  | Bucket  |
+---------------------+-------+--------+---------+---------+
| Memory per client   | O(1)  | O(1)*  | O(1)    | O(b)    |
| Allows bursts       | Yes** | No     | Yes     | No      |
| Smooth output       | No    | No     | No      | Yes     |
| Boundary accuracy   | Poor  | Good   | Good    | Good    |
| Implementation      | Easy  | Medium | Medium  | Easy    |
+---------------------+-------+--------+---------+---------+
 * Sliding window counter variant; log variant is O(r)
 ** Unintentional bursts at window boundaries
```

## Distributed Rate Limiting

So far we've discussed single-node rate limiting. In a distributed system with multiple servers, each server has its own counter. A client sending requests to different servers could exceed the global limit.

```
  Problem: per-node counters don't add up

  Client A sends 100 req/s to each of 3 servers:

  Server 1: count = 100  (limit 200: OK)
  Server 2: count = 100  (limit 200: OK)
  Server 3: count = 100  (limit 200: OK)

  Total: 300 req/s but global limit should be 200!
```

### Solution 1: Centralized Store (Redis)

Use a shared Redis instance as the single source of truth. All servers read/write the same counters.

```
  Server 1 --+
  Server 2 --+--> Redis (shared counters) --> single global count
  Server 3 --+
```

This is the most common approach. Redis's atomic `INCR` and Lua scripting make it easy to implement any of the algorithms above atomically. The trade-off is that every request now requires a round-trip to Redis (typically 0.5-1ms on the same network).

Here is a token bucket implemented as a Redis Lua script (atomic):

```lua
-- Token bucket in Redis (Lua script for atomicity)
-- KEYS[1] = rate limit key
-- ARGV[1] = bucket capacity
-- ARGV[2] = refill rate (tokens per second)
-- ARGV[3] = current timestamp (seconds, floating point)
-- ARGV[4] = tokens to consume (usually 1)

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1]) or capacity   -- start full
local last_refill = tonumber(data[2]) or now

-- Refill tokens based on elapsed time
local elapsed = math.max(0, now - last_refill)
tokens = math.min(capacity, tokens + elapsed * rate)

if tokens >= requested then
    tokens = tokens - requested
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
    redis.call('EXPIRE', key, math.ceil(capacity / rate) * 2)
    return 1  -- allowed
else
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
    redis.call('EXPIRE', key, math.ceil(capacity / rate) * 2)
    return 0  -- rejected
end
```

### Solution 2: Local + Sync

Each server maintains a local counter and periodically syncs with a central store. This reduces latency but allows temporary over-admission. Stripe describes this approach in their [blog post on rate limiting](https://stripe.com/blog/rate-limiters):

```
  Each server:
  +------------------+
  |  local_count = 0 |---> every 1s, push to Redis
  |  local_limit = N |<--- every 1s, pull global count
  +------------------+

  Trade-off: up to (num_servers * local_limit) overshoot
             but zero latency for hot-path checks
```

### Solution 3: Approximate with Consistent Hashing

Route each client to a specific rate-limiting server using consistent hashing on the client ID. Each server handles a subset of clients, so no coordination is needed.

```
  hash(client_A) -> Server 1 (all of A's requests go here)
  hash(client_B) -> Server 2
  hash(client_C) -> Server 1

  No cross-server coordination needed!
  Downside: if a server fails, its clients get temporarily unlimited
```

## Common Response Headers

Well-designed APIs communicate rate limit state to clients via headers:

```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 30

RateLimit-Limit: 100           # max requests per window
RateLimit-Remaining: 0         # requests left in current window
RateLimit-Reset: 1624550430    # Unix timestamp when window resets

{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Please retry after 30 seconds."
}
```

The `RateLimit-*` headers are being standardized in [RFC 9110](https://datatracker.ietf.org/doc/html/rfc9110) and the [RateLimit header fields draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/).

## Practical Tips

1. **Use different limits for different endpoints.** A login endpoint should have a much lower limit than a read-only search endpoint.

2. **Rate limit by multiple dimensions.** Combine per-IP, per-user, and per-endpoint limits. A single dimension is easy to bypass (e.g., rotate IPs).

3. **Return 429, not 503.** A 503 tells clients "the server is broken." A 429 tells them "you're sending too much, slow down." Load balancers and CDNs treat these differently.

4. **Include Retry-After.** Without it, clients have to guess when to retry, often hammering the server with exponential backoff storms.

5. **Fail open vs. fail closed.** If your Redis rate limiter is down, do you allow all traffic (fail open) or block all traffic (fail closed)? Most services choose fail open — a brief period without rate limiting is better than total outage.

6. **Measure before limiting.** Don't guess your limits. Observe your p99 latencies under load, find the inflection point, and set limits with headroom.

## References

1. Nginx `limit_req` module [source](https://github.com/nginx/nginx/blob/master/src/http/modules/ngx_http_limit_req_module.c)
2. Google Guava `RateLimiter` [source](https://github.com/google/guava/blob/master/guava/src/com/google/common/util/concurrent/SmoothRateLimiter.java)
3. Stripe engineering blog, Rate limiters and load shedders [blog](https://stripe.com/blog/rate-limiters)
4. AWS API Gateway throttling [doc](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html)
5. Cloudflare blog, How we built rate limiting capable of scaling to millions of domains [blog](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)
6. RFC 6585 Section 4, 429 Too Many Requests [RFC](https://datatracker.ietf.org/doc/html/rfc6585#section-4)
7. IETF draft, RateLimit header fields for HTTP [draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)
8. System Design Interview by Alex Xu, Chapter 4: Design a Rate Limiter
