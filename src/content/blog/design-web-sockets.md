---
author: JZ
pubDatetime: 2025-03-15T06:23:00Z
modDatetime: 2025-03-15T06:23:00Z
title: System Design - How do Websockets Work
featured: true
tags:
  - design-basics-web-sockets
description:
  "How do websockets work comparing to http?"
---

## Table of contents

## Context

The WebSocket protocol was standardized by the IETF as RFC 6455 in 2011. The current specification allowing web applications to use this protocol is known as WebSockets. It is a living standard maintained by the WHATWG and a successor to The WebSocket API from the W3C.

## Neo Kim Story

Neo Kim likes to use a story to explain, which, in most cases, is a great idea and easier to remember. This time Neo used a story where two people would like to collaboratively work on a Google document.

The traditional HTTP request response cycle works like below.

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F07159f2c-cba6-493c-ab3f-c6f43f9a41c4_1011x678.png)

For short communications, the overhead is expensive.

Then there is short polling. Imagine automatic refreshing every a few seconds to check progress.

![](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fd1b39042-747c-4078-9a23-f4894454a5ab_1035x676.png)

The drawback is the trade-offs on how to select the right interval and extra overhead from connection requests and empty responses.

Then there is long polling.

![](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F67a40195-9988-4464-9f8b-248c7e6f323b_1011x675.png)

The server load can be high since the connections are kept open, which consumes resources. The client has to make a separate request to send data to the server.

There is server-sent (server-side) events (SSE).

![](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F8304c443-d921-49d5-a2f9-03317a210364_1048x677.png)

The server still has to keep the connection to the client open and the communication is unidirectional.

Neo mentioned Google Docs use web sockets. There is uncertainty about that (see [reddit](https://www.reddit.com/r/computerscience/comments/12rl5wm/how_does_google_docs_send_the_changes_done_by/), [toolingant](https://toolingant.com/does-google-docs-use-websockets/), and [stackoverflow](https://stackoverflow.com/questions/35070217/what-technology-does-google-drive-use-to-get-real-time-updates) discussions). The bidirectional communication nature is similar to telephone call.

WebSocket is distinct from HTTP used to serve most webpages. Although they are different, RFC 6455 states that WebSocket "is designed to work over HTTP ports 443 and 80 as well as to support HTTP proxies and intermediaries", thus making it compatible with HTTP. To achieve compatibility, the WebSocket handshake uses the HTTP Upgrade header to change from the HTTP protocol to the WebSocket protocol.

The protocol includes the following steps throughout the lifecycle of communication.

1. Opening handshake (HTTP request and response)
2. Data and control (close, ping, pong) messages which can be composed of one or more frames. Frames enable messages with initial data available but complete length unknown.
3. Closing handshake (two close frames) to close the connection

Nginx, Apache HTTP Server, Internet Information Services (IIS), lighttpd supports web sockets.

## References

1. Neo Kim Blog [article](https://newsletter.systemdesign.one/p/how-do-websockets-work)
2. [wiki](https://en.wikipedia.org/wiki/WebSocket)
3. MDN [doc](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
4. CSDN [article](https://blog.csdn.net/guoqi_666/article/details/137260613)
