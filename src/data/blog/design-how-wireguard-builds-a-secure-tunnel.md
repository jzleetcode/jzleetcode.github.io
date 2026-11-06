---
author: JZ
pubDatetime: 2026-11-06T19:32:00Z
modDatetime: 2026-11-06T19:32:00Z
title: System Design - How WireGuard Builds a Secure IP Tunnel
tags:
  - design-networking
  - design-security
description: "Follow an IP packet through WireGuard's peer routing, Noise handshake, encrypted transport, replay protection, and NAT keepalives."
---

## Table of contents

## A private lane between two networks

Imagine that your laptop is on hotel Wi-Fi and needs to reach a file server at home. The laptop can send ordinary IP packets into a virtual network interface. WireGuard wraps those packets in authenticated encryption and sends them as UDP datagrams to another WireGuard peer. The gateway unwraps them and forwards the original packets into the home network.

The useful mental model is a small, configured peer network. Each peer has a long-term key pair. The public keys and IP prefixes say which peer may carry which traffic. A short cryptographic handshake creates temporary keys, and then the peers exchange encrypted IP packets.

```text
Laptop application                              Home file server
       |                                               ^
       | inner IP packet                              |
       v                                               |
  WireGuard interface == encrypted UDP packet ==> WireGuard interface
        laptop key                                      gateway key
        peer route                                      peer route
```

The words **inner** and **outer** help keep the layers straight. The inner packet still has the laptop and file server IP addresses. The outer packet has the public network addresses used to deliver the encrypted UDP datagram.

## A public key is also a route decision

WireGuard's `AllowedIPs` setting connects routing to peer identity. On the sending side, an inner packet's destination address is matched against the configured prefixes to choose a peer. On the receiving side, the decrypted packet's source address must belong to that peer's allowed prefixes.

For example, a gateway might configure one laptop peer with `10.8.0.2/32` and a branch-office peer with `10.20.0.0/16`. That tells the gateway which key should receive packets for those destinations, and which inner source addresses are valid after decryption. The operating system still needs a route that sends the desired destinations to the WireGuard interface.

This design is often called **cryptokey routing**: a packet is associated with a peer by its IP prefix, and that peer is authenticated cryptographically. There is no certificate lookup or user-name exchange in the packet path. An administrator provisions peer keys and prefixes ahead of time.

## Two handshake messages create fresh traffic keys

Before sending data, the peers run the `Noise_IK` handshake. The initiator already knows the responder's static public key. The responder has the initiator's public key in its peer configuration.

```text
Initiator                                         Responder
    |                                                  |
    |  1. fresh ephemeral key, encrypted identity,     |
    |     timestamp, and authentication data           |
    |------------------------------------------------->|
    |                                                  | verify peer,
    |                                                  | reject stale
    |                                                  | timestamp
    |  2. fresh ephemeral key and encrypted response   |
    |<-------------------------------------------------|
    |                                                  |
    |  Both derive a sending key and a receiving key   |
    |                                                  |
    |  3. first encrypted IP packet                    |
    |------------------------------------------------->|
```

The first message combines the initiator's static key with a fresh ephemeral key. The responder can use that combination to identify the configured peer without exposing the initiator's static key in plaintext. The response contributes another fresh ephemeral key. Both sides derive separate keys for sending and receiving, then erase the handshake secrets they no longer need.

The first data packet also confirms that the initiator received and installed the new keys. The responder waits for that confirmation before relying only on the new session. If the network drops a handshake message, a later attempt can establish a new session without needing the earlier packet exchange to have completed.

WireGuard's protocol page describes the handshake with Curve25519 Diffie-Hellman, the Noise framework, and a transcript hash. The negotiated data cipher is ChaCha20-Poly1305. BLAKE2s and HKDF help hash the handshake transcript and derive keys. An optional pre-shared key can be mixed into the derivation when an operator wants an additional symmetric secret.

## Each UDP datagram protects one inner packet

After the handshake, a peer encrypts each inner IP packet with its current sending key. A data datagram carries a receiver index, a monotonically increasing counter, and the encrypted packet with its authentication tag.

The receiver uses the index to find the right session key, authenticates and decrypts the payload, then checks the counter against a sliding replay window. UDP can reorder packets, so the receiver allows a bounded amount of reordering while rejecting a counter it has already accepted. A lost packet does not hold up later packets as it might on an ordered byte stream.

Sessions are rekeyed automatically. Fresh ephemeral secrets limit how long one data key is used and help keep previously captured traffic safe if a later key is exposed. Operators generally do not need to coordinate a manual reconnect when a peer needs new keys.

## Endpoints can move, and keepalives are optional

WireGuard is quiet when there is no traffic. If a laptop moves from one Wi-Fi network to another, a valid authenticated packet can arrive from a new public address and port. The peer can update its endpoint to that observed address, so the next packet follows the laptop's new path.

NAT devices may forget an idle mapping. If a peer behind NAT must remain reachable after a long quiet period, `PersistentKeepalive` can send an empty packet at an interval. The quick-start guide gives 25 seconds as a commonly useful interval, while leaving the setting disabled by default because many peers do not need it.

Under heavy load, a responder can also require a cookie proof before doing more expensive handshake work. This helps limit CPU cost from spoofed traffic. It does not replace firewall rules or careful key provisioning.

## What the tunnel leaves to the operator

WireGuard provides an encrypted, authenticated path between configured peers. The peer keys and `AllowedIPs` define which IP traffic those peers can carry. Host firewalls still control which services are reachable, and surrounding tools can handle user authentication, address assignment, key distribution, and device enrollment.

That separation is why the data path stays small: route an inner packet to a peer, authenticate the peer, encrypt the packet, and verify it on arrival. The setup work lives in configuration and key management; the tunnel does not have to negotiate a new collection of options for every connection.

## References

1. WireGuard, [Protocol & Cryptography](https://www.wireguard.com/protocol/) — handshake messages, data packets, replay protection, and denial-of-service mitigation.
2. WireGuard, [Quick Start](https://www.wireguard.com/quickstart/) — peer setup, endpoint behavior, and persistent keepalives.
3. WireGuard, [Routing & Network Namespaces](https://www.wireguard.com/netns/) — routing packets through WireGuard interfaces.
4. Noise Protocol Framework, [Noise Protocol](https://noiseprotocol.org/noise.html) — the handshake framework used by WireGuard.
5. IETF, [RFC 7748: Elliptic Curves for Security](https://www.rfc-editor.org/rfc/rfc7748) — Curve25519 key agreement.
6. IETF, [RFC 8439: ChaCha20 and Poly1305 for IETF Protocols](https://www.rfc-editor.org/rfc/rfc8439) — authenticated encryption used for transport packets.
7. IETF, [RFC 5869: HMAC-based Extract-and-Expand Key Derivation Function](https://www.rfc-editor.org/rfc/rfc5869) — HKDF key derivation.
