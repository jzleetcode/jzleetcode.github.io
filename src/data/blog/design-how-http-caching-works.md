---
author: JZ
pubDatetime: 2026-10-29T18:45:00Z
modDatetime: 2026-10-29T18:45:00Z
title: System Design - How HTTP Caching Works
tags:
  - design-system
  - design-web
description: "A practical mental model for HTTP caching: freshness, validation, Cache-Control, validators, and safe policies for versioned assets and dynamic responses."
---

## Table of contents

## The page that was fast for the wrong reason

Imagine that an online store has just changed the price of a product. The origin server returns the new HTML immediately, yet some visitors still see the old price. Others get the new price, and a few are served a page without touching the origin at all.

That is not necessarily a bug in the browser. HTTP caching is a distributed agreement between an origin, browsers, and shared caches such as reverse proxies or CDNs. The agreement answers two questions for each stored response:

1. **May I use this response without asking the origin?** This is freshness.
2. **If I must ask, can I cheaply prove that my stored response is still current?** This is validation.

Caching is powerful because it trades a repeat trip to the origin for a local response. It is dangerous when a response belongs to one user, changes more often than its policy says, or varies by request data that a cache cannot distinguish.

## One request can meet several caches

The word “cache” does not name one machine. A request might encounter a browser cache, a service-worker cache, a company proxy, and a CDN before it reaches the application. Each cache uses the response headers and its own stored copy.

```text
browser
  |
  | GET /products/42
  v
+----------------+       fresh hit       +----------------+
| browser cache  |---------------------->| render page    |
+----------------+                       +----------------+
  | stale or absent
  v
+----------------+       fresh hit       +----------------+
| CDN / proxy    |---------------------->| return bytes   |
+----------------+                       +----------------+
  | stale or absent
  v
+----------------+                       +----------------+
| origin server  |---------------------->| database/app   |
+----------------+                       +----------------+
```

A cache key normally starts with the request method and target URL. A response can add request-header dimensions through `Vary`. For example, `Vary: Accept-Encoding` tells a cache that gzip and Brotli representations cannot be substituted for one another. `Vary: Cookie` is usually a warning sign for a shared cache: it creates many variants and is easy to get wrong.

## Freshness: a promise with an expiration time

An origin can give a response a freshness lifetime with `Cache-Control: max-age=<seconds>`. While a cached response is younger than that lifetime, a cache may reuse it without contacting the origin.

```http
Cache-Control: public, max-age=600
```

The response is fresh for ten minutes. `public` permits a shared cache to store it; `private` says a shared cache must not store it, though a browser may. A cache also computes the response's current age from its `Date` header and the time it has been stored, so it does not accidentally give an already-old response a second full lifetime.

The useful directives are deliberately small in number:

| Directive      | Meaning                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `max-age=600`  | A browser or shared cache may reuse the response for 600 seconds.                               |
| `s-maxage=600` | Overrides `max-age` for shared caches only.                                                     |
| `no-cache`     | Storage is allowed, but reuse needs successful validation first.                                |
| `no-store`     | Do not store the response. Use for sensitive data that should not remain in cache storage.      |
| `private`      | Do not store in a shared cache.                                                                 |
| `immutable`    | While fresh, the representation will not change; especially useful for versioned static assets. |

`no-cache` is often misunderstood. It does **not** mean “do not cache.” It means “do not reuse without asking.” A validator can make that asking very cheap.

## Validation: asking without downloading again

Once a response is stale, a cache does not have to download its body again. The origin can provide a validator such as an `ETag` or `Last-Modified` timestamp. On a later request, the cache presents that validator conditionally.

```text
cache                              origin
  |                                   |
  | GET /logo.svg                    |
  | If-None-Match: "a91f"             |
  |----------------------------------->|
  |                                   | compare current representation
  |       304 Not Modified            |
  |<-----------------------------------|
  | reuse stored body; update metadata |
```

`304 Not Modified` has no new body. It says the cached body remains valid, which saves transfer bytes and often application work. If the content changed, the origin replies `200 OK` with the new representation and a new validator.

`ETag` is an opaque version label. It need not be a literal file hash; the origin only has to change it when the selected representation changes. `Last-Modified` / `If-Modified-Since` is easier to generate, but timestamp resolution and clock behavior can make it less precise. If both are available, clients typically use the ETag condition.

## The two policies that avoid most surprises

Static assets and personalized documents deserve different policies.

### Versioned assets: cache for a long time

Build tools commonly put content fingerprints in asset names:

```text
/assets/app.7d4e1c.js
/assets/site.91b3aa.css
```

When bytes change, the URL changes. That makes a long policy safe:

```http
Cache-Control: public, max-age=31536000, immutable
```

The HTML document is the directory that points at these assets, so it gets a shorter policy or validation policy. A deploy changes the HTML to name the new asset; clients can keep old assets for pages that still refer to them without seeing a mix of old and new bytes.

### HTML and API responses: choose correctness first

For a public product page, a short shared-cache lifetime can be useful:

```http
Cache-Control: public, max-age=60, s-maxage=300
```

Browsers recheck after one minute, while a CDN can reuse the response for five minutes. The precise values are product decisions, not universal defaults: they define how stale a result may be.

For an authenticated account page, avoid a shared copy:

```http
Cache-Control: private, no-cache
```

The browser may store the page, but must validate before reuse. For highly sensitive responses, such as a one-time recovery-code page, use `no-store` and consider the rest of the delivery path as well.

## A small cache decision tree

```text
received a request
        |
        v
does a matching stored response exist? -- no --> fetch from origin
        |
       yes
        |
        v
is it fresh under its Cache-Control policy? -- yes --> serve it
        |
       no
        |
        v
does it have a validator? -- yes --> conditional request --> 304: serve stored body
        |                                        |
       no                                        `--> 200: replace body
        |
        `--> fetch a full new response
```

Two details make this tree more subtle in production. First, a cache must honor the request and response directives that restrict reuse; it cannot decide that a convenient stale result is “probably fine.” Second, invalidation is not magic. Purging a CDN key can help after an emergency change, but versioned URLs and deliberate short policies are more reliable routine tools.

## Common failure modes

- **Caching a user-specific response as `public`.** A shared cache may serve one user's representation to another. Default to `private` when a response depends on authentication, then deliberately make only safe data public.
- **Changing bytes at a supposedly immutable URL.** A browser with a year-long fresh entry has no reason to ask for the replacement. Rename versioned assets instead.
- **Ignoring `Vary`.** If language, compression, or another request header selects the representation, the cache key needs that dimension. Avoid `Vary: *`; it prevents useful reuse.
- **Treating `no-cache` as `no-store`.** The former enables conditional validation; the latter prevents storage. They solve different problems.
- **Using cache headers as access control.** A cache policy does not authenticate a request or make a public URL private. Authorization belongs at the origin or an enforcing edge.

The durable mental model is simple: every response carries a reuse contract. `Cache-Control` sets the allowed age, validators make rechecking cheap, and the cache key determines which request is allowed to reuse which representation. Once those three pieces are explicit, cache behavior stops feeling mysterious.

## References

1. IETF, [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111).
2. IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110), especially conditional requests and validators.
3. MDN Web Docs, [HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching).
