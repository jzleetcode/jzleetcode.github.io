---
author: JZ
pubDatetime: 2026-10-04T18:43:14Z
modDatetime: 2026-10-04T18:43:14Z
title: System Design - How WebAuthn Passkeys Work
tags:
  - design-system
  - design-security
description: "A beginner-friendly walkthrough of passkey registration and sign-in, including WebAuthn challenges, public-key signatures, phishing resistance, and device sync."
---

## Table of contents

## Context

Imagine signing in to a website from a new laptop. With a password, the website asks you to send the same secret you chose at sign-up. If the site is breached, phished, or tricked into reusing that secret, an attacker may be able to sign in as you.

A **passkey** changes what the server asks for. Instead of asking the browser to send a reusable secret, the website asks an authenticator to prove that it holds a private key. The public key is registered with the website; the private key stays under the control of your device or passkey provider.

WebAuthn is the browser API and protocol that lets a website and an authenticator perform this public-key ceremony. The website is the **relying party** (RP), usually identified by a domain such as `example.com`. A platform authenticator might be built into a phone or computer; a roaming authenticator might be a hardware security key.

## The key pair

At registration, an authenticator creates a credential for the relying party. Conceptually, that credential contains a key pair:

- The **private key** signs a fresh challenge during sign-in.
- The **public key** is sent to the website and is used to verify that signature.
- A **credential ID** lets the website and browser refer to this particular credential later.

The website does not receive the private key, a fingerprint, or a device PIN. A biometric or device PIN can unlock the authenticator locally, but the web page receives only the protocol response and the authenticator's signed verification flags.

## Registration: creating a passkey

The flow starts on the server. It creates a random, short-lived challenge and returns it with the relying-party ID and account details. The page passes those creation options to `navigator.credentials.create()`.

```text
Website server       Browser / WebAuthn       Authenticator
     |                       |                      |
     |-- challenge, RP ID --->|                      |
     |                       |-- create credential ->|
     |                       |                      | create key pair
     |                       |<-- ID, public key ----|
     |<-- registration result|                      |
     | verify and store public key + credential ID  |
```

The browser checks that the website is allowed to request a credential for the supplied RP ID. The authenticator creates a credential, often after the user confirms the action with a screen lock, PIN, or biometric. The browser returns a credential ID and an attestation response that contains the public key and authenticator data.

The website verifies the response, including the challenge and origin, then stores the credential ID and public key with the user's account. The browser and authenticator keep the private credential available for later use. A user can register more than one passkey, for example on another device or a security key.

## Sign-in: proving possession

Sign-in repeats the pattern, but the authenticator signs instead of creating a key. The server makes a new one-time challenge; the browser calls `navigator.credentials.get()` and asks the authenticator to use a credential scoped to the relying party.

```text
Website server       Browser / WebAuthn       Authenticator
     |                       |                      |
     |-- fresh challenge --->|                      |
     |                       |-- get assertion ----->|
     |                       |                      | user verifies
     |                       |                      | sign challenge
     |                       |<-- signed assertion -|
     |<-- assertion ---------|                      |
     | verify signature, origin, RP ID, and challenge|
     |-- create authenticated session -------------->|
```

The assertion binds two pieces of data together: `authenticatorData` and the SHA-256 hash of `clientDataJSON`. The client data includes the challenge and the browser origin; authenticator data includes a hash of the RP ID and flags for user presence and user verification. The server checks that the challenge is the one it issued, the origin and RP ID match the site, the required verification flags are present, and the signature verifies with the stored public key.

A copied assertion cannot be reused for a later login because that login has a different challenge. A credential for `example.com` is also not available to a lookalike domain such as `examp1e.com`. The browser's origin checks and the signed RP ID binding make ordinary credential-phishing pages much less useful than they are against passwords.

## What passkeys do—and do not—guarantee

**A passkey is not the biometric.** The biometric or PIN is one local way to authorize the authenticator. WebAuthn reports whether user verification happened; it does not send the biometric template or PIN to the website. A relying party can require user verification when it creates or requests a credential, but it should validate the returned flag rather than assume every passkey involved a fingerprint.

**Some passkeys sync; some do not.** A device-bound credential stays with its authenticator. A syncable passkey can be made available on a user's other devices through a credential provider. Sync makes recovery and device changes easier, while making the provider account and its recovery process part of the security boundary. The website still stores only the public key, not the private key.

**Phishing resistance is not account invulnerability.** WebAuthn protects the credential ceremony against a fake site that has a different origin. It does not undo a stolen authenticated session, compromised device, weak account recovery flow, or a takeover of the user's passkey-provider account. Sites still need safe recovery, session expiration, and device-removal flows.

## References

1. W3C, [Web Authentication: An API for accessing Public Key Credentials (WebAuthn) Level 3](https://www.w3.org/TR/webauthn-3/).
2. FIDO Alliance, [Passkeys](https://fidoalliance.org/passkeys/).
3. Google Identity, [Server-side passkey registration](https://developers.google.com/identity/passkeys/developer-guides/server-registration).
4. Google Identity, [Server-side passkey authentication](https://developers.google.com/identity/passkeys/developer-guides/server-authentication).
