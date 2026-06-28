---
author: JZ
pubDatetime: 2026-06-28T06:23:00Z
modDatetime: 2026-06-28T06:23:00Z
title: System Design - How Protocol Buffers (Protobuf) Encoding Works
tags:
  - design-system
  - design-networking
description:
  "How Protocol Buffers encoding works internally: wire types, varint encoding, field tags, length-delimited records, and a byte-level walkthrough showing why protobuf messages are compact and fast to parse."
---

## Table of contents

## Context

When two services communicate over a network, they need to agree on how to turn structured data (objects, structs, messages) into bytes that travel over the wire, and back again. This is **serialization**.

You could use JSON. It is human-readable and universal. But JSON is text-based: numbers become strings of ASCII digits, field names repeat in every single message, and parsing requires scanning for quotes, colons, and commas character by character.

In high-throughput systems — think a microservice handling 100,000 RPC calls per second — JSON's overhead adds up. Google invented **Protocol Buffers** (protobuf) in 2001 to solve this at scale. Today, protobuf is the default serialization format behind gRPC, used by Google, Netflix, Square, and many others.

Protobuf messages are:
- **Smaller** than JSON (no field name repetition, compact numeric encoding)
- **Faster** to parse (no string scanning — fixed rules decode each byte)
- **Schema-driven** (a `.proto` file defines the structure at compile time)

Let's look at exactly how bytes are laid out on the wire.

## The .proto Schema

Before encoding, you define your message structure:

```protobuf
syntax = "proto3";

message Person {
  string name   = 1;   // field number 1
  int32  age    = 2;   // field number 2
  string email  = 3;   // field number 3
}
```

The numbers (`1`, `2`, `3`) are **field tags** — not values, but identifiers. They are the key to protobuf's compactness: on the wire, field names like `"name"` or `"email"` never appear. Only the small integer tag travels with the data.

## Wire Types

Every piece of data on the wire is prefixed by a **tag byte** that encodes two things:

1. The field number (which field is this?)
2. The wire type (how many bytes follow?)

```
Tag byte layout:

  +--+--+--+--+--+--+--+--+
  |  field_number  |  type |
  +--+--+--+--+--+--+--+--+
   bits 7..3         bits 2..0

  tag = (field_number << 3) | wire_type
```

There are six wire types, but most data uses three:

```
  Wire Type   Meaning                  Used For
  ---------   ----------------------   ---------------------------
  0           Varint                   int32, int64, uint32, bool
  1           64-bit fixed             double, fixed64
  2           Length-delimited         string, bytes, embedded msg
  5           32-bit fixed             float, fixed32
```

Wire types 3 and 4 (start/end group) are deprecated.

## Varint Encoding: The Core Trick

The most important encoding in protobuf is the **varint** — a variable-length integer that uses fewer bytes for smaller numbers.

The rule is simple: each byte uses 7 bits for data and 1 bit (the MSB) as a continuation flag.

```
  Encoding the number 300:

  300 in binary = 1 0010 1100

  Split into 7-bit groups (little-endian order):
    group 1:  010 1100   (low 7 bits)
    group 2:  000 0010   (next 7 bits)

  Add continuation bits (MSB = 1 means "more bytes follow"):
    byte 1:  1_010 1100  = 0xAC  (MSB=1: more coming)
    byte 2:  0_000 0010  = 0x02  (MSB=0: last byte)

  On the wire: AC 02
```

Small numbers (0–127) fit in a single byte. The number 1 is just `0x01`. This is why protobuf is compact for typical data — most field tags and many values are small.

```
  Varint examples:

  Value     Encoded bytes       Size
  -----     ---------------     ----
  1         01                  1 byte
  127       7F                  1 byte
  128       80 01               2 bytes
  300       AC 02               2 bytes
  16384     80 80 01            3 bytes
```

## Encoding a Complete Message

Let's encode a `Person` message with concrete values:

```protobuf
Person {
  name  = "Al"     // field 1, wire type 2 (length-delimited)
  age   = 25       // field 2, wire type 0 (varint)
  email = "a@b.c"  // field 3, wire type 2 (length-delimited)
}
```

