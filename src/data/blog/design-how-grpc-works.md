---
author: JZ
pubDatetime: 2026-04-15T06:23:00Z
modDatetime: 2026-04-15T06:23:00Z
title: System Design - How gRPC Works
tags:
  - design-system
  - design-networking
description:
  "How gRPC works under the hood: Protocol Buffers serialization, HTTP/2 framing, the four RPC patterns (unary, server streaming, client streaming, bidirectional), channel and transport architecture, interceptors, and a source code walkthrough from the grpc/grpc-go repository."
---

## Table of contents

## Context

When two services need to talk to each other across a network, the simplest approach is REST over HTTP/1.1 with JSON. It works, it is human-readable, and every language has libraries for it. But as systems grow to hundreds of microservices exchanging millions of messages per second, REST starts showing its limits: JSON is slow to serialize, HTTP/1.1 opens a new TCP connection (or at least blocks on one request per connection), and there is no built-in way to stream data in both directions.

Google faced this problem at scale in the early 2000s. Internally, they built a system called **Stubby** that handled roughly 10 billion RPCs per second across their data centers. In 2015, they open-sourced a redesigned version of Stubby as **gRPC** (the "g" stands for something [different in every release](https://github.com/grpc/grpc/blob/master/doc/g_stands_for.md) — "good," "green," "groovy," etc.).

gRPC is now used by projects like Kubernetes, TiDB, etcd, CockroachDB, and Envoy. It sits on two foundational technologies: **Protocol Buffers** for serialization and **HTTP/2** for transport.

```
   Traditional REST                        gRPC

   Client          Server            Client          Server
     |                |                |                |
     |  HTTP/1.1      |                |   HTTP/2       |
     |  POST /users   |                |   POST         |
     |  {"name":"a"}  |                |   /pkg.Svc/Mth |
     |--------------->|                |   [protobuf]   |
     |                |                |--------------->|
     |  200 OK        |                |                |
     |  {"id": 1}     |                |   [protobuf]   |
     |<---------------|                |<---------------|
     |                |                |                |
     |  (text-based,  |                |  (binary,      |
     |   one req/conn |                |   multiplexed, |
     |   at a time)   |                |   streaming)   |
     |                |                |                |
```

Let's start from the bottom and work our way up.

## Protocol Buffers: The Serialization Layer

Protocol Buffers (protobuf) is a language-neutral, binary serialization format. You define your data structures in a `.proto` file, and the `protoc` compiler generates code in your target language.

Here is a simple service definition:

```protobuf
syntax = "proto3";

package bookstore;

service BookService {
  rpc GetBook (GetBookRequest) returns (Book);
  rpc ListBooks (ListBooksRequest) returns (stream Book);
}

message GetBookRequest {
  int64 id = 1;
}

message ListBooksRequest {
  string author = 1;
  int32 page_size = 2;
}

message Book {
  int64 id = 1;
  string title = 2;
  string author = 3;
  int32 year = 4;
}
```

When you serialize a `Book{id: 42, title: "DDIA", author: "Kleppmann", year: 2017}`, protobuf encodes it as a compact binary format using **field tags** and **wire types**:

```
  Protobuf Binary Encoding

  Each field is encoded as: (field_number << 3 | wire_type) + value

  Field 1 (id=42):     08 2A        tag=0x08 (field 1, varint), value=42
  Field 2 (title):     12 04 44 44  tag=0x12 (field 2, length-delimited),
                       49 41        length=4, "DDIA"
  Field 3 (author):    1A 09 4B 6C  tag=0x1A (field 3, length-delimited),
                       65 70 70 6D  length=9, "Kleppmann"
                       61 6E 6E
  Field 4 (year=2017): 20 E1 0F     tag=0x20 (field 4, varint), value=2017

  Total: ~25 bytes

  Equivalent JSON: {"id":42,"title":"DDIA","author":"Kleppmann","year":2017}
  Total: ~55 bytes
```

The key differences from JSON:

1. **No field names in the payload.** Fields are identified by their numeric tag (the `= 1`, `= 2` in the `.proto` file). This is why you must never change a field's tag number — it would break backward compatibility.
2. **Variable-length integers (varints).** Small numbers use fewer bytes. The number 42 takes 1 byte, not the 2 characters "42" in JSON.
3. **No parsing ambiguity.** JSON numbers can overflow, strings need escape handling, and there is no native binary type. Protobuf types are fixed at compile time.

The `protoc` compiler generates strongly-typed structs and serialization methods. In Go, for example, `protoc-gen-go` produces a `Book` struct with `Marshal()` and `Unmarshal()` methods. In Java, it generates builder-pattern classes. The generated code handles backward and forward compatibility: unknown fields are preserved, missing fields get default values.

## HTTP/2: The Transport Layer

gRPC chose HTTP/2 as its transport protocol. To understand why, let's look at the problems with HTTP/1.1 and how HTTP/2 solves them.

### HTTP/1.1 limitations

```
  HTTP/1.1: One request at a time per connection

  Connection 1    Connection 2    Connection 3
  +-----------+   +-----------+   +-----------+
  | GET /a    |   | GET /b    |   | GET /c    |
  | (waiting) |   | (waiting) |   | (waiting) |
  | resp /a   |   | resp /b   |   | resp /c   |
  | GET /d    |   |           |   |           |
  | (waiting) |   |           |   |           |
  | resp /d   |   |           |   |           |
  +-----------+   +-----------+   +-----------+

  Problem: "head-of-line blocking"
  Each connection handles one request at a time.
  Browsers open 6-8 connections per host as a workaround.
```

### HTTP/2 multiplexing

HTTP/2 introduces **frames** and **streams**. A single TCP connection carries multiple independent streams, each identified by a stream ID:

```
  HTTP/2: Multiple streams on one connection

  Single TCP Connection
  +--------------------------------------------------+
  |                                                  |
  |  Stream 1 (GET /a)   Stream 3 (POST /b)         |
  |  +--frame--+          +--frame--+                |
  |  | HEADERS |          | HEADERS |                |
  |  +---------+          +---------+                |
  |  +--frame--+          +--frame--+                |
  |  | DATA    |          | DATA    |                |
  |  +---------+          +---------+                |
  |                       +--frame--+                |
  |  Stream 5 (GET /c)   | DATA    |                |
  |  +--frame--+          +---------+                |
  |  | HEADERS |                                     |
  |  +---------+          Stream 1 response          |
  |  +--frame--+          +--frame--+                |
  |  | DATA    |          | HEADERS |                |
  |  +---------+          +---------+                |
  |                       +--frame--+                |
  |                       | DATA    |                |
  |                       +---------+                |
  +--------------------------------------------------+
```

Each HTTP/2 frame has a fixed 9-byte header:

```
  HTTP/2 Frame Format (9-byte header + payload)

  +-----------------------------------------------+
  |                Length (24 bits)                |
  +---------------+-------------------------------+
  |  Type (8 bits)|  Flags (8 bits)               |
  +-+-------------+-------------------------------+
  |R|         Stream Identifier (31 bits)          |
  +-+----------------------------------------------+
  |                                                |
  |              Frame Payload (variable)          |
  |                                                |
  +------------------------------------------------+

  Common frame types:
    HEADERS (0x1)  - carries HTTP headers (compressed with HPACK)
    DATA    (0x0)  - carries the body (protobuf bytes for gRPC)
    RST_STREAM (0x3) - cancels a single stream
    SETTINGS (0x4) - connection-level configuration
    PING     (0x6) - keepalive / latency measurement
    GOAWAY   (0x7) - graceful shutdown
    WINDOW_UPDATE (0x8) - flow control
```

Key HTTP/2 features that gRPC relies on:

1. **Multiplexing:** Multiple RPCs share one TCP connection without blocking each other.
2. **Flow control:** Per-stream and per-connection flow control windows prevent a fast sender from overwhelming a slow receiver.
3. **Header compression (HPACK):** Repeated headers (like `:method: POST`, `content-type: application/grpc`) are encoded as small integers after the first occurrence.
4. **Server push:** Not used by gRPC, but available in HTTP/2.

## How a gRPC Call Works: Wire-Level View

When a gRPC client calls `GetBook(id=42)`, here is what happens on the wire:

```
  Client                                              Server
    |                                                   |
    |  HEADERS frame (stream 1)                         |
    |  :method = POST                                   |
    |  :path = /bookstore.BookService/GetBook           |
    |  :scheme = http                                   |
    |  content-type = application/grpc                  |
    |  te = trailers                                    |
    |  grpc-encoding = identity                         |
    |-------------------------------------------------->|
    |                                                   |
    |  DATA frame (stream 1)                            |
    |  +---+---+---+---+---+---+---+---+               |
    |  | 0 | 0   0   0   4 | 08  2A    |               |
    |  +---+---+---+---+---+---+---+---+               |
    |  |flg|  length (4B)  | protobuf  |               |
    |  |   |   big-endian  |  payload  |               |
    |  +---+---+---+---+---+---+---+---+               |
    |-------------------------------------------------->|
    |                                                   |
    |  HEADERS frame (stream 1)                         |
    |  :status = 200                                    |
    |  content-type = application/grpc                  |
    |<--------------------------------------------------|
    |                                                   |
    |  DATA frame (stream 1)                            |
    |  [compressed-flag + length + protobuf Book]       |
    |<--------------------------------------------------|
    |                                                   |
    |  HEADERS frame (stream 1, END_STREAM)             |
    |  grpc-status = 0                                  |
    |  grpc-message = (empty, meaning OK)               |
    |<--------------------------------------------------|
```

Notice the **gRPC length-prefixed message** format inside the DATA frame. Every gRPC message is wrapped in a 5-byte envelope:

```
  gRPC Message Envelope

  +---+---+---+---+---+------- ... -------+
  | C |      Message Length (4 bytes)      |
  +---+---+---+---+---+                   |
  |         Protobuf Payload              |
  +------- ... ---------------------------+

  C = Compressed flag (0 = no, 1 = yes)
  Message Length = big-endian uint32
```

This envelope allows the receiver to know exactly where one message ends and the next begins — essential for streaming RPCs where multiple messages travel on the same stream.

The gRPC path format is always `/{package}.{Service}/{Method}`. This is how the server routes the incoming request to the correct handler, without needing a URL router like REST frameworks.

## The Four RPC Patterns

gRPC supports four communication patterns, all built on HTTP/2 streams:

```
  Pattern            Client sends    Server sends    Use case
  ----------------   -------------   -------------   ------------------
  Unary              1 message       1 message       Simple request/reply
  Server streaming   1 message       N messages      Subscriptions, feeds
  Client streaming   N messages      1 message       File upload, batching
  Bidirectional      N messages      N messages      Chat, real-time sync
```

### 1. Unary RPC

The simplest pattern. One request, one response. This is what REST does, but with protobuf and HTTP/2.

```protobuf
rpc GetBook (GetBookRequest) returns (Book);
```

```
  Client                    Server
    |    HEADERS + DATA       |
    |    [GetBookRequest]     |
    |------------------------>|
    |                         |
    |    HEADERS + DATA       |
    |    [Book]               |
    |    TRAILERS             |
    |<------------------------|
```

### 2. Server Streaming RPC

The client sends one request, and the server sends back a stream of messages. The stream ends when the server sends trailers.

```protobuf
rpc ListBooks (ListBooksRequest) returns (stream Book);
```

```
  Client                    Server
    |    HEADERS + DATA       |
    |    [ListBooksRequest]   |
    |------------------------>|
    |                         |
    |    HEADERS              |
    |<------------------------|
    |    DATA [Book 1]        |
    |<------------------------|
    |    DATA [Book 2]        |
    |<------------------------|
    |    DATA [Book 3]        |
    |<------------------------|
    |    TRAILERS             |
    |    grpc-status = 0      |
    |<------------------------|
```

A real-world example: TiDB's PD server uses server streaming to push region heartbeat responses to TiKV stores. The TiKV store sends heartbeats (client streaming), and PD responds with scheduling commands (server streaming) — this is actually the bidirectional pattern.

### 3. Client Streaming RPC

The client sends a stream of messages, and the server responds with a single message after the client finishes.

```protobuf
rpc UploadChunks (stream Chunk) returns (UploadResult);
```

```
  Client                    Server
    |    HEADERS              |
    |------------------------>|
    |    DATA [Chunk 1]       |
    |------------------------>|
    |    DATA [Chunk 2]       |
    |------------------------>|
    |    DATA [Chunk 3]       |
    |    END_STREAM           |
    |------------------------>|
    |                         |
    |    HEADERS + DATA       |
    |    [UploadResult]       |
    |    TRAILERS             |
    |<------------------------|
```

### 4. Bidirectional Streaming RPC

Both sides send streams of messages independently. The two streams are independent — the client and server can read and write in any order.

```protobuf
rpc Chat (stream ChatMessage) returns (stream ChatMessage);
```

```
  Client                    Server
    |    HEADERS              |
    |------------------------>|
    |    DATA [msg 1]         |
    |------------------------>|
    |    DATA [reply 1]       |
    |<------------------------|
    |    DATA [msg 2]         |
    |------------------------>|
    |    DATA [msg 3]         |
    |------------------------>|
    |    DATA [reply 2]       |
    |<------------------------|
    |    DATA [reply 3]       |
    |<------------------------|
    |    END_STREAM           |
    |------------------------>|
    |    TRAILERS             |
    |<------------------------|
```

Kubernetes uses bidirectional streaming for `kubectl exec` — keystrokes flow from the client to the container, and stdout/stderr flow back, all on one HTTP/2 stream.

## Architecture: Channels, Transports, and Streams

Let's look at how the gRPC Go implementation (`grpc-go`) is structured. The codebase lives at [github.com/grpc/grpc-go](https://github.com/grpc/grpc-go).

```
  gRPC-Go Client Architecture

  +-----------------------------------------------------------+
  |  Application Code                                         |
  |  bookClient.GetBook(ctx, &GetBookRequest{Id: 42})         |
  +----------------------------+------------------------------+
                               |
                               v
  +-----------------------------------------------------------+
  |  Generated Stub (*.pb.go / *_grpc.pb.go)                  |
  |  Marshals request to protobuf, calls cc.Invoke()          |
  +----------------------------+------------------------------+
                               |
                               v
  +-----------------------------------------------------------+
  |  ClientConn (clientconn.go)                                |
  |  - Manages the "channel" (logical connection)             |
  |  - Holds the resolver, balancer, and picker               |
  |  - Picks a SubConn for each RPC                           |
  +--------+------------------+-------------------------------+
           |                  |
           v                  v
  +-----------------+  +-----------------+
  |   SubConn 1     |  |   SubConn 2     |   one per backend
  |  (addrConn)     |  |  (addrConn)     |
  +--------+--------+  +--------+--------+
           |                     |
           v                     v
  +-----------------+  +-----------------+
  |   Transport     |  |   Transport     |   HTTP/2 connection
  |  (http2Client)  |  |  (http2Client)  |
  +--------+--------+  +--------+--------+
           |                     |
           v                     v
       TCP conn 1           TCP conn 2
```

### ClientConn: The Channel

When you call `grpc.Dial("myservice:8080")`, gRPC creates a `ClientConn`. This is the **channel** — a logical connection to a service that may have multiple backends. The `ClientConn` is defined in [`clientconn.go`](https://github.com/grpc/grpc-go/blob/master/clientconn.go):

```go
type ClientConn struct {
    target          string
    authority       string
    csMgr           *connectivityStateManager
    balancerWrapper *ccBalancerWrapper
    resolverWrapper *ccResolverWrapper
    // ...
}
```

The `ClientConn` coordinates three subsystems:

1. **Resolver** — translates the target name (e.g., `dns:///myservice`) into a list of backend addresses. The default resolver uses DNS, but you can plug in etcd, Consul, or a static list.

2. **Balancer** — decides which backend to send each RPC to. The default is `pick_first` (stick to one backend until it fails). The `round_robin` balancer distributes RPCs across all healthy backends.

3. **Picker** — a lightweight, lock-free function that the balancer produces. On every RPC, the picker selects a `SubConn`. This design separates the "update addresses" path (slow, rare) from the "pick a backend" path (fast, every RPC).

### Transport: The HTTP/2 Connection

Each `SubConn` manages one TCP connection wrapped in an HTTP/2 transport. The transport layer is in [`internal/transport/http2_client.go`](https://github.com/grpc/grpc-go/blob/master/internal/transport/http2_client.go):

```go
type http2Client struct {
    conn       net.Conn          // underlying TCP connection
    framer     *http2.Framer     // reads/writes HTTP/2 frames
    controlBuf *controlBuffer    // outgoing control frames queue
    activeStreams map[uint32]*Stream // stream ID -> stream
    // ...
}
```

The transport handles:
- **Frame reading:** A dedicated goroutine (`reader()`) reads frames from the TCP connection and dispatches them to the correct stream.
- **Frame writing:** A dedicated goroutine (`loopy()`) drains the `controlBuf` and writes frames. This serializes all writes through one goroutine, avoiding lock contention on the TCP connection.
- **Flow control:** Both per-stream and per-connection flow control windows are tracked. When a window is exhausted, the sender blocks until the receiver sends a `WINDOW_UPDATE` frame.

### Stream: One RPC

Each RPC creates one HTTP/2 stream. The `Stream` struct in [`internal/transport/transport.go`](https://github.com/grpc/grpc-go/blob/master/internal/transport/transport.go) tracks the state of that stream:

```go
type Stream struct {
    id       uint32
    method   string           // e.g., "/bookstore.BookService/GetBook"
    recvCompress string       // incoming compression algorithm
    buf      *recvBuffer      // incoming DATA frames queue
    headerChan chan struct{}   // signals when response headers arrive
    // ...
}
```

For streaming RPCs, the `buf` (a `recvBuffer`) is a queue of incoming protobuf messages. The application reads from this queue until it receives an `io.EOF` (the server sent END_STREAM).

## The Server Side

The server architecture mirrors the client. When you call `grpc.NewServer()` and `s.Serve(lis)`, here is what happens:

```
  gRPC-Go Server Architecture

  +---------------------------------------------------------+
  |  net.Listener (TCP)                                     |
  |  Accepts new connections                                |
  +----------------------------+----------------------------+
                               |
                   (for each new conn)
                               v
  +---------------------------------------------------------+
  |  http2Server (internal/transport/http2_server.go)       |
  |  - Reads HTTP/2 frames from the connection              |
  |  - Creates a Stream for each new request                |
  +----------------------------+----------------------------+
                               |
                               v
  +---------------------------------------------------------+
  |  Server.handleStream (server.go)                        |
  |  - Looks up the service + method from :path header      |
  |  - Deserializes the request protobuf                    |
  |  - Calls the registered handler                         |
  +----------------------------+----------------------------+
                               |
                               v
  +---------------------------------------------------------+
  |  Application Handler                                    |
  |  func (s *bookServer) GetBook(ctx, req) (*Book, error)  |
  +---------------------------------------------------------+
```

The server's method lookup is a simple map. When you call `RegisterBookServiceServer(s, &myImpl{})`, the generated code registers each method name:

```go
// From the generated *_grpc.pb.go file
var BookService_ServiceDesc = grpc.ServiceDesc{
    ServiceName: "bookstore.BookService",
    Methods: []grpc.MethodDesc{
        {MethodName: "GetBook", Handler: _BookService_GetBook_Handler},
    },
    Streams: []grpc.StreamDesc{
        {StreamName: "ListBooks", Handler: _BookService_ListBooks_Handler, ServerStreams: true},
    },
}
```

The `Server` stores these in a map keyed by the full path (`/bookstore.BookService/GetBook`). When a HEADERS frame arrives with that path, the server dispatches to the registered handler. This code lives in [`server.go`](https://github.com/grpc/grpc-go/blob/master/server.go).

## Interceptors: Middleware for gRPC

gRPC has a middleware system called **interceptors**. They work like HTTP middleware but are typed for gRPC's unary and streaming patterns.

```
  Request Flow with Interceptors

  Client App
      |
      v
  +------------------+
  | Unary Interceptor|  logging, auth token injection
  +--------+---------+
           |
           v
  +------------------+
  | Unary Interceptor|  retry logic
  +--------+---------+
           |
           v
  +------------------+
  | Transport        |  --- network --->  Server Transport
  +------------------+                         |
                                               v
                                    +------------------+
                                    | Unary Interceptor|  auth validation
                                    +--------+---------+
                                             |
                                             v
                                    +------------------+
                                    | Unary Interceptor|  rate limiting
                                    +--------+---------+
                                             |
                                             v
                                        Handler
```

There are four interceptor types:

```go
// Client-side unary interceptor
type UnaryClientInterceptor func(
    ctx context.Context,
    method string,          // e.g., "/bookstore.BookService/GetBook"
    req, reply interface{}, // request and response messages
    cc *ClientConn,
    invoker UnaryInvoker,   // the next interceptor or the real call
    opts ...CallOption,
) error

// Server-side unary interceptor
type UnaryServerInterceptor func(
    ctx context.Context,
    req interface{},
    info *UnaryServerInfo,
    handler UnaryHandler,   // the next interceptor or the real handler
) (interface{}, error)

// Plus StreamClientInterceptor and StreamServerInterceptor
// for streaming RPCs
```

A practical example — a server-side logging interceptor:

```go
func loggingInterceptor(
    ctx context.Context,
    req interface{},
    info *grpc.UnaryServerInfo,
    handler grpc.UnaryHandler,
) (interface{}, error) {
    start := time.Now()
    resp, err := handler(ctx, req)  // call the next handler
    log.Printf("method=%s duration=%s err=%v",
        info.FullMethod, time.Since(start), err)
    return resp, err
}

// Register it
server := grpc.NewServer(
    grpc.UnaryInterceptor(loggingInterceptor),
)
```

Multiple interceptors are chained using `grpc.ChainUnaryInterceptor()`. The chain is built at server creation time and stored in [`server.go`](https://github.com/grpc/grpc-go/blob/master/server.go). Each interceptor calls the next one via the `handler` parameter, forming a classic middleware chain.

## Name Resolution and Load Balancing

gRPC has a pluggable name resolution system. The resolver interface is defined in [`resolver/resolver.go`](https://github.com/grpc/grpc-go/blob/master/resolver/resolver.go):

```
  Name Resolution Flow

  grpc.Dial("dns:///myservice.prod:8080")
       |
       v
  +---------------------+
  | Resolver            |     resolves name to addresses
  | (dns, etcd, consul) |
  +----------+----------+
             |
             |  UpdateState([addr1, addr2, addr3])
             v
  +---------------------+
  | Balancer            |     decides how to distribute RPCs
  | (pick_first,        |
  |  round_robin,       |
  |  custom)            |
  +----------+----------+
             |
             |  UpdatePicker(picker)
             v
  +---------------------+
  | Picker              |     selects a SubConn for each RPC
  | (lock-free, fast)   |     called on every RPC hot path
  +---------------------+
```

The target string uses a URI scheme: `dns:///host:port`, `etcd:///service-name`, `passthrough:///host:port`. The scheme determines which resolver is used. If no scheme is specified, the default resolver (DNS) is used.

The balancer receives address updates from the resolver and creates/destroys `SubConn`s. It then produces a new `Picker` that reflects the current set of healthy backends. This separation means:

- **Address updates** (DNS changes, nodes joining/leaving) happen asynchronously.
- **RPC dispatch** (picking a backend) is a fast, synchronous call with no locks.

For Kubernetes environments, gRPC can use the [xDS protocol](https://github.com/grpc/grpc-go/tree/master/xds) (the same protocol Envoy uses) for service discovery and load balancing, enabling advanced features like weighted routing, circuit breaking, and outlier detection.

## Deadlines, Cancellation, and Metadata

### Deadlines

Every gRPC call should have a deadline. The client sets it via Go's `context.WithTimeout`, and gRPC propagates it to the server automatically via the `grpc-timeout` header:

```go
// Client
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
book, err := client.GetBook(ctx, &GetBookRequest{Id: 42})
```

On the wire, gRPC sends `grpc-timeout: 5S` in the HEADERS frame. The server's `context.Context` will be canceled when the deadline expires, even if the client and server are in different processes.

### Cancellation

When a client cancels a context, gRPC sends an HTTP/2 `RST_STREAM` frame to the server:

```
  Client                    Server
    |    HEADERS + DATA       |
    |------------------------>|
    |                         |   (server is processing...)
    |    RST_STREAM           |
    |    (CANCEL)             |
    |------------------------>|
    |                         |   ctx.Done() fires
    |                         |   handler returns
```

This means the server can stop expensive work immediately when the client no longer cares about the result. The server should check `ctx.Err()` or select on `ctx.Done()` during long operations.

### Metadata

gRPC metadata is the equivalent of HTTP headers. Clients and servers can attach key-value pairs:

```go
// Client sends metadata
md := metadata.Pairs("authorization", "Bearer tok123")
ctx := metadata.NewOutgoingContext(ctx, md)
book, err := client.GetBook(ctx, req)

// Server reads metadata
md, ok := metadata.FromIncomingContext(ctx)
token := md.Get("authorization")[0]
```

Metadata is carried in HTTP/2 HEADERS frames, compressed with HPACK. Binary values (keys ending in `-bin`) are base64-encoded automatically.

## Error Handling: Status Codes

gRPC defines its own set of [status codes](https://github.com/grpc/grpc-go/blob/master/codes/codes.go), sent in the `grpc-status` trailer:

```
  Code  Name                When to use
  ----  ------------------  ------------------------------------
  0     OK                  Success
  1     CANCELLED           Client cancelled the RPC
  2     UNKNOWN             Unknown error (catch-all)
  3     INVALID_ARGUMENT    Client sent bad input
  4     DEADLINE_EXCEEDED   Timeout before completion
  5     NOT_FOUND           Resource doesn't exist
  7     PERMISSION_DENIED   Caller lacks permission
  8     RESOURCE_EXHAUSTED  Rate limit or quota exceeded
  13    INTERNAL            Server-side bug
  14    UNAVAILABLE         Transient failure, retry may help
  16    UNAUTHENTICATED     Missing or invalid credentials
```

These are not HTTP status codes. The HTTP status is almost always `200 OK` for gRPC — the real status lives in the trailers. This is because gRPC needs to send the status **after** the response body (which may be a stream of messages), and HTTP trailers are the mechanism for that.

```go
// Server returns a gRPC error
import "google.golang.org/grpc/status"

func (s *bookServer) GetBook(ctx context.Context, req *GetBookRequest) (*Book, error) {
    book, err := s.db.FindBook(req.Id)
    if err != nil {
        return nil, status.Errorf(codes.NotFound, "book %d not found", req.Id)
    }
    return book, nil
}
```

## Putting It All Together: A Request's Journey

Here is the complete path of a unary RPC through the grpc-go codebase:

```
  bookClient.GetBook(ctx, req)
       |
       |  1. Generated stub marshals req to protobuf bytes
       |     (*_grpc.pb.go)
       |
       |  2. cc.Invoke() is called on the ClientConn
       |     (clientconn.go)
       |
       |  3. Client interceptor chain runs
       |     (e.g., logging, retry, auth)
       |
       |  4. Picker selects a SubConn
       |     (balancer picks a backend)
       |
       |  5. Transport creates an HTTP/2 stream
       |     (internal/transport/http2_client.go)
       |
       |  6. HEADERS frame sent: :path=/bookstore.BookService/GetBook
       |  7. DATA frame sent: [5-byte envelope + protobuf bytes]
       |
       ~ ~ ~ ~ ~ ~ ~ network ~ ~ ~ ~ ~ ~ ~
       |
       |  8. Server transport reads HEADERS, creates a Stream
       |     (internal/transport/http2_server.go)
       |
       |  9. Server looks up handler by :path
       |     (server.go, service map)
       |
       | 10. Server interceptor chain runs
       |     (e.g., auth, rate limit, logging)
       |
       | 11. Handler executes: GetBook(ctx, req)
       |     (your application code)
       |
       | 12. Response marshaled to protobuf
       | 13. HEADERS + DATA + TRAILERS sent back
       |
       ~ ~ ~ ~ ~ ~ ~ network ~ ~ ~ ~ ~ ~ ~
       |
       | 14. Client transport reads response frames
       | 15. Protobuf bytes unmarshaled to Book struct
       | 16. Result returned to application
       v
  book, err := ...
```

## References

1. gRPC official documentation [doc](https://grpc.io/docs/)
2. Protocol Buffers encoding reference [doc](https://protobuf.dev/programming-guides/encoding/)
3. HTTP/2 specification, RFC 7540 [rfc](https://www.rfc-editor.org/rfc/rfc7540)
4. gRPC over HTTP/2 protocol specification [doc](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md)
5. grpc-go ClientConn implementation [`clientconn.go`](https://github.com/grpc/grpc-go/blob/master/clientconn.go)
6. grpc-go Server implementation [`server.go`](https://github.com/grpc/grpc-go/blob/master/server.go)
7. grpc-go HTTP/2 client transport [`internal/transport/http2_client.go`](https://github.com/grpc/grpc-go/blob/master/internal/transport/http2_client.go)
8. grpc-go resolver interface [`resolver/resolver.go`](https://github.com/grpc/grpc-go/blob/master/resolver/resolver.go)
9. grpc-go status codes [`codes/codes.go`](https://github.com/grpc/grpc-go/blob/master/codes/codes.go)
10. "What does the g in gRPC stand for?" [`doc/g_stands_for.md`](https://github.com/grpc/grpc/blob/master/doc/g_stands_for.md)
