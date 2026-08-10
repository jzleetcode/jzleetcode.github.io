---
author: JZ
pubDatetime: 2026-08-10T09:00:00Z
modDatetime: 2026-08-10T09:00:00Z
title: System Design - How Load Balancers Work
tags:
  - design-system
  - design-networking
description:
  "How load balancers work: L4 vs L7, algorithms (round-robin, least-connections, consistent hashing), health checks, connection draining, and source code walkthrough from HAProxy and Nginx."
---

## Table of contents

## Context

Imagine a single web server handling all traffic for a growing application. At first, it works fine. Then traffic doubles, triples, and eventually the server cannot keep up — requests queue, latency spikes, and users see errors. The obvious solution is to add more servers. But how does a client know which server to talk to?

A **load balancer** sits between clients and a pool of backend servers (often called **upstreams** or **backends**). It accepts incoming connections, picks a healthy backend, and forwards the request. From the client's perspective, it talks to a single endpoint. From the backend's perspective, work arrives in manageable chunks.

```
                        Load Balancer Overview

   +--------+    +--------+    +--------+
   | Client |    | Client |    | Client |
   +---+----+    +---+----+    +---+----+
       |             |             |
       +------+------+------+------+
              |             |
              v             v
       +---------------------------+
       |      Load Balancer        |
       |                           |
       |  - accepts connections    |
       |  - picks a backend        |
       |  - forwards traffic       |
       +--+--------+--------+-----+
          |        |        |
          v        v        v
     +--------+ +--------+ +--------+
     |Backend | |Backend | |Backend |
     |   A    | |   B    | |   C    |
     +--------+ +--------+ +--------+
```

Load balancers appear at every layer of modern infrastructure: DNS, network edge, service mesh sidecars, and application-layer reverse proxies. Understanding how they work is essential for designing reliable distributed systems.

## L4 vs L7: Two Layers of Balancing

Load balancers operate at different layers of the OSI network model. The two most common are **Layer 4** (transport) and **Layer 7** (application).

### Layer 4 (Transport)

An L4 load balancer works at the TCP/UDP level. It sees source IP, destination IP, and port numbers — but **not** the contents of the request (no HTTP headers, no URLs, no cookies). It makes routing decisions based solely on connection-level information.

```
                    L4 Load Balancer Decision

  Client packet arrives:
  +----------------------------------------------+
  | IP Header: src=10.0.0.5  dst=VIP(10.0.1.1)  |
  | TCP Header: src_port=49152  dst_port=443     |
  | Payload: [encrypted/opaque to L4]            |
  +----------------------------------------------+
                          |
                          v
              Pick backend by (src_ip, src_port,
                              dst_ip, dst_port, protocol)
                          |
                          v
  Forward entire TCP connection to Backend B
```

Because L4 doesn't inspect payloads, it's extremely fast. Linux's **IPVS** (IP Virtual Server) and cloud providers' network load balancers (AWS NLB, GCP Network LB) work at this layer. They can handle millions of connections per second with minimal overhead.

### Layer 7 (Application)

An L7 load balancer terminates the TCP connection, parses the application protocol (usually HTTP), and routes based on rich content: URL paths, headers, cookies, request bodies.

```
                    L7 Load Balancer Decision

  Client HTTP request arrives:
  +----------------------------------------------+
  | GET /api/users/42 HTTP/1.1                   |
  | Host: app.example.com                        |
  | Cookie: session=abc123                       |
  +----------------------------------------------+
                          |
                          v
         Parse HTTP, inspect path + headers
                          |
          +---------------+---------------+
          |                               |
   /api/* routes to            /static/* routes to
   API backend pool            CDN/cache pool
```

L7 balancers like **Nginx**, **HAProxy**, and **Envoy** provide fine-grained control. They can do path-based routing, header injection, request rewriting, rate limiting, and TLS termination — but at the cost of more CPU and memory per connection.

## Load Balancing Algorithms

The algorithm determines **which backend receives the next request**. Different algorithms optimize for different goals.

### Round Robin