Step by step:

```
  Field: name (field_number=1, wire_type=2)
  Tag:   (1 << 3) | 2 = 0x0A
  Length: 2 (two bytes of UTF-8)
  Data:  0x41 0x6C ("Al")

  Field: age (field_number=2, wire_type=0)
  Tag:   (2 << 3) | 0 = 0x10
  Data:  0x19 (varint for 25)

  Field: email (field_number=3, wire_type=2)
  Tag:   (3 << 3) | 2 = 0x1A
  Length: 5
  Data:  0x61 0x40 0x62 0x2E 0x63 ("a@b.c")

  Complete message on the wire (14 bytes):

  0A 02 41 6C 10 19 1A 05 61 40 62 2E 63
  |     |     |  |  |     |
  |     "Al"  |  25 |     "a@b.c"
  tag1        tag2  tag3
```

The equivalent JSON `{"name":"Al","age":25,"email":"a@b.c"}` is 38 bytes — nearly 3x larger.

## How the Decoder Works

Decoding is a simple loop:

```
  decode(bytes):
      while bytes remaining:
          tag_byte = read_varint(bytes)
          field_number = tag_byte >> 3
          wire_type    = tag_byte & 0x07

          switch wire_type:
              case 0:  value = read_varint(bytes)
              case 1:  value = read_fixed_64(bytes)
              case 2:  length = read_varint(bytes)
                       value  = read_bytes(bytes, length)
              case 5:  value = read_fixed_32(bytes)

          store(field_number, value)
```

```
  Decoding flow for our Person message:

  Bytes: 0A 02 41 6C 10 19 1A 05 61 40 62 2E 63
         ^
         |
  +------+------+------+------+------+------+
  | Read 0x0A   | tag: field=1, type=2       |
  | Read 0x02   | length = 2                 |
  | Read 2 bytes| "Al"                       |
  +-------------+----------------------------+
  | Read 0x10   | tag: field=2, type=0       |
  | Read 0x19   | varint = 25               |
  +-------------+----------------------------+
  | Read 0x1A   | tag: field=3, type=2       |
  | Read 0x05   | length = 5                 |
  | Read 5 bytes| "a@b.c"                    |
  +-------------+----------------------------+
```

Notice that the decoder does not need the `.proto` schema to skip fields. If it encounters an unknown field number, it knows exactly how many bytes to skip based on the wire type alone. This is how protobuf achieves **forward compatibility** — old code can skip new fields it doesn't recognize.

## Signed Integers: ZigZag Encoding

Standard varints are efficient for positive numbers, but negative numbers in two's complement have their MSB set, making them large (10 bytes for any negative int64!). Protobuf solves this with **ZigZag encoding** for `sint32`/`sint64` types:

```
  ZigZag maps signed integers to unsigned:

  Original    Encoded
  --------    -------
   0           0
  -1           1
   1           2
  -2           3
   2           4
  ...         ...

  Formula:  zigzag(n) = (n << 1) ^ (n >> 31)   // for int32
```

This keeps small-magnitude negative numbers small on the wire:

```
  Value    varint(sint32)   varint(int32)
  -----    --------------   -------------
  -1       01 (1 byte)      FF FF FF FF FF FF FF FF FF 01 (10 bytes!)
  -2       03 (1 byte)      FE FF FF FF FF FF FF FF FF 01 (10 bytes!)
```

## Nested Messages and Repeated Fields

Embedded messages use wire type 2 (length-delimited) — they are just bytes within bytes:

```protobuf
message Address {
  string city = 1;
}
message Person {
  string  name    = 1;
  Address address = 4;
}
```

```
  Encoding Person { name="Jo", address={ city="NY" } }:

  0A 02 4A 6F        field 1: "Jo"
  22 04              field 4: length-delimited, 4 bytes follow
     0A 02 4E 59    nested Address: field 1 = "NY"
       ^--- this is a full protobuf message inside the outer one
```

Repeated fields (arrays) are encoded as **packed varints** for numeric types:

