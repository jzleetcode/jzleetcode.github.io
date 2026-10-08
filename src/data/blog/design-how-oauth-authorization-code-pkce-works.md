---
author: JZ
pubDatetime: 2026-10-08T18:00:00Z
modDatetime: 2026-10-08T18:00:00Z
title: System Design - How OAuth 2.0 Authorization Code with PKCE Works
tags:
  - design-system
  - design-security
description: "A beginner-friendly walkthrough of OAuth 2.0 authorization code with PKCE: redirects, one-time codes, proof keys, client types, token exchange, and the boundary between authorization and authentication."
---

## Table of contents

## Context

This post explains authorization code with **PKCE** for engineers who know HTTP but have not built an OAuth integration. We will follow one request and explain why it crosses both a browser and a token endpoint.

Imagine a calendar app called TripBoard. It wants to read your calendar to suggest travel dates. Giving TripBoard your calendar password would give it much more power than it needs. Instead, the calendar service can grant limited access without revealing that password to the app.

That is the problem **OAuth 2.0** addresses. The [OAuth framework](https://www.rfc-editor.org/rfc/rfc6749.html#section-1) separates the user, the client requesting access, the authorization server issuing credentials, and the resource server protecting the data. The two servers may belong to the same provider, but they have different jobs.

```text
You                   TripBoard                Calendar provider
resource owner        OAuth client             authorization server
                      asks for permission      handles authorization

                                               calendar API
                                               resource server
                                               checks API credentials
```

The app needs an **access token**, a credential intended for the API. It does not need your password. The remaining question is how the right app gets that token.

## Why the browser returns a code, not the access token

The authorization code flow uses two paths:

- A **front channel**: redirects through the user's browser.
- A **token exchange**: an HTTP request from the OAuth client to the token endpoint.

For a server-backed app, its backend makes the exchange. For a browser-only app, browser JavaScript makes it; calling this path a token exchange does not make the browser a confidential environment.

The authorization server returns a short-lived **authorization code** through the redirect. The client then exchanges it for tokens. A code is bound to the client and redirect URI, and it cannot be successfully redeemed twice. It is not an API credential. These rules come from [RFC 6749's code grant](https://www.rfc-editor.org/rfc/rfc6749.html#section-4.1).

Separating the paths also creates room for another check: the client can prove that the party redeeming the code is the party that started this authorization attempt.

## PKCE is a secret chosen for one authorization attempt

PKCE stands for **Proof Key for Code Exchange**, pronounced "pixy." Its [original specification](https://www.rfc-editor.org/rfc/rfc7636.html#section-4) adds a pair of values:

- `code_verifier`: a high-entropy random string kept by the client for this attempt.
- `code_challenge`: a transformed version sent with the authorization request.

With the `S256` method, the transformation is:

```text
code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))

BASE64URL here uses URL-safe characters and omits '=' padding.
```

The server associates the challenge with the authorization code. At the token endpoint, it transforms the supplied verifier the same way and checks that the result matches. Someone who steals only the code has not obtained the verifier.

Think of the code as a claim ticket and the verifier as the second piece needed to collect the package. **PKCE does not encrypt the code**; it adds a check before redemption succeeds.

The verifier has 43 to 128 characters from the allowed unreserved character set. One straightforward construction uses 32 cryptographically random bytes encoded as unpadded base64url. This Node.js example creates the pair without printing the verifier:

```javascript
import { createHash, randomBytes } from "node:crypto";

function createPkce() {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");

  return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
}

const attempt = createPkce();
```

This is just the cryptographic building block, not a complete OAuth client. Real client software must also bind the attempt to the initiating user session and manage its expiry and callback.

## Following one authorization attempt

Here is the complete relationship between the two channels. The arrows describe a server-backed client; a public client performs the corresponding client actions without a backend-held secret.

```text
Browser             TripBoard client          Authorization server
   |                       |                           |
   | start connection      |                           |
   |---------------------->| create verifier, challenge|
   |                       | and state for this attempt|
   | redirect to /authorize|                           |
   |<----------------------|                           |
   | client_id, redirect_uri, scope, state,             |
   | code_challenge, code_challenge_method=S256         |
   |-------------------------------------------------->|
   |                  authenticate user / authorize    |
   | redirect to callback with code and state          |
   |<--------------------------------------------------|
   | callback              |                           |
   |---------------------->| validate callback binding |
   |                       |                           |
   |                       | POST /token               |
   |                       | code + code_verifier      |
   |                       |-------------------------->|
   |                       | check code, client,       |
   |                       | redirect URI and PKCE     |
   |                       |<--------------------------|
   |                       | access token              |
```

The provider can show consent or use an existing grant, depending on its policy. OAuth does not prescribe the user's particular login mechanism.

An illustrative authorization request contains these parameters. `STATE` and `CHALLENGE` stand for actual per-attempt values, not literal strings to send:

```text
GET /authorize?
    response_type=code&
    client_id=tripboard&
    redirect_uri=https%3A%2F%2Ftripboard.example%2Fcallback&
    scope=calendar.read&
    state=STATE&
    code_challenge=CHALLENGE&
    code_challenge_method=S256
```

`calendar.read` is a fictional provider-defined scope. The client follows the provider's actual endpoint, registration, and scope definitions rather than assuming that every provider uses these example values.

The token request includes `grant_type=authorization_code`, `code`, and `code_verifier`. When the authorization request included `redirect_uri`, the exchange includes the identical value. Public clients identify themselves with `client_id`; confidential clients authenticate using their registered method. A client identifier is not a password.

## Public and confidential describe where secrets can be kept

A **confidential client** can protect a credential, such as a secret held by a backend. A **public client** cannot reliably keep a shared secret from its users. Shipping a secret inside downloadable application code does not make it confidential. The [native-app best practices](https://www.rfc-editor.org/rfc/rfc8252.html#section-8.5) spell out this distinction for installed apps and favor an external user agent for authorization.

PKCE is not a replacement for a confidential client's authentication. It binds an individual code exchange to its initiating attempt. Client authentication identifies the registered client through a different mechanism.

The January 2025 [OAuth security best current practice](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1.1) requires public clients to use PKCE and recommends it for confidential clients. Use `S256`, not the legacy `plain` transformation that sends the verifier as the challenge.

## State and PKCE protect different bindings

In the diagram, TripBoard also creates an unpredictable `state` value, stores it with the attempt, and compares the returned value before accepting the callback.

- `state` can bind the browser callback to an authorization attempt initiated in this user session.
- PKCE binds redemption of the code to the verifier associated with that attempt.

There is an important nuance: correctly deployed PKCE can also provide CSRF protection under the conditions described in [RFC 9700's CSRF discussion](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.7). The client must know that the authorization server supports and enforces PKCE, and each fresh verifier must be bound to the initiating client and user-agent session for that transaction. Merely sending a challenge is not enough. It is therefore inaccurate to claim that a separate `state` parameter is universally mandatory whenever PKCE is present. This example deliberately keeps an explicit callback-binding check.

For concurrent attempts, store separate attempt records rather than one global verifier that the next browser tab overwrites. Consume the matching record once and discard expired records. That is an application design consequence of the per-attempt relationship, not a new OAuth parameter.

## Getting a token is not the same as logging in

OAuth answers a delegation question: what may this client access?

**OpenID Connect** adds an identity layer on top. It introduces the `openid` scope and an **ID token** for the client. The client validates it according to the provider's flow, including applicable issuer, audience, signature, expiry, and nonce checks. An ID token and an access token have different recipients and purposes; they are not interchangeable. See [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html#IDToken).

Likewise, an access token is not necessarily a JWT. Its format and the resource server's validation mechanism are implementation choices. For a bearer token, the important property is that possession is sufficient to use it. [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750.html#section-1.2) explains why it must be protected in transit and storage and defines transmission in the `Authorization: Bearer ...` header.

**PKCE protects authorization-code redemption, not every later use of the access token.** Stealing an ordinary bearer access token is a different problem.

## The configuration is part of the protocol

Before examining application code, identify these pieces:

| Setting                              | What it establishes                                                     |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Authorization server issuer          | Which provider the client trusts.                                       |
| Authorization and token endpoints    | Where the two channels terminate.                                       |
| Registered client ID and client type | Which app is requesting access and how it authenticates, if applicable. |
| Registered redirect URI              | Which callback is permitted to receive the result.                      |
| Requested scopes                     | Which provider-defined access the app asks for.                         |
| Supported PKCE methods               | Whether the server supports the `S256` exchange.                        |

[Authorization server metadata](https://www.rfc-editor.org/rfc/rfc8414.html#section-2) standardizes fields including `issuer`, `authorization_endpoint`, `token_endpoint`, `token_endpoint_auth_methods_supported`, and `code_challenge_methods_supported`. Metadata helps discover capabilities; it does not replace establishing trust in the intended issuer.

Common implementation failures now become easier to classify: a mismatched redirect URI breaks registration binding; a lost verifier breaks PKCE; a callback associated with the wrong session breaks attempt binding; treating an ID token as an API token breaks the identity/authorization boundary.

## The mental model to keep

The browser carries permission requests and a one-time code. The client redeems that code using a per-attempt verifier. The authorization server checks the relationships, and the resource server subsequently checks the API credential.

Each value has a job. Understanding those jobs is more useful than memorizing one provider's redirect URL.

## References

1. [RFC 6749: OAuth 2.0 authorization framework](https://www.rfc-editor.org/rfc/rfc6749.html), especially Sections 2.1 and 4.1.
2. [RFC 7636: Proof Key for Code Exchange](https://www.rfc-editor.org/rfc/rfc7636.html), especially Section 4 and the Appendix B test vector.
3. [RFC 9700: Best current practice for OAuth 2.0 security](https://www.rfc-editor.org/rfc/rfc9700.html), published January 2025; Sections 2.1.1 and 4.7.
4. [RFC 8252: OAuth 2.0 for native apps](https://www.rfc-editor.org/rfc/rfc8252.html), including the public-client discussion in Section 8.5.
5. [RFC 6750: OAuth 2.0 bearer token usage](https://www.rfc-editor.org/rfc/rfc6750.html).
6. [RFC 8414: OAuth 2.0 authorization server metadata](https://www.rfc-editor.org/rfc/rfc8414.html).
7. [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html).
8. [Node.js crypto documentation](https://nodejs.org/api/crypto.html), for `randomBytes` and `createHash` used in the illustrative PKCE helper.
