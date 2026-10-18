---
author: JZ
pubDatetime: 2026-10-18T18:45:27Z
modDatetime: 2026-10-18T18:45:27Z
title: System Design - How TLS Certificate Revocation Reaches a Browser
tags:
  - design-system
  - design-security
description: "Follow a compromised TLS certificate from CA revocation through CRLs and OCSP to browser checks, and see why freshness and privacy complicate the design."
---

## Table of contents

## A certificate with time left on the clock

Imagine that an attacker steals the private key for `shop.example`. The site's TLS certificate still has weeks before its expiration date. The owner gets a new key and certificate, but that alone does not tell everyone else to distrust the stolen one. A browser presented with the old certificate still needs a way to learn that its issuer has **revoked** it.

The certificate binds a name to a public key; the issuer's signature and the `notAfter` date establish who vouched for it and for how long. Revocation adds a different question: **has the issuer withdrawn that endorsement early?** It does not erase a certificate, and it does not magically notify every browser. This post follows the notification path, not TLS chain validation as a whole.

```text
           compromise reported
 Site owner ------------------------> Certificate authority (CA)
                                         |              |
                                         |              +--> signed OCSP answer
                                         +--> signed CRL (list of serials)
                                                   |
                             browser or its locally updated revocation data
                                                   |
                                   accept / reject old certificate
```

The CA revokes the **certificate identified by its issuer and serial number**; the browser still has to obtain and apply suitable status information. The [X.509 profile](https://www.rfc-editor.org/rfc/rfc5280.html#section-5) describes the certificate revocation list (CRL), while the [OCSP specification](https://www.rfc-editor.org/rfc/rfc6960.html#section-2) describes asking about an individual certificate.

## A signed list, or a signed answer

**CRL: download the issuer's list.** A CA publishes a signed list of revoked certificate serial numbers. It carries an issuer, a `thisUpdate` publication time, a `nextUpdate` deadline for the next list, and revocation entries. A client must check the CRL's issuer, signature, applicability, and freshness before deciding that a particular serial is absent. A certificate's CRL distribution point can tell clients where to find the relevant list. Downloading a whole list is reusable across many certificates, but a list can be large and a cached copy cannot reflect a revocation that happened after it was published. See [RFC 5280's CRL format](https://www.rfc-editor.org/rfc/rfc5280.html#section-5.1) and [distribution points](https://www.rfc-editor.org/rfc/rfc5280.html#section-4.2.1.13).

**OCSP: ask about one issuer/serial pair.** An authorized responder signs a reply containing `good`, `revoked`, or `unknown`, along with times that bound the response's usefulness. Here, `good` means **not known revoked** for the queried identifier; it does not prove that the certificate was legitimately issued or otherwise valid. `unknown` is not `good`. The client checks the responder's authority, signature, certificate identifier, and freshness before trusting the answer. [RFC 6960 defines the status meanings](https://www.rfc-editor.org/rfc/rfc6960.html#section-2.2) and [response validation](https://www.rfc-editor.org/rfc/rfc6960.html#section-4.2.2.2).

Suppose the stolen certificate has serial `42` and the CA publishes a CRL containing `42`. A client with that fresh, applicable CRL rejects it. Alternatively, an authorized OCSP responder returns a signed `revoked` response for the issuer/serial pair, and a client that checks OCSP rejects it. In either case, the decision is **not** based on a string saying `revoked` in an untrusted network packet: the issuer or authorized responder must authenticate the status.

## Why stapling did not end the story

With ordinary live OCSP lookup, a browser may have to contact the CA's responder while opening a site. That can add a network dependency and disclose a visit to the responder. **OCSP stapling** moves the lookup to the server: it fetches a signed OCSP response and sends it alongside its certificate during the TLS handshake. The browser can verify the signed response without asking the CA at connection time. In TLS 1.3 this status travels in an extension of the certificate entry, rather than the separate TLS 1.2 `CertificateStatus` message ([RFC 8446, §4.4.2.1](https://www.rfc-editor.org/rfc/rfc8446.html#section-4.4.2.1)).

```text
 CA responder          Website server                 Browser
      |  signed status       |                           |
      |--------------------->|                           |
      |                      | certificate + signed status|
      |                      |--------------------------->|
      |                      |                     verify locally
```

Stapling moves the request; it does not make a cached `good` answer instantly notice a new revocation. It also depends on the server supplying a usable response and the client deciding what to do if one is missing. You cannot infer the client's failure policy merely from seeing a `status_request` extension. [RFC 6960 discusses replay of precomputed responses](https://www.rfc-editor.org/rfc/rfc6960.html#section-5), and [Let's Encrypt's account of ending OCSP](https://letsencrypt.org/2024/12/05/ending-ocsp.html) explains the privacy and operational trade-offs.

## What browsers actually do

Protocols describe possible checks; browsers decide which ones to deploy. Chromium says [CRLSets](https://www.chromium.org/Home/chromium-security/crlsets/) are its main way to quickly block certificates in emergencies and that it does **not generally perform live OCSP or CRL checks**. Firefox describes [CRLite](https://hacks.mozilla.org/2025/08/crlite-fast-private-and-comprehensive-certificate-revocation-checking-in-firefox/), a compact, periodically updated local representation of revocations, so checking need not disclose each visit to a CA. Neither claim means every TLS client behaves the same way.

The ecosystem is also changing at the issuer end. On **August 6, 2025**, [Let's Encrypt shut down its OCSP service](https://letsencrypt.org/2025/08/06/ocsp-service-has-reached-end-of-life) and switched to publishing revocation information through CRLs. Therefore, "turn on OCSP stapling for every certificate" is not a universal 2026 recommendation: first check whether **your issuer provides OCSP at all**, then check the behavior of the clients you support.

## The mental model

A certificate's expiry date is a scheduled end; revocation is an early withdrawal. A CA signs either a periodically distributed list or a per-certificate answer, and a client must receive, authenticate, and apply it. There is always a trade-off between **freshness**, **availability**, and **privacy**: checking on every visit can leak where you browse or fail when a responder is down, while checking cached or locally distributed information introduces an update window. This is why revocation is a delivery-system problem as much as a cryptography problem.

## References

1. [RFC 5280: X.509 certificate and CRL profile](https://www.rfc-editor.org/rfc/rfc5280.html#section-5).
2. [RFC 6960: OCSP response states and validation](https://www.rfc-editor.org/rfc/rfc6960.html#section-2).
3. [RFC 8446: TLS 1.3 OCSP status in certificate entries](https://www.rfc-editor.org/rfc/rfc8446.html#section-4.4.2.1).
4. [Chromium: CRLSets and online checking](https://www.chromium.org/Home/chromium-security/crlsets/).
5. [Mozilla: CRLite revocation checking](https://hacks.mozilla.org/2025/08/crlite-fast-private-and-comprehensive-certificate-revocation-checking-in-firefox/).
6. [Let's Encrypt: OCSP service end of life, August 2025](https://letsencrypt.org/2025/08/06/ocsp-service-has-reached-end-of-life).