```protobuf
message Scores {
  repeated int32 values = 1;
}
// Scores { values = [3, 270, 86942] }
```

```
  Tag:    0x0A (field 1, wire type 2)
  Length: 0x06 (6 bytes of packed data)
  Data:   03 8E 02 9E A7 05

  Breakdown:
    03         -> 3
    8E 02      -> 270   (0001 0001110 -> remove continuation -> 270)
    9E A7 05   -> 86942
```

## Source Code: Google's C++ Implementation

The core encoding lives in [`google/protobuf/io/coded_stream.h`](https://github.com/protocolbuffers/protobuf/blob/main/src/google/protobuf/io/coded_stream.h). Key pieces:

**Writing a varint** (from `coded_stream.cc`):

```cpp
uint8_t* CodedOutputStream::WriteVarint64ToArrayInline(
    uint64_t value, uint8_t* target) {
  while (value >= 0x80) {
    *target = static_cast<uint8_t>(value | 0x80);
    value >>= 7;
    ++target;
  }
  *target = static_cast<uint8_t>(value);
  return target + 1;
}
```

**Reading a varint** (from `coded_stream.cc`):

```cpp
bool CodedInputStream::ReadVarint64Slow(uint64_t* value) {
  uint64_t result = 0;
  int count = 0;
  uint32_t b;
  do {
    b = ReadRaw(1);
    result |= static_cast<uint64_t>(b & 0x7F) << (7 * count);
    ++count;
  } while (b & 0x80);
  *value = result;
  return true;
}
```

The write path is branchless-optimized for 1-2 byte varints (the common case). The read path uses a loop but processes exactly one byte per iteration with no allocation.

## Why Not Just Use JSON?

A side-by-side comparison:

```
  Feature            Protobuf                JSON
  -------            --------                ----
  Size               Compact (binary)        Verbose (text)
  Parse speed        O(n), no scanning       O(n), string scanning
  Schema             Required (.proto)       Optional
  Human-readable     No                      Yes
  Forward compat     Yes (skip unknown)      Partial
  Field ordering     Not required            Not required
  Null handling      Default values omitted  Explicit null
```

```
  Size comparison for 1000 Person records:

  +---------------------------+
  |  JSON:      ~45 KB        |
  |  Protobuf:  ~14 KB        |  ~3x smaller
  +---------------------------+
  |  JSON parse:   12 ms      |
  |  Proto parse:   2 ms      |  ~6x faster
  +---------------------------+
  (Approximate; varies by data and implementation)
```

The tradeoff is clear: if humans need to read the data (config files, APIs for browser clients), use JSON. If machines talk to machines at high volume (internal RPCs, storage formats, streaming pipelines), protobuf wins.

## How Protobuf Achieves Forward and Backward Compatibility

The field-tag design makes schema evolution safe:

```
  Rule 1: Never reuse a field number
  Rule 2: New fields get new numbers
  Rule 3: Use 'reserved' for retired fields

  v1 schema:              v2 schema (new field added):
  message Person {        message Person {
    string name = 1;        string name = 1;
    int32  age  = 2;        int32  age  = 2;
  }                         string phone = 4;  // new!
                          }

  Old code reading v2 data:
    sees tag 4 → unknown field → reads wire_type to skip → done
    (no crash, no corruption)

  New code reading v1 data:
    never sees tag 4 → field 'phone' stays at default ("")
    (no crash, no corruption)
```

This is why protobuf field numbers are permanent. Once assigned, a number means that field forever.

## References

1. Protocol Buffers encoding documentation: [protobuf.dev/programming-guides/encoding](https://protobuf.dev/programming-guides/encoding/)
2. Protocol Buffers source code: [github.com/protocolbuffers/protobuf](https://github.com/protocolbuffers/protobuf)
3. Google's original protobuf paper (2008): "Protocol Buffers: Google's Data Interchange Format"
4. Varint encoding: [protobuf.dev/programming-guides/encoding/#varints](https://protobuf.dev/programming-guides/encoding/#varints)
5. gRPC uses protobuf as its IDL and serialization format: [grpc.io](https://grpc.io/)
