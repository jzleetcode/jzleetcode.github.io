---
author: JZ
pubDatetime: 2026-09-01T06:23:00Z
modDatetime: 2026-09-01T06:23:00Z
title: System Design - How Content Delivery Networks (CDNs) Work
tags:
  - design-system
  - design-networking
description:
  "How Content Delivery Networks (CDNs) work: architecture, DNS-based routing, anycast, edge caching, cache hierarchies, TLS termination, cache invalidation strategies, and source code walkthrough from Varnish Cache."
---

## Table of contents

## Context

Imagine you have built a website in San Francisco, and a user in Tokyo loads your page. The request travels roughly 8,300 km across the Pacific Ocean. Even at the speed of light, the round-trip takes about 55 milliseconds just for physics — add in routing hops, TLS handshakes, and server processing, and you are looking at 200–400ms before the first byte arrives. Multiply that by dozens of assets (images, scripts, stylesheets), and the page feels slow.

A **Content Delivery Network (CDN)** solves this by placing copies of your content on servers distributed across the world. Instead of every request traveling to San Francisco, the CDN serves it from a nearby **edge server** — maybe one sitting in a Tokyo data center, just 5ms away.

```
  Without CDN                          With CDN

  User (Tokyo)                         User (Tokyo)
       |                                    |
       | ~200ms round trip                  | ~5ms round trip
       |                                    |
       v                                    v
  Origin Server                        Edge Server
  (San Francisco)                      (Tokyo)
                                            |
                                            | cache miss? ~200ms
                                            |
                                            v
                                       Origin Server
                                       (San Francisco)
```

CDNs are used by virtually every major website today. Cloudflare serves over 20% of all web traffic. Akamai has over 365,000 edge servers in more than 135 countries. AWS CloudFront, Fastly, and Google Cloud CDN are other major players.

But a CDN is much more than "a cache in front of your server." It is a distributed system that must solve routing, caching, invalidation, security, and load balancing — all at massive scale. Let us walk through how each piece works.

## How Requests Reach the Right Edge Server

The first problem: when a user types `www.example.com`, how does the browser end up talking to the nearest edge server instead of the origin? CDNs use two main techniques.

### DNS-Based Routing

The most common approach. When you configure a CDN, you point your domain's DNS to the CDN's nameservers. When a user resolves `www.example.com`, the CDN's authoritative DNS server looks at the **source IP** of the DNS resolver (or the EDNS Client Subnet extension, which carries the user's subnet) and returns the IP address of a nearby edge server.

```
  User (Tokyo)           DNS Resolver          CDN DNS Server         Edge (Tokyo)
       |                      |                      |                      |
       | resolve              |                      |                      |
       | www.example.com      |                      |                      |
       |--------------------->|                      |                      |
       |                      | query                |                      |
       |                      | www.example.com      |                      |
       |                      | (client subnet:      |                      |
       |                      |  203.0.113.0/24)     |                      |
       |                      |--------------------->|                      |
       |                      |                      |                      |
       |                      |  answer:             |                      |
       |                      |  198.51.100.42       |                      |
       |                      |  (Tokyo edge IP)     |                      |
       |                      |  TTL=60              |                      |
       |                      |<---------------------|                      |
       |                      |                      |                      |
       | 198.51.100.42        |                      |                      |
       |<---------------------|                      |                      |
       |                                                                    |
       | HTTPS GET /index.html                                              |
       |------------------------------------------------------------------->|
       |                                                                    |
       | 200 OK (from cache)                                                |
       |<-------------------------------------------------------------------|
```

The CDN DNS server maintains a mapping of IP ranges to geographic regions and picks the best edge based on proximity, server load, and health checks. The **low TTL** (often 30–60 seconds) ensures that if an edge goes down, DNS can quickly redirect traffic elsewhere.

The limitation of DNS routing is granularity. DNS resolvers often serve millions of users, so the CDN can only route at the resolver level, not the individual user level. EDNS Client Subnet (RFC 7871) partially fixes this by letting the resolver forward the client's subnet.

