---
author: JZ
pubDatetime: 2026-10-31T18:30:00Z
modDatetime: 2026-10-31T18:30:00Z
title: "System Design - How Email Delivery Works: SMTP, DNS, SPF, DKIM, and DMARC"
tags:
  - design-system
  - design-network
description: "A practical guide to Internet email delivery: how SMTP servers discover recipients with DNS, how message transfer differs from mailbox access, and how SPF, DKIM, and DMARC reduce spoofing."
---

## Table of contents

## Context

Sending an email feels like one action: write a note, press **Send**, and wait for the recipient to read it. Behind that button is a relay race across independently operated systems. Your mail provider accepts the message, discovers who receives mail for the destination domain, opens a server-to-server connection, and leaves the message in a mailbox. The recipient's app reads it later.

That separation is the most useful mental model:

```text
submission                 transfer                     access

mail app --> provider --> recipient mail server --> recipient's mail app
             SMTP           SMTP                         IMAP / web API
```

SMTP (Simple Mail Transfer Protocol) moves a message between mail systems. It is not the protocol that normally keeps every device's inbox synchronized. A webmail application can use HTTPS, and a desktop mail client often uses IMAP, after SMTP delivery is already complete.

In this article, Alice at `alice@sender.example` writes to Bob at `bob@receiver.example`. We will follow one ordinary message, then see why modern email needs DNS-based identity checks in addition to SMTP.

## The cast: MUA, MSA, MTA, and mailbox

Email terminology is old but clarifies responsibilities:

| Component                           | Job                                             | Example                                |
| ----------------------------------- | ----------------------------------------------- | -------------------------------------- |
| Mail user agent (MUA)               | Lets a person compose and read mail             | phone app, Outlook, webmail UI         |
| Mail submission agent (MSA)         | Accepts authenticated mail from a user          | `smtp.sender.example`                  |
| Mail transfer agent (MTA)           | Relays mail between domains                     | an outbound relay or recipient MX host |
| Mail delivery agent / mailbox store | Places mail in, and serves, a recipient mailbox | Bob's provider storage                 |

One product may run several of these roles. What matters is the boundary: Alice's app is allowed to prove who Alice is to her provider, but a receiving provider must not blindly trust what an unknown Internet host says about its sender.

## 1. Alice submits a message

Alice's client connects to her provider's submission service. Submission typically uses port 587 with STARTTLS, or port 465 with TLS from the start. The client authenticates before it is permitted to relay mail.

SMTP is a text protocol. A shortened dialogue looks like this:

```text
Alice's client                         sender.example MSA
     |                                        |
     | TCP + TLS, then SMTP greeting          |
     |--------------------------------------->|
     | EHLO laptop.example                    |
     |--------------------------------------->|
     | 250-STARTTLS / 250-AUTH ...            |
     |<---------------------------------------|
     | AUTH ... (inside TLS)                  |
     |--------------------------------------->|
     | MAIL FROM:<alice@sender.example>       |
     | RCPT TO:<bob@receiver.example>         |
     | DATA                                   |
     | headers + body, ending with <CRLF>.<CRLF>
     |--------------------------------------->|
     | 250 queued as message id ...           |
     |<---------------------------------------|
```

`MAIL FROM` is the **envelope sender**. It is used for delivery failures (bounces) and is not necessarily the `From:` line displayed to Bob. A legitimate mailing list, for example, can use a list address for the envelope while preserving an author's visible `From:` header. This difference becomes important when evaluating anti-spoofing policy.

After the MSA accepts the message, Alice's app has a submission success. It does not necessarily mean Bob has already received it. The provider may queue and retry delivery for hours or days when the destination is temporarily unavailable.

## 2. DNS chooses the receiving mail server

The sender's transfer agent needs an address for `receiver.example`. It asks DNS for **MX** (mail exchanger) records:

```dns
receiver.example.  IN MX 10 mx1.receiver.example.
receiver.example.  IN MX 20 mx2.receiver.example.
mx1.receiver.example. IN A 203.0.113.10
```

The lowest numeric preference wins; `10` is preferred over `20`. If several MX records share a preference, the sender can choose among them. The MTA then resolves the selected host's A or AAAA record and connects to it using SMTP, usually on port 25.

If the domain has no MX record, SMTP's rules allow a fallback to the domain's address record. A domain that publishes a **Null MX** (`MX 0 .`) instead explicitly says it accepts no email. These are details a mail provider handles, but they explain why DNS is part of email's routing plane.

## 3. The receiver decides whether to accept it

On the second SMTP hop, sender.example is no longer an authenticated local user. It is an Internet peer. The recipient server therefore evaluates more than the message text.

```text
sender.example MTA                         mx1.receiver.example
       |                                            |
       | connect, greet, offer TLS                   |
       |------------------------------------------->|
       | MAIL FROM / RCPT TO / DATA                  |
       |------------------------------------------->|
       |                                             |-- DNS and reputation checks
       |                                             |-- SPF / DKIM / DMARC checks
       |                                             |-- spam and malware scanning
       |                                             |-- recipient and quota checks
       | 250 accepted, or a temporary/permanent error|
       |<-------------------------------------------|
```

SMTP status codes make delivery retryable. A `4xx` response means a temporary failure: an MTA should queue the message and try again later. A `5xx` response means permanent failure for that attempt, such as an unknown recipient or rejected policy. The receiving server should reject an unacceptable message while the sending server is still connected; accepting it and later bouncing to an untrusted envelope sender creates backscatter spam.

