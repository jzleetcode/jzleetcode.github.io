---
author: JZ
pubDatetime: 2026-04-17T12:00:00Z
modDatetime: 2026-04-17T12:00:00Z
title: System Design - How the TLS Handshake Works
tags:
  - design-system
  - design-networking
description:
  "How TLS (Transport Layer Security) works: the handshake protocol, certificate verification, key exchange with Diffie-Hellman, symmetric encryption, TLS 1.2 vs 1.3, and a source code walkthrough from Go's crypto/tls package."
---

## Table of contents

## Context

Every time you open a website, send an API request, or push code to GitHub, your data travels through networks you do not control. Routers, ISPs, coffee-shop Wi-Fi access points — any of these could read or tamper with your traffic. The internet was originally designed without encryption. HTTP sends everything in plaintext.

**TLS** (Transport Layer Security) solves this. It wraps a TCP connection in an encrypted tunnel so that:

- **Confidentiality:** No one between you and the server can read the data.
- **Integrity:** No one can modify the data without detection.
- **Authentication:** You can verify that you are talking to the real server, not an impostor.

TLS sits between the application layer (HTTP, gRPC, SMTP) and the transport layer (TCP). When you see `https://`, that is HTTP running inside a TLS tunnel.

```
   Application Data (HTTP request, gRPC call, etc.)
          |
          v
   +------------------+
   |       TLS        |   encryption, authentication
   +------------------+
          |
          v
   +------------------+
   |       TCP        |   reliable byte stream
   +------------------+
          |
          v
   +------------------+
   |       IP         |   routing
   +------------------+
```

The most critical part of TLS is the **handshake** — the initial negotiation where client and server agree on encryption keys without ever sending those keys over the wire. Let's walk through how this works, step by step.

## The Problem: Exchanging Keys Over an Insecure Channel

Symmetric encryption (like AES) is fast and secure, but it requires both sides to share the same secret key. If you just sent the key over the network, an eavesdropper could grab it and decrypt everything.

Asymmetric encryption (like RSA) lets you encrypt with a public key that only the matching private key can decrypt. But asymmetric encryption is roughly **100x slower** than symmetric encryption — too slow for bulk data transfer.

TLS uses both:

```
  +-------------------+     +-------------------+
  |   Asymmetric      |     |   Symmetric       |
  |   (RSA, ECDHE)    |     |   (AES-GCM)       |
  |                   |     |                   |
  |   Slow but safe   |     |   Fast            |
  |   for key         |---->|   for bulk         |
  |   exchange        |     |   data transfer    |
  +-------------------+     +-------------------+
       Handshake                 Data phase
```

The handshake uses asymmetric cryptography to securely establish a shared secret. Both sides then derive symmetric keys from that secret. All subsequent data flows through the fast symmetric cipher. This two-phase approach gives you the security of asymmetric crypto with the speed of symmetric crypto.

## TLS 1.2 Handshake: Step by Step

TLS 1.2 (RFC 5246, published 2008) is still widely deployed. Its handshake takes **two round-trips** between client and server before any application data can flow.

```
   Client                                           Server
     |                                                |
     |  (1) ClientHello                               |
     |  - supported TLS versions                      |
     |  - supported cipher suites                     |
     |  - client random (32 bytes)                    |
     |----------------------------------------------->|
     |                                                |
     |                      (2) ServerHello           |
     |                      - chosen TLS version      |
     |                      - chosen cipher suite     |
     |                      - server random (32 bytes)|
     |<-----------------------------------------------|
     |                                                |
     |                      (3) Certificate           |
     |                      - server's X.509 cert     |
     |                      - intermediate CA certs   |
     |<-----------------------------------------------|
     |                                                |
     |                      (4) ServerKeyExchange      |
     |                      - ECDHE parameters        |
     |                      - server's DH public key  |
     |                      - signature (proof)       |
     |<-----------------------------------------------|
     |                                                |
     |                      (5) ServerHelloDone       |
     |<-----------------------------------------------|
     |                                                |
     |  (6) ClientKeyExchange                         |
     |  - client's DH public key                      |
     |----------------------------------------------->|
     |                                                |
     |  Both sides now compute the shared secret      |
     |  from (client DH key + server DH key)          |
     |                                                |
     |  (7) ChangeCipherSpec                          |
     |  "switching to encrypted mode"                 |
     |----------------------------------------------->|
     |                                                |
     |  (8) Finished (encrypted)                      |
     |  - hash of all handshake messages              |
     |----------------------------------------------->|
     |                                                |
     |                (9) ChangeCipherSpec             |
     |<-----------------------------------------------|
     |                                                |
     |               (10) Finished (encrypted)        |
     |<-----------------------------------------------|
     |                                                |
     |  ============ Encrypted tunnel open ===========|
     |                                                |
     |  Application data (HTTP, gRPC, etc.)           |
     |<----------------------------------------------->|
```

