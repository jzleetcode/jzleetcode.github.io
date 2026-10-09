---
author: JZ
pubDatetime: 2026-10-09T18:43:20Z
modDatetime: 2026-10-09T18:43:20Z
title: System Design - How WebRTC Connects Two Peers
tags:
  - design-system
  - design-networking
description: "How WebRTC sets up a real-time connection: signaling, ICE candidates, STUN and TURN, and encrypted media transport."
---

## Table of contents

## The hard part is finding a route

Imagine a video call between two browsers. Each browser is usually behind a router, and neither browser knows which address the other can reach. A browser cannot simply send video to the other browser's private Wi-Fi address.

WebRTC is the set of browser APIs and protocols that negotiate a path, check whether packets can travel over it, and then carry real-time audio, video, or data. The application still supplies one important piece: a way for the two browsers to exchange setup messages.

The connection has two kinds of traffic:

- **Signaling:** setup messages that describe the call and potential network paths.
- **Media:** the audio and video packets that travel after a path is selected.

Keeping those jobs separate explains why a signaling server can be involved in a call without carrying the call's video.

## First, the browsers exchange a plan

Before sending media, each browser needs to agree on things such as media types, codecs, and transport security. A browser packages this session information in an offer or answer, commonly represented as SDP (Session Description Protocol).

WebRTC does not specify how the offer and answer reach the other browser. The application chooses a signaling channel—often a WebSocket connection or an HTTP-based service—and sends the messages through it. The signaling service is like a meeting coordinator: it introduces the peers, but it does not have to relay their media.

Each side also discovers possible network addresses, called **ICE candidates**. Candidates can arrive gradually, a technique called _trickle ICE_, while the rest of the connection is being negotiated.

## ICE tries possible paths

ICE (Interactive Connectivity Establishment) gathers candidate addresses and tests candidate pairs. It prefers a working direct route when one is available, but it can use a relay when network address translation or firewall rules prevent a direct route.

Three candidate types make the search easier to understand:

- **Host candidate:** an address on the device's network interface. It may only be reachable on the same local network.
- **Server-reflexive candidate:** an address-and-port mapping observed by a STUN server. STUN helps a peer learn how it appears from outside its router; it does not relay the call.
- **Relay candidate:** an address allocated by a TURN server. Peers send packets to the relay, which forwards them when a direct route does not work.

ICE sends connectivity checks over candidate pairs. A check is a small STUN request and response: if the remote peer can receive and answer it, that pair may carry the call. ICE then nominates a working pair for the connection.

```text
Browser A             App signaling service             Browser B
    |                         |                              |
    |---- offer + candidates ->|----------------------------->|
    |<--- answer + candidates -|<-----------------------------|
    |                         |                              |
    |---- ICE connectivity checks over candidate pairs ------|
    |                         |                              |
    |<========== selected route: direct, if possible =========>|
    |                         |                              |
    |<=============== encrypted media =======================>|

                    TURN can relay packets
              when a direct candidate pair fails.
```

The browser may contact STUN and TURN services while it gathers candidates. Those services have different jobs from the application signaling service: STUN helps discover a mapped address, while TURN forwards packets through a relay allocation.

## A selected route is not the whole security story

Once ICE has a route, the peers establish a DTLS connection over it. DTLS negotiates keys for SRTP, the protocol that protects real-time audio and video packets. The SDP exchanged through signaling carries a fingerprint of the peer's DTLS certificate. The browser checks the certificate used in the DTLS handshake against that fingerprint.

This encryption applies whether the selected route is direct or uses TURN. A TURN server forwards packets; it is not supposed to decrypt the media. The application still needs to protect its own signaling channel and authenticate who is allowed to join a call. WebRTC does not define that product-level identity or signaling policy.

## Three common misconceptions

**“WebRTC means the media always goes directly between devices.”** Not necessarily. ICE can select a TURN relay when network conditions make direct connectivity fail. A peer-to-peer API does not guarantee a peer-to-peer network path.

**“STUN is the media relay.”** STUN answers questions about connectivity and address mappings. TURN is the protocol that provides a relay allocation.

**“The signaling server carries the video.”** The signaling server exchanges setup messages. Media normally flows over the selected ICE path, which can be direct or relayed through TURN.

## How to reason about a failed call

Think of setup as a sequence of gates. Did the peers exchange the offer, answer, and candidates? Did any ICE candidate pair pass its connectivity checks? Did the DTLS handshake complete after ICE selected a route? Each failure points to a different layer.

In browser diagnostics, `RTCPeerConnection` state and `getStats()` can show whether ICE connected and whether the selected candidate pair is relayed. A call that works only when TURN is available usually points to a network path that blocks direct connectivity, not a problem with the video codec.

The useful mental model is: **signaling introduces peers, ICE finds a path, and DTLS-SRTP protects the media on that path.**

## References

1. MDN, [Signaling and video calling](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling).
2. MDN, [WebRTC protocols](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols).
3. W3C, [WebRTC 1.0: Real-Time Communication Between Browsers](https://www.w3.org/TR/webrtc/).
4. RFC 8445, [Interactive Connectivity Establishment (ICE)](https://www.rfc-editor.org/rfc/rfc8445).
5. RFC 8489, [Session Traversal Utilities for NAT (STUN)](https://www.rfc-editor.org/rfc/rfc8489).
6. RFC 8656, [Traversal Using Relays around NAT (TURN)](https://www.rfc-editor.org/rfc/rfc8656).
7. RFC 5764, [DTLS Extension to Establish Keys for SRTP](https://www.rfc-editor.org/rfc/rfc5764).
