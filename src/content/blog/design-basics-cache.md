---
author: JZ
pubDatetime: 2025-06-18T06:23:00Z
modDatetime: 2025-06-18T06:23:00Z
title: System Design - All about Caching
featured: true
tags:
  - design-system
  - c-twitter
description:
  "system design basics, all about caching (cache)"
---

## Table of contents

## Concept

- Take advantage of the locality of reference principle: recently requested data is likely to be requested again.
- Exist at all levels in architecture, but often found at the level nearest to the front end.

### Application server cache
- Cache placed on a request layer node.
- When a request layer node is expanded to many nodes
    - Load balancer randomly distributes requests across the nodes.
    - The same request can go to different nodes.
    - Increase cache misses.
    - Solutions:
        - Global caches
        - Distributed caches

## Distributed cache
- Each request layer node owns part of the cached data.
- The Entire cache is divided up using a consistent hashing function.
- Pro
    - Cache space can be increased easily by adding more nodes to the request pool.
- Con
    - A missing node leads to cache lost.

## Global cache
- A server or file store that is faster than the original store, and accessible by all request layer nodes.
- Two common forms
    - Cache server handles cache miss.
        - Used by most applications.
    - Request nodes handle cache miss.
        - Have a large percentage of the hot data set in the cache.
        - An architecture where the files stored in the cache are static and shouldn’t be evicted.
        - The application logic understands the eviction strategy or hot spots better than the cache

## Content distributed network (CDN)
- For sites serving large amounts of static media.
- Process
    - A request first asks the CDN for a piece of static media.
    - CDN serves that content if it has it locally available.
    - If content isn’t available, CDN will query back-end servers for the file, cache it locally and serve it to the requesting user.
- If the system is not large enough for CDN, it can be built like this:
    - Serving static media off a separate subdomain using lightweight HTTP server (e.g., Nginx).
    - Cut over the DNS from this subdomain to a CDN later.

## Cache invalidation
- Keep cache coherent with the source of truth. Invalidate cache when the source of truth has changed.
- Write-through cache
    - Data is written into the cache and permanent storage at the same time. Ensures strong consistency. The app does not interact with the database directly; the cache does. Used where write rate is low and when data freshness is critical.
    - Pro
        - Fast retrieval, complete data consistency, robust to system disruptions.
    - Con
        - Higher latency for write operations.
        - Cache space might get wasted with infrequently accessed data.
- Cache Aside Strategy, Lazy Loading
    - Data is written to permanent storage, not cache. The app tries to read data from the cache. On cache miss, the app reads data from the database and writes to cache. The cache does not interact with the database directly; the app does. Used in read-heavy workloads, such as configuration data or user profiles.
    - Pro
        - Reduce the cache that is not used.
    - Con
        - Query for recently written data creates cache miss and higher latency.
        - Risk of data inconsistency.
- Read Through Strategy
    - The app does not interact with the database directly; the cache does. The app reads data from the cache. On cache miss, the cache reads data from the database. The data gets written to the cache and then returned to the app. Used in read-heavy workloads, such as a newsfeed or a product catalog.
    - Pro
        - low latency
    - Con
        - risk of data inconsistency
- Write-around cache
    - The app writes to the database. It tries to read data from cache later. The app reads from the database on cache miss and updates the cache. Used for large data objects where updates happen rarely.
    - Pro
        - optimized cache storage for frequently accessed data
    - Con
        - risk of increased latency because of cache misses
- Write-back cache
    - Data is only written to cache. Write to the permanent storage is done later on asynchronously. Used in write-heavy workloads where throughput is more important than durability.
    - Pro
        - Low write latency, high throughput for write-intensive applications (through batching).
    - Con
        - Risk of data loss in case of system disruptions.

With the 2 popular cache implementations are Redis and Memcached:

1. Read heavy workload: use cache aside or read through strategies
2. Consistency vs throughput: use write-through or write-back strategies
3. Avoid caching one-off writes: use write-around strategy

## Cache eviction policies

- FIFO: first in first out
- LIFO: last in first out
- LRU: least recently used
- MRU: most recently used
- LFU: least frequently used
- RR: random replacement

## References

1. Neo Kim [Blog](https://newsletter.systemdesign.one/p/cache-strategies)
