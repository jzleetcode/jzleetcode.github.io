---
author: JZ
pubDatetime: 2026-05-08T06:23:00Z
modDatetime: 2026-05-08T06:23:00Z
title: System Design - How TCP Congestion Control Works
tags:
  - design-system
  - design-networking
description:
  "How TCP congestion control works: slow start, congestion avoidance, fast retransmit, fast recovery, and modern algorithms like CUBIC and BBR — explained with ASCII diagrams and Linux kernel source references."
---

## Table of contents

## Context

In October 1986, the internet experienced its first **congestion collapse**. The throughput between Lawrence Berkeley Laboratory and UC Berkeley — nodes connected by a 32 Kbps link — dropped from 32 Kbps to 40 bps. That is a factor of 800x degradation. Packets were being sent, lost, retransmitted, lost again, retransmitted again, flooding the network with copies of data that would never arrive.

Van Jacobson diagnosed the problem and, in his 1988 paper *Congestion Avoidance and Control*, introduced the algorithms that still form the backbone of TCP congestion control today.

The core insight: **a shared network link is a commons**. If every sender transmits as fast as possible, the shared buffers in routers overflow, packets are dropped, and everyone suffers. TCP needs a mechanism to:

1. **Discover** how much bandwidth is available.
2. **Back off** when the network is congested.
3. **Share fairly** among competing flows.

All of this must happen without explicit feedback from routers (in classic TCP). The sender must **infer** congestion from indirect signals: packet loss and round-trip time changes.

```
  The Congestion Collapse Problem

  Sender A ───┐
              │
  Sender B ───┼───[ Router ]───── Bottleneck Link ─────[ Router ]───── Receivers
              │      │
  Sender C ───┘      │
                     ▼
              Buffer overflow!
              Packets dropped.
              Senders retransmit.
              More packets flood in.
              Throughput collapses.
```

## The Congestion Window (cwnd)

TCP uses a variable called **cwnd** (congestion window) to limit how many bytes can be "in flight" — sent but not yet acknowledged. This is distinct from the **receive window (rwnd)** advertised by the receiver.

The effective sending window is:

```
  effective_window = min(cwnd, rwnd)
```

The receiver says "I can buffer X bytes" via rwnd. The sender independently tracks "I think the network can handle Y bytes" via cwnd. The sender transmits whichever is smaller.

```
  Sender's View of the Pipe

  +-------+-------+-------+-------+-------+-------+-------+
  |  Seg  |  Seg  |  Seg  |  Seg  |  Seg  |  Seg  |  Seg  |
  |   1   |   2   |   3   |   4   |   5   |   6   |   7   |
  +-------+-------+-------+-------+-------+-------+-------+
  |<------- acknowledged -------->|<----- in flight ------>|<-- not yet sent
                                  |                        |
                                  |<-------- cwnd -------->|
```

When an ACK arrives, it "slides" the window forward, allowing the sender to transmit more data. The art of congestion control is deciding **how fast to grow cwnd** and **how much to shrink it** when loss is detected.

## Slow Start

Despite the name, slow start is actually **exponential growth**. When a TCP connection is new (or recovering from a timeout), the sender does not know the network's capacity. Starting at full speed could immediately cause congestion. So TCP begins conservatively:

