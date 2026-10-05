---
author: JZ
pubDatetime: 2026-10-05T19:00:00Z
modDatetime: 2026-10-05T19:00:00Z
title: System Design - How Kubernetes Deployment Rolling Updates Work
tags:
  - design-system
  - design-kubernetes
  - design-deployment
description: "A beginner-friendly walkthrough of how a Kubernetes Deployment replaces Pods gradually, using ReplicaSets, readiness, maxSurge, and maxUnavailable."
---

This explanation is for engineers who know what a Pod is and want to understand how Kubernetes can replace an application version without stopping every replica at once.

## Table of contents

## The problem a Deployment solves

Imagine that a small web service has four copies running. Version 1 is serving requests, and you want to release version 2. If Kubernetes deleted all four old Pods before starting the new ones, the service would have no instances during the gap. If it started four more Pods without a limit, it might overload the cluster.

A **Deployment** coordinates this change. You describe the version and replica count you want. The Deployment controller repeatedly compares that desired state with the objects that exist, then makes a small adjustment. It does not replace all Pods in one atomic operation.

The important objects are:

- A **Deployment** stores the desired replica count and Pod template, such as the container image and readiness probe.
- A **ReplicaSet** keeps a specified number of Pods that match one Pod template.
- A **Pod** is the instance that runs the application container.

When the Pod template changes, the Deployment controller creates or finds a new ReplicaSet for that template. The old ReplicaSet continues to own the old Pods while the new ReplicaSet starts the new ones.

```text
                 desired replicas + Pod template
                              |
                              v
                    +-------------------+
                    |    Deployment     |
                    +---------+---------+
                              |
                    observes and reconciles
                              |
                              v
                    +-------------------+
                    | Deployment        |
                    | controller        |
                    +----+---------+----+
                         |         |
              old version|         |new version
                         v         v
                  +-----------+ +-----------+
                  | old       | | new       |
                  | ReplicaSet| | ReplicaSet|
                  +-----+-----+ +-----+-----+
                        |             |
                    old Pods       new Pods
```

## How the rolling update proceeds

The controller's rolling-update loop first reconciles the new ReplicaSet. If it scales that ReplicaSet, it updates rollout status and returns. On a later reconciliation, it considers scaling down old ReplicaSets. It repeats this process until the Deployment reaches its desired state. The implementation is in Kubernetes' [`rolloutRolling`, `reconcileNewReplicaSet`, and `reconcileOldReplicaSets`](https://github.com/kubernetes/kubernetes/blob/8ae47e9fc94cbb1f8a36dafb13209984d5e07d0f/pkg/controller/deployment/rolling.go#L31-L211).

For a Deployment with four replicas, the update looks roughly like this:

```text
Start:          old 4, new 0
Add a new Pod:  old 4, new 1   (one surge slot is in use)
Wait:           the new Pod must become available
Make room:      old 3, new 1
Repeat:         old 3, new 2 -> old 2, new 2 -> ...
Finish:         old 0, new 4
```

The old and new counts can change over several controller passes. Pod startup, image pulls, readiness checks, and capacity all take time, so a rollout is a process rather than a single command that swaps binaries instantly.

## The two rollout budgets

The `RollingUpdate` strategy has two controls that describe different budgets:

| Setting          | What it limits                                                          | Example with four desired replicas                                     |
| ---------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `maxSurge`       | How many extra Pods may exist above the desired count during an update. | `1` permits up to five Pods in total.                                  |
| `maxUnavailable` | How many desired replicas may be unavailable during the update.         | `1` permits the controller to have as few as three available replicas. |

Both values can be integers or percentages. In the Kubernetes documentation, the default percentage for each is 25%; percentage values are rounded up for `maxSurge` and down for `maxUnavailable`. See the [Deployment rolling update documentation](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-update-deployment) for the rules and current version details.

With four healthy starting replicas, setting `maxUnavailable: 0` and `maxSurge: 1` prioritizes keeping all four available. Kubernetes must start a new Pod and wait for it to count as available before it can remove an old one. That setting needs enough spare cluster capacity to run the temporary extra Pod.

`minReadySeconds` adds another check: a Pod must remain ready for that many seconds before Kubernetes treats it as available for rollout progress. This can help avoid counting a Pod that briefly passes its readiness check and then fails immediately.

## Readiness is the hand-off signal

The controller cannot infer that an application is healthy just because its container process started. The Pod's readiness state is the signal that tells Kubernetes whether the Pod should receive traffic through the Service. A readiness probe should test the capability needed to serve requests, not merely whether the process exists.

That signal is part of the rollout's safety mechanism:

1. The new ReplicaSet creates a Pod.
2. The kubelet runs the container and its configured probes.
3. When the Pod becomes ready and satisfies `minReadySeconds`, its ReplicaSet reports it as available.
4. The Deployment controller can then use that availability when deciding whether to scale down an old ReplicaSet.

This is why a bad image, a failing readiness probe, or a startup that takes longer than expected can leave a rollout stuck with both versions present. The old Pods are not necessarily deleted just because the new ReplicaSet exists.

## What a rollback does—and does not do

ReplicaSets retain the Pod templates for rollout revisions. If the new application version is unhealthy, you can roll the Deployment back to an earlier revision. Kubernetes then changes the Deployment's desired Pod template and runs another rollout toward that older template.

This is not a rollback of everything the application did. A Deployment does not reverse database migrations, undo messages already written to a queue, or restore external state. Applications should usually keep old and new versions compatible with shared dependencies while a rollout is in progress.

## The bigger picture

A rolling update is a feedback loop with two explicit budgets: temporary capacity (`maxSurge`) and tolerated unavailable replicas (`maxUnavailable`). ReplicaSets preserve the old and new Pod templates, while the controller moves replicas between them only as observed health allows.

This design trades rollout speed for safety. More surge capacity can let the new version start sooner. A smaller unavailability budget protects serving capacity but can make progress wait longer for healthy Pods. Neither setting can compensate for incorrect readiness checks or an application that is incompatible with its dependencies.

## References

1. [Kubernetes Deployments: rolling updates](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-update-deployment).
2. [Kubernetes Deployment rolling-update controller implementation](https://github.com/kubernetes/kubernetes/blob/8ae47e9fc94cbb1f8a36dafb13209984d5e07d0f/pkg/controller/deployment/rolling.go#L31-L211).
