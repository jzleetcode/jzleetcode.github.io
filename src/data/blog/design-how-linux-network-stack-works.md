---
author: JZ
pubDatetime: 2026-06-29T10:00:00Z
modDatetime: 2026-06-29T10:00:00Z
title: System Design - How the Linux Kernel Network Stack Works
tags:
  - design-system
  - design-networking
description:
  "How a packet travels from NIC hardware to your application's socket: interrupts, NAPI, sk_buff, protocol layers, and socket receive queues — a walkthrough of the Linux kernel network stack."
---

## Table of contents

## Context

When your application calls `recv()` on a TCP socket, it gets back bytes. But those bytes traveled a long path inside the kernel before arriving. Understanding this path helps you reason about latency, packet drops, tuning parameters like ring buffer sizes, and why tools like `tcpdump` see packets at specific points.

This article traces the life of an incoming network packet from the moment it hits the physical NIC (Network Interface Card) to the moment your application reads it. We focus on the **receive path** (ingress) since that is the more complex direction.

```
  The Big Picture: Packet Receive Path

  +--------------------+
  |   Application      |   recv() / read() / epoll_wait()
  +--------+-----------+
           |  copy_to_user
  +--------v-----------+
  |   Socket Layer     |   per-socket receive queue (sk->sk_receive_queue)
  +--------+-----------+
           |
  +--------v-----------+
  |   Transport (TCP)  |   sequence reassembly, ACK generation
  +--------+-----------+
           |
  +--------v-----------+
  |   Network (IP)     |   routing, netfilter hooks (iptables)
  +--------+-----------+
           |
  +--------v-----------+
  |   NAPI / softirq   |   budget-based polling, GRO aggregation
  +--------+-----------+
           |
  +--------v-----------+
  |   Driver / Ring    |   DMA ring buffer, hardware interrupts
  +--------+-----------+
           |
  +--------v-----------+
  |   NIC Hardware     |   wire -> PHY -> MAC -> DMA to RAM
  +--------------------+
```

## Step 1: The NIC Receives a Frame

Modern NICs are sophisticated devices. When an Ethernet frame arrives on the wire:

1. The **PHY** (physical layer chip) converts electrical/optical signals into digital bits.
2. The **MAC** (media access controller) verifies the frame check sequence (FCS/CRC) and strips preamble.
3. The NIC uses **DMA** (Direct Memory Access) to copy the frame into a pre-allocated region of host RAM called a **ring buffer** (or descriptor ring).

The ring buffer is a circular array of descriptors, each pointing to a pre-allocated memory buffer (typically 2KB or a page). The driver sets these up at initialization:

```
  Ring Buffer (simplified)

  head (NIC writes here)
    |
    v
  +------+------+------+------+------+------+------+------+
  | desc | desc | desc | desc | desc | desc | desc | desc |
  |  0   |  1   |  2   |  3   |  4   |  5   |  6   |  7   |
  +--+---+--+---+--+---+--+---+--+---+--+---+--+---+--+---+
     |      |      |      |      |      |      |      |
     v      v      v      v      v      v      v      v
  [buf0] [buf1] [buf2] [buf3] [buf4] [buf5] [buf6] [buf7]
                   ^
                   |
               tail (driver refills here)
```

The NIC owns descriptors from `head` to `tail` (wrapping). After DMA-ing a frame into the buffer, the NIC updates the descriptor's status bits and advances its internal head pointer. You can inspect ring buffer sizes with:

```bash
ethtool -g eth0
# Ring parameters for eth0:
# Pre-set maximums:
# RX:    4096
# Current hardware settings:
# RX:    256
```

If the ring fills up (driver cannot consume fast enough), the NIC **drops frames silently** — visible via `ethtool -S eth0 | grep rx_missed` or `rx_no_buffer_count`.

## Step 2: Hardware Interrupt and NAPI

After placing a frame in the ring buffer, the NIC raises a **hardware interrupt** (IRQ). The kernel's interrupt handler (registered by the driver) runs immediately:

```c
// Simplified from drivers/net/ethernet/intel/ixgbe/ixgbe_main.c
static irqreturn_t ixgbe_msix_clean_rings(int irq, void *data)
{
    struct ixgbe_q_vector *q_vector = data;

    // Disable further interrupts from this queue
    ixgbe_irq_disable_queues(q_vector->adapter, q_vector->ring_mask);

    // Schedule NAPI polling
    napi_schedule_irqoff(&q_vector->napi);

    return IRQ_HANDLED;
}
```

