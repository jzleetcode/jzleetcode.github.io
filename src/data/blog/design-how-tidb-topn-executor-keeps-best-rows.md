---
author: JZ
pubDatetime: 2026-10-19T18:39:00Z
modDatetime: 2026-10-19T18:39:00Z
title: System Design - How TiDB's TopN Executor Keeps Only the Best Rows
tags:
  - design-system
  - design-database
  - design-tidb
description: "Trace ORDER BY with OFFSET and LIMIT through TiDB's PhysicalTopN, executor builder, TopNExec, and chunk heap, including memory and spill settings."
---

## Table of contents

## A leaderboard with a skipped winner

This source walkthrough is for engineers new to TiDB's SQL executors. Imagine that a leaderboard needs the second- and third-highest scores:

```sql
SELECT player, score
FROM leaderboard
ORDER BY score DESC
LIMIT 2 OFFSET 1;
```

The executor cannot keep just two candidates: it needs the _best three_, then skips the first. If the scores arrive as `72, 94, 51, 88, 90, 61`, the three candidates are `94, 90, 88`, and the output scores are `90, 88`. Equal scores have no guaranteed order without an additional `ORDER BY` key.

We'll follow the ordinary **TiDB-side, in-memory TopN path** in [`pingcap/tidb` at commit `dfda1fd`](https://github.com/pingcap/tidb/tree/dfda1fd3e83f73fcccb536fb3eeead54735de7b1). This is a snapshot of upstream `main`, not a claim about every release or every plan. The optimizer might instead choose an ordered index scan with `Limit`, or push TopN into TiKV; check `EXPLAIN` before assuming this executor runs. The [TiDB TopN/Limit pushdown documentation](https://docs.pingcap.com/tidb/stable/topn-limit-push-down/) explains those alternatives.

## Four pieces in one path

```text
  PhysicalTopN (ByItems: score DESC, Offset: 1, Count: 2)
                 |
                 v
  executorBuilder.buildTopN() --- creates TopNExec and child executor
                 |
                 v
  TopNExec: read child chunks ---> topNChunkHeap (keep best 3)
                                         |
                              sort candidate row pointers
                                         |
                                  skip 1, return 2
```

