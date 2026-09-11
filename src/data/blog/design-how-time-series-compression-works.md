---
author: JZ
pubDatetime: 2026-09-11T06:23:00Z
modDatetime: 2026-09-11T06:23:00Z
title: System Design - How Time-Series Compression Works
tags:
  - design-system
  - design-database
description:
  "How time-series databases compress timestamps and floating-point values: delta-of-delta encoding, XOR-based float compression, the Facebook Gorilla paper, and a source code walkthrough of Prometheus TSDB's chunk encoding."
---

## Table of contents

## Context

Imagine you are monitoring a fleet of 10,000 servers. Each server reports CPU usage, memory, disk I/O, and network throughput every 15 seconds. That is 4 metrics $\times$ 10,000 servers $\times$ 5,760 samples per day (one every 15 seconds) $= 230$ million data points per day. Each data point is a pair: a 64-bit timestamp and a 64-bit floating-point value. At 16 bytes each, that is **3.4 GB per day** — uncompressed.

This is the scale that monitoring systems like Prometheus, InfluxDB, and Meta's internal Gorilla database face daily. The key insight that makes this tractable is that time-series data is **predictable**:

- **Timestamps arrive at regular intervals.** If samples come every 15 seconds, consecutive timestamps differ by exactly 15,000 milliseconds — most of the time.
- **Values change slowly.** CPU usage at 47.3% is likely followed by 47.5% or 47.1%, not 99.9%.

