---
author: JZ
pubDatetime: 2026-11-12T19:32:48Z
modDatetime: 2026-11-12T19:32:48Z
title: System Design - How CUDA GPU Kernels Execute Work
tags:
  - design-system
  - design-hardware
  - design-performance
description: "Trace a CUDA vector addition from the CPU's kernel launch into GPU blocks and warps, then see how synchronization, memory, and scheduling shape performance."
---

## Table of contents

- [A GPU needs a map of work](#a-gpu-needs-a-map-of-work)
- [Blocks are schedule units](#blocks-are-schedule-units)
- [Warps execute instructions together](#warps-execute-instructions-together)
- [Memory determines how much math gets done](#memory-determines-how-much-math-gets-done)
- [Synchronization has boundaries](#synchronization-has-boundaries)
- [A practical tuning checklist](#a-practical-tuning-checklist)

## A GPU needs a map of work

A developer moves a loop from the CPU to the GPU and expects it to become faster. The first surprise is that a GPU kernel is not a loop that runs once on a special processor. It is a piece of device code that gets launched many times, once for each logical GPU thread.

Consider adding two arrays. A CPU loop might give one processor each element in turn. In CUDA, the host (CPU) launches a kernel with enough threads to cover all elements:

~~~~cpp
__global__ void add(const float* a, const float* b, float* c, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        c[i] = a[i] + b[i];
    }
}

// a, b, and c point to device memory here.
int threadsPerBlock = 256;
int blocks = (n + threadsPerBlock - 1) / threadsPerBlock;
add<<<blocks, threadsPerBlock>>>(a, b, c, n);
~~~~

The <code>__global__</code> marker makes <code>add</code> a kernel: host code can launch it, and its body runs on the device (the GPU). The triple-angle launch syntax says how much logical work to create. In this one-dimensional example, CUDA numbers each thread by its block and its position inside that block:

~~~~
i = blockIdx.x * blockDim.x + threadIdx.x
~~~~

If <code>n</code> is 1,000 and each block has 256 threads, the launch creates four blocks, or 1,024 logical threads. The final 24 threads fail the bounds check. That guard is common: round the grid size up, then let extra threads do nothing.

The grid, block, and thread are logical coordinates. CUDA also supports two- and three-dimensional grids, which can make images, matrices, and volumes easier to index. The code still needs to translate those coordinates into the data item each thread owns.

## Blocks are schedule units

A grid groups its threads into **blocks**. Each block is designed to be independent of the others, so the GPU can schedule blocks in whatever order its resources allow.

~~~~
CPU / host code
     |
     | launch add<<<grid, block>>>
     v
CUDA grid
  +-----------+  +-----------+  +-----------+       +-----------+
  | Block 0   |  | Block 1   |  | Block 2   |  ...  | Block N   |
  +-----------+  +-----------+  +-----------+       +-----------+
       |                |              |
       +----------------+--------------+
                        v
          GPU schedules available blocks
          onto Streaming Multiprocessors
~~~~

A Streaming Multiprocessor (SM) is a hardware unit that runs groups of threads. CUDA does not promise that block 0 runs first or that neighboring blocks run at the same time. Hardware assigns each block to an SM when it starts, and the block runs there to completion; the scheduler can map a different block to that SM next. A large grid can contain far more blocks than the GPU can run concurrently. When an SM finishes a block and has resources available, it can start another.

That independence is a useful design constraint. A block can share data and synchronize its own threads. A block should not spin while waiting for another block in the same ordinary kernel launch: the block it waits for may not have been scheduled yet.

## Warps execute instructions together

Inside an SM, threads are grouped into **warps**. On NVIDIA CUDA GPUs, a warp contains 32 threads. The CUDA programming model is often described as SIMT: Single Instruction, Multiple Threads. Each lane in a warp has its own registers and data, but the warp executes instructions together.

This is why a simple element-wise statement is straightforward for a GPU:

~~~~cpp
c[i] = a[i] + b[i];
~~~~

Adjacent lanes can perform the same addition on different values at the same time. A branch is different:

~~~~cpp
if (a[i] > 0) {
    c[i] = expensivePath(a[i]);
} else {
    c[i] = otherPath(a[i]);
}
~~~~

If every lane takes the same branch, the warp stays together. If some lanes take the first path and others take the second, the GPU must execute the paths separately with different lanes active. The answer is still correct, but some lanes sit idle during each path. This is **warp divergence**.

Branch divergence is not automatically a bug. Sometimes a branch saves more work than it costs. It is a performance clue: if neighboring threads often make different choices, the kernel may do less useful work per instruction.

## Memory determines how much math gets done

The CPU and GPU have separate memories on most systems. A program usually copies inputs from host memory to device memory, launches one or more kernels, and copies results back. For small jobs, those transfers and the launch itself can cost more time than the arithmetic.

Within the GPU, different storage serves different scopes:

~~~~
Per thread:       registers (private temporary values)
Per block:        shared memory (cooperative scratch space)
Per SM:           L1 cache
Across the GPU:   L2 cache and global device memory
Outside the GPU:  host memory (CPU memory)
~~~~

Registers are fast but limited. Shared memory is an explicitly managed scratchpad that threads in one block can share. Global memory holds much more data, but each access is more expensive than using values already close to the SM.

The layout of accesses matters too. If the 32 lanes in a warp read neighboring addresses, the hardware can often satisfy those loads with fewer memory transactions. This is called **coalescing**. If every lane jumps to an unrelated part of memory, the same warp may need many transactions. When a kernel performs little arithmetic per byte read, arranging data for regular, neighboring access can matter more than adding more math units.

Use shared memory when threads in a block can reuse data, such as neighboring image pixels or a tile of a matrix. The copy into shared memory and the synchronization around it have a cost, so reuse should pay for that cost.

## Synchronization has boundaries

Threads in a block can rendezvous with <code>__syncthreads()</code>. For example, a block can load a tile into shared memory, wait until every thread has finished loading, and then compute from the shared tile.

Every participating thread must reach the same barrier. If only some threads in a block call it, the others can wait forever or the program can behave incorrectly.

An ordinary kernel launch does not provide a general barrier across all blocks. When work in one grid depends on all blocks in that grid finishing, a common design is to end one kernel and launch the next. Kernel boundaries provide a clear ordering point for work in the same stream. Specialized cooperative launches have additional rules and are not a general replacement for understanding those boundaries.

Kernel launches are normally asynchronous from the CPU's point of view: the host can continue while the GPU works. A synchronization point is needed before the CPU consumes a result that the GPU has not finished producing. Avoid adding a wait after every launch unless the program needs one; unnecessary waits can prevent CPU and GPU work from overlapping.

## A practical tuning checklist

The CUDA hierarchy gives a useful first pass when a kernel is slow:

1. **Give the GPU enough independent blocks.** A grid with only a handful of blocks may leave many SMs idle. Blocks are a scheduling unit, so start with enough work to keep the device busy.
2. **Check register and shared-memory use.** A block that consumes too many resources can reduce how many warps an SM keeps active. Occupancy describes active warps relative to hardware limits; higher occupancy can help hide memory latency, but it does not guarantee a faster kernel.
3. **Look at the addresses each warp touches.** Coalesced memory access can reduce wasted memory transactions.
4. **Keep data on the device when practical.** Repeated host-to-device transfers can overwhelm a small kernel's benefit.
5. **Measure the real workload.** Block size, memory reuse, and launch overhead interact. A choice that helps one kernel can hurt another.

The short mental model is: the CPU launches a grid, the GPU schedules independent blocks onto SMs, the SMs execute threads in warps, and the memory and synchronization rules determine whether those warps stay productive. Once those pieces are clear, CUDA code stops looking like a mysterious parallel loop and starts looking like a work map with explicit boundaries.

## References

1. NVIDIA, [CUDA Programming Guide](https://docs.nvidia.com/cuda/cuda-programming-guide/index.html).
2. NVIDIA Developer Blog, [CUDA Refresher: The CUDA Programming Model](https://developer.nvidia.com/blog/cuda-refresher-cuda-programming-model/).
3. NVIDIA, [CUDA C++ Best Practices Guide](https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html).