[`PhysicalTopN`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/planner/core/operator/physicalop/physical_topn.go#L36-L53) stores the order-by items, offset, and count. [`executorBuilder.buildTopN`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/builder.go#L2968-L2983) builds its child and creates `TopNExec` with those order and limit values. The executor embeds [`SortExec`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L59-L97) for row comparison, but it does **not** simply sort every input row in memory. Its [`topNChunkHeap`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn_chunk_heap.go#L31-L50) holds row pointers into chunks plus the number of candidates to retain.

These are the four units to track: plan, builder, executor, and heap. The child executor is the source of batches, not another operator whose implementation we need to learn today.

## Why the worst candidate sits on top

On its first `Next` call, [`TopNExec.fetchChunks`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L268-L325) starts the work once. For a normal TopN, [`initBeforeLoadingChunks`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L328-L365) gives the heap a `totalLimit` of `Offset + Count` and an output index of `Offset`: three candidate rows and a starting output index of one in our example. The executor loads enough initial chunks to populate the heap, then starts the remaining work. A child chunk can cross the target size; [`executeTopN`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L668-L695) initializes the heap and pops extra worst rows before processing further chunks.

For descending scores, the _worst_ retained row is the **smallest** score. The heap places that row at its root, where it is cheap to compare with a newcomer. [`greaterRow`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L195-L209) reverses the comparison for descending keys; [`topNChunkHeap.Less`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn_chunk_heap.go#L140-L151) uses that ordering to put the worst candidate at the root. When a better row arrives, [`update`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn_chunk_heap.go#L99-L112) replaces the root pointer and repairs the heap with `heap.Fix`; a worse row is ignored.

```text
  incoming score   best three retained (displayed sorted, not heap order)
  72, 94, 51       94, 72, 51
  88               94, 88, 72       evict 51
  90               94, 90, 88       evict 72
  61               94, 90, 88       ignore 61
                                      |
                           skip 94; emit 90, 88
```

The example shows the _candidate values_ in sorted order for clarity. The heap itself is not a sorted list. TiDB sorts the final candidate **pointers** after reading the remaining child chunks, then [`generateTopNResultsWhenNoSpillTriggered`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L719-L728) sends rows starting at the offset to the result channel. The caller's `Next` copies up to its requested rows from that channel into a result chunk; [the initial fetch and channel read](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L268-L292) are separate from building the heap.

## What the heap actually keeps in memory

Heap size is not the same as the total memory footprint. [`topNChunkHeap`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn_chunk_heap.go#L31-L69) stores row values in a chunk list and keeps **row pointers** in the heap. When a better candidate arrives, `update` appends the row and changes a pointer; the old row's bytes can remain in the list. Otherwise a stream of improving rows could grow memory even though the heap pointer count stays at three.

The no-spill loop [compacts the chunk list](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L523-L559) when its row count exceeds four times the number of retained pointers. [`doCompaction`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn_chunk_heap.go#L115-L137) copies just the current candidates into a new chunk list. Thus "keeps only the best three" describes the _logical candidate set_, not a strict three-row cap on every intermediate allocation.

Ordinary TopN still needs to see the whole unsorted input before it knows the winners. [The initial load](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L368-L396) explicitly avoids setting `RequiredRows` to the output limit on its child. This is different from a plain `LIMIT` without `ORDER BY`: a late score might beat the current leader. A pushdown plan or an already ordered source changes where or how that work occurs, not the meaning of the SQL result.

## The knobs, and the boundary of this story

- **`tidb_mem_quota_query`** sets a statement's query memory quota. [`TopNExec.OpenSelf`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L109-L120) attaches its memory tracker to the statement tracker; the [variable definition](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/sessionctx/variable/sysvar.go#L3208-L3219) shows how the limit is set.
- **`tidb_enable_tmp_storage_on_oom`** gates this executor's spill setup. When enabled, [`OpenSelf`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L125-L160) creates a disk tracker, spill helper, and workers; the no-spill path above is only one branch of that executor. See the [TiDB memory-control documentation](https://docs.pingcap.com/tidb/stable/configure-memory-usage/) for operational context.
- **`tidb_executor_concurrency`** is passed by the [builder](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/builder.go#L2973-L2983) to TopN's `Concurrency`. In this snapshot it sizes the [spill-related worker/channel setup](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L118-L156); it does not mean the ordinary heap loop automatically runs in parallel. The [system-variable definition](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/sessionctx/variable/sysvar.go#L2390-L2393) is the source for its name and constraints.

We leave spill merging, partial-order short-circuiting, and TiKV's own TopN implementation for separate posts. Check a real plan and your release's settings before changing memory or concurrency limits.

## The mental model

`ORDER BY ... LIMIT count OFFSET offset` needs the best `count + offset` rows. The local TopN executor reads child chunks, retains candidates through a worst-at-root heap, sorts the survivors, skips the offset, and returns the rest. Chunk compaction keeps replaced rows from piling up; spill and pushdown are distinct paths. The key contrast with plain `LIMIT` is that, without an ordered input, TopN cannot know the winners until it has examined all candidates.

## References

- [TiDB source: `PhysicalTopN` and `executorBuilder.buildTopN` at commit `dfda1fd`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/planner/core/operator/physicalop/physical_topn.go#L36-L53), [builder](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/builder.go#L2968-L3000).
- [TiDB source: `TopNExec`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn.go#L59-L97) and [`topNChunkHeap`](https://github.com/pingcap/tidb/blob/dfda1fd3e83f73fcccb536fb3eeead54735de7b1/pkg/executor/sortexec/topn_chunk_heap.go#L31-L50).
- [PingCAP documentation: TopN and Limit pushdown](https://docs.pingcap.com/tidb/stable/topn-limit-push-down/) and [memory usage](https://docs.pingcap.com/tidb/stable/configure-memory-usage/).