In 2015, engineers at Facebook published a paper called [Gorilla: A Fast, Scalable, In-Memory Time Series Database](http://www.vldb.org/pvldb/vol8/p1816-teller.pdf). The paper described a compression scheme that exploits these patterns to achieve **12x compression** over uncompressed storage. The ideas are elegant and surprisingly simple. Let's walk through them.

## The Big Picture

A time-series chunk is a sequence of `(timestamp, value)` pairs. Gorilla compresses timestamps and values independently, using two different techniques:

```
  Raw time series:

  (t0, v0), (t1, v1), (t2, v2), (t3, v3), ...

  Compressed:

  +---------------------------+---------------------------+
  |    Timestamp stream       |    Value stream           |
  |    (delta-of-delta)       |    (XOR encoding)         |
  +---------------------------+---------------------------+
  |  t0 (full)                |  v0 (full 64 bits)        |
  |  t1-t0 (first delta)     |  v0 XOR v1 (meaningful?)  |
  |  d2 - d1 (delta-of-delta)|  v1 XOR v2 (meaningful?)  |
  |  d3 - d2 (delta-of-delta)|  v2 XOR v3 (meaningful?)  |
  |  ...                      |  ...                      |
  +---------------------------+---------------------------+
```

The timestamp stream uses **delta-of-delta** encoding: instead of storing each timestamp, we store how the *interval between samples* changes over time. The value stream uses **XOR** encoding: instead of storing each float, we store the bitwise difference from the previous float.

Let's look at each one in detail.

## Delta-of-Delta: Compressing Timestamps

### The Intuition

Suppose your monitoring system samples every 15 seconds. The raw timestamps look like:

```
  t0 = 1694000000000   (ms since epoch)
  t1 = 1694000015000   (+15000)
  t2 = 1694000030000   (+15000)
  t3 = 1694000045000   (+15000)
  t4 = 1694000060123   (+15123)   <-- slight jitter
```

The **first delta** (difference between consecutive timestamps) is:

```
  d1 = t1 - t0 = 15000
  d2 = t2 - t1 = 15000
  d3 = t3 - t2 = 15000
  d4 = t4 - t3 = 15123
```

The **delta-of-delta** (difference between consecutive deltas) is:

```
  dd2 = d2 - d1 = 0
  dd3 = d3 - d2 = 0
  dd4 = d4 - d3 = 123
```

Most of the time, the delta-of-delta is **zero** — the interval between samples is perfectly regular. When it is not zero, the deviation is small. This is exactly the pattern we can exploit.

### The Encoding Scheme

Gorilla uses a variable-length encoding for delta-of-deltas. Smaller values get fewer bits:

```
  Delta-of-delta value       Encoding
  -------------------------  -----------------------------------
  0                          '0'                       (1 bit)
  [-63, 64]                  '10' + value in 7 bits    (9 bits)
  [-255, 256]                '110' + value in 9 bits   (12 bits)
  [-2047, 2048]              '1110' + value in 12 bits (16 bits)
  everything else            '1111' + value in 32 bits (36 bits)
```

In practice, about **96% of timestamps** in typical monitoring data have a delta-of-delta of zero. That means 96% of timestamps cost just **1 bit** to store, down from 64 bits. Even a 15-second timestamp that would normally take 8 bytes now takes 1 bit — a **512x** improvement for the common case.

### Source Code: Prometheus XOR Chunk

Prometheus implements this in its TSDB library. The file [`tsdb/chunkenc/xor.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/chunkenc/xor.go) contains the chunk encoder. Here is how it writes a timestamp delta-of-delta:

```go
func (a *xorAppender) writeTimestampDeltaOfDelta(dod int64) {
    switch {
    case dod == 0:
        a.b.writeBit(zero)
    case bitRange(dod, 14):
        a.b.writeBits(0b10, 2)
        a.b.writeBits(uint64(dod), 14)
    case bitRange(dod, 17):
        a.b.writeBits(0b110, 3)
        a.b.writeBits(uint64(dod), 17)
    case bitRange(dod, 20):
        a.b.writeBits(0b1110, 4)
        a.b.writeBits(uint64(dod), 20)
    default:
        a.b.writeBits(0b1111, 4)
        a.b.writeBits(uint64(dod), 64)
    }
}
```

Note that Prometheus uses slightly different bit-widths than the original Gorilla paper (14, 17, 20, 64 instead of 7, 9, 12, 32). This is a tuning choice — the principle is identical. The `bitRange` helper checks whether a signed value fits in the given number of bits (accounting for the sign bit in two's complement).

The append path looks like this:

```go
func (a *xorAppender) appendTimestamp(t int64) {
    tDelta := t - a.t           // first-order delta
    dod := tDelta - a.tDelta    // delta-of-delta

    a.writeTimestampDeltaOfDelta(dod)

    a.t = t
    a.tDelta = tDelta
}
```

Two variables track the running state: `a.t` (the last timestamp) and `a.tDelta` (the last first-order delta). Each new sample updates both.

## XOR Encoding: Compressing Floating-Point Values

### Why XOR?

IEEE 754 double-precision floats are 64 bits:

```
  Bit 63    Bits 62-52       Bits 51-0
  +------+---------------+---------------------------+
  | sign |   exponent    |       mantissa            |
  |  (1) |    (11)       |         (52)              |
  +------+---------------+---------------------------+
```

When a metric like CPU usage moves from 47.3% to 47.5%, the exponent stays the same and only a few mantissa bits change. If we XOR two consecutive values, most bits cancel out to zero:

```
  v1 = 47.3  -->  0 10000000100 0111101001100110011001100110011001100110011010 ...
  v2 = 47.5  -->  0 10000000100 0111110000000000000000000000000000000000000000 ...

  v1 XOR v2  =    0 00000000000 0000011001100110011001100110011001100110011010 ...
                                ^^^^
                  sign + exponent = 0     only mantissa bits differ
```

The XOR result has a **leading run of zeros** (the sign and exponent match) and a **trailing run of zeros** (the lower mantissa bits haven't changed). We only need to store the "meaningful" bits in between.

### The Encoding Scheme

Gorilla encodes XOR values with three cases:

```
  Case                         Encoding
  ---------------------------  ----------------------------------------
  XOR == 0 (identical value)   '0'                            (1 bit)

  XOR fits in previous         '10' + meaningful bits only    (2 + N bits)
  leading/trailing window

  New leading/trailing counts  '11' + 5-bit leading count     (2 + 5 + 6 + N bits)
                               + 6-bit length of meaningful
                               + meaningful bits
```

Let's trace through an example:

```
  Sample   Value    XOR with prev    Leading  Trailing  Meaningful
  ------   -----    -------------    -------  --------  ----------
  v0       47.3     (stored raw)     -        -         64 bits
  v1       47.5     0x000C_CC...     12       26        26 bits
  v2       47.1     0x0019_98...     11       26        27 bits
  v3       47.1     0x0000_00...     (zero)   -         0 bits
```

For v1: XOR has 12 leading zeros and 26 trailing zeros, so 26 meaningful bits. We write `'11'` + leading count (12 in 5 bits) + meaningful length (26 in 6 bits) + the 26 meaningful bits = 39 bits total instead of 64.

For v2: XOR has 11 leading zeros and 26 trailing zeros, so 27 meaningful bits. The leading/trailing window changed (11 != 12), so we write a new header: 40 bits.

For v3: XOR is zero (same value as v2). We write just `'0'` = 1 bit.

### Source Code: Prometheus Value Encoding

From [`tsdb/chunkenc/xor.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/chunkenc/xor.go), here is the value encoding logic:

```go
func (a *xorAppender) writeVDelta(v float64) {
    vDelta := math.Float64bits(v) ^ math.Float64bits(a.v)

    if vDelta == 0 {
        a.b.writeBit(zero)
        return
    }
    a.b.writeBit(one)

    leading := uint8(bits.LeadingZeros64(vDelta))
    trailing := uint8(bits.TrailingZeros64(vDelta))

    // Clamp leading zeros to 5 bits (max 31)
    if leading >= 32 {
        leading = 31
    }

    if a.leading != 0xff && leading >= a.leading && trailing >= a.trailing {
        // The meaningful bits fit inside the previous window
        a.b.writeBit(zero)
        a.b.writeBits(vDelta>>a.trailing, 64-int(a.leading)-int(a.trailing))
    } else {
        // Write a new window
        a.b.writeBit(one)
        a.b.writeBits(uint64(leading), 5)

        sigbits := 64 - leading - trailing
        a.b.writeBits(uint64(sigbits), 6)
        a.b.writeBits(vDelta>>trailing, int(sigbits))

        a.leading = leading
        a.trailing = trailing
    }
}
```

The key optimization is the "reuse previous window" path (the `'10'` case). When consecutive XOR values have similar bit patterns — which they usually do because the metric is changing in the same region of the mantissa — we skip the 11-bit header entirely. In practice, about **51% of values** are identical to the previous one (1 bit) and another **30%** reuse the window, so only ~19% need the full header.

## Putting It All Together: A Chunk

In Prometheus, a chunk holds up to 120 samples (configurable). Here is the overall structure:

```
  +--------+--------+---------------------------------------------+
  | Header | Sample |               Compressed body               |
  | (2 B)  |  count |                                             |
  +--------+--------+---------------------------------------------+
  |                                                               |
  |  t0 (full 64-bit timestamp)                                   |
  |  v0 (full 64-bit float)                                       |
  |  tDelta1 (14-bit varint of t1-t0)                            |
  |  vDelta1 (XOR encoded)                                        |
  |  tDoD2 (delta-of-delta, often just '0' = 1 bit)              |
  |  vDelta2 (XOR encoded, often just '0' = 1 bit)               |
  |  ...                                                          |
  |  tDoDN                                                        |
  |  vDeltaN                                                      |
  |                                                               |
  +---------------------------------------------------------------+
```

The first sample is stored uncompressed (128 bits). The second sample stores a first-order delta for the timestamp and an XOR for the value. From the third sample onward, it is delta-of-delta for timestamps and XOR for values.

### Compression Ratio in Practice

The Gorilla paper reports these numbers for Facebook's production monitoring data:

```
  Component          Avg bits/sample   vs. raw 64 bits
  -----------------  ----------------  ---------------
  Timestamp          1.37 bits         46.7x smaller
  Value              6.13 bits         10.4x smaller
  Combined           7.50 bits         17.1x smaller
  Overall with       ~10.1 bits        12.7x smaller
  overhead
```

Prometheus reports similar numbers. A typical two-hour chunk of 480 samples (15-second interval) compresses from 7,680 bytes to about 600 bytes — roughly **12x compression**.

## How the Decoder Works

Reading back the data means reversing each step. The decoder maintains the same running state (previous timestamp, previous delta, previous value, previous XOR window) and reads the prefix bits to decide which case applies:

```go
func (it *xorIterator) Next() ValueType {
    // Read timestamp
    dod := it.readTimestampDeltaOfDelta()
    it.tDelta = it.tDelta + dod
    it.t = it.t + it.tDelta

    // Read value
    it.readValue()

    return ValFloat
}

func (it *xorIterator) readTimestampDeltaOfDelta() int64 {
    // Read prefix bits to determine the bucket
    bit, _ := it.br.readBitFast()
    if bit == zero {
        return 0
    }
    // ... read more prefix bits, then the value
}
```

Because the encoding is **prefix-free** (no code is a prefix of another), the decoder can unambiguously parse the bitstream without any separators or length fields.

## Beyond Gorilla: Modern Improvements

The Gorilla scheme is the foundation, but modern systems have built on it:

### Prometheus Histogram Chunks

Prometheus 2.40+ introduced native histograms, which store entire histogram distributions in a single time series. The chunk format extends XOR encoding to compress bucket boundaries and counts, using the same delta-of-delta principle for monotonically increasing counters.

### Integer Optimization

Many time-series values are actually integers (request counts, queue depths). Systems like InfluxDB detect this and use simpler integer compression (delta encoding + bit-packing) instead of XOR, which can achieve even better ratios.

### Dictionary Encoding for Labels

While Gorilla handles the numeric data, labels (key-value metadata like `host=server42`) use dictionary encoding. Each unique label string gets an integer ID, and the chunk stores only the ID. Prometheus's label index maps these IDs back to strings at query time.

```
  Time series storage stack:

  +----------------------------+
  |  Query layer               |
  |  (PromQL / InfluxQL)       |
  +----------------------------+
  |  Index: inverted index     |
  |  on label key-value pairs  |
  +----------------------------+
  |  Chunks: Gorilla-style     |  <-- this article
  |  compressed (t, v) pairs   |
  +----------------------------+
  |  WAL: write-ahead log      |
  |  for crash recovery        |
  +----------------------------+
  |  Disk / mmap               |
  +----------------------------+
```

## Why This Matters

Time-series compression is not just an academic exercise. It directly determines:

1. **How much data fits in RAM.** Gorilla was designed as an in-memory cache. With 12x compression, a single server can hold 26 hours of data for millions of time series — enough for real-time alerting without touching disk.

2. **Query speed.** Compressed data means fewer cache misses and less I/O. Prometheus scans compressed chunks sequentially, decoding on-the-fly, which is faster than random-access lookups on uncompressed data because the working set fits in CPU cache.

3. **Storage cost.** At petabyte scale (Meta, Google, large enterprises), 12x compression means 12x fewer SSDs. The savings pay for entire engineering teams.

The Gorilla paper showed that by understanding the statistical properties of your data — regular timestamps, slowly-changing values — you can design compression schemes that are both fast (no dictionary lookups, no Huffman trees, just bit shifts and XOR) and effective (12x compression). This is a pattern that appears throughout systems engineering: the best optimization comes from understanding your data.

## References

1. Gorilla: A Fast, Scalable, In-Memory Time Series Database [paper](http://www.vldb.org/pvldb/vol8/p1816-teller.pdf)
2. Prometheus TSDB chunk encoding [`tsdb/chunkenc/xor.go`](https://github.com/prometheus/prometheus/blob/main/tsdb/chunkenc/xor.go)
3. Prometheus TSDB design doc [doc](https://fabxc.org/tsdb/)
4. Facebook Engineering: Gorilla announcement [blog](https://www.facebook.com/notes/facebook-engineering/introducing-gorilla-a-fast-scalable-in-memory-time-series-database/10153960867696920/)
5. InfluxDB storage engine internals [doc](https://docs.influxdata.com/influxdb/v2/reference/internals/storage-engine/)
6. IEEE 754 floating-point format [wiki](https://en.wikipedia.org/wiki/Double-precision_floating-point_format)
7. Prometheus native histograms [design doc](https://github.com/prometheus/prometheus/blob/main/tsdb/docs/format/chunks.md)
