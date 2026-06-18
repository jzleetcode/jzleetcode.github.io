---
author: JZ
pubDatetime: 2026-06-18T06:23:00Z
modDatetime: 2026-06-18T06:23:00Z
title: System Design - How SSDs Work Internally (NAND Flash, FTL, and Write Amplification)
tags:
  - design-system
  - design-hardware
description:
  "How Solid-State Drives work internally: NAND flash physics, pages and blocks, the Flash Translation Layer (FTL), garbage collection, wear leveling, write amplification, TRIM, and why understanding SSDs matters for database engineers."
---

## Table of contents

## Context

If you have ever wondered why databases care so much about sequential vs. random I/O, or why "write amplification" appears in RocksDB tuning guides, the answer lives one layer below the software: inside the SSD itself.

Unlike hard drives (HDDs) that spin magnetic platters and seek with a mechanical arm, SSDs have **no moving parts**. They store data in billions of floating-gate transistors etched into silicon chips. This makes reads fast (microseconds, not milliseconds) but introduces a surprising constraint: **you cannot overwrite data in place**. You must erase a large region before writing to it again.

This single constraint — the erase-before-write rule — drives the entire architecture of an SSD. Let's explore how it works, starting from the physics and building up to the firmware algorithms that hide this complexity from the operating system.

## NAND Flash: The Storage Medium

### The floating-gate transistor

Each bit in an SSD is stored in a **floating-gate transistor**. The floating gate is a tiny conductor completely surrounded by insulator (silicon dioxide). Electrons trapped on this gate stay there for years without power — that's how SSDs retain data when unplugged.

```
         Word Line (Control Gate)
         ========================
                  |
         +-------+-------+
         |  Control Gate  |
         +-------+-------+
         |  Oxide Layer   |  <-- insulator
         +-------+-------+
         | Floating Gate  |  <-- trapped electrons = data
         +-------+-------+
         |  Oxide Layer   |  <-- insulator (tunnel oxide)
         +-------+-------+
         |    Channel     |
         +---+-------+---+
             |       |
           Source   Drain
             |       |
         Bit Line   Ground
```

- **Programming (writing a 0):** A high voltage (~20V) on the control gate forces electrons through the tunnel oxide onto the floating gate via quantum tunneling. The trapped electrons raise the transistor's threshold voltage.
- **Erasing (resetting to 1):** A high voltage on the source pulls electrons off the floating gate. This resets the threshold voltage.
- **Reading:** A moderate voltage is applied to the control gate. If the transistor conducts (threshold is low), the cell stores a "1". If it does not conduct (threshold is high because electrons are trapped), it stores a "0".

### Cell types: SLC, MLC, TLC, QLC

How many bits each transistor stores depends on how many voltage levels the controller can distinguish:

```
  Voltage Threshold Levels

  SLC (1 bit/cell)        MLC (2 bits/cell)
  2 levels                4 levels

  |         |             |    |    |    |
  |  "1"    |  "0"       |"11"|"10"|"00"|"01"
  |         |             |    |    |    |
  +---------+------       +----+----+----+------
  Low      High           L   ML   MH   H

  TLC (3 bits/cell)       QLC (4 bits/cell)
  8 levels                16 levels
  +--+--+--+--+--+--+--+--    (increasingly tight margins)
```

More bits per cell means more capacity per chip but:
- **Slower writes** (programming must be more precise)
- **Fewer program/erase cycles** before wear-out (SLC ~100K, TLC ~3K, QLC ~1K)
- **Higher error rates** (tighter voltage margins)

Enterprise SSDs typically use TLC with large overprovisioning; consumer drives use QLC.

## The Page/Block/Die Hierarchy

NAND flash is organized into a strict hierarchy:

