---
author: JZ
pubDatetime: 2026-10-16T18:00:00Z
modDatetime: 2026-10-16T18:00:00Z
title: System Design - How a TCP Connection Opens and Closes
tags:
  - design-system
  - design-networking
description: "Follow one TCP connection from SYN to TIME-WAIT: sequence numbers, the three-way handshake, half-close, FIN versus RST, and why the active closer lingers."
---

## Table of contents

## A request before the request

You open a browser and ask a server for a page. Before an HTTP request can travel over a new TCP connection, the two machines need to agree on a connection and on where each direction's byte numbers begin. Later, when the page is delivered, each direction has to finish independently.

The [TCP specification, RFC 9293](https://www.rfc-editor.org/rfc/rfc9293.html), describes both conversations. We will follow one ordinary connection, rather than cover retransmission algorithms or [congestion control](./design-how-tcp-congestion-control-works.md). HTTP/3 uses QUIC instead of TCP, so this story applies to a TCP-based connection, such as HTTP/1.1 or HTTP/2.

One connection is identified by its two IP addresses and two ports: the **four-tuple**. A server can listen on port 443 and still keep many client connections separate because each has its own four-tuple. The listening socket and an established connection are not the same thing.

## First, agree on byte numbers

TCP treats application data as a **stream of bytes**, not a series of messages. Each side chooses an initial sequence number (ISN). The other side acknowledges the **next** sequence number it expects, not merely the number it last saw. Each direction has its own sequence space.

Here is [RFC 9293's basic handshake example](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.5), with client ISN 100 and server ISN 300:

```text
Client                                                   Server
CLOSED                                                   LISTEN

SYN, seq=100                   -------------------------> SYN-RECEIVED
                  <------------------------- SYN+ACK, seq=300, ack=101
ESTABLISHED
ACK, seq=101, ack=301          -------------------------> ESTABLISHED

first data byte uses seq=101   ------------------------->
```

1. **SYN:** the client proposes its starting number and enters `SYN-SENT`.
2. **SYN+ACK:** the server proposes its own number and acknowledges the client's SYN. It enters `SYN-RECEIVED`.
3. **ACK:** the client acknowledges the server's SYN. The server reaches `ESTABLISHED` when it receives this acknowledgment.

Why `ack=101` rather than `100`? A SYN consumes **one** sequence number. The server's SYN similarly explains `ack=301`. A standalone ACK consumes **none**, so the client's first data byte still starts at 101. If that client sends five bytes, its next sequence number is 106. A FIN will also consume one sequence number when we close.

The client can start sending after it has processed SYN+ACK; the server cannot treat the handshake as complete until it receives the final ACK. On an ordinary network, a client can complete this handshake in roughly one round trip. That is _before_ counting TLS and the HTTP request. The example uses a separate final ACK for clarity; TCP can carry data with handshake segments under the specification's rules.

### Why not stop after two messages?

The final ACK tells the server that the client received **the server's** chosen sequence number. Without that confirmation, an old delayed SYN could be mistaken for a fresh connection. The specification describes avoiding confusion from old duplicate connection requests as the main reason for the three-way handshake.

Packet loss does not change the protocol into a two-message exchange: for example, if the last ACK is lost, the server can retransmit SYN+ACK while it awaits confirmation. This is one reason `SYN-RECEIVED` and `ESTABLISHED` are different states.

## Saying goodbye in both directions

Suppose the client has sent everything it intends to send. It sends **FIN**, meaning _I will send no more bytes_. It does **not** mean _I refuse to receive more bytes_. The server may acknowledge that FIN while continuing to send its response: this is a **half-closed** connection.

[RFC 9293's normal close](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.6) looks like this when the client initiates:

```text
Client (active closer)                                 Server
ESTABLISHED                                            ESTABLISHED

FIN, seq=x                    -----------------------> CLOSE-WAIT
FIN-WAIT-1
                 <----------------------- ACK, ack=x+1
FIN-WAIT-2                                            (may still send data)

                 <----------------------- FIN, seq=y
TIME-WAIT                                             LAST-ACK
ACK, ack=y+1                 -----------------------> CLOSED

wait for 2 x MSL
CLOSED
```

These are often called the **four steps** of shutdown: FIN, ACK, FIN, ACK. They need not be four separate packets; if the server is ready to close immediately, it can combine its ACK and FIN. The important distinction is that an ACK of the client's FIN does _not_ close the server-to-client direction. `CLOSE-WAIT` means the server has seen the client's FIN but its application has not finished closing its own side. The client's `FIN-WAIT-2` means its FIN was acknowledged and it awaits the peer's FIN.

As with SYN, the FIN uses a sequence number: acknowledging FIN at `x` means expecting `x+1`. All earlier bytes still have to be handled. A graceful close preserves the distinction between _no more bytes are coming_ and _some earlier bytes were lost_.

## Why does TIME-WAIT exist?

The **active closer** normally enters `TIME-WAIT` after acknowledging the peer's FIN. [RFC 9293 specifies a 2 × MSL wait](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.6.1), where MSL is the maximum segment lifetime. This period gives old segments time to disappear and lets the closer acknowledge a retransmitted FIN if its last ACK was lost. The RFC also describes qualified ways an implementation may reuse a connection from `TIME-WAIT`; do not assume every machine uses a single universal wall-clock timeout.

The client is the active closer **in our example**, not by definition. If the server initiates shutdown, the server can be the endpoint in `TIME-WAIT`. If both sides close simultaneously, both can enter `TIME-WAIT`. Seeing many such sockets on a server therefore does not, by itself, tell you which side is malfunctioning.

## What if one side sends RST instead?

A **reset** (`RST`) is an abort, not a polite FIN. The [specification distinguishes](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.6) the FIN exchange, which closes normally, from an abort that sends RST and discards connection state immediately. The receiving application must be able to tell normal close from abort. A reset is not a promise that queued data has been delivered; treat it differently from a clean end-of-stream.

That distinction helps when investigating a failed request: an orderly FIN after the response is normal, whereas a reset during a response can leave the application with incomplete data.

## A compact mental model

```text
Open:   SYN -> SYN+ACK -> ACK       synchronize both byte streams
Work:   bytes carry sequence numbers; ACKs report next expected bytes
Close:  FIN -> ACK -> FIN -> ACK    finish each direction independently
Abort:  RST                         discard the connection instead
```

Next time a packet trace shows `SYN-RECEIVED`, `CLOSE-WAIT`, or `TIME-WAIT`, ask **which side has acknowledged which direction**. The state name then becomes a short description of unfinished work rather than a mysterious error code.

## References

1. [RFC 9293, TCP specification: connection establishment, §3.5](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.5).
2. [RFC 9293, closing a connection and normal versus abortive close, §3.6](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.6).
3. [RFC 9293, half-closed connections and TIME-WAIT, §3.6.1](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.6.1).
4. [RFC 9293, TCP connection state diagram, §3.3.2](https://www.rfc-editor.org/rfc/rfc9293.html#section-3.3.2).
