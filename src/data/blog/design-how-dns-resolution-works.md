---
author: JZ
pubDatetime: 2026-04-20T10:00:00Z
modDatetime: 2026-04-20T10:00:00Z
title: System Design - How DNS Resolution Works
tags:
  - design-system
  - design-networking
description:
  "How DNS resolution works: the recursive and iterative query process, DNS record types, caching layers, TTL mechanics, and how the global DNS hierarchy routes billions of lookups every day."
---

## Table of contents

## Context

Every time you type `example.com` into your browser, your computer needs to figure out the IP address of the server hosting that website. Humans remember names; machines route packets using numbers. The **Domain Name System (DNS)** is the bridge between the two — a globally distributed, hierarchical database that translates human-readable domain names into IP addresses.

DNS handles over **600 billion queries per day** across the internet. It was designed in 1983 by Paul Mockapetris (RFC 1034/1035) to replace a single `HOSTS.TXT` file that every machine on the early internet had to download from a central server at SRI. That approach obviously did not scale, so DNS introduced a distributed, delegated architecture that has served the internet for over 40 years.

Let's trace what happens when you type a URL in your browser.

## The Problem DNS Solves

Before DNS, every computer on ARPANET maintained a local copy of a file that mapped hostnames to IP addresses. As the network grew, this file became unmanageable:

- **Size:** The file grew linearly with every new host.
- **Freshness:** Changes took hours or days to propagate.
- **Conflicts:** Two organizations could accidentally pick the same hostname.

DNS solves all three problems with a **hierarchical namespace** (no conflicts), **distributed authority** (each organization manages its own records), and **caching with expiration** (changes propagate within a bounded time).

## The DNS Hierarchy

DNS is structured as an inverted tree. Every domain name is a path from a leaf up to the root:

```
                              . (root)
                              |
              +---------------+---------------+
              |               |               |
             com             org             net
              |               |               |
        +-----+-----+        |               |
        |           |         |               |
     example    google    wikipedia       cloudflare
        |           |         |               |
       www        mail       en             dns
```

Each level of the tree is served by different nameservers:

```
  Level              Responsibility                    Count (approx)
  ----------------  --------------------------------  ---------------
  Root servers      Know where all TLD servers are    13 clusters (A-M)
                                                      ~1500+ instances
  TLD servers       Know authoritative NS for each    Varies per TLD
                    domain under their TLD             (e.g., Verisign for .com)
  Authoritative     Hold the actual DNS records       Millions (one per domain
  nameservers       (A, AAAA, MX, etc.)               or hosting provider)
```

**Root servers** are not a single machine. Each of the 13 root server identifiers (A through M) is backed by hundreds of anycast instances worldwide. When your query reaches "a root server," it actually reaches the nearest anycast instance.

## Recursive vs Iterative Resolution

There are two modes of DNS resolution:

### Recursive resolution