Let's examine each step.

### Step 1: ClientHello

The client starts by announcing what it supports. The most important fields:

- **Client random:** 32 bytes of randomness. This will be mixed into the key derivation later.
- **Cipher suites:** An ordered list like `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256`. Each name encodes the full recipe: key exchange algorithm (ECDHE), authentication (RSA), bulk cipher (AES-128-GCM), and hash (SHA-256).
- **SNI (Server Name Indication):** The hostname the client wants to reach. This lets a single IP host multiple TLS sites.

In Go's `crypto/tls` package, the `ClientHello` is built in [`tls/handshake_client.go`](https://github.com/golang/go/blob/master/src/crypto/tls/handshake_client.go):

```go
hello := &clientHelloMsg{
    vers:               clientHelloVersion,
    random:             make([]byte, 32),
    compressionMethods: []uint8{compressionNone},
    serverName:         hostnameInSNI(config.ServerName),
    supportedCurves:    config.curvePreferences(),
    supportedPoints:    []uint8{pointFormatUncompressed},
    cipherSuites:       config.cipherSuites(),
    // ...
}
io.ReadFull(config.rand(), hello.random)
```

### Step 2-3: ServerHello and Certificate

The server picks one cipher suite from the client's list, generates its own 32-byte random, and sends its **X.509 certificate**. The certificate contains:

- The server's **public key**.
- The server's **domain name** (in the Subject Alternative Name field).
- A **signature** from a Certificate Authority (CA) that vouches for the server's identity.

### Step 4: Certificate Verification — The Chain of Trust

The client does not blindly trust the server's certificate. It builds a **chain of trust** back to a root CA that the client's operating system already trusts:

```
  +---------------------------+
  |   Root CA Certificate     |   Pre-installed in your OS/browser
  |   (self-signed)           |   (~150 root CAs worldwide)
  +------------+--------------+
               |
               | signed
               v
  +---------------------------+
  |   Intermediate CA Cert    |   Sent by the server in step (3)
  |   (signed by Root CA)     |
  +------------+--------------+
               |
               | signed
               v
  +---------------------------+
  |   Server Certificate      |   Contains server's public key
  |   (signed by Intermediate)|   + domain name
  +---------------------------+
```

The client verifies each signature in the chain:

1. Is the server cert signed by the intermediate CA? Check the signature using the intermediate's public key.
2. Is the intermediate cert signed by the root CA? Check using the root's public key.
3. Is the root CA in my trust store? If yes, the chain is valid.

The client also checks that the certificate's domain matches the SNI from step 1, and that the certificate has not expired.

