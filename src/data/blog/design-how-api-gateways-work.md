---
author: JZ
pubDatetime: 2026-11-01T17:30:00Z
modDatetime: 2026-11-01T17:30:00Z
title: "How API Gateways Work: One Front Door for Many Services"
tags:
  - design-system
  - design-networking
description: "How an API gateway routes requests, centralizes cross-cutting concerns, protects backend services, and avoids becoming a bottleneck."
---

## Table of contents

## The crowded restaurant door

Imagine a restaurant with separate kitchens for pizza, drinks, desserts, and takeout. A customer should not need to know which kitchen is on which floor, whether one is temporarily busy, or how to prove that they paid. A host stands at the entrance, checks the reservation, sends each order to the right kitchen, and returns one coherent experience.

An **API gateway** is that host for software. It is the network entry point that receives a client request and forwards it to one or more backend services. It gives a mobile app, browser, or partner one stable public API even while the system behind it contains many independently deployed services.

It is not merely a reverse proxy. A simple reverse proxy primarily forwards traffic. An API gateway commonly adds API-aware policy: authentication, authorization, rate limits, request validation, observability, and sometimes response composition.

```
                    public API boundary

  Mobile app ----> +----------------+ ----> identity service
  Browser --------> |   API gateway  | ----> catalog service
  Partner --------> |                | ----> order service
                   +----------------+ ----> payment service
                         |      |
                         |      +---- metrics, traces, logs
                         +----------- auth, quotas, routing
```

The gateway is useful because it moves repeated edge concerns out of every service. The catalog service can focus on catalog data instead of separately implementing token parsing, request IDs, TLS policy, and per-client quotas.

## A request's short journey

Suppose a client calls `GET /api/orders/42` with a bearer token. A well-designed gateway can process it in a deliberate order:

```
client
  |
  | HTTPS request + token
  v
[1] terminate TLS and attach request ID
  |
  v
[2] authenticate and authorize caller
  |
  v
[3] enforce route-specific rate limit
  |
  v
[4] match /api/orders/:id and choose a healthy backend
  |
  v
[5] forward with deadline, trace context, and selected headers
  |
  v
order service
```

The gateway should reject a request as early as possible. An expired token should not consume a database connection in the order service. A request that exceeds a partner's quota should receive a clear `429 Too Many Requests` response before it creates load downstream.

At the forwarding step, the gateway usually sets a timeout and propagates a trace context such as a W3C `traceparent` header. The backend can then connect its log line and database spans to the same user-visible request. It should also strip or replace headers that a public client must not be allowed to forge, such as internal identity headers.

## Routing is a small decision with large consequences

Routes map a public request to a backend target. The match can use a host, path, HTTP method, headers, query parameters, or a version prefix:

```
api.example.com/v1/catalog/*  -> catalog-v1
api.example.com/v1/orders/*   -> order service
api.example.com/internal/*    -> reject at the public gateway
```

Once it has chosen a service, the gateway needs a healthy instance. In a dynamic environment such as Kubernetes, this normally comes from service discovery. The gateway might use DNS, a control plane, or the platform's endpoint list. It should stop selecting an instance that fails health checks, but it must distinguish a bad instance from a slow dependency: overly aggressive health checks can turn a brief slowdown into a self-inflicted outage.

Routes also make gradual change safer. A gateway can send a small percentage of traffic to a new version, or choose it only when a request carries an explicit header. That enables a canary rollout without asking every client to update at once.

## Authentication, authorization, and the trust boundary

Authentication answers, "Who is calling?" Authorization answers, "May that caller do this?" Gateways often validate signed JWT access tokens locally, which avoids calling the identity provider for every request. The gateway verifies the token's signature, issuer, audience, expiry, and required scopes before forwarding a request.

Local validation is fast, but it does not make the gateway the only security layer. Backend services should still authorize sensitive actions. A gateway route may accidentally be changed, an internal caller may bypass the public gateway, or a service may need richer resource-level rules than the gateway can evaluate.

The safe pattern is layered:

```
gateway: validates token and coarse route scope
service: checks ownership and business permission
database: enforces data-level constraints where possible
```

For example, the gateway can require an `orders:read` scope for `GET /orders/42`; the order service must still ensure that the authenticated customer owns order 42.

## Rate limits protect shared capacity

A gateway is a natural place to limit requests because it sees traffic before it fans out. A common implementation is a **token bucket**. Each client has a bucket that refills at a steady rate. One request removes one token; when the bucket is empty, the gateway rejects or delays the request.

```
capacity = 10 tokens, refill = 2 tokens/second

short burst: 10 requests can pass quickly
steady state: roughly 2 requests/second can continue
empty bucket: gateway returns 429 (often with Retry-After)
```

Limit by the thing that consumes capacity fairly: authenticated user, API key, tenant, IP address, route, or a combination. IP-only limits are weak for users behind shared networks; tenant-based limits are often more meaningful for a multi-tenant API.

In a gateway fleet, this policy has a design choice. Per-instance counters are fast but allow a client to receive a larger effective limit when requests land on many instances. A shared store gives a global limit but adds latency and a dependency. Some systems accept approximate local limits; others use a distributed rate-limit service for expensive endpoints.

## Composition can reduce client round trips

One screen may need product data, inventory, and reviews. A gateway can make those calls in parallel and return a tailored response:

```
                 +--> product service
gateway request --+--> inventory service
                 +--> review service
                         |
                         v
                   one response to client
```

This is attractive for mobile clients on high-latency networks. But composition makes the gateway aware of product-specific response shapes and failure policy. If reviews are unavailable, should the whole product page fail, or should it return product and inventory with reviews omitted? That is a product decision, not a generic networking decision.

For this reason, a large organization often keeps a thin shared gateway for universal policy and places composition in a **backend for frontend** (BFF) owned by the team responsible for that client experience.

## Avoid turning the gateway into a traffic jam

Because every public request may pass through the gateway, it must be treated as critical infrastructure:

- Run multiple instances across failure domains and load-balance them.
- Keep the request path non-blocking and avoid per-request calls to slow control-plane systems.
- Use bounded timeouts, connection pools, and backpressure; retries must be limited and aware of whether the operation is safe to repeat.
- Emit latency, error-rate, saturation, route, and policy-denial metrics.
- Test configuration changes as carefully as application code. A broad route or an authentication bypass is an outage or security incident waiting to happen.

A gateway also needs a clear scope. It is a poor home for business workflows, long-running jobs, or direct database access. Those additions make a shared edge component difficult to deploy, scale, and reason about.

## When an API gateway is worth it

A single service with a small trusted client may only need a load balancer or reverse proxy. An API gateway earns its complexity when several clients and services need consistent edge policies, a stable public contract, and controlled evolution.

The enduring idea is simple: make the boundary explicit. Put general network and API policy at the entrance, preserve business decisions in the services that own them, and keep the gateway boring enough that it stays reliable.

## References

1. [Microsoft Azure Architecture Center: API gateway](https://learn.microsoft.com/en-us/azure/architecture/microservices/design/gateway)
2. [Google Cloud Architecture Center: API gateways](https://cloud.google.com/architecture/apigateway)
3. [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
4. [W3C Trace Context](https://www.w3.org/TR/trace-context/)
5. [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
