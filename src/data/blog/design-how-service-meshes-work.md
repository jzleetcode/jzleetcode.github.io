---
author: JZ
pubDatetime: 2026-08-20T06:00:00Z
modDatetime: 2026-08-20T06:00:00Z
title: System Design - How Service Meshes Work (Envoy & Istio)
tags:
  - design-system
  - design-networking
description:
  "How service meshes work: sidecar proxy architecture, Envoy's threading model, xDS dynamic configuration, Istio control plane, mTLS, traffic management, and observability — with ASCII diagrams and source code references."
---

## Table of contents

## Context: Why Microservices Need a Service Mesh

Imagine you join a company running 200 microservices. Each service needs to handle retries, timeouts, circuit breaking, mutual TLS, metrics collection, and distributed tracing. The naive approach is to embed all of this logic into every service using a shared library.

This works until you realize:

1. Services are written in Go, Java, Python, and Rust. You need a library for each language.
2. Upgrading the retry logic means redeploying all 200 services.
3. A bug in the networking library takes down everything simultaneously.

A **service mesh** solves this by extracting all networking concerns into a dedicated infrastructure layer. Instead of each application handling retries and TLS, a small proxy process sits next to every service instance and transparently handles all network traffic.

```
        Without Service Mesh                   With Service Mesh

  +------------------+                   +---------+  +-------+
  |   Service A      |                   | Service |  | Proxy |
  |  +------------+  |                   |    A    |--| (side |
  |  | retry      |  |                   |         |  |  car) |
  |  | timeout    |  |                   +---------+  +---+---+
  |  | TLS        |  |                                    |
  |  | metrics    |  |                        encrypted   |
  |  | tracing    |  |                        connection  |
  |  +------+-----+  |                                    |
  +---------|--------+                   +---------+  +---+---+
            |                            | Service |  | Proxy |
            | plain TCP                  |    B    |--| (side |
            |                            |         |  |  car) |
  +---------|--------+                   +---------+  +-------+
  |   Service B      |
  |  +------------+  |
  |  | retry      |  |
  |  | timeout    |  |
  |  | TLS ...    |  |
  |  +------------+  |
  +------------------+
```

The two dominant open-source projects in this space are **Envoy** (the proxy, or "data plane") and **Istio** (the management layer, or "control plane"). Let's understand how they work together.

## Data Plane vs Control Plane

A service mesh splits into two logical layers:

```
                    Service Mesh Architecture

  +==============================================================+
  |                      CONTROL PLANE                           |
  |                                                              |
  |   +------------------------------------------------------+  |
  |   |                    istiod                             |  |
  |   |   (Pilot + Citadel + Galley, merged since v1.5)      |  |
  |   +---+-------------------+-------------------+----------+  |
  |       |                   |                   |              |
  +==============================================================+
          | xDS (config)      | certs             | xDS
          v                   v                   v
  +==============================================================+
  |                       DATA PLANE                             |
  |                                                              |
  |  +-------+  +-------+  +-------+  +-------+  +-------+     |
  |  | Envoy |  | Envoy |  | Envoy |  | Envoy |  | Envoy |     |
  |  | proxy |  | proxy |  | proxy |  | proxy |  | proxy |     |
  |  +---+---+  +---+---+  +---+---+  +---+---+  +---+---+     |
  |      |           |           |           |           |       |
  |  +---+---+  +---+---+  +---+---+  +---+---+  +---+---+     |
  |  | Svc A |  | Svc B |  | Svc C |  | Svc D |  | Svc E |     |
  |  +-------+  +-------+  +-------+  +-------+  +-------+     |
  |                                                              |
  +==============================================================+
```

- **Data plane (Envoy proxies):** Intercepts every network packet entering or leaving a service. Handles load balancing, retries, TLS termination, and metrics collection.
- **Control plane (istiod):** Tells each Envoy proxy *how* to behave: which services exist, what certificates to use, what routing rules apply.

## The Sidecar Proxy Pattern

Each application pod in Kubernetes gets an Envoy container injected alongside the application container. This is the "sidecar" pattern. Istio achieves this through a **mutating admission webhook** that modifies pod specs at creation time.

```
            Kubernetes Pod
  +-------------------------------------+
  |                                     |
  |  +-------------+   +-------------+ |
  |  | Application |   |    Envoy    | |
  |  |  Container  |   |   Sidecar   | |
  |  |             |   |             | |
  |  | listens on  |   | listens on  | |
  |  | localhost:  |   | 0.0.0.0:    | |
  |  |   8080      |   |  15001 (out)| |
  |  |             |   |  15006 (in) | |
  |  +------+------+   +------+------+ |
  |         |                  |        |
  |         +---iptables NAT---+        |
  |                                     |
  +-------------------------------------+
```