In Go, this verification happens in [`x509/verify.go`](https://github.com/golang/go/blob/master/src/crypto/x509/verify.go):

```go
func (c *Certificate) Verify(opts VerifyOptions) (chains [][]*Certificate, err error) {
    // ... build chain from leaf to root
    // ... check signature at each level
    // ... check expiry, hostname, key usage
}
```

### Step 5-6: Key Exchange with Diffie-Hellman

This is the clever part. The server and client each generate a temporary (ephemeral) Diffie-Hellman key pair. They exchange public keys, and each side independently computes the same shared secret — without ever sending it over the wire.

Here is how Elliptic Curve Diffie-Hellman (ECDHE) works conceptually:

```
  Client                              Server
    |                                    |
    |  pick random private key: a        |  pick random private key: b
    |  compute public key: A = a * G     |  compute public key: B = b * G
    |                                    |
    |          A  (client public key)    |
    |  --------------------------------> |
    |                                    |
    |          B  (server public key)    |
    |  <-------------------------------- |
    |                                    |
    |  shared = a * B                    |  shared = b * A
    |        = a * (b * G)              |        = b * (a * G)
    |        = ab * G                    |        = ab * G
    |                                    |
    |  Both arrive at the same point!    |
```

`G` is a well-known base point on an elliptic curve (like P-256 or X25519). The math guarantees that given `A = a * G`, it is computationally infeasible to recover `a` — this is the **elliptic curve discrete logarithm problem**.

The "E" in ECDHE stands for **Ephemeral**: the keys `a` and `b` are thrown away after the handshake. Even if someone steals the server's long-term private key later, they cannot decrypt past sessions. This property is called **forward secrecy**.

### Step 7-8: Deriving Session Keys

Both sides now have three ingredients:

1. Client random (32 bytes, sent in plaintext)
2. Server random (32 bytes, sent in plaintext)
3. Pre-master secret (from Diffie-Hellman, never sent over the wire)

They feed these into a **PRF** (Pseudo-Random Function) to derive the actual encryption keys:

```
  client random + server random + pre-master secret
                      |
                      v
              +---------------+
              |     PRF       |  (TLS 1.2 uses SHA-256 based)
              +-------+-------+
                      |
          +-----------+-----------+
          |           |           |
          v           v           v
    client write   server write  MAC keys
    key (AES)      key (AES)     (if needed)
```

Both sides derive identical keys. The client encrypts data with the "client write key" and decrypts server data with the "server write key," and vice versa. The `Finished` messages (steps 8 and 10) are the first encrypted messages — each side sends a hash of the entire handshake transcript, encrypted with the new keys. If the other side can decrypt and verify this hash, the handshake succeeded.

## TLS 1.3: Faster and Simpler

TLS 1.3 (RFC 8446, published 2018) redesigned the handshake to complete in just **one round-trip** — halving the latency:

```
   Client                                           Server
     |                                                |
     |  (1) ClientHello                               |
     |  - supported versions                          |
     |  - supported cipher suites                     |
     |  - key_share: client DH public keys            |
     |  - client random                               |
     |----------------------------------------------->|
     |                                                |
     |                      (2) ServerHello           |
     |                      - chosen cipher suite     |
     |                      - key_share: server DH key|
     |                      - server random           |
     |<-----------------------------------------------|
     |                                                |
     |              {EncryptedExtensions}              |
     |              {Certificate}                     |
     |              {CertificateVerify}               |
     |              {Finished}                        |
     |<-----------------------------------------------|
     |                                                |
     |  {Finished}                                    |
     |----------------------------------------------->|
     |                                                |
     |  ========= Encrypted tunnel open ==============|
     |                                                |
     |  {} = encrypted with handshake keys            |
```

Key differences from TLS 1.2:

1. **One round-trip:** The client sends its DH public key(s) in the very first message (it guesses which curves the server supports). The server responds with its DH key, certificate, and `Finished` — all in one flight.

2. **Encrypted earlier:** The server's certificate is encrypted (using handshake keys derived from the DH exchange). In TLS 1.2, certificates were sent in plaintext, leaking which site you were visiting.

3. **Removed insecure options:** TLS 1.3 drops RSA key exchange (no forward secrecy), CBC mode ciphers (vulnerable to padding oracle attacks), and many other legacy options. Only five cipher suites remain:

```
  TLS_AES_128_GCM_SHA256
  TLS_AES_256_GCM_SHA384
  TLS_CHACHA20_POLY1305_SHA256
  TLS_AES_128_CCM_SHA256
  TLS_AES_128_CCM_8_SHA256
```

4. **0-RTT resumption:** If the client has connected before, it can send encrypted application data in the very first message (zero round-trips). The trade-off: 0-RTT data is vulnerable to **replay attacks**, so it should only carry idempotent requests (like GET).

In Go's implementation, TLS 1.3 handshake logic lives in [`tls/handshake_client_tls13.go`](https://github.com/golang/go/blob/master/src/crypto/tls/handshake_client_tls13.go):

```go
func (hs *clientHandshakeStateTLS13) handshake() error {
    // 1. Already sent ClientHello with key shares
    if err := hs.processServerHello(); err != nil {
        return err
    }
    // 2. Derive handshake keys from DH shared secret
    hs.establishHandshakeKeys()
    // 3. Read encrypted server messages
    if err := hs.readServerParameters(); err != nil {
        return err
    }
    if err := hs.readServerCertificate(); err != nil {
        return err
    }
    if err := hs.readServerFinished(); err != nil {
        return err
    }
    // 4. Send client Finished, derive application keys
    if err := hs.sendClientFinished(); err != nil {
        return err
    }
    return nil
}
```

## Key Derivation in TLS 1.3: HKDF

TLS 1.3 replaced the PRF with **HKDF** (HMAC-based Key Derivation Function, RFC 5869). HKDF works in two stages:

```
  HKDF-Extract                    HKDF-Expand
  (concentrate entropy)           (derive specific keys)

  Input Key Material              PRK (from Extract)
  + Salt                          + Info label
        |                               |
        v                               v
  +------------+                 +-------------+
  |  HMAC      |  --> PRK  -->  |   HMAC      | --> Output Key
  +------------+                 +-------------+
```

TLS 1.3 runs a key schedule that derives different keys for different phases:

```
  (no input)
       |
       v
  HKDF-Extract(salt=0, IKM=0)  --> Early Secret
       |
       +-- Derive-Secret("ext binder")  --> binder key (PSK)
       +-- Derive-Secret("c e traffic") --> client early traffic key (0-RTT)
       |
       v
  HKDF-Extract(salt=Early Secret, IKM=DHE shared secret)
       |                                 --> Handshake Secret
       |
       +-- Derive-Secret("c hs traffic") --> client handshake key
       +-- Derive-Secret("s hs traffic") --> server handshake key
       |
       v
  HKDF-Extract(salt=Handshake Secret, IKM=0)
       |                                 --> Master Secret
       |
       +-- Derive-Secret("c ap traffic") --> client application key
       +-- Derive-Secret("s ap traffic") --> server application key
       +-- Derive-Secret("res master")   --> resumption master secret
```

Each `Derive-Secret` call includes a hash of the handshake transcript up to that point, binding the keys to the specific connection. If even one byte of the handshake was tampered with, both sides would derive different keys and the `Finished` verification would fail.

## What Happens When TLS Goes Wrong

Understanding the handshake helps you diagnose common failures:

| Error | What happened |
|-------|---------------|
| `certificate has expired` | Server cert's `notAfter` date has passed. Renew the cert. |
| `certificate signed by unknown authority` | Client's trust store doesn't contain the root CA. Common with self-signed certs or missing intermediate certs. |
| `handshake failure` | No overlapping cipher suites. Often happens when a client requires TLS 1.3 but the server only supports 1.2. |
| `certificate name mismatch` | The hostname in the URL doesn't match the cert's SAN (Subject Alternative Name). |
| `no renegotiation` | TLS 1.3 removed renegotiation entirely. Legacy clients may break. |

You can inspect the TLS handshake of any server with `openssl`:

```bash
openssl s_client -connect example.com:443 -servername example.com
```

This prints the certificate chain, negotiated cipher suite, TLS version, and session details.

## Performance: Why TLS 1.3 Matters

The latency difference between TLS 1.2 and 1.3 is one full round-trip:

```
  TLS 1.2 (2-RTT handshake)         TLS 1.3 (1-RTT handshake)

  Client        Server               Client        Server
    |   SYN       |                    |   SYN       |
    |------------>|                    |------------>|
    |   SYN-ACK   |   TCP             |   SYN-ACK   |   TCP
    |<------------|   handshake        |<------------|   handshake
    |   ACK       |                    |   ACK       |
    |------------>|                    |------------>|
    |             |                    |             |
    | ClientHello |                    | ClientHello |
    |------------>|                    |  + key_share|
    | ServerHello |   TLS             |------------>|
    | + Cert      |   round 1         | ServerHello |   TLS
    |<------------|                    | + Cert      |   (1 round)
    | KeyExchange |                    | + Finished  |
    | + Finished  |   TLS             |<------------|
    |------------>|   round 2         | Finished    |
    | Finished    |                    |------------>|
    |<------------|                    |             |
    |             |                    | GET /       |   First data
    | GET /       |   First data      |------------>|
    |------------>|                    |             |
    |             |                    |    Total: 2 RTT
    |    Total: 3 RTT                 |    (TCP + TLS)
    |    (TCP + 2x TLS)              |
```

On a connection with 100ms RTT (e.g., cross-continent), TLS 1.3 saves 100ms on every new connection. With 0-RTT resumption, the first HTTP request can piggyback on the handshake itself, saving another 100ms.

For services making many short-lived connections (microservices, CDNs, mobile apps), this adds up significantly. Cloudflare reported a **~30% reduction** in time-to-first-byte after deploying TLS 1.3 across their network.

## Summary

```
  +---------------------------------------------------------------------+
  |                       TLS Handshake Summary                         |
  +---------------------------------------------------------------------+
  |                                                                     |
  |  1. Client sends supported ciphers + DH key share                  |
  |                                                                     |
  |  2. Server picks cipher, sends certificate + DH key share          |
  |                                                                     |
  |  3. Client verifies certificate chain back to trusted root CA      |
  |                                                                     |
  |  4. Both sides compute shared secret via Diffie-Hellman            |
  |     (never sent over the wire)                                      |
  |                                                                     |
  |  5. Both sides derive symmetric keys using HKDF                    |
  |     (client key, server key, bound to transcript hash)             |
  |                                                                     |
  |  6. Finished messages verify handshake integrity                   |
  |                                                                     |
  |  7. Encrypted application data flows                               |
  |                                                                     |
  +---------------------------------------------------------------------+
  |  Forward secrecy: ephemeral DH keys are discarded after handshake  |
  |  Even stealing the server's private key later cannot decrypt past   |
  |  sessions.                                                          |
  +---------------------------------------------------------------------+
```

## References

1. RFC 8446 — The Transport Layer Security (TLS) Protocol Version 1.3 [rfc](https://www.rfc-editor.org/rfc/rfc8446)
2. RFC 5246 — The Transport Layer Security (TLS) Protocol Version 1.2 [rfc](https://www.rfc-editor.org/rfc/rfc5246)
3. RFC 5869 — HMAC-based Extract-and-Expand Key Derivation Function (HKDF) [rfc](https://www.rfc-editor.org/rfc/rfc5869)
4. Go `crypto/tls` handshake implementation [`handshake_client_tls13.go`](https://github.com/golang/go/blob/master/src/crypto/tls/handshake_client_tls13.go)
5. Go `crypto/tls` TLS 1.2 handshake [`handshake_client.go`](https://github.com/golang/go/blob/master/src/crypto/tls/handshake_client.go)
6. Go `crypto/x509` certificate verification [`verify.go`](https://github.com/golang/go/blob/master/src/crypto/x509/verify.go)
7. Cloudflare, An overview of TLS 1.3 [blog](https://blog.cloudflare.com/rfc-8446-aka-tls-1-3/)
8. "Attention is All You Need" for the internet: A New Illustrated TLS Connection [site](https://tls13.xargs.org/)
9. Diffie-Hellman key exchange [wiki](https://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange)
