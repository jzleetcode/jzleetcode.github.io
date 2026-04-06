---
author: JZ
pubDatetime: 2026-04-05T07:00:00Z
modDatetime: 2026-04-05T07:00:00Z
title: System Design - Proxy vs Reverse Proxy
tags:
  - design-system
description:
  "system design basics - forward proxy vs reverse proxy, differences, use cases, and examples"
---

## Table of contents

## Context

Both proxies and reverse proxies act as intermediaries between clients and servers. They sit in the middle of the request flow but serve opposite purposes and protect different sides.

## Forward Proxy

A forward proxy sits in front of **clients** and forwards requests to the internet on their behalf. The server sees the proxy's IP, not the client's.

```
                     Internet
Clients              Firewall         Servers
+----------+            |
|  Client  +--+         |
+----------+  |  +------+-----+      +--------+
              +--+  Forward   +------+ Server |
+----------+  |  |   Proxy    +--+   +--------+
|  Client  +--+  +------+-----+  |
+----------+            |        |   +--------+
                        |        +---+ Server |
                        |            +--------+
```

### Use Cases

1. **Anonymity** --hides the client's IP address from the server.
2. **Access control** --organizations block or filter outbound traffic. For example, a corporate firewall proxy can deny requests to social media or streaming sites during work hours. Schools and libraries use forward proxies to enforce content policies, blocking categories of sites (e.g., gambling, adult content) via URL filtering or DNS-based rules.
3. **Caching** --caches frequently accessed content closer to the clients to reduce outbound bandwidth. For example, if 100 employees visit the same website, the proxy serves the cached copy instead of fetching it 100 times. This benefits the **client side** -- faster responses and lower ISP costs.
4. **Bypassing restrictions** --access geo-blocked content by routing through a proxy in another region.
5. **Logging and monitoring** --all outbound traffic flows through the proxy, so it can log every request (URL, timestamp, user, bytes transferred). IT teams use these logs to audit employee internet usage, detect data exfiltration attempts, or generate compliance reports. Tools like Squid produce access logs that feed into SIEM systems (e.g., Splunk) for alerting and analysis.

### Examples

- **Squid** --open-source caching proxy, commonly used in corporate networks.
- **VPN services** --act as forward proxies encrypting traffic and masking client IPs.
- **Browser proxy settings** --HTTP/SOCKS proxies configured in browser or OS.

## Reverse Proxy

A reverse proxy sits in front of **servers** and intercepts requests from clients before forwarding them to backend servers. The client sees the proxy's IP, not the server's.

```
                                   Internal Network
Clients                 Firewall            Servers
                            |
+----------+                |  +-----------+   +--------+
|  Client  +--+             |  |           +---+ Server |
+----------+  |  +-------+  |  |  Reverse  |   +--------+
              +--+       +--+--+   Proxy   |
+----------+  |  |  CDN  |     |           |   +--------+
|  Client  +--+  +-------+     |           +---+ Server |
+----------+                   +-----------+   +--------+
```

### Use Cases

1. **Load balancing** --distributes incoming traffic across multiple backend servers.
2. **SSL termination** --handles TLS encryption/decryption, offloading work from backends.
3. **Caching** --caches server responses closer to the clients to reduce backend load. For example, Nginx can cache API responses or static assets so repeated requests never hit the application servers. This benefits the **server side** -- fewer backend requests, lower compute costs, and the ability to survive traffic spikes.
4. **Security** --hides backend server IPs and topology, provides DDoS protection.
5. **Compression** --compresses responses before sending to clients.
6. **A/B testing and canary deployments** --routes a percentage of traffic to new versions.

### Examples

- **Nginx** --widely used as a reverse proxy, load balancer, and web server.
- **HAProxy** --high-performance TCP/HTTP load balancer and reverse proxy.
- **AWS ALB/ELB** --managed reverse proxy and load balancer in AWS.
- **Cloudflare** --CDN and reverse proxy providing caching and DDoS protection.
- **Envoy** --supports three deployment modes: edge/front proxy (like Nginx, no sidecars), service-to-service sidecar mesh, or both combined. Unlike Nginx, Envoy features dynamic configuration via APIs (no restarts), native gRPC/HTTP2/HTTP3, and built-in observability. The service mesh architecture (e.g., Istio) deserves its own article.

## Comparison

| Aspect | Forward Proxy | Reverse Proxy |
|---|---|---|
| **Position** | In front of clients | In front of servers |
| **Protects** | Clients (hides client identity) | Servers (hides server identity) |
| **Who configures** | Client or client's organization | Server or server's organization |
| **Client awareness** | Client knows it's using a proxy | Client is unaware of the proxy |
| **Primary goal** | Control/anonymize outbound requests | Distribute/secure inbound requests |
| **Caching** | Caches for client-side benefit (reduce bandwidth) | Caches for server-side benefit (reduce backend load) |
| **Ownership** | Owned by client's organization | Owned by same organization as the backend servers |

## Can One Tool Do Both?

Yes. **Nginx**, for example, can function as both a forward and reverse proxy depending on configuration. The same applies to **Squid**. The distinction is architectural role, not the software itself.

## References

1. Cloudflare [What is a reverse proxy?](https://www.cloudflare.com/learning/cdn/glossary/reverse-proxy/)
2. Nginx [reverse proxy guide](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)
