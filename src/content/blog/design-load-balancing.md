---
author: JZ
pubDatetime: 2025-06-29T06:23:00Z
modDatetime: 2025-06-29T06:23:00Z
title: System Design - Load Balancing
featured: true
tags:
  - design-system
description:
  "system design basics - load balancing"
---

## Table of contents

## Context

A component that distributes traffic evenly among servers. Each service has a different workload and usage patten.

## Algorithms

### Round Robin

This algorithm sends requests to each of the servers in sequence and evenly distributes the load.
It's straightforward to set up and understand, but slow requests might overload the server.

### Weighted Round Robin

1. The load balancer assigns a weight to each server based on its capacity.
2. It then forwards requests based on server weight; the more the weight, the higher the requests

Imagine weighted round robin as an extension of the round robin algorithm. It means servers with higher capacity get more requests in sequential order.

This approach offers better performance. Yet scaling needs manual updates to server weights, thus increasing operational costs.

### Least Response Time

1. The load balancer monitors the response time of the servers.
2. It then forwards the request to the server with the fastest response time.
3. If two servers have the same latency, the server with the fewest connections gets the request.

This approach has the lowest latency, yet there’s an overhead with server monitoring. Besides latency spikes might cause wrong routing decisions.

### Adaptive

1. An agent runs on each server, which sends the server status to the load balancer in real-time.
2. The load balancer then routes the requests based on server metrics, such as CPU and memory usage.

Put simply, servers with a lower load receive more requests. It means better fault tolerance. Yet it’s complex to set up, also the agent adds an extra overhead.

### Least Connections

1. The load balancer tracks the active connections to the server.
2. It then routes requests to the server with fewer connections.

It ensures a server does not get overloaded during peak traffic. Yet tracking the number of active connections makes it complex.
Also, session affinity needs extra logic.

### IP Hash

1. The load balancer uses a hash function to convert the client’s IP address into a number.
2. It then finds the server using the number.

This approach avoids the need for an external storage for sticky sessions.

Yet there’s a risk of server overload if IP addresses aren’t random.
Also, many clients might share the same IP address, thus making it less effective.

### Least Bandwidth

Similar to the least connections, but route to the server serving the least bandwidth for IO.

## Implementation

- Smart clients
- Hardware load balancers
- Software load balancers

A hardware load balancer runs on a separate physical server. Although it offers high performance, it's expensive.

So they set up a software load balancer. It runs on general-purpose hardware. Besides, it's easy to scale and cost-effective.

## References

1. Neo Kim [blog](https://newsletter.systemdesign.one/p/load-balancing-algorithms)