The key trick: **iptables rules** (injected by the `istio-init` container) redirect all inbound and outbound traffic through the Envoy sidecar. The application has no idea it is even there.

The iptables setup is handled by [`tools/istio-iptables`](https://github.com/istio/istio/tree/master/tools/istio-iptables) in the Istio source tree. The relevant redirect rules look like:

```
# Redirect all outbound TCP traffic to Envoy (port 15001)
-A ISTIO_OUTPUT -j ISTIO_REDIRECT
-A ISTIO_REDIRECT -p tcp -j REDIRECT --to-ports 15001

# Redirect all inbound TCP traffic to Envoy (port 15006)
-A ISTIO_IN_REDIRECT -p tcp -j REDIRECT --to-ports 15006
```

## Envoy Proxy Architecture

Envoy is a high-performance C++ proxy designed for large-scale service meshes. Its architecture is optimized for both throughput and low tail latency.

### Threading Model

Envoy uses a **1 main thread + N worker threads** model:

```
  +------------------------------------------------------------+
  |                     Envoy Process                           |
  |                                                            |
  |  +------------------+                                      |
  |  |   Main Thread    |  - xDS communication with istiod     |
  |  |                  |  - config updates                    |
  |  |                  |  - stats flushing                    |
  |  |                  |  - admin API (localhost:15000)        |
  |  +--------+---------+                                      |
  |           |                                                |
  |           | distributes listeners to workers               |
  |           |                                                |
  |  +--------+------+--------+------+--------+------+         |
  |  |               |               |               |         |
  |  v               v               v               v         |
  |  +-----------+   +-----------+   +-----------+   +------+  |
  |  | Worker 0  |   | Worker 1  |   | Worker 2  |   | W(N) |  |
  |  |           |   |           |   |           |   |      |  |
  |  | - own     |   | - own     |   | - own     |   |      |  |
  |  |   event   |   |   event   |   |   event   |   |      |  |
  |  |   loop    |   |   loop    |   |   loop    |   |      |  |
  |  | - owns    |   | - owns    |   | - owns    |   |      |  |
  |  |   conns   |   |   conns   |   |   conns   |   |      |  |
  |  +-----------+   +-----------+   +-----------+   +------+  |
  |                                                            |
  +------------------------------------------------------------+
```

Key design choices:

1. **Each worker thread has its own event loop** (using libevent). Once a connection is accepted, it stays on that worker thread for its entire lifetime. No locking needed for per-connection state.

2. **Nearly lock-free.** Workers rarely share mutable state. When the main thread pushes a config update, it posts the update to each worker's event loop, and the worker applies it on its next iteration.

3. **Connection acceptance uses SO_REUSEPORT.** The kernel distributes new connections across worker threads, avoiding a single accept-thread bottleneck.

The threading model is implemented in [`source/server/worker_impl.cc`](https://github.com/envoyproxy/envoy/blob/main/source/server/worker_impl.cc) and [`source/common/event/dispatcher_impl.cc`](https://github.com/envoyproxy/envoy/blob/main/source/common/event/dispatcher_impl.cc).

### Connection Handling and Filter Chains

When a new connection arrives, Envoy processes it through a **filter chain**:

```
  Inbound connection
        |
        v
  +-----+-----+
  | Listener  |  (bound to a port, e.g., 15006)
  +-----+-----+
        |
        v
  +-----+-----+
  | TLS        |  (optional: terminates mTLS)
  | Inspector  |
  +-----+-----+
        |
        v
  +-----+-----+------ Filter Chain ------+-----+-----+
  |           |                           |           |
  |  Network  |   Network    Network      |   HTTP    |
  |  Filter   |   Filter     Filter       |  Conn    |
  |  (tcp_    |   (rbac)     (http_       |  Manager  |
  |   proxy)  |              connection_  |           |
  |           |              manager)     |           |
  +-----------+                           +-----+-----+
                                                |
                                          +-----+-----+
                                          | HTTP Filter Chain |
                                          |                   |
                                          | - router          |
                                          | - jwt_authn       |
                                          | - fault_injection |
                                          | - wasm            |
                                          +-------------------+
```

Filters are the extension point. Envoy ships with dozens of built-in filters (rate limiting, gRPC transcoding, Lua scripting, Wasm), and you can add custom ones. The filter chain configuration is specified per-listener.

The filter chain matching logic lives in [`source/server/filter_chain_manager_impl.cc`](https://github.com/envoyproxy/envoy/blob/main/source/server/filter_chain_manager_impl.cc).

## xDS: Dynamic Configuration Protocol

Static configuration files are fine for simple deployments, but in a mesh with hundreds of services scaling up and down, Envoy needs **dynamic** configuration. This is where **xDS** (x Discovery Service) comes in.

xDS is a set of gRPC-based APIs that the control plane uses to push configuration to Envoy:

| API | Full Name | What It Configures |
|-----|-----------|-------------------|
| **LDS** | Listener Discovery Service | Which ports to listen on, what filter chains to apply |
| **RDS** | Route Discovery Service | HTTP routing rules (path-based routing, header matching) |
| **CDS** | Cluster Discovery Service | Upstream service clusters (timeout, circuit breaker settings) |
| **EDS** | Endpoint Discovery Service | Actual IP:port pairs for each cluster (the service instances) |
| **SDS** | Secret Discovery Service | TLS certificates and keys |

The flow looks like:

```
  +----------+                              +-----------+
  |  istiod  |                              |   Envoy   |
  |  (xDS    |                              |   proxy   |
  |  server) |                              |           |
  +----+-----+                              +-----+-----+
       |                                          |
       |  1. Envoy connects via gRPC stream       |
       |<-----------------------------------------|
       |                                          |
       |  2. Envoy sends DiscoveryRequest         |
       |     (resource type: LDS)                 |
       |<-----------------------------------------|
       |                                          |
       |  3. istiod sends DiscoveryResponse       |
       |     (listeners config, version: v42)     |
       |----------------------------------------->|
       |                                          |
       |  4. Envoy ACKs (sends next request       |
       |     with version: v42)                   |
       |<-----------------------------------------|
       |                                          |
       |  ... later, a new service appears ...    |
       |                                          |
       |  5. istiod pushes new EDS update         |
       |     (new endpoint 10.0.3.7:8080)         |
       |----------------------------------------->|
       |                                          |
```

This is **incremental** and **eventually consistent**. Envoy does not need to restart when configuration changes. It applies updates in-place, draining old connections gracefully.

The xDS protocol specification is defined in the [Envoy data-plane-api repository](https://github.com/envoyproxy/data-plane-api). The core protobuf definitions live in [`envoy/service/discovery/v3/`](https://github.com/envoyproxy/envoy/tree/main/api/envoy/service/discovery/v3).

### ADS: Aggregated Discovery Service

In practice, Istio uses **ADS** (Aggregated Discovery Service) which multiplexes all xDS types over a single gRPC stream. This avoids ordering issues — for example, you don't want Envoy to learn about a new route before it knows about the cluster the route points to.

The ADS implementation in Istio lives in [`pilot/pkg/xds/ads.go`](https://github.com/istio/istio/blob/master/pilot/pkg/xds/ads.go).

## Istio Control Plane: istiod

Before Istio 1.5 (2020), the control plane was split into three separate components: Pilot, Citadel, and Galley. This was over-engineered. Since 1.5, everything is merged into a single binary called **istiod**.

```
  +------------------------------------------------------------------+
  |                           istiod                                  |
  |                                                                  |
  |  +-------------------+  +------------------+  +---------------+  |
  |  |      Pilot        |  |    Citadel       |  |    Galley     |  |
  |  |                   |  |                  |  |               |  |
  |  | - watches K8s API |  | - issues certs   |  | - config      |  |
  |  |   (Services,      |  | - rotates certs  |  |   validation  |  |
  |  |    Endpoints,     |  | - root CA mgmt   |  | - webhook     |  |
  |  |    Pods)          |  |                  |  |   validation  |  |
  |  | - converts to     |  | - integrates     |  |               |  |
  |  |   xDS config      |  |   with ext CAs   |  |               |  |
  |  | - pushes to       |  |                  |  |               |  |
  |  |   Envoy proxies   |  |                  |  |               |  |
  |  +-------------------+  +------------------+  +---------------+  |
  |                                                                  |
  |  +------------------------------------------------------------+  |
  |  |              Kubernetes API Server (watch)                  |  |
  |  +------------------------------------------------------------+  |
  +------------------------------------------------------------------+
```

### How Pilot Translates Kubernetes State to Envoy Config

Pilot watches the Kubernetes API for `Service`, `Endpoints`, `Pod`, and Istio CRDs (`VirtualService`, `DestinationRule`, etc.). When something changes, it:

1. Rebuilds an internal **service registry** model.
2. Translates the model into xDS resources for each connected Envoy.
3. Pushes the xDS updates over the ADS stream.

The translation logic is in [`pilot/pkg/model/`](https://github.com/istio/istio/tree/master/pilot/pkg/model) and the push mechanism in [`pilot/pkg/xds/push_context.go`](https://github.com/istio/istio/blob/master/pilot/pkg/xds/push_context.go).

Each Envoy proxy gets a **tailored** configuration based on its namespace, labels, and which services it needs to communicate with. Istio calls this **Sidecar scoping** — it avoids sending every proxy the entire mesh configuration.

## mTLS: Automatic Sidecar-to-Sidecar Encryption

One of the killer features of a service mesh is **zero-trust networking** through automatic mutual TLS. Without any application code changes, all service-to-service traffic is encrypted and authenticated.

### How It Works

```
  Pod A                                              Pod B
  +-------------------+                              +-------------------+
  |  App A            |                              |  App B            |
  |  (plaintext       |                              |  (plaintext       |
  |   on localhost)   |                              |   on localhost)   |
  +--------+----------+                              +--------+----------+
           |                                                  ^
           | HTTP (unencrypted, localhost only)                | HTTP
           v                                                  |
  +--------+----------+                              +--------+----------+
  |  Envoy Sidecar A  |                              |  Envoy Sidecar B  |
  |                   |                              |                   |
  |  - has cert:      |       mTLS (TLS 1.3)        |  - has cert:      |
  |    spiffe://      | ---------------------------> |    spiffe://      |
  |    cluster.local/ |  both sides verify each      |    cluster.local/ |
  |    ns/foo/sa/a    |  other's SPIFFE identity     |    ns/bar/sa/b    |
  |                   |                              |                   |
  +-------------------+                              +-------------------+
```

### Certificate Lifecycle

1. **Bootstrap:** When a sidecar starts, it generates a private key and CSR (Certificate Signing Request).
2. **Request:** The sidecar sends the CSR to istiod's CA (Citadel component) via SDS (Secret Discovery Service).
3. **Issuance:** istiod signs the certificate with the mesh root CA and returns it. The certificate contains the pod's **SPIFFE identity** (e.g., `spiffe://cluster.local/ns/default/sa/my-service`).
4. **Rotation:** Certificates are short-lived (default 24 hours). Envoy automatically requests new ones before expiry via SDS.

The certificate signing logic is in [`security/pkg/server/ca/`](https://github.com/istio/istio/tree/master/security/pkg/server/ca). The SPIFFE identity construction is in [`pilot/pkg/model/authentication.go`](https://github.com/istio/istio/blob/master/pilot/pkg/model/authentication.go).

### Permissive Mode

Istio supports a **permissive** mTLS mode during migration: sidecars accept both plaintext and TLS connections. This lets you roll out sidecars incrementally without breaking services that don't have one yet.

## Traffic Management

Istio provides fine-grained traffic control through Custom Resource Definitions (CRDs) that translate into Envoy configuration.

### VirtualService: Routing Rules

A `VirtualService` defines how requests are routed to a service:

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: reviews-route
spec:
  hosts:
  - reviews
  http:
  - match:
    - headers:
        end-user:
          exact: jason
    route:
    - destination:
        host: reviews
        subset: v2        # canary: jason sees v2
  - route:
    - destination:
        host: reviews
        subset: v1        # everyone else sees v1
      weight: 90
    - destination:
        host: reviews
        subset: v2
      weight: 10          # 10% canary traffic
```

This translates into Envoy **RDS** (Route Discovery Service) configuration — specifically `RouteConfiguration` resources with weighted clusters.

### DestinationRule: Upstream Behavior

A `DestinationRule` defines policies applied to traffic *after* routing:

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: reviews-destination
spec:
  host: reviews
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        h2UpgradePolicy: UPGRADE
        maxRequestsPerConnection: 10
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 60s
  subsets:
  - name: v1
    labels:
      version: v1
  - name: v2
    labels:
      version: v2
```

### Circuit Breaking

Circuit breaking in Envoy is configured via `DestinationRule` outlier detection. When a host returns too many errors, Envoy **ejects** it from the load balancing pool temporarily:

```
  Normal operation:
  +--------+     +--------+     +--------+
  | host-1 |     | host-2 |     | host-3 |     all in pool
  |  (ok)  |     |  (ok)  |     |  (ok)  |
  +--------+     +--------+     +--------+

  After 5 consecutive 5xx from host-2:
  +--------+     +--------+     +--------+
  | host-1 |     | host-2 |     | host-3 |
  |  (ok)  |     | EJECTED|     |  (ok)  |     host-2 out for 60s
  +--------+     +--------+     +--------+
                  (no traffic
                   sent here)

  After ejection period:
  +--------+     +--------+     +--------+
  | host-1 |     | host-2 |     | host-3 |     host-2 back in pool
  |  (ok)  |     |  (ok)  |     |  (ok)  |     (probation)
  +--------+     +--------+     +--------+
```

The outlier detection implementation is in [`source/common/upstream/outlier_detection_impl.cc`](https://github.com/envoyproxy/envoy/blob/main/source/common/upstream/outlier_detection_impl.cc).

## Observability: Metrics, Traces, and Logs for Free

Because all traffic flows through the sidecar proxy, the mesh can automatically collect three pillars of observability without any application instrumentation.

### Metrics

Envoy emits per-request metrics by default:

- **Request count** — broken down by source, destination, response code
- **Request duration** — histogram (p50, p99, etc.)
- **Request size / response size**
- **TCP connections** — active, total, failed

Istio collects these via Prometheus and exposes them in standard dashboards. The metrics are generated by Envoy's `stats` filter and the Istio-specific `metadata_exchange` and `stats` Wasm filters.

### Distributed Traces

Envoy automatically generates trace spans for every request. It propagates trace context headers (`x-request-id`, `x-b3-traceid`, `x-b3-spanid`, etc.) and reports spans to backends like Jaeger or Zipkin.

```
  Service A          Service B          Service C
      |                  |                  |
      |--- span A-B ---->|                  |
      |                  |--- span B-C ---->|
      |                  |                  |
      |                  |<--- response ----|
      |<--- response ----|                  |

  Trace timeline:
  |====== A-B ======|
       |============ B-C ============|
  t0                                 t_end
```

Important caveat: Envoy generates the spans, but the application must **propagate** the trace headers on outgoing requests. Otherwise, you get disconnected traces.

### Access Logs

Every request through the sidecar can be logged with configurable fields:

```
[2026-08-19T10:15:32.001Z] "GET /api/reviews HTTP/1.1" 200 - via_upstream
    - 0 1234 15 12 "-" "curl/7.68.0"
    "reviews.default.svc.cluster.local:8080"
    outbound|8080|v1|reviews.default.svc.cluster.local
    10.244.0.15:8080
    10.244.0.5:38432
    spiffe://cluster.local/ns/default/sa/productpage
```

This single log line tells you the source identity, destination, response code, upstream latency, and more.

## Performance Considerations

### Latency Overhead

The sidecar pattern adds latency: every request traverses two extra network hops (source sidecar -> destination sidecar). In practice:

- **p50 latency overhead:** 0.5 - 1 ms per hop (total ~1 - 2 ms extra for a request)
- **p99 latency overhead:** 2 - 5 ms per hop under load
- **Memory per sidecar:** 40 - 100 MB (depending on mesh size and config)
- **CPU per sidecar:** 0.1 - 0.5 vCPU under typical load

These numbers come from [Istio performance benchmarks](https://istio.io/latest/docs/ops/deployment/performance-and-scalability/) and real-world production measurements.

### Where the Time Goes

```
  App A  -->  Envoy A  ------network------  Envoy B  -->  App B
         |            |                    |            |
         |<- ~0.2ms ->|                    |<- ~0.2ms ->|
         |  (userspace                     |  (userspace
         |   to proxy)                     |   to app)
         |            |<--- ~0.5-1ms ----->|
         |            |  (TLS handshake    |
         |            |   amortized over   |
         |            |   connection pool) |
```

The latency comes from:
1. **iptables redirect** — copying data between kernel network stacks
2. **TLS encryption/decryption** — mitigated by connection pooling and TLS session resumption
3. **Filter chain processing** — each filter adds a small amount

### eBPF-Based Alternatives

Projects like **Cilium** (with its service mesh mode) bypass the sidecar model entirely using **eBPF** programs in the Linux kernel:

```
  Traditional sidecar:
  App -> iptables -> Envoy (userspace) -> kernel -> network -> Envoy -> App

  eBPF approach:
  App -> kernel (eBPF program handles L4/L7) -> network -> kernel (eBPF) -> App
```

Benefits of eBPF:
- No sidecar container overhead (saves memory)
- Fewer context switches (stays in kernel for L4 operations)
- Lower latency for simple operations (TCP proxying, L4 load balancing)

Tradeoffs:
- Less mature L7 features (HTTP routing, gRPC load balancing still need a proxy)
- Kernel version requirements (5.10+)
- Harder to debug than userspace proxies

Istio itself is exploring **ambient mesh** (introduced in v1.15), which replaces per-pod sidecars with per-node **ztunnel** proxies for L4 and optional **waypoint proxies** for L7:

```
  Ambient Mesh Architecture:

  Node 1                              Node 2
  +-----------------------------+     +-----------------------------+
  |  +-----+  +-----+  +-----+ |     |  +-----+  +-----+  +-----+ |
  |  |App A|  |App B|  |App C| |     |  |App D|  |App E|  |App F| |
  |  +--+--+  +--+--+  +--+--+ |     |  +--+--+  +--+--+  +--+--+ |
  |     |         |         |   |     |     |         |         |   |
  |  +--+---------+---------+-- |     |  +--+---------+---------+-- |
  |  |       ztunnel (L4)      ||     |  |       ztunnel (L4)      ||
  |  | (per-node, handles mTLS)||     |  | (per-node, handles mTLS)||
  |  +-------------+-----------+|     |  +----------+--+-----------+|
  +----------------|------------+     +-------------|---|-----------+
                   |                                |   |
                   +--------------------------------+   |
                   |  (HBONE tunnel, mTLS)              |
                   |                                    |
              +----+------------------------------------+----+
              |          Waypoint Proxy (optional)           |
              |     (per-namespace, handles L7 policy)       |
              +---------------------------------------------+
```

## Putting It All Together: A Request's Journey

Let's trace a single HTTP request through the mesh:

```
  1. App A sends HTTP request to reviews:8080
                    |
  2. iptables redirects to Envoy sidecar A (port 15001)
                    |
  3. Envoy A looks up route (from RDS config):
     -> destination: reviews cluster, subset v1
                    |
  4. Envoy A picks endpoint from EDS (e.g., 10.0.2.5:8080)
                    |
  5. Envoy A establishes mTLS to destination Envoy B
     (using cert from SDS, verifies peer SPIFFE identity)
                    |
  6. Envoy A sends request, starts trace span
                    |
  7. Envoy B (on pod 10.0.2.5) receives the connection
     -> verifies client cert (authorization policy)
     -> applies rate limits, RBAC filters
                    |
  8. Envoy B forwards plaintext to App B on localhost:8080
                    |
  9. App B responds
                    |
  10. Envoy B records metrics (response code, latency)
      and sends response back through the mTLS connection
                    |
  11. Envoy A records its own metrics, completes trace span
                    |
  12. App A receives the response
```

The application code simply called `http://reviews:8080/api/review/123`. Everything else — TLS, load balancing, retries, metrics, tracing — happened transparently.

## Summary Table

| Component | Role | Key Mechanism |
|-----------|------|---------------|
| Envoy proxy | Data plane — handles actual traffic | Filter chains, connection pooling, SO_REUSEPORT |
| istiod (Pilot) | Translates K8s state to Envoy config | xDS push over gRPC (ADS) |
| istiod (Citadel) | Issues and rotates mTLS certificates | SDS API, SPIFFE identities |
| VirtualService | Defines routing rules | Becomes RDS RouteConfiguration |
| DestinationRule | Defines upstream policies | Becomes CDS Cluster + outlier detection |
| iptables / eBPF | Transparently captures traffic | REDIRECT to sidecar ports |

## References

1. **Envoy Proxy documentation** — https://www.envoyproxy.io/docs/envoy/latest/
2. **Envoy source code** — https://github.com/envoyproxy/envoy
3. **Istio documentation** — https://istio.io/latest/docs/
4. **Istio source code** — https://github.com/istio/istio
5. **xDS protocol specification** — https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol
6. **SPIFFE specification** — https://spiffe.io/docs/latest/spiffe-about/overview/
7. **Istio performance benchmarks** — https://istio.io/latest/docs/ops/deployment/performance-and-scalability/
8. **Envoy threading model blog post** — https://blog.envoyproxy.io/envoy-threading-model-a8d44b922310
9. **Istio ambient mesh RFC** — https://github.com/istio/istio/tree/master/ambient
10. **Cilium service mesh** — https://docs.cilium.io/en/stable/network/servicemesh/
