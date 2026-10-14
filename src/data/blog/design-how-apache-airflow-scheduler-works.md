---
author: JZ
pubDatetime: 2026-10-14T18:35:32Z
modDatetime: 2026-10-14T18:35:32Z
title: System Design - How Apache Airflow Schedules a DAG
tags:
  - design-system
  - design-workflow
description: "A beginner-friendly explanation of Apache Airflow's DAG processor, scheduler, executor, and workers—and how a task becomes eligible to run."
---

## Table of contents

## Context

This explanation follows one daily workflow from its DAG file to task execution, for engineers who are new to workflow schedulers. An Airflow DAG looks like a graph of Python tasks. It is tempting to picture the scheduler as a program that walks that graph and calls each Python function. That is not quite what happens. Airflow separates **describing a workflow**, **deciding which task instances may run**, and **executing those task instances**.

This explanation follows the Airflow 3 architecture. It is for engineers who know what a Python function is but are new to workflow schedulers. We will follow one daily report from its DAG file to its worker.

## A DAG is a recipe, not a run

Suppose a DAG has three tasks: `extract`, `transform`, and `publish`. The arrows express dependencies: `transform` waits for `extract`, and `publish` waits for `transform`.

The DAG definition describes the recipe. A **DAG run** is one scheduled or manually created instance of that recipe, associated with a logical data interval. Within a DAG run, each task gets a **task instance**. If Airflow catches up on several missed daily intervals, it creates several DAG runs, each with its own task instances.

Airflow 3 keeps parsing DAG files separate from scheduling and execution:

```
 Python DAG files
       |
       v
 DAG processor --serialized DAGs--> Metadata DB <--> Scheduler --> Executor --> Task process / worker
                                        ^                                             |
                                        |                                             | Task Execution API
                                        +------------------- API server <-------------+
```

The **DAG processor** imports and parses the files, then stores serialized DAG definitions in the metadata database. In Airflow 3, a DAG bundle supplies the DAG files and related resources to the processor and, when needed, workers. The DAG processor is a required standalone process, so the scheduler never has direct access to the DAG bundle or executes DAG-author code. The **scheduler** reads serialized definitions and coordinates DAG runs and task instances using the database.

The **executor** is configured as part of the scheduler, not deployed as a separate Airflow service. It launches ready work locally or sends it to a remote worker system. In a minimal deployment, the task process may run alongside the scheduler; a separate worker fleet is optional.

In Airflow 3, a worker does not write task state directly to the metadata database. The worker uses the **Task Execution API** served by the API server to communicate runtime state and request Airflow-managed context. The API server is the database-facing gateway for that task interaction. This is an important boundary: task code does not get direct metadata-database access, even though trusted control-plane components such as the scheduler and DAG processor use the database directly.

## How a task becomes runnable

For a daily DAG, the scheduler first determines whether a run should exist for the next data interval. A schedule describes the intervals; it does not mean “run at exactly this wall-clock second.” With catchup enabled, Airflow can create runs for intervals that were missed while the DAG was paused or the scheduler was unavailable. With catchup disabled, it avoids creating that backlog of historical runs.

For each task instance, the scheduler then asks two kinds of questions:

- **Are its dependencies satisfied?** For example, `transform` cannot run until `extract` succeeds. Trigger rules and other dependency settings can change this decision.
- **Is there capacity to admit it?** DAG-level concurrency limits, global parallelism, and pools can all hold an otherwise-ready task back.

Once a task passes those checks, the scheduler queues it through the configured executor. A local executor may run it on the scheduler host; a distributed executor can hand it to an external queue and worker fleet. The scheduler does not need to run the task function itself to decide whether it is ready.

When a worker finishes, it reports the task instance's new state through the Task Execution API. The scheduler then sees that persisted state, which can make downstream tasks eligible. If the task fails and retries are configured, another attempt can be scheduled after its retry delay. The scheduler keeps reconciling stored definitions and state; it is not a one-time traversal of the DAG.

## The knobs that shape scheduling

It helps to separate four kinds of controls:

| Control                                  | What it influences                                 |
| ---------------------------------------- | -------------------------------------------------- |
| DAG schedule and `catchup`               | Which data intervals become DAG runs               |
| `max_active_runs` and `max_active_tasks` | How much work from one DAG may be active at once   |
| `parallelism` and pools                  | Global concurrency and limits for shared resources |
| Executor choice                          | Where queued task instances are executed           |

These controls solve different problems. Increasing `parallelism` does not make a task's dependencies ready. Changing the executor does not change the DAG's ordering rules. A pool is useful when tasks share a scarce resource, such as a database with a limited connection budget.

## A useful mental model

Think of Airflow as a coordinator with a durable notebook. The DAG processor writes down the workflow recipe. The scheduler consults the recipe and the current task states, then admits work when its dependencies and capacity allow. The executor and workers perform that work and write back the result.

That separation is why Airflow can recover after a scheduler restart: it can reconstruct what should happen from the DAG definitions and persisted metadata instead of relying on one Python process to remember how far it got.

## References

1. [Airflow architecture overview](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/overview.html).
2. [Airflow DAG bundles](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/dag-bundles.html).
3. [Airflow scheduler](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/scheduler.html).
4. [DAGs and task dependencies](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html).
5. [DAG runs and data intervals](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html).
6. [Executors](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/executor/index.html).
7. [Pools](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/pools.html).
8. [Airflow 3 security model and component trust boundaries](https://airflow.apache.org/docs/apache-airflow/stable/security/security_model.html).
