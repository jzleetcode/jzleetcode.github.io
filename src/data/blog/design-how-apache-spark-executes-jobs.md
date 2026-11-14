---
author: JZ
pubDatetime: 2026-11-14T19:32:46Z
modDatetime: 2026-11-14T19:32:46Z
title: System Design - How Apache Spark Executes a Job
tags:
  - design-system
  - design-distributed
description:
  "Follow an Apache Spark job from a lazy RDD transformation through stages, shuffle boundaries, tasks, executors, retries, and scheduling settings."
---

## Table of contents

## A question that does not run yet

Imagine an analyst wants to count orders by product. The code might look like this:

```scala
val counts = sc.textFile("hdfs:///orders")
  .map(parseOrder)
  .filter(_.isValid)
  .map(order => (order.productId, 1))
  .reduceByKey(_ + _)

counts.saveAsTextFile("hdfs:///results/product-counts")
```

The first few lines describe work, but do not immediately read every order. Spark records the transformations as a lineage graph. The final line is an **action**: it asks Spark to produce an output, so Spark has to run the computation.

This separation lets Spark see a larger part of the work before it starts. It can combine simple operations, run independent partitions at the same time, and decide where data must move between machines.

This post follows the RDD execution model. Spark SQL uses its own query planner, but it ultimately relies on Spark's distributed execution machinery too.

## Three layers of work

Spark uses three related terms:

- A **job** is the work triggered by an action such as `saveAsTextFile`, `count`, or `collect`.
- A **stage** is a group of operations that can run without waiting for a shuffle produced by an earlier group.
- A **task** is one stage's work for one data partition.

For example, a stage with 200 partitions normally creates 200 tasks. A task processes a partition; it does not represent one input row.

```text
Application code
      |
      | action, such as saveAsTextFile
      v
   one job
      |
      +-- stage 0: tasks read input partitions and write shuffle output
      |
      +-- stage 1: tasks read shuffle buckets and write final partitions
```

The job is the whole request. Stages are its dependent phases, and tasks are the parallel pieces inside a phase.

## Transformations build a graph

A transformation such as `map` or `filter` creates another RDD in the lineage. It does not normally compute the new values right away.

For the order-count example, Spark can view the work roughly like this:

```text
orders on disk
     |
     +-- read partition
             |
             +-- parseOrder
                     |
                     +-- filter valid orders
                             |
                             +-- map to (productId, 1)
                                     |
                                     +-- reduceByKey
                                             |
                                             +-- write results
```

Some operations can be pipelined in one task. A task can read one input partition, parse its rows, filter them, and map them without writing an intermediate file after each step.

Operations that require records with the same key to meet each other are different. `reduceByKey` needs to bring values for each product together, possibly from many input partitions. That network redistribution is a **shuffle**.

## A shuffle creates a stage boundary

Before the reduce side can finish, Spark must make the map side's shuffle data available. The DAGScheduler represents this dependency as a shuffle boundary and divides the work into stages.

For our example, the flow is:

```text
Stage 0: read and prepare
  Task 0 reads input partition 0 --+
  Task 1 reads input partition 1 --+--> local combine --> shuffle buckets
  Task 2 reads input partition 2 --+
  Task 3 reads input partition 3 --+

                    shuffle files
                         |
                         v

Stage 1: finish each key's reduction and write output
  Task 0 reads bucket 0 --> output partition 0
  Task 1 reads bucket 1 --> output partition 1
  Task 2 reads bucket 2 --> output partition 2
```

The map tasks can combine values locally before sending them across the network. For example, if one input partition has a thousand orders for the same product, it can send a partial count instead of a thousand separate values.

Spark does not need to wait for every stage in the entire job before it begins useful work. It submits a stage once its required parent shuffle outputs are available. The dependent stage then fetches the buckets it needs.

The important cost is the shuffle itself: it moves data over the network and often writes intermediate files. Choosing operations such as `reduceByKey` instead of collecting all values with `groupByKey` can reduce how much data crosses that boundary.

## From a stage to running tasks