1. Set `cwnd = IW` (initial window, typically 10 segments since [RFC 6928](https://www.rfc-editor.org/rfc/rfc6928)).
2. For every ACK received, increase cwnd by 1 MSS (maximum segment size).

Since each ACK corresponds to one segment sent, and each segment acknowledged lets us send one more, cwnd effectively **doubles every RTT**:

```
  Slow Start: Exponential Growth of cwnd

  cwnd
  (segments)
    |
  64 |                                            xxxxxxxx
    |                                        xxxx
  32 |                                    xxxx
    |                                xxxx
  16 |                           xxxxx
    |                       xxxx
   8 |                  xxxxx
    |              xxxx
   4 |         xxxxx
    |     xxxx
   2 |  xxx
    | xx
   1 |x
    +-----|-----|-----|-----|-----|-----|-----|-----> RTTs
    0     1     2     3     4     5     6     7

  RTT 0: cwnd = 1, send 1 segment
  RTT 1: 1 ACK received, cwnd = 2, send 2 segments
  RTT 2: 2 ACKs received, cwnd = 4, send 4 segments
  RTT 3: 4 ACKs received, cwnd = 8, send 8 segments
  ...exponential growth until ssthresh
```

This continues until cwnd reaches **ssthresh** (slow-start threshold). At that point, TCP transitions to congestion avoidance. The initial ssthresh is typically set to a very large value (effectively infinite), so the first slow start runs until loss is detected.

In the Linux kernel, slow start is implemented in [`net/ipv4/tcp_cong.c`](https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_cong.c):

```c
void tcp_slow_start(struct tcp_sock *tp, u32 acked)
{
    u32 cwnd = min(tp->snd_cwnd + acked, tp->snd_ssthresh);

    tp->snd_cwnd = min(cwnd, tp->snd_cwnd_clamp);
}
```

## Congestion Avoidance

Once cwnd reaches ssthresh, TCP enters **congestion avoidance**. Here the growth becomes **linear** — additive increase:

- For every RTT (i.e., a full window of ACKs), increase cwnd by 1 MSS.

In practice, this is done per-ACK: increase cwnd by `MSS * MSS / cwnd` for each ACK (which adds up to 1 MSS per RTT).

```
  AIMD: Additive Increase, Multiplicative Decrease

  cwnd
    |          /\        /\        /\
    |         /  \      /  \      /  \
    |        /    \    /    \    /    \
    |       /      \  /      \  /      \
    |      /        \/        \/        \
    |     /   loss!    loss!     loss!
    |    /
    |   /  <- slow start
    |  /
    | /
    |/
    +---------------------------------------------------> time

  On loss: cwnd = cwnd / 2  (multiplicative decrease)
  After:   cwnd += 1/cwnd per ACK  (additive increase)
```

This **AIMD** (Additive Increase, Multiplicative Decrease) pattern gives TCP its characteristic "sawtooth" shape. It has a beautiful mathematical property: when multiple flows share a bottleneck link, AIMD converges to a **fair share** for each flow. The multiplicative decrease penalizes large windows proportionally more, while the additive increase gives everyone the same absolute growth.

## Detecting Loss

TCP detects congestion through two signals, and they mean different things:

### Triple Duplicate ACKs

When a packet is lost but subsequent packets arrive, the receiver sends duplicate ACKs for the last in-order segment. Three duplicate ACKs (4 total identical ACKs) signal that a **single segment was lost** but the network is still delivering packets. This is considered **mild congestion**.

```
  Sender                              Receiver
    |                                    |
    |------- Seg 1 --------------------->|  ACK 2
    |------- Seg 2 --------------------->|  ACK 3
    |------- Seg 3 -----X (lost)         |
    |------- Seg 4 --------------------->|  ACK 3 (dup 1)
    |------- Seg 5 --------------------->|  ACK 3 (dup 2)
    |------- Seg 6 --------------------->|  ACK 3 (dup 3)  <-- trigger!
    |                                    |
    |  3 dup ACKs = single loss, network still working
```

### Retransmission Timeout (RTO)

If no ACKs arrive at all and the retransmission timer expires, this signals **severe congestion** — possibly all packets in flight were lost, or the path is broken.

```
  Signal              Severity    Response
  ─────────────────────────────────────────────────────────
  3 dup ACKs          Mild        Fast retransmit + fast recovery
  RTO timeout         Severe      Reset to slow start (cwnd = 1)
```

## Fast Retransmit and Fast Recovery (Reno)

TCP Reno (RFC 5681) introduced two optimizations over the original Tahoe algorithm:

### Fast Retransmit

Instead of waiting for the RTO timer to expire, retransmit the lost segment immediately upon receiving 3 duplicate ACKs. This saves an entire RTO worth of idle time.

### Fast Recovery

After fast retransmit, instead of dropping cwnd to 1 and entering slow start (which Tahoe does), Reno does:

1. Set `ssthresh = cwnd / 2`
2. Set `cwnd = ssthresh + 3` (the 3 dup ACKs represent 3 segments that left the network)
3. For each additional duplicate ACK, increment cwnd by 1 (each dup ACK means another segment left the network)
4. When the retransmitted segment is ACKed, set `cwnd = ssthresh` and enter congestion avoidance

```
  TCP Reno: Fast Recovery vs Tahoe

  cwnd
    |
    |         Reno (fast recovery)
  W |.........*
    |        / \
    |       /   \_____ cwnd = W/2, then linear growth
    |      /     \_____
    |     /            \______
    |    /
    |   /
    |  /     Tahoe (drop to 1)
  1 |./.......\
    |          \___slow start again___/ linear
    +---------------------------------------------------> time
                ^
                loss detected (3 dup ACKs)
```

The key insight: duplicate ACKs are **clock signals**. Each one tells the sender that a segment left the network (was received out of order by the receiver). This "ACK clock" keeps the pipe full during recovery.

In the kernel, this logic lives in [`net/ipv4/tcp_input.c`](https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_input.c) in the function `tcp_fastretrans_alert()`.

## TCP CUBIC

Since Linux 2.6.19 (2006), the default congestion control algorithm is **CUBIC** ([RFC 9438](https://www.rfc-editor.org/rfc/rfc9438)). It replaces Reno's linear increase with a **cubic function**, making it much more aggressive in probing for bandwidth on high-BDP (bandwidth-delay product) networks.

### The Cubic Function

After a loss event, CUBIC records the window size at which loss occurred: `W_max`. It then grows the window according to:

```
  W(t) = C * (t - K)^3 + W_max

  where:
    C     = scaling factor (0.4 in Linux)
    t     = time since last loss event
    K     = cubic_root(W_max * beta / C)
    beta  = multiplicative decrease factor (0.7 for CUBIC)
```

This produces a distinctive S-shaped curve:

```
  CUBIC Window Growth

  cwnd
    |
    |                               ___...---***  (probing above W_max)
    |                          __--*
    |                     __--*
  W_max|..............*****...........|................
    |            **                 |  concave region:
    |          **                   |  cautious near W_max
    |        **
    |      **     convex region:
    |    **       aggressive growth
    |  **         far from W_max
    | *
    |*
    +--|------------|--------------|---> time since loss
       0           K             2K

  Phase 1 (t < K): Convex growth — fast ramp-up when far below W_max
  Phase 2 (t ~ K): Plateau — slow, careful probing near W_max
  Phase 3 (t > K): Concave growth — probing above W_max for new capacity
```

### Why CUBIC is Better for High-BDP

Reno's additive increase adds 1 MSS per RTT. On a 10 Gbps link with 100ms RTT, the BDP is ~83,000 segments. After a 50% loss, Reno needs 41,500 RTTs (69 minutes!) to recover. CUBIC's cubic function recovers in seconds because its growth rate depends on **time**, not RTT.

### Linux Kernel Implementation

The CUBIC algorithm lives in [`net/ipv4/tcp_cubic.c`](https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_cubic.c). Key structures:

```c
/* From net/ipv4/tcp_cubic.c */
struct bictcp {
    u32 cnt;           /* increase cwnd by 1 after ACKs */
    u32 last_max_cwnd; /* last maximum cwnd (W_max) */
    u32 last_cwnd;     /* last cwnd */
    u32 last_time;     /* time when updated last_cwnd */
    u32 bic_origin_point; /* origin point of cubic function */
    u32 bic_K;         /* time to reach origin point from epoch */
    u32 delay_min;     /* min delay (for Hystart) */
    u32 epoch_start;   /* beginning of an epoch */
    u32 ack_cnt;       /* ACK count */
    u32 tcp_cwnd;      /* estimated tcp cwnd (for friendliness) */
    ...
};
```

The core window calculation in `bictcp_update()`:

```c
static void bictcp_update(struct bictcp *ca, u32 cwnd, u32 acked)
{
    ...
    /* Calculate the cubic function value */
    /* W(t) = C * (t - K)^3 + W_max */
    offs = ca->bic_K - t;  /* |t - K| */
    delta = (cube_rtt_scale * offs * offs * offs) >> (10 + 3*BICTCP_HZ);
    ...
}
```

CUBIC also maintains a "TCP-friendly" mode: it tracks what standard Reno would do and uses whichever window is larger, ensuring it is never less aggressive than Reno.

## BBR (Bottleneck Bandwidth and RTT)

In 2016, Google introduced **BBR** — a fundamentally different approach to congestion control. While Reno and CUBIC are **loss-based** (they grow until they cause loss, then back off), BBR is **model-based**: it continuously estimates the bottleneck bandwidth and minimum RTT, then paces packets to match.

### The Problem with Loss-Based Algorithms

Loss-based algorithms fill router buffers before detecting congestion. This causes **bufferbloat** — excess latency from packets sitting in queues:

```
  Loss-based (CUBIC)              Model-based (BBR)
  operating point                 operating point

  Throughput                      Throughput
    |     ___________               |     ___________
    |    /           \              |    /           \
    |   /             \             |   /             \
    |  /               \            |  * <-- here!     \
    | /                 \           | /                 \
    |/                   \          |/                   \
    +----------*----------+--       +---------------------+--
               ^          inflight                        inflight
               |
            here!
        (buffer full, loss)

  CUBIC operates at the right edge (buffer overflow point).
  BBR operates at the left knee (maximum throughput, minimum delay).
```

### BBR's Model

BBR maintains two estimates:

- **BtlBw** (bottleneck bandwidth): The maximum delivery rate observed over a sliding window of ~10 RTTs.
- **RTprop** (round-trip propagation delay): The minimum RTT observed over a sliding window of ~10 seconds.

The optimal in-flight data is:

```
  BDP = BtlBw * RTprop
```

BBR paces packets at `BtlBw` rate and caps in-flight data at approximately `2 * BDP` (with a gain factor for probing).

### BBR State Machine

BBR cycles through four states:

```
  BBR State Machine

  +──────────────────────────────────────────────────────────────+
  |                                                              |
  |  ┌──────────┐     ┌───────────────┐     ┌──────────────┐   |
  |  │ STARTUP  │────>│   DRAIN       │────>│  PROBE_BW    │   |
  |  │          │     │               │     │              │   |
  |  │ 2/ln2    │     │ Drain queue   │     │ Steady state │   |
  |  │ gain     │     │ down to BDP   │     │ 8-phase cycle│   |
  |  └──────────┘     └───────────────┘     └──────┬───────┘   |
  |                                                 │           |
  |                                                 │ every     |
  |                                                 │ ~10 sec   |
  |                                                 ▼           |
  |                                          ┌──────────────┐   |
  |                                          │  PROBE_RTT   │   |
  |                                          │              │   |
  |                                          │ cwnd = 4     │   |
  |                                          │ for 200ms    │   |
  |                                          └──────────────┘   |
  +──────────────────────────────────────────────────────────────+

  STARTUP:   Exponential probing (like slow start) to find BtlBw.
             Exit when BtlBw plateaus (3 rounds without 25% increase).

  DRAIN:     Reduce inflight to match the BDP (empty queues filled
             during startup).

  PROBE_BW:  Steady-state cycling. Alternates pacing gain between
             1.25, 0.75, and 1.0 to probe for more bandwidth.

  PROBE_RTT: Periodically drains the pipe (cwnd = 4 packets for
             200ms) to get a fresh RTprop measurement.
```

### BBR in the Linux Kernel

BBR v1 is at [`net/ipv4/tcp_bbr.c`](https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_bbr.c). BBR v2 is in development and addresses fairness concerns with loss-based flows.

Key structures:

```c
struct bbr {
    u32 min_rtt_us;           /* min RTT in min_rtt_win_sec window */
    u32 min_rtt_stamp;        /* timestamp of min_rtt_us */
    u32 probe_rtt_done_stamp; /* end time for PROBE_RTT mode */
    u32 prior_cwnd;           /* prior cwnd upon entering loss recovery */
    u32 full_bw;              /* recent bw, to estimate if pipe is full */
    ...
    enum bbr_mode mode;       /* current mode/state */
    ...
};
```

To enable BBR on Linux:

```bash
# Check current algorithm
sysctl net.ipv4.tcp_congestion_control

# Enable BBR
sysctl -w net.ipv4.tcp_congestion_control=bbr
sysctl -w net.core.default_qdisc=fq
```

## How the Linux Kernel Implements It

The Linux TCP stack is a layered design that separates the congestion control algorithm from the core TCP state machine:

```
  Linux TCP Congestion Control Architecture

  +─────────────────────────────────────────────────────────+
  | Application (send/recv)                                 |
  +─────────────────────────────────────────────────────────+
  | TCP Core (tcp_output.c, tcp_input.c)                    |
  |   - Segmentation, ACK processing, retransmit logic     |
  |   - Calls into congestion ops via function pointers     |
  +─────────────────────────────────────────────────────────+
  | struct tcp_congestion_ops  (pluggable interface)        |
  |   .init()         - Initialize algorithm state          |
  |   .cong_avoid()   - Called on each ACK (grow window)    |
  |   .ssthresh()     - Calculate new ssthresh on loss      |
  |   .undo_cwnd()    - Undo cwnd reduction (spurious loss) |
  |   .pkts_acked()   - Called with RTT sample              |
  |   .set_state()    - Notify of state transitions         |
  +─────────────────────────────────────────────────────────+
  | Registered algorithms: cubic, bbr, reno, vegas, ...     |
  +─────────────────────────────────────────────────────────+
```

The congestion ops interface is defined in [`include/net/tcp.h`](https://github.com/torvalds/linux/blob/master/include/net/tcp.h):

```c
struct tcp_congestion_ops {
    /* Required: */
    u32  (*ssthresh)(struct sock *sk);
    void (*cong_avoid)(struct sock *sk, u32 ack, u32 acked);

    /* Optional: */
    void (*init)(struct sock *sk);
    void (*release)(struct sock *sk);
    void (*set_state)(struct sock *sk, u8 new_state);
    void (*cwnd_event)(struct sock *sk, enum tcp_ca_event ev);
    void (*pkts_acked)(struct sock *sk, const struct ack_sample *sample);
    u32  (*undo_cwnd)(struct sock *sk);
    ...
};
```

When an ACK arrives, the path through the kernel is:

```
  tcp_v4_rcv()                    [net/ipv4/tcp_ipv4.c]
    -> tcp_rcv_established()      [net/ipv4/tcp_input.c]
      -> tcp_ack()                [net/ipv4/tcp_input.c]
        -> tcp_cong_avoid()       [net/ipv4/tcp_input.c]
          -> icsk->icsk_ca_ops->cong_avoid()
             (dispatches to cubic, bbr, etc.)
```

### Key Kernel State Variables

In `struct tcp_sock` (from [`include/linux/tcp.h`](https://github.com/torvalds/linux/blob/master/include/linux/tcp.h)):

```c
struct tcp_sock {
    ...
    u32 snd_cwnd;       /* Sending congestion window */
    u32 snd_ssthresh;   /* Slow start size threshold */
    u32 srtt_us;        /* Smoothed RTT in microseconds */
    u32 mdev_us;        /* Medium deviation of RTT */
    u32 snd_cwnd_cnt;   /* Linear increase counter */
    u32 prior_cwnd;     /* cwnd before loss */
    ...
};
```

## Practical Implications

### Observing cwnd in Real Time

The `ss` (socket statistics) tool shows TCP internal state, including cwnd:

```bash
$ ss -i dst 10.0.0.1
tcp   ESTAB  0  0  10.0.0.2:22  10.0.0.1:54321
     cubic wscale:7,7 rto:204 rtt:1.5/0.5 ato:40 mss:1448
     cwnd:42 ssthresh:32 bytes_sent:128000 bytes_acked:127500
     send 323.5Mbps pacing_rate 387.2Mbps delivery_rate 312.1Mbps
     retrans:0/2 rcv_space:29200 minrtt:0.8
```

Key fields:
- `cwnd:42` — current congestion window (segments)
- `ssthresh:32` — slow-start threshold
- `rtt:1.5/0.5` — smoothed RTT / RTT variance (ms)
- `retrans:0/2` — current unresolved retransmits / total retransmits

### Tuning for High-BDP Networks

On a 10 Gbps link with 100ms RTT:

```
  BDP = 10 Gbps * 100ms = 1 Gbit = 125 MB

  Required socket buffer >= 125 MB to fill the pipe!
```

Linux tuning parameters:

```bash
# Increase maximum socket buffer sizes
sysctl -w net.core.rmem_max=134217728    # 128 MB
sysctl -w net.core.wmem_max=134217728    # 128 MB

# TCP auto-tuning range: min, default, max (bytes)
sysctl -w net.ipv4.tcp_rmem="4096 87380 134217728"
sysctl -w net.ipv4.tcp_wmem="4096 65536 134217728"
```

### When BBR Helps

BBR excels in scenarios where loss-based algorithms suffer:

| Scenario | CUBIC | BBR |
|----------|-------|-----|
| High-BDP links (intercontinental) | Slow ramp-up | Fast convergence |
| Bufferbloated paths | Fills buffers, high latency | Avoids buffer filling |
| Random (non-congestion) loss | Treats as congestion, backs off | Ignores non-congest loss |
| Shallow buffers | Under-utilizes link | Matches link rate |

However, BBR v1 has known issues:
- **Unfairness to loss-based flows:** BBR can consume more than its fair share when competing with CUBIC/Reno.
- **High retransmission rates:** The probing behavior can cause 1-3% retransmission in some conditions.
- **PROBE_RTT stalls:** The 200ms drain every 10 seconds can cause throughput dips for latency-sensitive applications.

BBR v2 and v3 (in development) address these by incorporating loss signals and improving fairness.

### Choosing an Algorithm

```bash
# List available algorithms
sysctl net.ipv4.tcp_available_congestion_control

# Per-socket override (in application code)
setsockopt(fd, IPPROTO_TCP, TCP_CONGESTION, "bbr", 3);
```

For most server workloads at scale:
- **CUBIC** (default): Good general-purpose choice. Well-tested, fair.
- **BBR**: Better for long-fat pipes, content delivery, and paths with random loss.
- **DCTCP**: For data centers with ECN-capable switches (marks rather than drops).

## Summary

```
  Evolution of TCP Congestion Control

  1986  Congestion collapse discovered
  1988  Jacobson: Slow Start + Congestion Avoidance (Tahoe)
  1990  Fast Retransmit + Fast Recovery (Reno)  [RFC 2581]
  1994  TCP Vegas (delay-based, not widely deployed)
  2004  BIC (aggressive binary search)
  2006  CUBIC replaces BIC as Linux default   [kernel 2.6.19]
  2010  Compound TCP (Windows default)
  2016  BBR v1 (Google, model-based)          [kernel 4.9]
  2019  BBR v2 alpha (adds loss sensitivity)
  2022  BBR v3 (improved fairness)

  Key Idea:
  ─────────────────────────────────────────────────────────────
  Loss-based:  Grow until you break something, then back off.
  Model-based: Measure the pipe, send at measured rate.
  ─────────────────────────────────────────────────────────────
```

## References

1. V. Jacobson, "Congestion Avoidance and Control," ACM SIGCOMM 1988. [PDF](https://ee.lbl.gov/papers/congavoid.pdf)
2. RFC 5681 — TCP Congestion Control (Reno). [Link](https://www.rfc-editor.org/rfc/rfc5681)
3. RFC 9438 — CUBIC for Fast and Long-Distance Networks. [Link](https://www.rfc-editor.org/rfc/rfc9438)
4. N. Cardwell et al., "BBR: Congestion-Based Congestion Control," ACM Queue, 2016. [Link](https://queue.acm.org/detail.cfm?id=3022184)
5. Linux kernel TCP CUBIC source. [GitHub](https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_cubic.c)
6. Linux kernel TCP BBR source. [GitHub](https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_bbr.c)
7. Linux kernel TCP input processing. [GitHub](https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_input.c)
8. RFC 6928 — Increasing TCP's Initial Window. [Link](https://www.rfc-editor.org/rfc/rfc6928)
9. Bufferbloat project and diagnosis. [Link](https://www.bufferbloat.net/)
10. Google BBR v2 progress. [GitHub](https://github.com/google/bbr)