The interrupt handler does almost nothing — it just **disables the NIC's interrupt** for that queue and schedules a **NAPI poll**. This is critical: if we processed every packet in interrupt context, a flood of packets would cause an "interrupt storm" (livelock), starving the rest of the system.

**NAPI** (New API) is the kernel's solution. It switches between interrupt-driven mode (low load) and polling mode (high load):

```
  NAPI State Machine

        packet arrives
             |
             v
  +---------------------+     ring empty
  |  Interrupt fires    |<-----------------+
  |  (HW IRQ)           |                  |
  +----------+----------+                  |
             |                             |
             v disable IRQ                 |
  +---------------------+                  |
  |  napi_schedule()    |                  |
  |  (mark NAPI_SCHED)  |                  |
  +----------+----------+                  |
             |                             |
             v runs in softirq             |
  +---------------------+                  |
  |  napi_poll()        +------------------+
  |  process up to      |  done (< budget)
  |  'budget' packets   |  re-enable IRQ
  |  (default: 64)      |
  +----------+----------+
             |
             | still more packets (hit budget)
             v
  +---------------------+
  |  stay in poll mode  |
  |  (no IRQ needed)    |
  +---------------------+
```

The poll function runs in **softirq context** (specifically `NET_RX_SOFTIRQ`). It processes packets in a loop up to a budget (default 64 packets per poll cycle). The relevant kernel code is in [`net/core/dev.c`](https://github.com/torvalds/linux/blob/master/net/core/dev.c):

```c
static int napi_poll(struct napi_struct *n, struct list_head *repoll)
{
    int work, weight;

    weight = n->weight;  // typically 64
    work = n->poll(n, weight);  // driver's poll function

    if (work < weight) {
        // Done: processed fewer than budget -> re-enable IRQ
        napi_complete_done(n, work);
        return work;
    }
    // Hit budget: stay scheduled for another round
    return work;
}
```

## Step 3: Building an sk_buff

Inside the driver's poll function, each received frame is wrapped in the kernel's core networking data structure: **`struct sk_buff`** (socket buffer). This structure is defined in [`include/linux/skbuff.h`](https://github.com/torvalds/linux/blob/master/include/linux/skbuff.h) and has ~200 fields. The essential layout:

```
  sk_buff structure (simplified)

  struct sk_buff {
      // -- Linked-list pointers --
      struct sk_buff  *next, *prev;

      // -- Timing --
      ktime_t         tstamp;          // receive timestamp

      // -- Device --
      struct net_device *dev;          // which NIC

      // -- Protocol headers (pointers into data) --
      unsigned char   *head;           // start of allocated buffer
      unsigned char   *data;           // current data start
      unsigned char   *tail;           // current data end
      unsigned char   *end;            // end of allocated buffer

      // -- Layer pointers --
      __u16           transport_header; // offset to TCP/UDP
      __u16           network_header;   // offset to IP
      __u16           mac_header;       // offset to Ethernet

      // -- Length --
      unsigned int    len;             // total data length
      unsigned int    data_len;        // length in fragments

      // -- Protocol info --
      __be16          protocol;        // ETH_P_IP, ETH_P_IPV6, ...
      struct sock     *sk;             // owning socket (set later)
  };
```

The head/data/tail/end pointers define the buffer space:

```
  Buffer layout inside sk_buff

  head                  data            tail                end
   |                     |               |                   |
   v                     v               v                   v
  +------+--------+------+---------+-----+-------------------+
  | head | L2 hdr | L3   | L4 hdr  | pay |   tailroom        |
  | room | (ETH)  | (IP) | (TCP)   | load|                   |
  +------+--------+------+---------+-----+-------------------+

  <-------- headroom ----->
  <----- skb->len (logical data length) ----->
```

As the packet moves up through protocol layers, each layer calls `skb_pull()` to advance the `data` pointer past its own header, "consuming" that header from the perspective of the next layer.

## Step 4: GRO (Generic Receive Offload)

Before passing packets up the stack, NAPI applies **GRO** — merging multiple small packets belonging to the same TCP flow into one large sk_buff. This dramatically reduces per-packet overhead for the upper layers:

```
  Without GRO:               With GRO:
  5 packets, 5 TCP trips     1 merged packet, 1 TCP trip

  [1500B] -+                 [7500B] --------> TCP layer
  [1500B]  |                   (5 segments merged)
  [1500B]  +-> 5x TCP
  [1500B]  |   processing
  [1500B] -+
```

GRO is the receive-side counterpart of TSO (TCP Segmentation Offload) on the transmit side. It groups packets by flow (same source/dest IP+port, same TCP connection) and merges payload. The combined sk_buff uses a **frag_list** or **frags** array to avoid copying data. Check GRO status:

```bash
ethtool -k eth0 | grep generic-receive-offload
# generic-receive-offload: on
```

## Step 5: The Network Layer (IP)

After GRO, each sk_buff enters the IP layer via `ip_rcv()` in [`net/ipv4/ip_input.c`](https://github.com/torvalds/linux/blob/master/net/ipv4/ip_input.c). This function:

1. **Validates** the IP header (version, checksum, length sanity).
2. Passes through **netfilter PREROUTING** hooks — this is where iptables/nftables rules run (DNAT, connection tracking).
3. Makes a **routing decision**: is this packet for us (local delivery) or should it be forwarded?
4. For local delivery, calls `ip_local_deliver()`.
5. Passes through **netfilter INPUT** hooks (firewall filtering).
6. Strips the IP header and hands to the transport layer.

```
  Netfilter hook points (IPv4)

              +----------+
  incoming -->| PREROUTE |--+
  packet      +----------+  |
                            v
                     +-----------+
                     |  Routing  |
                     |  Decision |
                     +-----+-----+
                           |
              +------------+------------+
              |                         |
              v (for us)                v (forward)
        +-----------+            +-----------+
        |   INPUT   |            |  FORWARD  |
        +-----------+            +-----------+
              |                         |
              v                         v
        local process              +-----------+
                                   | POSTROUTE |
                                   +-----------+
                                        |
                                        v
                                   outgoing
```

The routing lookup uses the **FIB** (Forwarding Information Base) — essentially the kernel's routing table (`ip route show`). For locally-destined packets, the result says "deliver to local transport protocol handler."

## Step 6: The Transport Layer (TCP)

The IP layer calls into `tcp_v4_rcv()` in [`net/ipv4/tcp_ipv4.c`](https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_ipv4.c). TCP processing is the most complex part of the receive path:

1. **Socket lookup**: Find the `struct sock` matching this 4-tuple (src_ip, src_port, dst_ip, dst_port). Uses a hash table for O(1) lookup.
2. **State machine**: Handle the TCP state (LISTEN, SYN_RECV, ESTABLISHED, etc.).
3. **Sequence validation**: Is the sequence number within the receive window?
4. **Reassembly**: Place out-of-order segments in the **out-of-order queue** (`ofo_queue`); deliver in-order data to the **receive queue** (`sk->sk_receive_queue`).
5. **ACK generation**: Schedule or immediately send ACKs. Delayed ACK coalesces acknowledgments (up to 40ms delay by default).
6. **Window update**: Advertise new receive window to the sender.
7. **Congestion handling**: Update congestion window if needed.

```
  TCP receive processing (simplified)

  tcp_v4_rcv(skb)
       |
       v
  tcp_v4_do_rcv(sk, skb)
       |
       +--> state == ESTABLISHED?
       |        |
       |        v
       |    tcp_rcv_established(sk, skb)   <-- fast path
       |        |
       |        +--> header prediction (fast path check)
       |        |        |
       |        |     +--v-----------+    +----------------+
       |        |     | In-order?    |--->| Add to         |
       |        |     | seq == rcv_nxt   | sk_receive_queue|
       |        |     +--------------+    +-------+--------+
       |        |                                 |
       |        |     +--------------+            v
       |        |     | Out of order |---> ofo_queue
       |        |     +--------------+     (rb-tree)
       |        |
       |        +--> wake up blocked reader (if any)
       |
       +--> other states: tcp_rcv_state_process()
```

The **header prediction** fast path in `tcp_rcv_established()` is a performance optimization. If the incoming segment is the next expected one (sequence == `rcv_nxt`), has no special flags, and the receive window is open, the kernel skips most of the complex state machine logic and directly queues the data — hitting this fast path is the common case for bulk data transfer.

## Step 7: Socket Receive Queue and Waking the Application

Once TCP places data on `sk->sk_receive_queue`, it checks if a process is blocked waiting on this socket:

```c
// Simplified from net/ipv4/tcp_input.c
static void tcp_data_ready(struct sock *sk)
{
    // Wake up any process blocked in recv() or epoll_wait()
    sk->sk_data_ready(sk);
}
```

If the application is blocked in `recv()`, the kernel wakes it via the socket's wait queue. If it is using **epoll**, the socket is added to epoll's ready list and `epoll_wait()` returns.

The actual data copy to user space happens in `tcp_recvmsg()`:

```c
// Simplified from net/ipv4/tcp.c
int tcp_recvmsg(struct sock *sk, struct msghdr *msg, size_t len, int flags)
{
    // Lock the socket
    lock_sock(sk);

    // Walk sk_receive_queue, copy data to user buffer
    skb_queue_walk(&sk->sk_receive_queue, skb) {
        // copy_to_user: kernel buffer -> user space buffer
        err = skb_copy_datagram_msg(skb, offset, msg, used);
        // free sk_buff after copying
    }

    // Update TCP receive window (now have more buffer space)
    tcp_cleanup_rbuf(sk, copied);

    release_sock(sk);
    return copied;
}
```

## Putting It All Together: The Timeline

```
  Time -->

  NIC wire   NIC DMA     IRQ      softirq/NAPI    IP         TCP         App
    |          |          |            |            |           |           |
    v          v          v            v            v           v           v
  frame    ring buf    disable     poll driver   validate   seq check   recv()
  arrives  written     IRQ,        build skb,   route,     reassemble  returns
           (DMA)       schedule    GRO merge    netfilter  queue data  data
                       NAPI

  |<----- hardware ---->|<---------- kernel (softirq) -------->|<- syscall->|
        ~1-5 us              ~5-20 us (per packet)               ~1-3 us
```

Typical latencies on modern hardware (10 Gbps NIC, bare metal):
- NIC DMA + interrupt: 1-5 microseconds
- NAPI poll + GRO + IP + TCP: 5-20 microseconds per packet
- System call overhead for `recv()`: 1-3 microseconds
- **Total NIC-to-application: ~10-30 microseconds** for a single packet

## Key Tuning Parameters

| Parameter | What it controls | How to check/set |
|-----------|-----------------|------------------|
| Ring buffer size | How many frames NIC can DMA before driver must poll | `ethtool -G eth0 rx 4096` |
| NAPI weight | Packets processed per poll cycle | `/sys/class/net/eth0/napi_defer_hard_irqs` |
| `net.core.netdev_budget` | Total packets processed per softirq round | `sysctl net.core.netdev_budget` (default 300) |
| `net.core.rmem_max` | Max socket receive buffer | `sysctl net.core.rmem_max` |
| `net.ipv4.tcp_rmem` | TCP auto-tuning min/default/max | `sysctl net.ipv4.tcp_rmem` |
| IRQ affinity | Which CPU handles which NIC queue | `/proc/irq/<N>/smp_affinity` |
| RPS/RFS | Software receive steering to spread load | `/sys/class/net/eth0/queues/rx-0/rps_cpus` |

## Where Common Tools Hook In

Understanding where observability tools tap into this pipeline helps you interpret their output:

```
  +----------+  +--------+  +-------+  +-------+  +--------+
  | tcpdump  |  | XDP/   |  | nf/   |  | TCP   |  | app    |
  | libpcap  |  | eBPF   |  | ipt   |  | probe |  | trace  |
  +----+-----+  +---+----+  +---+---+  +---+---+  +---+----+
       |             |           |          |          |
  =====v=============v===========v==========v==========v======
  NIC -> ring -> NAPI/skb -> IP layer -> TCP layer -> socket
  ================================================================

  tcpdump:   sees raw frames right after NIC (AF_PACKET socket)
  XDP/eBPF:  runs BEFORE sk_buff allocation (fastest hook)
  iptables:  netfilter hooks in IP layer (PREROUTING, INPUT, etc.)
  TCP tracepoints: ftrace/bpftrace probes in TCP functions
```

Note: `tcpdump` captures happen **before** iptables INPUT rules, which is why you can see packets in tcpdump that your firewall drops.

## References

1. Linux kernel source: [`net/core/dev.c`](https://github.com/torvalds/linux/blob/master/net/core/dev.c) — core network device handling and NAPI
2. Linux kernel source: [`net/ipv4/tcp_input.c`](https://github.com/torvalds/linux/blob/master/net/ipv4/tcp_input.c) — TCP receive processing
3. Linux kernel source: [`include/linux/skbuff.h`](https://github.com/torvalds/linux/blob/master/include/linux/skbuff.h) — sk_buff definition
4. "Understanding Linux Network Internals" by Christian Benvenuti (O'Reilly, 2006)
5. Linux NAPI documentation: [`Documentation/networking/napi.rst`](https://github.com/torvalds/linux/blob/master/Documentation/networking/napi.rst)
6. Memory and Networking: [Linux Foundation wiki on sk_buff](https://wiki.linuxfoundation.org/networking/sk_buff)
7. Blog: "Illustrated Guide to Monitoring and Tuning the Linux Networking Stack" by packagecloud.io