Your computer asks a **recursive resolver** (like `8.8.8.8` or `1.1.1.1` or your ISP's resolver): "What is the IP for `www.example.com`?" The resolver does all the work and returns the final answer.

### Iterative resolution

The recursive resolver itself talks to the DNS hierarchy using **iterative queries**. Each server it contacts either gives the answer directly or says "I don't know, but ask this other server." The resolver follows these referrals step by step.

Here is how they work together:

```
  Your Computer          Recursive Resolver        Root Server
  (stub resolver)        (e.g., 8.8.8.8)          (e.g., a.root-servers.net)
       |                       |                        |
       | Q: www.example.com?   |                        |
       |---------------------->|                        |
       |                       | Q: www.example.com?    |
       |                       |----------------------->|
       |                       |                        |
       |                       | R: I don't know, but   |
       |                       |    .com is at these NS  |
       |                       |<-----------------------|
       |                       |                        |
       |                       |        TLD Server (.com)
       |                       |        (e.g., a.gtld-servers.net)
       |                       |              |
       |                       | Q: www.example.com?
       |                       |------------->|
       |                       |              |
       |                       | R: I don't know, but
       |                       |    example.com NS are:
       |                       |    ns1.example.com
       |                       |<-------------|
       |                       |              |
       |                       |      Authoritative NS
       |                       |      (ns1.example.com)
       |                       |              |
       |                       | Q: www.example.com?
       |                       |------------->|
       |                       |              |
       |                       | R: 93.184.216.34
       |                       |<-------------|
       |                       |
       | A: 93.184.216.34      |
       |<----------------------|
```

The stub resolver on your computer is intentionally simple. It sends one query and expects the full answer. The recursive resolver handles all the complexity of walking the tree.

## DNS Record Types

A domain can have multiple types of records. Each serves a different purpose:

```
  Type     Purpose                          Example Value
  ------   -------------------------------- ----------------------------------
  A        IPv4 address                     93.184.216.34
  AAAA     IPv6 address                     2606:2800:220:1:248:1893:25c8:1946
  CNAME    Alias (canonical name)           www.example.com -> example.com
  NS       Nameserver delegation            ns1.example.com
  MX       Mail server (with priority)      10 mail.example.com
  TXT      Arbitrary text                   "v=spf1 include:_spf.google.com ~all"
  SOA      Start of Authority (zone meta)   ns1.example.com admin.example.com ...
  SRV      Service location (port + host)   _sip._tcp.example.com 5060 sipserver
  PTR      Reverse lookup (IP -> name)      34.216.184.93.in-addr.arpa -> example.com
```

**A and AAAA** are the most common — they map a name to an IP. **CNAME** creates an alias: if `www.example.com` is a CNAME pointing to `example.com`, the resolver will follow the chain and ultimately return the A/AAAA record for `example.com`.

**NS** records delegate authority. When the `.com` TLD server says "example.com's nameservers are ns1.example.com and ns2.example.com," it's returning NS records.

**MX** records tell mail servers where to deliver email. The priority number (lower = preferred) allows fallback: if the primary mail server is down, senders try the next one.

**TXT** records are used for verification (SPF, DKIM, DMARC for email), domain ownership proofs, and other metadata that doesn't fit elsewhere.

## Caching and TTL

If every single DNS lookup required walking the entire hierarchy, the root servers would be crushed under load. **Caching** makes the system practical.

### TTL (Time To Live)

Every DNS record includes a **TTL** value in seconds. This tells resolvers: "You may cache this answer for this long before asking again."

```
  example.com.    300    IN    A    93.184.216.34
                  ^^^
                  TTL = 300 seconds (5 minutes)
```

When the TTL expires, the cached entry is evicted and the next query triggers a fresh lookup.

### Caching layers

Multiple caches sit between your browser and the authoritative server:

```
  +------------------+
  |  Browser cache   |  TTL: respects DNS TTL (Chrome caps at ~1 min)
  +--------+---------+
           |
  +--------v---------+
  |  OS resolver     |  TTL: respects DNS TTL
  |  (systemd-resolved, |
  |   mDNSResponder) |
  +--------+---------+
           |
  +--------v---------+
  |  Recursive       |  TTL: respects DNS TTL
  |  resolver        |  Also caches negative results (NXDOMAIN)
  |  (ISP, 8.8.8.8) |
  +--------+---------+
           |
  +--------v---------+
  |  Authoritative   |  Source of truth; sets the TTL value
  |  nameserver      |
  +------------------+
```

**TTL trade-offs:**

- **Short TTL (e.g., 60s):** Changes propagate quickly. Useful for failover and load balancing. But increases query load on authoritative servers.
- **Long TTL (e.g., 86400s = 24h):** Reduces query load. But changes take longer to propagate. If you migrate servers and forget to lower the TTL first, users may see stale IPs for up to a day.

**Best practice for migrations:** Lower the TTL to 60s a day before the change, perform the migration, verify, then raise the TTL back.

### Negative caching

If a domain does not exist, the resolver caches that fact too. The SOA record's `minimum` field specifies the negative cache TTL. This prevents repeated queries for typos or non-existent domains from flooding the hierarchy.

## Tracing a Real Lookup: `dig example.com`

Let's trace what happens with the `dig` command. Running `dig +trace example.com` shows each step:

```bash
$ dig +trace example.com

; <<>> DiG 9.18.18 <<>> +trace example.com
;; global options: +cmd
.                       518400  IN  NS  a.root-servers.net.
.                       518400  IN  NS  b.root-servers.net.
.                       518400  IN  NS  c.root-servers.net.
;; [... 13 root servers ...]
;; Received 525 bytes from 127.0.0.53#53(127.0.0.53) in 0 ms

com.                    172800  IN  NS  a.gtld-servers.net.
com.                    172800  IN  NS  b.gtld-servers.net.
;; [... more TLD servers ...]
;; Received 1170 bytes from 198.41.0.4#53(a.root-servers.net) in 24 ms

example.com.            172800  IN  NS  a.iana-servers.net.
example.com.            172800  IN  NS  b.iana-servers.net.
;; Received 309 bytes from 192.5.6.30#53(a.gtld-servers.net) in 15 ms

example.com.            86400   IN  A   93.184.216.34
;; Received 56 bytes from 199.43.135.53#53(a.iana-servers.net) in 72 ms
```

Here is what happened step by step:

```
  Step  Who was queried             What they returned
  ----  --------------------------  -----------------------------------------
  1     Local resolver (127.0.0.53) List of root servers (from hints file)
  2     a.root-servers.net          "Try .com TLD at a.gtld-servers.net"
  3     a.gtld-servers.net          "Try example.com at a.iana-servers.net"
  4     a.iana-servers.net          "93.184.216.34" (the final answer)
```

Total time: ~111 ms for an uncached lookup. Subsequent queries hit the cache and return in under 1 ms.

## DNS over HTTPS (DoH) and DNS over TLS (DoT)

Traditional DNS sends queries in **plaintext UDP** on port 53. Anyone on the network path (your ISP, a coffee shop's WiFi operator, a government) can see which domains you're looking up. This has privacy and security implications.

Modern alternatives encrypt DNS traffic:

```
  Protocol      Port    Transport       RFC      Adopted by
  ----------    -----   -----------     ------   --------------------
  DNS (classic) 53      UDP/TCP         1035     Everything
  DoT           853     TLS over TCP    7858     Android 9+, systemd
  DoH           443     HTTPS (HTTP/2)  8484     Firefox, Chrome, iOS
```

**DNS over HTTPS (DoH)** wraps DNS queries inside regular HTTPS requests. Because it uses port 443 (the same as all HTTPS traffic), it's indistinguishable from normal web browsing at the network level. This makes it harder to block or monitor.

**DNS over TLS (DoT)** uses a dedicated port (853) with TLS encryption. It's easier to identify and block at the network level, but simpler to implement.

Both solve the privacy problem. The trade-off is that they centralize trust in the recursive resolver you choose (e.g., Cloudflare's 1.1.1.1 or Google's 8.8.8.8), which can now see all your queries even if your ISP cannot.

## Security Considerations

### DNS Spoofing (Cache Poisoning)

Because classic DNS uses unencrypted UDP, an attacker can forge responses. If a forged response reaches the resolver before the legitimate one, the resolver caches the fake answer:

```
  Attacker           Recursive Resolver          Authoritative NS
     |                      |                          |
     |                      | Q: bank.com A?           |
     |                      |------------------------->|
     |                      |                          |
     | Forged response:     |                          |
     | bank.com -> 6.6.6.6  |                          |
     |--------------------->|                          |
     |                      |                          |
     |        (attacker's   | Legitimate response:     |
     |         response     | bank.com -> 1.2.3.4      |
     |         arrives      |<-------------------------|
     |         first!)      |                          |
     |                      |                          |
     |                      | Caches 6.6.6.6 (WRONG)  |
```

Now every user of that resolver gets sent to the attacker's server for `bank.com`.

**Mitigations:**

- **Source port randomization (RFC 5452):** Makes it harder to guess which port the resolver is listening on.
- **Query ID randomization:** The 16-bit transaction ID must match; randomizing it gives 65,536 possible values.
- **0x20 encoding (RFC draft):** Randomizes the case of letters in the query name. The authoritative server echoes it back, so forged responses must guess the exact casing.

### DNSSEC (DNS Security Extensions)

DNSSEC adds **cryptographic signatures** to DNS records. It does not encrypt queries (that's DoH/DoT's job), but it lets resolvers **verify** that a response hasn't been tampered with.

```
  How DNSSEC verification works:

  Root zone           Signs .com DS record with root's private key
       |
       v
  .com TLD            Signs example.com DS record with .com's private key
       |
       v
  example.com         Signs its A record with example.com's private key
       |
       v
  Resolver            Verifies chain: root -> .com -> example.com -> A record
                      (using public keys published as DNSKEY records)
```

DNSSEC introduces new record types:

- **RRSIG:** The signature over a record set.
- **DNSKEY:** The public key used to verify signatures.
- **DS (Delegation Signer):** A hash of the child zone's DNSKEY, stored in the parent zone. This creates the chain of trust.
- **NSEC/NSEC3:** Proves that a domain does NOT exist (authenticated denial of existence).

**DNSSEC adoption** has been gradual. As of 2025, the root zone and most TLDs are signed, but only about 30% of domains have full DNSSEC chains. Validation is more widespread on the resolver side (Google, Cloudflare, and most ISP resolvers validate DNSSEC).

## Putting It All Together

Here is the complete picture of a DNS lookup from your browser to the final IP:

```
  Browser types "www.example.com"
       |
       v
  [1] Check browser DNS cache ------> HIT? Return immediately
       |
       | MISS
       v
  [2] Check OS DNS cache -----------> HIT? Return immediately
       |
       | MISS
       v
  [3] Query recursive resolver -----> HIT in resolver cache? Return
       |
       | MISS
       v
  [4] Resolver queries root ---------> Returns .com TLD NS
       |
       v
  [5] Resolver queries .com TLD -----> Returns example.com NS
       |
       v
  [6] Resolver queries authoritative -> Returns 93.184.216.34
       |
       v
  [7] Resolver caches result (TTL=86400), returns to OS
       |
       v
  [8] OS caches result, returns to browser
       |
       v
  [9] Browser caches result, initiates TCP connection to 93.184.216.34
```

In practice, steps 4-6 rarely all happen for popular domains. The resolver almost certainly has `.com` TLD servers cached (their TTL is 48 hours). For popular domains like `google.com`, even the final A record is likely cached. Cold lookups that walk the full tree are rare for well-known sites.

## References

1. RFC 1034 — Domain Names: Concepts and Facilities [rfc](https://datatracker.ietf.org/doc/html/rfc1034)
2. RFC 1035 — Domain Names: Implementation and Specification [rfc](https://datatracker.ietf.org/doc/html/rfc1035)
3. RFC 4033 — DNS Security Introduction and Requirements (DNSSEC) [rfc](https://datatracker.ietf.org/doc/html/rfc4033)
4. RFC 8484 — DNS Queries over HTTPS (DoH) [rfc](https://datatracker.ietf.org/doc/html/rfc8484)
5. RFC 7858 — DNS over Transport Layer Security (DoT) [rfc](https://datatracker.ietf.org/doc/html/rfc7858)
6. RFC 5452 — Measures for Making DNS More Resilient against Forged Answers [rfc](https://datatracker.ietf.org/doc/html/rfc5452)
7. Root Servers Technical Information [site](https://root-servers.org/)
8. IANA Root Zone Database [site](https://www.iana.org/domains/root/db)
9. Cloudflare Learning Center — What is DNS? [article](https://www.cloudflare.com/learning/dns/what-is-dns/)
10. Google Public DNS Documentation [doc](https://developers.google.com/speed/public-dns)