```
  +----------------------------------------------------------+
  |                      SSD Package                          |
  |                                                          |
  |  +------------+  +------------+  +------------+          |
  |  |   Die 0    |  |   Die 1    |  |   Die 2    |  ...    |
  |  |            |  |            |  |            |          |
  |  | +--------+ |  | +--------+ |  | +--------+ |         |
  |  | |Plane 0 | |  | |Plane 0 | |  | |Plane 0 | |         |
  |  | |        | |  | |        | |  | |        | |         |
  |  | | Block 0| |  | | Block 0| |  | | Block 0| |         |
  |  | | Block 1| |  | | Block 1| |  | | Block 1| |         |
  |  | | Block 2| |  | | Block 2| |  | | Block 2| |         |
  |  | |  ...   | |  | |  ...   | |  | |  ...   | |         |
  |  | +--------+ |  | +--------+ |  | +--------+ |         |
  |  |            |  |            |  |            |          |
  |  | +--------+ |  | +--------+ |  | +--------+ |         |
  |  | |Plane 1 | |  | |Plane 1 | |  | |Plane 1 | |         |
  |  | |  ...   | |  | |  ...   | |  | |  ...   | |         |
  |  | +--------+ |  | +--------+ |  | +--------+ |         |
  |  +------------+  +------------+  +------------+          |
  +----------------------------------------------------------+

  Typical sizes:
    Page:   4 KB - 16 KB     (smallest unit you can READ or WRITE)
    Block:  256 - 512 pages  (smallest unit you can ERASE)
    Plane:  ~1000 blocks
    Die:    2-4 planes
    Package: 2-16 dies
```

The critical asymmetry:
- **Read granularity:** 1 page (4-16 KB)
- **Write granularity:** 1 page (but only to an erased page)
- **Erase granularity:** 1 block (256-512 pages = 1-8 MB)

This is like a notebook where you can write on any blank page, but to reuse pages you must tear out and shred the entire chapter (block) — even if only one page in it is stale.

## The Flash Translation Layer (FTL)

The operating system thinks it is talking to a block device with logical block addresses (LBAs) that can be freely overwritten. The **Flash Translation Layer** is the firmware component inside the SSD controller that maintains this illusion.

### The mapping table

At its core, the FTL maintains a mapping from logical pages (what the OS sees) to physical pages (where data actually lives on NAND):

```
  OS writes to LBA 42             FTL Mapping Table
       |                          +--------+---------+
       v                          |  LBA   |  PPA    |
  +----------+                    +--------+---------+
  |   FTL    | ---- lookup ---->  |   42   | Die0,   |
  | firmware |                    |        | Blk17,  |
  +----------+                    |        | Pg3     |
       |                          +--------+---------+
       v                          |   43   | Die1,   |
  Write to a NEW                  |        | Blk5,   |
  free physical page              |        | Pg100   |
  (old page marked invalid)       +--------+---------+
                                       ...
```

When the OS "overwrites" LBA 42, the FTL does NOT erase the old page. Instead:
1. Writes the new data to a fresh, erased page.
2. Updates the mapping: LBA 42 now points to the new physical page.
3. Marks the old physical page as **invalid** (stale).

This is called **log-structured** or **copy-on-write** — the same principle that LSM trees use at the software level.

### Mapping granularity

A 1TB SSD with 4KB pages has ~250 million pages. A full page-level mapping table would need:
$$250{,}000{,}000 \times 4 \text{ bytes (PPA)} \approx 1\text{ GB of DRAM}$$

This is why enterprise SSDs have 1-4 GB of DRAM cache. DRAM-less (budget) SSDs use a **hybrid mapping**: block-level mapping for most data (coarser, smaller table) and page-level mapping only for a small "hot" journal area. This explains why cheap SSDs slow down dramatically under random writes.

## Garbage Collection

Since the FTL never erases pages at write time, invalid pages accumulate. **Garbage collection (GC)** is the background process that reclaims space by:

1. Selecting a victim block (one with many invalid pages).
2. Copying all **valid** pages from that block to a new location.
3. Erasing the entire victim block (making it available for new writes).

```
  Before GC:                         After GC:

  Block 17                           Block 17 (erased, free)
  +-------+-------+-------+----+    +-------+-------+-------+----+
  | Pg0   | Pg1   | Pg2   |... |    | FREE  | FREE  | FREE  |... |
  | VALID | INVAL | INVAL |    |    |       |       |       |    |
  +-------+-------+-------+----+    +-------+-------+-------+----+
      |
      | (copied to new block)        New Block
      +----------------------------> +-------+-------+-------+----+
                                     | Pg0   | FREE  | FREE  |... |
                                     | VALID |       |       |    |
                                     +-------+-------+-------+----+
```

### Victim selection strategies

The firmware must choose which block to reclaim. Common approaches:

| Strategy | Picks block with... | Trade-off |
|----------|-------------------|-----------|
| Greedy | Most invalid pages | Minimizes copy cost now |
| Cost-Benefit | High invalid ratio AND old age | Considers future invalidations |
| FIFO | Written longest ago | Simple but suboptimal |

Most real SSDs use a variant of **cost-benefit** analysis: a block that is mostly invalid AND hasn't been written recently is ideal because its remaining valid pages are likely "cold" data that won't be updated soon.

## Write Amplification

**Write amplification factor (WAF)** is the ratio of actual NAND writes to host-requested writes:

$$WAF = \frac{\text{bytes written to NAND}}{\text{bytes written by host}}$$

A WAF of 1.0 means the drive writes exactly what the host asked. In practice, WAF > 1 because:

1. **GC copies valid pages** — moving data the host didn't ask to move.
2. **Page alignment padding** — a 512-byte write still programs a full 4KB+ page.
3. **FTL metadata updates** — mapping table changes.

```
  Host writes 4KB to LBA X

  Best case (WAF = 1):
    [Host 4KB] --> [NAND 4KB]        just one page written

  Worst case (WAF >> 1):
    GC picks a block with 255/256 valid pages
    [Host 4KB] --> [NAND 4KB]        new write
                   [NAND 4KB x 255]  valid pages relocated by GC
    WAF = 256 / 1 = 256 (!)

  Realistic steady-state:
    Consumer SSD:   WAF ~ 2-5
    Enterprise SSD: WAF ~ 1.5-3 (more overprovisioning)
```

### Reducing write amplification

Techniques the SSD (and database software) use:

1. **Overprovisioning (OP):** Reserve 7-28% of NAND capacity as invisible spare space. More free blocks means GC can find blocks with higher invalid ratios, reducing copies. Enterprise drives often have 28% OP.

2. **TRIM/UNMAP:** The OS tells the SSD which LBAs are no longer in use (e.g., after file deletion). The FTL marks those pages invalid immediately, giving GC more invalid pages to work with.

3. **Sequential writes:** When data arrives sequentially, entire blocks are invalidated together (the OS overwrites them in order), making GC trivial — entire blocks are already 100% invalid.

4. **Write coalescing:** The SSD buffers small writes in DRAM and flushes them as full pages.

## Wear Leveling

Each NAND block can only survive a limited number of program/erase (P/E) cycles. If some blocks are erased far more than others, they wear out prematurely, reducing drive capacity.

**Wear leveling** ensures P/E cycles are distributed evenly:

```
  Without wear leveling:           With wear leveling:

  Block  P/E count                 Block  P/E count
    0    |========== 50K (dead!)     0    |====== 10K
    1    |== 2K                      1    |====== 10K
    2    |=== 3K                     2    |====== 10K
    3    |= 1K                       3    |====== 10K

  Hot data on block 0 causes       Firmware moves cold data
  premature wear-out                to high-P/E blocks and
                                    hot data to low-P/E blocks
```

Two approaches:
- **Dynamic wear leveling:** Only distributes writes among free blocks. Simple but insufficient — if cold data occupies a block forever, that block never gets reused.
- **Static wear leveling:** Periodically migrates cold data from low-P/E blocks to high-P/E blocks, freeing the fresh blocks for hot writes. More effective but adds background I/O.

## The NVMe Protocol

Modern SSDs connect via the **NVMe (Non-Volatile Memory Express)** protocol over PCIe, replacing the SATA/AHCI stack designed for spinning disks:

```
  SATA/AHCI (legacy)                 NVMe (modern)
  +-----------+                      +-----------+
  |    OS     |                      |    OS     |
  +-----+-----+                      +-----+-----+
        |                                  |
  +-----+-----+                      +-----+-----+
  | AHCI HBA  |                      |  NVMe     |
  | (1 queue,  |                      | (64K queues,
  |  32 depth) |                      |  64K depth)|
  +-----+-----+                      +-----+-----+
        |                                  |
   SATA cable                          PCIe lanes
   (600 MB/s)                          (x4 = 8 GB/s)
        |                                  |
  +-----+-----+                      +-----+-----+
  |    SSD    |                      |    SSD    |
  +-----------+                      +-----------+

  Latency: ~100us                    Latency: ~10-20us
  IOPS: ~100K                        IOPS: ~1M+
```