When the receiver accepts the message, it stores the delivered copy in Bob's mailbox. Bob's mail app later uses IMAP, a provider API, or webmail over HTTPS to view it. Delivery and reading are separate asynchronous steps.

## Why SMTP alone cannot prove `From:`

SMTP was designed for a cooperative network. Any SMTP client can place a familiar-looking address in a message header:

```text
From: payroll@receiver.example
```

That header alone does not prove the client controls `receiver.example`. Modern email authentication answers a narrower and more useful question: did a domain authorize this sending path or sign this message, and does that domain align with the visible `From:` domain?

## SPF: is this IP allowed to send for the envelope domain?

Sender Policy Framework (SPF) is a DNS TXT record published by an envelope-sender domain. A simplified record might be:

```dns
sender.example. IN TXT "v=spf1 ip4:198.51.100.24 include:_spf.provider.example -all"
```

The receiver takes the SMTP client's IP address and the envelope domain from `MAIL FROM`, evaluates the record, and gets a result such as pass, fail, softfail, neutral, or none. SPF is useful because the domain owner can authorize an outbound provider without giving every recipient a private allowlist.

But SPF breaks under ordinary forwarding: the forwarder sends from its own IP, which might not be authorized by the original envelope domain. SPF also does not authenticate the human-visible `From:` header. That is why SPF is only one signal.

## DKIM: can the receiver verify a signed copy?

DomainKeys Identified Mail (DKIM) adds a cryptographic signature to selected headers and the body. The sending system adds a `DKIM-Signature` header naming a domain (`d=`) and selector (`s=`). The receiver fetches the public key from DNS, for example:

```dns
news2026._domainkey.sender.example. IN TXT "v=DKIM1; k=rsa; p=...public-key..."
```

If the signature verifies, the receiver knows that a holder of the corresponding private key signed the protected content and that the protected portions have not changed since signing. DKIM does not say the message is desirable, nor does it inherently say that the signing domain is the visible `From:` domain. Mailing lists can also modify a message enough to invalidate an original signature.

## DMARC: connect the checks to what a person sees

DMARC tells receivers how a domain wants mail using its visible `From:` domain to be evaluated. It requires **alignment**: at least SPF or DKIM must pass for a domain that matches (strictly or by organizational domain, according to policy) the `From:` domain.

```text
visible From: alerts@sender.example
                   |
                   +--> SPF pass? Is its authenticated domain aligned?
                   |
                   +--> DKIM pass? Is d= domain aligned?
                                      |
                                      v
                         at least one aligned pass?
                              | yes        | no
                              v            v
                           DMARC pass   apply p=none/quarantine/reject
```

A DMARC record is also DNS TXT data, such as:

```dns
_dmarc.sender.example. IN TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@sender.example"
```

`p=none` asks for monitoring, `p=quarantine` asks receivers to treat failing mail suspiciously, and `p=reject` asks them to reject it. The policy is a request, not a magical guarantee: each receiver combines it with local policy. Aggregate reports sent to `rua` help a domain owner discover legitimate services that are not yet authenticated before tightening the policy.

## TLS protects a hop, not the whole journey

STARTTLS can encrypt an SMTP connection after the server advertises the capability. It protects traffic on that particular hop from passive observation or modification, but ordinary opportunistic STARTTLS does not by itself guarantee that the peer is the intended recipient domain. SMTP MTA-STS and DANE for SMTP are mechanisms that can make TLS policy more explicit for domains that deploy them.

Email is therefore not end-to-end encrypted merely because a lock icon appears in a mail app. The provider operating each hop can normally process the message. End-to-end encryption requires a separate scheme, such as S/MIME or OpenPGP, and key management for the people involved.

## A compact troubleshooting map

```text
Message sent but not received
          |
          +-- Was it accepted by the submitter? --> inspect submission log / client error
          |
          +-- Did DNS return MX records? -------> inspect MX and target A/AAAA records
          |
          +-- Did the remote MTA reply 4xx? ----> queue and retry; investigate availability
          |
          +-- Did it reply 5xx? ----------------> inspect recipient, policy, and auth result
          |
          +-- Was it accepted then filtered? ---> inspect mailbox, spam policy, and headers
```

The key is to locate the last system that accepted responsibility. A client "sent" status often means only the first handoff succeeded; an SMTP queue identifier and delivery log identify the next handoff.

## Takeaways

- SMTP submission, SMTP transfer, and mailbox access are different jobs.
- DNS MX records route mail by domain; the receiving MTA decides whether to accept it.
- Envelope addresses guide delivery and bounces, while `From:` is a display header.
- SPF authenticates a sending IP for an envelope domain; DKIM validates a domain signature; DMARC requires alignment with the visible `From:` domain.
- A successful submission is not a delivery receipt. SMTP queues make retries possible when a downstream server is temporarily unavailable.

## References

1. [RFC 5321: Simple Mail Transfer Protocol](https://www.rfc-editor.org/rfc/rfc5321).
2. [RFC 7505: Null MX records](https://www.rfc-editor.org/rfc/rfc7505).
3. [RFC 7208: Sender Policy Framework](https://www.rfc-editor.org/rfc/rfc7208).
4. [RFC 6376: DomainKeys Identified Mail](https://www.rfc-editor.org/rfc/rfc6376).
5. [RFC 7489: DMARC](https://www.rfc-editor.org/rfc/rfc7489).
6. [RFC 3207: SMTP Service Extension for Secure SMTP over TLS](https://www.rfc-editor.org/rfc/rfc3207).
7. [RFC 8461: SMTP MTA Strict Transport Security](https://www.rfc-editor.org/rfc/rfc8461).