The simplest algorithm. Requests go to backends in order: A, B, C, A, B, C, ...

```
  Request 1 --> Backend A
  Request 2 --> Backend B
  Request 3 --> Backend C
  Request 4 --> Backend A
  Request 5 --> Backend B
  ...
```

Here is how Nginx implements round robin in its upstream module ([`src/http/ngx_http_upstream_round_robin.c`](https://github.com/nginx/nginx/blob/master/src/http/ngx_http_upstream_round_robin.c)):

```c
static ngx_http_upstream_rr_peer_t *
ngx_http_upstream_get_peer(ngx_http_upstream_rr_peer_data_t *rrp)
{
    ngx_http_upstream_rr_peer_t  *peer, *best;
    best = NULL;

    for (peer = rrp->peers->peer; peer; peer = peer->next) {
        if (peer->down) {
            continue;
        }

        peer->current_weight += peer->effective_weight;

        if (best == NULL || peer->current_weight > best->current_weight) {
            best = peer;
        }
    }

    if (best == NULL) {
        return NULL;
    }

    best->current_weight -= rrp->peers->total_weight;
    return best;
}
```

Nginx actually implements **weighted round robin** using a "smooth" algorithm. Each peer has an `effective_weight` (its configured weight) and a `current_weight` (accumulated over iterations). Every round, each peer's `current_weight` increases by its `effective_weight`. The peer with the highest `current_weight` is selected, and its `current_weight` is decreased by the total weight of all peers. This distributes requests proportionally without bursts.

**Pros:** Simple, zero state, even distribution.
**Cons:** Ignores backend load. A slow backend gets the same share as a fast one.

### Least Connections

Route to the backend with the fewest active connections. This adapts to varying backend speeds — a slow backend accumulates connections and stops receiving new ones.

```
  Current connections:
    Backend A: 12 active
    Backend B:  3 active  <-- pick this one
    Backend C:  8 active

  New request --> Backend B
```

HAProxy's least-connections implementation lives in [`src/lb_leastconn.c`](https://github.com/haproxy/haproxy/blob/master/src/lb_leastconn.c). It uses a tree structure sorted by connection count:

```c
static struct server *lb_leastconn_get_next(struct proxy *p)
{
    struct eb32_node *node;
    struct server *s;

    node = eb32_first(&p->lbprm.leastconn.act);
    if (!node)
        return NULL;

    s = eb32_entry(node, struct server, lb_node);
    return s;
}
```

Each server's position in the tree is keyed by `(active_connections * 256 + position_hint)`. When a connection starts, the server is removed, its key is updated, and it's reinserted. The `eb32_first()` call always returns the server with the lowest key — the least loaded one.

**Pros:** Adapts to heterogeneous backends and slow requests.
**Cons:** Requires per-connection state tracking.

### Consistent Hashing

Map requests to backends using a hash ring. Each backend is placed at one or more points on a circular hash space. A request's hash (from its key — typically client IP or a request header) determines which backend serves it by finding the next clockwise point on the ring.

```
               Consistent Hash Ring

                    0 / 2^32
                      |
              C       |       A
               \      |      /
                \     |     /
                 +----+----+
                /           \
               /             \
              |               |
              |               |
               \             /
                \           /
                 +----+----+
                /     |     \
               /      |      \
              B       |       A (virtual node)
                      |
                    2^31

  hash("user:42") = 0x3A01... --> lands between B and C
                                  --> routes to C (next clockwise)
```

When a backend is added or removed, only the keys between it and its counter-clockwise neighbor are remapped — minimizing disruption. Virtual nodes (multiple hash positions per backend) ensure even distribution.

This is how Nginx's consistent hash module computes the target ([`src/http/modules/ngx_http_upstream_hash_module.c`](https://github.com/nginx/nginx/blob/master/src/http/modules/ngx_http_upstream_hash_module.c)):

```c
static ngx_int_t
ngx_http_upstream_get_chash_peer(ngx_peer_connection_t *pc, void *data)
{
    ngx_http_upstream_hash_peer_data_t *uhpd = data;
    uint32_t hash;

    hash = ngx_crc32_long(uhpd->key.data, uhpd->key.len);

    /* binary search the sorted points array for the first point >= hash */
    ngx_http_upstream_rr_peer_t *peer;
    peer = uhpd->peers->peer;  /* found via ring lookup */

    /* walk forward until we find a non-down peer */
    ...
    return NGX_OK;
}
```

**Pros:** Minimizes redistribution on topology changes. Great for caches and stateful services.
**Cons:** Uneven distribution without enough virtual nodes. Does not consider backend load.

### Other Common Algorithms

| Algorithm | How it works | Best for |
|-----------|-------------|----------|
| Random | Pick a backend uniformly at random | Simple stateless balancing |
| Weighted random | Random with bias toward higher-weight backends | Heterogeneous capacity |
| IP hash | Hash client IP to pick backend | Session affinity without cookies |
| Power of two choices | Pick 2 random backends, use the less loaded one | Low-overhead adaptive balancing |

The **power of two random choices** algorithm deserves special mention. Instead of checking all backends (expensive with large pools), it picks just two at random and routes to whichever has fewer connections. This achieves exponentially better load distribution than pure random, with minimal overhead. It's used in Envoy's load balancer.

## Health Checks

A load balancer is only useful if it avoids sending traffic to broken backends. Health checks verify that backends can serve requests.

### Active Health Checks

The load balancer periodically sends probe requests to each backend:

```
               Active Health Check Flow

  Load Balancer                    Backend A
       |                               |
       |--- HTTP GET /health --------->|
       |                               |
       |<-- 200 OK -------------------|   (healthy)
       |                               |
       |                           Backend B
       |                               |
       |--- HTTP GET /health --------->|
       |                               |
       |<-- [timeout, no response] ---|   (unhealthy)
       |                               |
       |  mark B as DOWN               |
       |  stop routing to B            |
```

HAProxy's health check configuration:

```
backend app_servers
    option httpchk GET /health
    http-check expect status 200

    server backend-a 10.0.1.10:8080 check inter 3s fall 3 rise 2
    server backend-b 10.0.1.11:8080 check inter 3s fall 3 rise 2
```

- `inter 3s`: check every 3 seconds
- `fall 3`: mark as down after 3 consecutive failures
- `rise 2`: mark as up after 2 consecutive successes

The `fall` and `rise` thresholds prevent flapping — a single dropped packet shouldn't take a server out of rotation.

### Passive Health Checks (Circuit Breaking)

Instead of probing, the load balancer observes real traffic. If a backend starts returning errors or timing out, it's removed from the pool.

```
  Request flow with passive health checking:

  Request --> Backend C --> 503 error
  Request --> Backend C --> 503 error
  Request --> Backend C --> 503 error   (3 failures in 10s)
                |
                v
       Circuit OPEN: stop sending to C
                |
         wait 30 seconds
                |
                v
       Circuit HALF-OPEN: send 1 probe request
                |
        +-------+-------+
        |               |
     success          failure
        |               |
        v               v
   Circuit CLOSED    Circuit OPEN
   (resume traffic)  (wait again)
```

Envoy implements this as **outlier detection** — tracking error rates per backend and ejecting those that exceed thresholds.

## Connection Draining (Graceful Shutdown)

When a backend needs to be removed (for deployment, scaling down, or maintenance), abruptly dropping its connections causes errors. **Connection draining** lets existing requests finish while stopping new ones:

```
                Connection Drain Timeline

  t=0: Backend B signals "shutting down"
  ------------------------------------------------>
       |                                    |
       | existing connections               | drain timeout
       | continue to completion             | (e.g., 30s)
       |                                    |
       | new requests --> other backends    |
       |                                    |
  t=30: force-close any remaining connections
        Backend B is fully removed
```

In Kubernetes, this is triggered by removing the pod's endpoint from the Service. The load balancer (kube-proxy or an ingress controller) stops sending new traffic, while in-flight requests are given a `terminationGracePeriodSeconds` window to complete.

HAProxy implements this with the `drain` state:

```
# Via the runtime API:
echo "set server app_servers/backend-b state drain" | socat stdio /var/run/haproxy.sock
```

## Direct Server Return (DSR)

For read-heavy workloads where responses are much larger than requests (video streaming, file downloads), having the load balancer handle both directions is wasteful. **DSR** lets the backend respond directly to the client, bypassing the load balancer on the return path:

```
            Direct Server Return

  Client                LB                Backend
    |                   |                    |
    |--- request ------>|                    |
    |                   |--- request ------->|
    |                   |                    |
    |<----------- response (direct) --------|
    |                   |                    |
    |  (LB never sees the response)         |
```

This requires the backend to have the VIP (virtual IP) configured on a loopback interface so it can send packets with the VIP as the source address. Linux IPVS supports DSR mode natively.

**Trade-off:** The load balancer can't inspect responses, so it can't do response-based health checks or modify response headers. It also can't do L7 features like compression or header injection.

## Putting It All Together: A Request's Journey

Let's trace a single HTTPS request through a production load-balanced stack:

```
  Client (browser)
    |
    | 1. DNS resolves app.example.com --> VIP 203.0.113.10
    |
    v
  L4 Load Balancer (e.g., AWS NLB)
    |
    | 2. Picks an L7 LB instance (least connections)
    |    Forwards TCP connection (no TLS termination)
    |
    v
  L7 Load Balancer (e.g., Nginx/Envoy)
    |
    | 3. TLS handshake (terminates TLS)
    | 4. Parses HTTP: GET /api/users/42
    | 5. Checks health of backends in "api" pool
    | 6. Picks backend using weighted round robin
    | 7. Adds headers: X-Request-Id, X-Forwarded-For
    |
    v
  Backend Server (app instance)
    |
    | 8. Processes request, returns response
    |
    v
  Response flows back through L7 LB --> L4 LB --> Client
```

This two-tier architecture is common:
- **L4** handles raw TCP distribution across L7 instances (cheap, scales to millions of conns)
- **L7** handles application routing, TLS, and observability (rich features per request)

## Real-World Considerations

**Sticky sessions:** Some applications require that the same client always reaches the same backend (e.g., in-memory session stores). Load balancers support this via cookies or IP hashing — but it limits the effectiveness of balancing and complicates failover.

**Thundering herd on recovery:** When a failed backend recovers, sending it a full share of traffic immediately can overwhelm it. Good load balancers use **slow start** — gradually ramping up the weight of a newly recovered backend over 30-60 seconds.

**Head-of-line blocking:** With HTTP/1.1, a single slow response on a connection blocks subsequent requests on that connection. HTTP/2 multiplexing eliminates this, but the load balancer must support it end-to-end.

**Observability:** Load balancers are the ideal point to collect latency percentiles, error rates, and request counts per backend. HAProxy's stats page and Envoy's `/stats` endpoint are critical for debugging production issues.

## References

1. HAProxy documentation, Load Balancing Algorithms [doc](https://docs.haproxy.org/3.0/configuration.html#4-balance)
2. Nginx upstream module [source](https://github.com/nginx/nginx/blob/master/src/http/ngx_http_upstream_round_robin.c)
3. Envoy Proxy, Load Balancing [doc](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/overview)
4. Linux IPVS (IP Virtual Server) [doc](http://www.linuxvirtualserver.org/software/ipvs.html)
5. Mitzenmacher, "The Power of Two Choices in Randomized Load Balancing" [paper](https://www.eecs.harvard.edu/~michaelm/postscripts/tpds2001.pdf)
6. Google SRE Book, Chapter 20: Load Balancing in the Datacenter [book](https://sre.google/sre-book/load-balancing-datacenter/)
7. HAProxy source, least connections [`src/lb_leastconn.c`](https://github.com/haproxy/haproxy/blob/master/src/lb_leastconn.c)
8. Nginx consistent hash module [`src/http/modules/ngx_http_upstream_hash_module.c`](https://github.com/nginx/nginx/blob/master/src/http/modules/ngx_http_upstream_hash_module.c)