Key NVMe advantages:
- **Multiple submission/completion queues:** Each CPU core gets its own queue pair, eliminating lock contention.
- **Deeper queue depth:** 64K commands per queue vs 32 for AHCI.
- **Fewer CPU cycles per I/O:** Streamlined command set, no legacy register polling.

## Why This Matters for Database Engineers

Understanding SSD internals explains many database design choices:

| Database behavior | SSD reason |
|------------------|------------|
| RocksDB uses sequential writes | Sequential writes minimize GC, reduce WAF |
| Databases align I/O to page size | Sub-page writes waste an entire NAND page |
| `fstrim` / TRIM in maintenance | Tells SSD about deleted data, improves GC |
| Overprovisioning recommendations | More spare space = lower WAF, longer life |
| Write-ahead log on separate SSD | Prevents log I/O from polluting data GC patterns |
| Compaction at off-peak hours | Avoids competing with SSD's own GC for bandwidth |

RocksDB's leveled compaction, for example, writes sorted runs sequentially. When old sorted runs are deleted, TRIM informs the SSD, and entire blocks become invalid at once — the ideal scenario for GC.

## Inside a Real SSD Controller

A modern SSD controller is essentially a specialized computer:

```
  +----------------------------------------------------------+
  |                   SSD Controller SoC                      |
  |                                                          |
  |  +----------+  +----------+  +----------+               |
  |  | ARM Core |  | ARM Core |  | ARM Core |  (2-8 cores)  |
  |  +----+-----+  +----+-----+  +----+-----+               |
  |       |              |              |                     |
  |  +----+--------------+--------------+----+               |
  |  |           Internal Bus (AXI)          |               |
  |  +---+------+------+------+------+------++               |
  |      |      |      |      |      |      |               |
  |  +---+--+ +-+--+ +-+--+ +-+--+ +-+--+ +-+--+           |
  |  | FTL  | |ECC | |DMA | |NVMe| |DRAM| |NAND|           |
  |  |Engine| |Eng.| |Eng.| |Ctrl| |Ctrl| |Ctrl|           |
  |  +------+ +----+ +----+ +----+ +----+ +----+           |
  |                                                          |
  +----------------------------------------------------------+
         |                    |                    |
    +---------+         +---------+          +---------+
    |  DRAM   |         |  NAND   |          |  NAND   |
    | (cache) |         | Die 0-3 |          | Die 4-7 |
    +---------+         +---------+          +---------+
```

The ECC engine is crucial: as NAND ages, bit errors increase. Modern controllers use **LDPC (Low-Density Parity-Check)** codes that can correct dozens of bit errors per page, extending drive life significantly.

## Power Loss Protection

What happens if power fails mid-write? Without protection:
- Pages partially programmed → corrupted data
- Mapping table updates lost → data unreachable
- GC interrupted mid-copy → valid data in neither old nor new location

Enterprise SSDs include **power-loss capacitors** (supercaps or tantalum caps) that provide enough energy to:
1. Flush the DRAM write buffer to NAND (~10ms of writes).
2. Persist the in-flight FTL mapping table updates.
3. Complete any in-progress page programs.

Consumer SSDs may lack this protection — another reason databases use `fsync` and WAL files.

## References

1. Agrawal, N., et al. "Design Tradeoffs for SSD Performance." USENIX ATC 2008. [paper](https://www.usenix.org/legacy/event/usenix08/tech/full_papers/agrawal/agrawal.pdf)
2. Desnoyers, P. "Analytic Models of SSD Write Performance." ACM TOS 2014.
3. Hu, Y., et al. "Write Amplification Analysis in Flash-Based Solid State Drives." SYSTOR 2009.
4. NVM Express Base Specification. [spec](https://nvmexpress.org/specifications/)
5. Micron Technical Note: "NAND Flash 101." [doc](https://www.micron.com/products/nand-flash)
6. Samsung White Paper: "Samsung SSD Architecture." [doc](https://semiconductor.samsung.com/ssd/)
7. RocksDB Wiki: "Direct I/O." [wiki](https://github.com/facebook/rocksdb/wiki/Direct-IO)
8. Bjørling, M., et al. "Open-Channel SSDs." FAST 2017.