### Anycast Routing

A more elegant approach used by Cloudflare, Google, and others. In **anycast**, multiple edge servers around the world advertise the **same IP address** via BGP (Border Gateway Protocol). When a router sees multiple paths to the same IP, it picks the shortest one — which is typically the geographically closest.

```
  BGP Routing Table (simplified)

  Destination: 198.51.100.0/24

  +-------------------+------------------+------------------+
  |   Announced by    |   AS Path        |   Next Hop       |
  +-------------------+------------------+------------------+
  |  Tokyo Edge       |  AS13335         |  Tokyo IX        |
  |  Frankfurt Edge   |  AS13335 AS3356  |  Frankfurt IX    |
  |  Ashburn Edge     |  AS13335 AS7018  |  Ashburn IX      |
  +-------------------+------------------+------------------+

  Router in Tokyo picks "Tokyo Edge" (shortest AS path)
```

Anycast has a significant advantage over DNS routing: it works at the IP layer, so it handles **every** connection, including TCP and UDP. It also provides automatic failover — if a data center goes down and withdraws its BGP route, traffic shifts to the next-closest in seconds.

The trade-off is complexity. TCP connections are stateful, so if BGP routes shift mid-connection, packets might arrive at a different edge server that has no knowledge of the existing TCP state. CDNs mitigate this with **connection draining** (keeping old routes active briefly during transitions) and **TCP connection migration** techniques.

## The Edge Cache: How Caching Works

Once a request reaches the edge server, the CDN checks its local cache. This is where the real magic of a CDN lives.

### Cache Lookup

The edge server computes a **cache key** from the request — typically a hash of the URL, the `Host` header, and selected query parameters. It then checks its local cache (usually a combination of RAM and SSD):

```
  Cache Key Construction

  Request:
    GET /images/hero.jpg?v=42
    Host: www.example.com
    Accept-Encoding: gzip

  Cache key = hash(
    scheme   = "https"
    host     = "www.example.com"
    path     = "/images/hero.jpg"
    query    = "v=42"
    vary     = "Accept-Encoding:gzip"
  )

  = "ae3f...c712"
```

On a **cache hit**, the edge returns the stored response immediately. On a **cache miss**, it must fetch from the origin (or a mid-tier cache, which we will discuss shortly).

### Cache Headers: Who Decides What Gets Cached?

The origin server controls caching behavior through HTTP headers:

```
  HTTP/1.1 200 OK
  Cache-Control: public, max-age=86400, s-maxage=31536000
  ETag: "5d8c72a5edda8"
  Vary: Accept-Encoding
  Content-Type: image/jpeg

  (image bytes)
```

Key headers:

- **`Cache-Control: s-maxage=31536000`** — tells the CDN (shared cache) to keep this object for 1 year. The `s-maxage` directive overrides `max-age` for shared caches, letting you set a short browser cache (e.g., `max-age=3600`) but a long CDN cache.
- **`ETag`** — a fingerprint of the content. When the CDN's cached copy expires, it sends a conditional request (`If-None-Match: "5d8c72a5edda8"`) to the origin. If the content hasn't changed, the origin returns `304 Not Modified` (no body), saving bandwidth.
- **`Vary: Accept-Encoding`** — tells the CDN to store separate cached copies for different encodings (e.g., gzip vs. brotli vs. uncompressed).

### What Happens on a Cache Miss

When the edge does not have the content, it fetches from the origin. But what if 1,000 users simultaneously request the same uncached asset? Without protection, all 1,000 requests would hit the origin — a problem called **cache stampede** (or thundering herd).

CDNs solve this with **request coalescing** (also called **request collapsing**). When the first request for a cache key arrives, it proceeds to the origin. Subsequent requests for the same key are **queued** and served from the response of the first request:

```
  Request Coalescing (Thundering Herd Protection)

  Time -->

  req 1 ----+
  req 2 ----+--> [  coalesce  ] ---> origin fetch ---> response
  req 3 ----+        queue                                |
  req 4 ----+                                             |
                                                          v
  req 1 <---+                                        cache store
  req 2 <---+--- serve from cached response
  req 3 <---+
  req 4 <---+
```

Here is how Varnish Cache implements this. In [`bin/varnishd/cache/cache_req_fsm.c`](https://github.com/varnishcache/varnish-cache/blob/master/bin/varnishd/cache/cache_req_fsm.c), when a request encounters a cache miss, Varnish creates a **busy object** and other requests for the same key wait on it:

```c
static enum req_fsm_nxt
cnt_miss(struct worker *wrk, struct req *req)
{
    // ... lookup returned a miss ...

    // Create a busyobj — this signals to other threads
    // that a fetch is in progress for this object
    VRY_Prep(req);
    AZ(req->objcore->flags & OC_F_BUSY);
    req->objcore->flags |= OC_F_BUSY;

    // Begin the backend fetch
    (void)VBF_Fetch(wrk, req, req->objcore, req->stale_oc, VBF_NORMAL);

    // The fetch happens asynchronously. Other requests hitting
    // the same cache key will find OC_F_BUSY set and wait
    // in cnt_lookup() until the fetch completes.
    req->req_step = R_STP_FETCH;
    return (REQ_FSM_MORE);
}
```

When other requests arrive for the same key and find `OC_F_BUSY`, they enter a wait state in the lookup path rather than dispatching another origin fetch.

## Cache Hierarchy: Edge, Shield, and Origin

A flat architecture where every edge server independently fetches from the origin does not scale well. If you have 200 edge locations and a cache miss happens at each one, the origin gets 200 simultaneous requests for the same content.

CDNs solve this with a **tiered cache hierarchy**:

```
  Three-Tier Cache Hierarchy

  +--------+   +--------+   +--------+   +--------+   +--------+
  | Edge   |   | Edge   |   | Edge   |   | Edge   |   | Edge   |
  | Tokyo  |   | Seoul  |   | Sydney |   | London |   | NYC    |
  +---+----+   +---+----+   +---+----+   +---+----+   +---+----+
      |            |             |            |            |
      +-----+------+             +-----+------+            |
            |                          |                   |
            v                          v                   v
       +----------+              +----------+        +----------+
       | Shield   |              | Shield   |        | Shield   |
       | (Asia)   |              | (Europe) |        | (US)     |
       +----+-----+              +----+-----+        +----+-----+
            |                         |                    |
            +----------+--------------+--------------------+
                       |
                       v
                 +----------+
                 |  Origin  |
                 |  Server  |
                 +----------+

  Miss at Edge Tokyo:
    1. Check Edge Tokyo cache        -> MISS
    2. Check Shield Asia cache       -> MISS
    3. Fetch from Origin             -> 200 OK
    4. Store in Shield Asia cache
    5. Store in Edge Tokyo cache
    6. Return to user

  Miss at Edge Seoul (same object, moments later):
    1. Check Edge Seoul cache        -> MISS
    2. Check Shield Asia cache       -> HIT (cached from Tokyo's miss)
    3. Store in Edge Seoul cache
    4. Return to user
    (Origin never touched!)
```

The **shield** (or mid-tier / regional cache) acts as a funnel. Instead of each edge hitting the origin independently, misses from edges in the same region converge on a single shield server. This dramatically reduces origin load.

Cloudflare calls this feature **Tiered Cache**. AWS CloudFront calls it **Origin Shield**. The concept is the same: reduce origin fetches by aggregating cache misses through an intermediate layer.

## Cache Invalidation

Phil Karlton famously said there are only two hard things in computer science: cache invalidation and naming things. In CDNs, cache invalidation is indeed the hardest operational challenge.

### Time-Based Expiration (TTL)

The simplest approach: set `Cache-Control: max-age=3600` and the cached copy expires after one hour. After expiration, the next request triggers a revalidation (conditional GET with `If-None-Match` or `If-Modified-Since`).

```
  TTL-Based Expiration Timeline

  Time: 0s         3600s              3601s
         |            |                  |
         v            v                  v
    [cache store]  [object expires]  [next request]
         |                               |
         |                               v
         |                          conditional GET
         |                          If-None-Match: "abc"
         |                               |
         |                          +----+----+
         |                          |         |
         |                          v         v
         |                       304        200
         |                    Not Modified  New Content
         |                       |           |
         |                    reset TTL   replace cache
         |                    (same ETag)  (new ETag)
```

### Purge (Active Invalidation)

When content changes and you cannot wait for TTL expiration, you issue a **purge** request. This tells the CDN to immediately remove the object from all edge caches.

Most CDNs expose a purge API:

```bash
# Cloudflare purge by URL
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
  -H "Authorization: Bearer {token}" \
  -d '{"files":["https://www.example.com/images/hero.jpg"]}'

# Fastly instant purge by surrogate key
curl -X POST "https://api.fastly.com/service/{service_id}/purge/{surrogate_key}" \
  -H "Fastly-Key: {token}"
```

Fastly's **surrogate keys** (also called cache tags) are particularly powerful. You can tag cached objects with arbitrary labels (e.g., `product-123`, `category-shoes`) and purge all objects sharing a tag in a single API call. This avoids having to enumerate every URL.

### Stale-While-Revalidate

A hybrid approach that avoids both stale content and slow responses:

```
  Cache-Control: max-age=3600, stale-while-revalidate=86400

  Timeline:
  0s                3600s                    90000s
  |-- fresh -------->|-- stale-while -------->|-- truly stale -->
                     |   revalidate           |
                     |                        |
                     | serve stale instantly   | must revalidate
                     | + revalidate in         | before serving
                     |   background            |
```

During the `stale-while-revalidate` window, the CDN serves the stale cached copy immediately (fast response) while fetching a fresh copy from the origin in the background. The next request gets the updated version. This is defined in RFC 5861 and widely supported.

## TLS Termination at the Edge

CDNs terminate TLS (HTTPS) connections at the edge server, not the origin. This means the TLS handshake — which requires multiple round trips — happens over the short user-to-edge path rather than the long user-to-origin path:

```
  TLS Termination at Edge

  User (Tokyo)              Edge (Tokyo)              Origin (SF)
       |                         |                         |
       |--- TCP SYN ----------->|                         |
       |<-- TCP SYN+ACK -------|  (~5ms RTT)             |
       |--- TCP ACK ----------->|                         |
       |                         |                         |
       |--- ClientHello ------->|                         |
       |<-- ServerHello --------|                         |
       |<-- Certificate --------|                         |
       |--- Key Exchange ------>|                         |
       |<-- Finished -----------|                         |
       |--- Finished ---------->|                         |
       |                         |                         |
       | TLS established (~15ms) |                         |
       |                         |                         |
       |--- GET /page ---------->|                         |
       |                         |--- GET /page ---------->|
       |                         |  (pre-established conn, |
       |                         |   or new TLS over       |
       |                         |   persistent link)      |
       |                         |<-- 200 OK --------------|
       |<-- 200 OK -------------|                         |

  Without CDN, TLS handshake alone = ~110ms (2x RTT to SF)
  With CDN, TLS handshake = ~15ms (2x RTT to local edge)
```

CDNs also maintain **persistent connections** (connection pools) between the edge and origin, so the edge-to-origin leg often reuses an existing TCP+TLS connection rather than opening a new one for each request.

## Edge Computing: Running Code at the Edge

Modern CDNs go beyond caching static content. They let you run custom code at the edge:

- **Cloudflare Workers** — V8 isolates (the JavaScript engine from Chrome) running on every edge server. You can intercept requests, modify responses, or generate entire pages at the edge.
- **AWS CloudFront Functions / Lambda@Edge** — JavaScript functions triggered on CloudFront events (viewer request, origin request, etc.).
- **Fastly Compute** — WebAssembly-based edge compute platform.

This is useful for:
- A/B testing (route users to different variants without an origin round-trip)
- Authentication (validate JWTs at the edge)
- Personalization (inject user-specific headers before hitting the origin cache)
- API gateways (rate limiting, request transformation)

The key insight is that running logic at the edge avoids the latency penalty of going to the origin for decisions that can be made locally.

## Putting It All Together: Life of a CDN Request

Here is the complete journey of a request through a CDN:

```
  1. User types www.example.com in browser

  2. DNS Resolution
     Browser -> DNS Resolver -> CDN Authoritative DNS
     CDN DNS checks user's location (via EDNS Client Subnet)
     Returns IP of nearest edge (e.g., Tokyo edge)

  3. TCP + TLS Handshake
     Browser <-> Tokyo Edge (~5ms RTT)
     TLS 1.3 with 0-RTT if resuming = 1 round trip

  4. HTTP Request
     GET /page.html HTTP/2
     Host: www.example.com

  5. Edge Cache Lookup
     cache_key = hash("https", "www.example.com", "/page.html")

     +-- HIT? -------------------------+
     |                                 |
     | yes                             | no (MISS)
     v                                 v
  6a. Serve from cache              6b. Request coalescing
     Add Age header                    Already fetching? Wait.
     Return 200 OK                     First miss? Continue.
     (~1ms)                            |
                                       v
                                    7. Shield lookup
                                       Forward to Asia shield
                                       |
                                       +-- HIT? ------+
                                       |               |
                                       | no            | yes
                                       v               v
                                    8. Origin fetch  Return to edge
                                       TLS over       |
                                       persistent     v
                                       connection   Store at edge
                                       |            Return 200 OK
                                       v
                                    9. Origin responds 200 OK
                                       Store at shield
                                       Store at edge
                                       Return to user
```

## Performance Numbers

To get a sense of real-world impact, here are typical latencies:

```
  Scenario                               Latency (TTFB)
  -----------------------------------------+-----------
  Direct to origin (cross-continent)       | 200-400ms
  CDN edge hit (same city)                 |   5-20ms
  CDN shield hit (same continent)          |  30-60ms
  CDN miss (full origin fetch)             | 200-450ms
  CDN miss with connection reuse           | 150-300ms
```

Cache hit ratios for well-configured CDNs typically range from 85% to 99%. Even a 90% hit ratio means the origin handles only 10% of the original traffic, while 90% of users get sub-20ms response times.

## References

1. Cloudflare, How does a CDN work? [doc](https://www.cloudflare.com/learning/cdn/what-is-a-cdn/)
2. Nygren, E., Sitaraman, R.K., Sun, J. The Akamai Network: A Platform for High-Performance Internet Applications [paper](https://dl.acm.org/doi/10.1145/1842733.1842736)
3. Varnish Cache source, request FSM [`bin/varnishd/cache/cache_req_fsm.c`](https://github.com/varnishcache/varnish-cache/blob/master/bin/varnishd/cache/cache_req_fsm.c)
4. RFC 7234, Hypertext Transfer Protocol (HTTP/1.1): Caching [rfc](https://datatracker.ietf.org/doc/html/rfc7234)
5. RFC 5861, HTTP Cache-Control Extensions for Stale Content [rfc](https://datatracker.ietf.org/doc/html/rfc5861)
6. RFC 7871, Client Subnet in DNS Queries (EDNS) [rfc](https://datatracker.ietf.org/doc/html/rfc7871)
7. Cloudflare Tiered Cache [doc](https://developers.cloudflare.com/cache/how-to/tiered-cache/)
8. AWS CloudFront Origin Shield [doc](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-shield.html)
9. Fastly Surrogate Keys [doc](https://docs.fastly.com/en/guides/working-with-surrogate-keys)
10. Cloudflare Workers [doc](https://developers.cloudflare.com/workers/)