The **DAGScheduler** turns the lineage and shuffle dependencies into stages. When a stage is ready, it creates tasks for the missing partitions and submits them to the **TaskScheduler**.

The task scheduler groups a stage's tasks into a task set, considers available resources and data locality, and asks the scheduler backend to launch work. The cluster manager provides executor processes; executors run tasks and send results and status back to the driver.

```text
Driver
  DAGScheduler
      |
      | ready task set
      v
  TaskScheduler
      |
      | launch tasks where resources are available
      v
Cluster manager ---- allocates ----> Executors
                                      | Task 0
                                      | Task 1
                                      | Task 2
                                      v
                                 shuffle / output
```

A Spark application has a driver and its own executors. The cluster manager (for example, Standalone, YARN, or Kubernetes) helps the application obtain resources. The DAGScheduler and TaskScheduler work inside the driver; they are not separate cluster services.

A task can run on an executor that already has useful data nearby, but locality is a preference, not a promise. If the preferred executor is busy, Spark can wait briefly and then use another available executor.

## Failures and retries

A distributed job expects some tasks to fail. A worker can disappear, a task can hit a temporary storage error, or a network transfer can fail. Spark can retry a failed task. If shuffle output that a later stage needs is lost, Spark may need to rerun work that produced that output.

The lineage graph is useful here: it records how an RDD was built, which gives Spark a recipe for recomputing missing partitions. It does not mean every failure is free. Recomputing a large shuffle stage can take time and consume substantial network and CPU.

Task attempts can also run more than once. With speculative execution enabled, Spark may start a second copy of a task that appears unusually slow. Code that writes to an external system should therefore be safe if an operation is retried or duplicated.

## Settings to know

| Setting | What it changes |
| --- | --- |
| `spark.task.maxFailures` | How many times an individual task can fail before Spark aborts its task set. |
| `spark.locality.wait` | How long Spark waits for a preferred data location before trying a less-local resource. The documented default is 3 seconds. |
| `spark.speculation` | Enables duplicate attempts for unusually slow tasks. It is disabled by default. |

These settings solve different problems. Raising the task failure limit can help with transient failures, but it can also make a persistently broken task take longer to fail. Increasing locality wait can help tasks that benefit from cached or local data, but it may leave resources idle. Speculation can reduce the impact of a straggler, but it uses extra resources and makes idempotent side effects even more important.

## The whole journey

The order-count example now has a concrete lifecycle:

1. The program builds a lazy RDD graph from transformations.
2. `saveAsTextFile` requests a result and creates a job.
3. The DAGScheduler finds shuffle dependencies and builds stages.
4. Each stage creates tasks for its partitions.
5. The TaskScheduler places tasks on executors as resources become available.
6. Map tasks write shuffle data; reduce tasks fetch it, finish aggregation, and write the output.
7. The driver reports success when the action's work completes, or propagates a failure after Spark's retry rules are exhausted.

The next time a Spark UI shows a job with several stages, the stage boundaries are usually clues about where the computation must exchange data. The number of tasks in a stage tells you how the stage was partitioned, while long task tails can point to data skew, resource contention, or a straggler.

## References

1. Apache Spark, [Cluster Mode Overview](https://spark.apache.org/docs/latest/cluster-overview.html)
2. Apache Spark, [RDD Programming Guide](https://spark.apache.org/docs/latest/rdd-programming-guide.html)
3. Apache Spark, [Configuration](https://spark.apache.org/docs/latest/configuration.html#scheduling)
4. Spark source: [DAGScheduler.scala](https://github.com/apache/spark/blob/master/core/src/main/scala/org/apache/spark/scheduler/DAGScheduler.scala)
5. Spark source: [TaskSchedulerImpl.scala](https://github.com/apache/spark/blob/master/core/src/main/scala/org/apache/spark/scheduler/TaskSchedulerImpl.scala)
6. Spark source: [TaskSetManager.scala](https://github.com/apache/spark/blob/master/core/src/main/scala/org/apache/spark/scheduler/TaskSetManager.scala)
