---
author: JZ
pubDatetime: 2026-10-17T18:30:00Z
modDatetime: 2026-10-17T18:30:00Z
title: System Design - How Kubernetes Horizontal Pod Autoscaling Works
tags:
  - design-system
  - design-kubernetes
description: "Follow a traffic spike through Kubernetes' HPA control loop: metric collection, replica calculations, the scale subresource, and the safeguards against noisy measurements."
---

## Table of contents

## A queue starts growing

This is an explanation for engineers new to Kubernetes autoscaling. Imagine an API running on two Pods. Traffic doubles, CPU use rises, and requests start waiting. Adding replicas manually would help, but someone would need to notice the spike and later remove the extra replicas. A **HorizontalPodAutoscaler (HPA)** makes that decision repeatedly from measured demand. It changes the _number_ of Pods, not the CPU or memory allocated to an individual Pod.

There are three different kinds of numbers in this story: a container's **CPU request** reserves its share of CPU for scheduling; its **observed CPU usage** comes from metrics; an HPA's **target utilization** is the desired percentage of the request. A target of 50% is **not** 50% of the node's CPU. If the containers in a Pod omit the relevant CPU request, the controller cannot calculate that Pod's CPU utilization for this metric. See the [Kubernetes algorithm description](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/#algorithm-details).

## Who actually adds the Pods?

```text
   Pod CPU usage -- Metrics Server -- metrics.k8s.io
                                         |
                                         v
 HPA (target, bounds) ----------> HPA controller
                                    | calculate desired replicas
                                    | apply safety rules
                                    v
                            Deployment /scale
                                    |
                                    v
                         Deployment + ReplicaSet
                                    |
                                    v
                              additional Pods
```

The HPA controller runs inside `kube-controller-manager` at intervals, rather than reacting to each request. For resource metrics such as CPU, it reads `metrics.k8s.io`, ordinarily supplied by a separately installed **Metrics Server**. It looks up the workload named by `scaleTargetRef`, gets its current replica count and Pod selector through the workload's **scale subresource**, and updates that same subresource if the decision changes. The Deployment and ReplicaSet controllers then reconcile actual Pods to the new desired count. **The HPA does not create Pods directly.** [Kubernetes' HPA overview](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/) describes these interfaces; the [controller's reconciliation path](https://github.com/kubernetes/kubernetes/blob/98d0129cf21ce0871637ae36e67b5ff82d3db50d/pkg/controller/podautoscaler/horizontal.go#L826-L895) reads the scale target.

## The calculation behind one scale-up

For a single metric, the starting point is:

```text
desired replicas = ceil(current replicas * current metric / target metric)
```

Suppose the two Pods average **80% of their requested CPU**, while the HPA target is **50%**. The raw calculation is `ceil(2 * 80 / 50) = 4` replicas. Adding two Pods should spread roughly the same work across more capacity _if_ the workload is distributable and new Pods become ready. It is an estimate, not a promise of an exact future CPU percentage. Kubernetes' [documented formula](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/#algorithm-details) also describes a tolerance around the target: small deviations produce no change.

In source, [`HorizontalController.computeReplicasForMetrics`](https://github.com/kubernetes/kubernetes/blob/98d0129cf21ce0871637ae36e67b5ff82d3db50d/pkg/controller/podautoscaler/horizontal.go#L380-L453) computes a recommendation for each configured metric and takes the largest. The recommendation goes through [`normalizeDesiredReplicas` or `normalizeDesiredReplicasWithBehaviors`](https://github.com/kubernetes/kubernetes/blob/98d0129cf21ce0871637ae36e67b5ff82d3db50d/pkg/controller/podautoscaler/horizontal.go#L952-L980) for bounds, stabilization, and scaling limits. Finally, [`reconcileAutoscaler` updates `/scale`](https://github.com/kubernetes/kubernetes/blob/98d0129cf21ce0871637ae36e67b5ff82d3db50d/pkg/controller/podautoscaler/horizontal.go#L983-L1012); a write conflict causes a retry against a freshly read scale value. The calculation and the change to the workload are separate steps.

## Why doesn't it oscillate forever?

Imagine CPU drops the moment the extra Pods start. Immediately deleting them might bring CPU back up, triggering another scale-up. HPA has several brakes:

- **Tolerance:** a ratio close enough to the target does not change replicas.
- **Missing samples and startup:** missing Pod metrics and CPU readings from Pods that are not yet ready are handled conservatively; a tentative scaling decision can shrink or disappear after adjustment. The CPU reported in HPA status can still be the _original_ average, not the conservative value used for scaling.
- **Multiple metrics:** HPA chooses the highest replica recommendation. If one metric fails and another recommends scaling _down_, the downscale is skipped; a valid upscale can still proceed.
- **Downscale stabilization:** HPA remembers recent recommendations and normally keeps the highest within the downscale window, so a brief dip does not immediately remove capacity.
- **Bounds and policies:** `minReplicas` and `maxReplicas` constrain the result. `behavior` can configure stabilization and the rate of scaling in either direction.

These behaviors are described in the [algorithm and scaling-policy documentation](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/#configurable-scaling-behavior). They trade reaction speed for stability: a slow downscale can cost extra resources, while an aggressive one may cause oscillation. HPA also cannot guarantee enough _nodes_ are available to schedule the new Pods; that is a separate capacity problem.

## The controls worth remembering

`scaleTargetRef` names the scalable workload; `metrics` names what to measure and the target; `minReplicas` and `maxReplicas` bound the answer; `behavior` controls how quickly a recommendation is applied. The controller manager's `--horizontal-pod-autoscaler-sync-period` controls how often it checks, and `--horizontal-pod-autoscaler-downscale-stabilization` sets the default downscale window when no per-HPA override is supplied. Check your cluster's [HPA configuration documentation](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/#configurable-scaling-behavior) before changing defaults.

If the HPA is not changing replica counts, inspect its conditions and metric availability before changing targets. A missing Metrics Server or CPU requests means the controller may have no usable CPU utilization to compare. If the desired count _does_ rise but Pods remain pending, investigate scheduling and cluster capacity instead; a successful HPA calculation is not the same as a running Pod.

## The mental model

HPA is a feedback loop: **measure → estimate → stabilize → update desired replicas → let the workload controllers act**. It controls a _desired count_, not request traffic or the underlying machines. That separation explains both its power during ordinary load changes and its limits when measurements or capacity are missing.

## References

1. [Kubernetes: Horizontal Pod Autoscaling](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/), including the formula, missing-data rules, and scaling behavior.
2. [Kubernetes: Resource Metrics Pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/), for the Metrics Server and `metrics.k8s.io` path.
3. [Kubernetes source: HPA controller at commit `98d0129`](https://github.com/kubernetes/kubernetes/blob/98d0129cf21ce0871637ae36e67b5ff82d3db50d/pkg/controller/podautoscaler/horizontal.go), the implementation snapshot used above; cluster versions can differ.
