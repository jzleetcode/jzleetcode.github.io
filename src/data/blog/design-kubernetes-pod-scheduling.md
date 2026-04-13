---
author: JZ
pubDatetime: 2026-04-12T08:00:00Z
modDatetime: 2026-04-12T08:00:00Z
title: System Design - Kubernetes Pod Scheduling, Custom Schedulers, and Karpenter
tags:
  - design-system
  - design-kubernetes
description:
  "How Kubernetes schedules pods: the default kube-scheduler's filter-score pipeline, the scheduling framework's extension points, custom schedulers (TiDB scheduler as case study), and how Karpenter complements scheduling by provisioning nodes."
---

## Table of contents

## Context

When you run `kubectl apply -f my-pod.yaml`, Kubernetes needs to decide **which node** in your cluster should run that pod. This decision is called **scheduling**. It sounds simple, but the scheduler must consider CPU and memory requests, affinity rules, topology constraints, storage locality, and more — all in milliseconds.

A common misconception is that tools like **Karpenter** replace the Kubernetes scheduler. They don't. Karpenter **provisions nodes** (creates or removes VMs), while the scheduler **assigns pods to nodes**. They work in sequence: when the scheduler cannot place a pod because no node has enough capacity, Karpenter notices and spins up a new node. Once the node is ready, the scheduler assigns the pod to it.

Some workloads need scheduling logic that the default scheduler doesn't provide. For example, TiDB (a distributed database) needs to spread its storage pods across failure domains so that losing one rack doesn't lose a quorum. TiDB solves this with a **custom scheduler** called `tidb-scheduler`. Let's start from the default scheduler and build up to understand how all these pieces fit together.

## The Default Scheduler: kube-scheduler

The default Kubernetes scheduler is called `kube-scheduler`. It runs as a control-plane component and watches the API server for newly created pods that don't yet have a `spec.nodeName` (i.e., unscheduled pods).

For each unscheduled pod, the scheduler runs a two-step algorithm:

```
                  kube-scheduler: Pod Placement Pipeline

  Unscheduled Pod
        |
        v
  +---------------------+
  |   1. FILTERING       |   "Which nodes CAN run this pod?"
  |                     |
  |   Check each node:  |
  |   - Enough CPU?     |
  |   - Enough memory?  |
  |   - Matching taints |
  |     and tolerations?|
  |   - Affinity rules? |
  |   - Port available? |
  +----------+----------+
             |
             v
       Feasible Nodes
      (nodes that pass)
             |
             v
  +----------+----------+
  |   2. SCORING         |   "Which node is BEST?"
  |                     |
  |   Score each node:  |
  |   - Spread evenly?  |
  |   - Least requested |
  |     resources?      |
  |   - Data locality?  |
  |   - Image already   |
  |     pulled?         |
  +----------+----------+
             |
             v
       Highest Score
       (winner node)
             |
             v
  +----------+----------+
  |   3. BINDING         |   "Assign pod to node"
  |                     |
  |   Update pod's      |
  |   spec.nodeName     |
  |   via API server    |
  +---------------------+
```

### A Concrete Example

Imagine you have three nodes and submit a pod requesting 2 CPUs and 4 GiB of memory:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  containers:
  - name: app
    image: my-app:latest
    resources:
      requests:
        cpu: "2"
        memory: "4Gi"
```

The scheduler runs through its pipeline:

```
  Node A: 8 CPU, 16 Gi (6 CPU free, 10 Gi free)   --> PASS filter
  Node B: 4 CPU, 8 Gi  (1 CPU free, 3 Gi free)    --> FAIL (not enough CPU)
  Node C: 8 CPU, 16 Gi (4 CPU free, 12 Gi free)   --> PASS filter

  Scoring (LeastRequestedPriority):
    Node A: 6 free -> score 75    (more headroom)
    Node C: 4 free -> score 50

  Winner: Node A
```

The scheduler then creates a **binding** — it updates the pod's `spec.nodeName` to `Node A`, and the kubelet on Node A starts the container.

## The Scheduling Framework

Internally, the two-step filter-score pipeline is implemented via the **Scheduling Framework**, a plugin-based architecture introduced in Kubernetes 1.15. The framework defines **extension points** — hooks where plugins can inject logic:

```
  Pod enters queue
       |
       v
  [PreEnqueue]     Can this pod enter the active queue?
       |
       v
  [QueueSort]      Order pods in the queue (only one plugin allowed)
       |
       v
  === Scheduling Cycle (runs serially per pod) ===
       |
       v
  [PreFilter]      Pre-process pod info, check cluster conditions
       |
       v
  [Filter]         Remove infeasible nodes (runs concurrently per node)
       |
       +--> No feasible nodes? --> [PostFilter] (e.g., preemption)
       |
       v
  [PreScore]       Generate shared state for scoring
       |
       v
  [Score]          Rank feasible nodes (integer scores)
       |
       v
  [NormalizeScore] Scale scores to a common range
       |
       v
  [Reserve]        Optimistically claim resources (stateful)
       |
       v
  [Permit]         Final gate: approve, deny, or wait
       |
       v
  === Binding Cycle (runs concurrently) ===
       |
       v
  [PreBind]        Pre-binding work (e.g., provision network volume)
       |
       v
  [Bind]           Assign pod to node (update API server)
       |
       v
  [PostBind]       Cleanup, logging, metrics
```

Each built-in scheduling feature is a plugin. For example:

| Plugin | Extension Points | What It Does |
|---|---|---|
| `NodeResourcesFit` | Filter, Score | Checks CPU/memory requests fit; scores by utilization |
| `NodeAffinity` | Filter, Score | Enforces `nodeAffinity` rules from pod spec |
| `TaintToleration` | Filter, Score | Matches taints on nodes with tolerations on pods |
| `InterPodAffinity` | Filter, Score | Enforces pod affinity/anti-affinity |
| `PodTopologySpread` | Filter, Score | Spreads pods across topology domains (zones, nodes) |
| `VolumeBinding` | Filter, Score | Ensures PVs are available on the selected node |

This plugin architecture makes the scheduler extensible. You can enable, disable, or reorder plugins via `KubeSchedulerConfiguration`. You can also write your own plugins and compile them into a custom scheduler binary.

## Running Multiple Schedulers

Kubernetes supports running **multiple schedulers** side by side. Each pod specifies which scheduler should handle it via the `spec.schedulerName` field:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: tidb-pd-0
spec:
  schedulerName: tidb-scheduler   # <-- use TiDB's custom scheduler
  containers:
  - name: pd
    image: pingcap/pd:latest
```

If `schedulerName` is omitted, the pod goes to `default-scheduler` (kube-scheduler). Each scheduler watches only for pods addressed to it.

A custom scheduler is deployed as a regular Deployment in the cluster:

```
  +-----------------------------------------------------+
  |                Kubernetes Cluster                    |
  |                                                     |
  |  Control Plane                                      |
  |  +------------------+   +----------------------+    |
  |  | default-scheduler|   |   tidb-scheduler     |    |
  |  | (kube-scheduler) |   |   (custom)           |    |
  |  +--------+---------+   +----------+-----------+    |
  |           |                        |                |
  |           |  watches pods with     |  watches pods  |
  |           |  schedulerName=        |  with          |
  |           |  "default-scheduler"   |  schedulerName=|
  |           |                        |  "tidb-scheduler"|
  |           v                        v                |
  |  +--------+---------+   +----------+-----------+    |
  |  |   nginx pod      |   |   tikv-0 pod         |    |
  |  |   redis pod      |   |   pd-0 pod           |    |
  |  |   my-app pod     |   |   tidb-0 pod         |    |
  |  +------------------+   +----------------------+    |
  +-----------------------------------------------------+
```

## Case Study: TiDB's Custom Scheduler

TiDB is a distributed NewSQL database. Its architecture has three main components that run as pods in Kubernetes:

- **PD** (Placement Driver): The brain — manages metadata and timestamps. Uses Raft consensus, so it needs an odd number of replicas (typically 3 or 5).
- **TiKV**: The storage engine — stores data in Raft groups with 3 replicas by default.
- **TiDB**: The SQL layer — stateless, can run anywhere.

The default Kubernetes scheduler doesn't understand TiDB's replication topology. If it happens to place 2 out of 3 PD pods on the same node, and that node goes down, PD loses its Raft quorum and the entire cluster becomes unavailable. TiDB solves this with `tidb-scheduler`.

### How tidb-scheduler Works

The TiDB Operator deploys `tidb-scheduler` as a **scheduler extender**. When the TidbCluster custom resource specifies `tidb-scheduler`, the pod templates include `schedulerName: tidb-scheduler`. The scheduler watches for these pods and applies component-specific **predicates** (filters).

The core logic lives in [`pkg/scheduler/scheduler.go`](https://github.com/pingcap/tidb-operator/blob/master/pkg/scheduler/scheduler.go):

```go
// Filter selects eligible nodes for a TiDB component pod.
func (s *scheduler) Filter(args *extender.Args) (*extender.Result, error) {
    pod := args.Pod
    component := pod.Labels["app.kubernetes.io/component"]

    // Select predicates based on component type
    var predicates []Predicate
    switch component {
    case "pd", "tikv":
        predicates = append(predicates, NewHA())    // HA spreading
    case "tidb":
        if featureGate.Enabled(StableScheduling) {
            predicates = append(predicates, NewStableScheduling())
        }
    }

    // Apply each predicate to narrow down feasible nodes
    nodes := args.Nodes
    for _, predicate := range predicates {
        nodes = predicate.Filter(nodes, pod)
    }
    return &extender.Result{Nodes: nodes}, nil
}
```

### The HA Predicate: Spreading Pods Across Failure Domains

The HA predicate in [`pkg/scheduler/predicates/ha.go`](https://github.com/pingcap/tidb-operator/blob/master/pkg/scheduler/predicates/ha.go) ensures PD and TiKV pods are spread across **topology domains** (nodes, racks, or zones).

The topology key is configurable via an annotation on the TidbCluster. The default is `kubernetes.io/hostname` (spread across nodes). You can set it to `topology.kubernetes.io/zone` for zone-level spreading.

**PD spreading rule**: No more than a minority of replicas on one topology. The formula:

$$\text{maxPodsPerTopology} = \left\lfloor \frac{\text{replicas} + 1}{2} \right\rfloor - 1, \text{ minimum } 1$$

For 3 PD replicas: $\lfloor(3+1)/2\rfloor - 1 = 1$. So at most 1 PD pod per node. This means losing any single node still leaves a majority (2 out of 3) alive — quorum is preserved.

```
  3 PD replicas across 3 nodes (max 1 per node):

  +--------+   +--------+   +--------+
  | Node A |   | Node B |   | Node C |
  |        |   |        |   |        |
  | [pd-0] |   | [pd-1] |   | [pd-2] |
  +--------+   +--------+   +--------+

  Node B goes down:
  - pd-0 on A: alive
  - pd-1 on B: LOST
  - pd-2 on C: alive
  -> 2/3 alive = quorum maintained, cluster stays available
```

**TiKV spreading rule**: TiKV uses 3-copy Raft groups by default. With 3+ replicas, the scheduler requires at least 3 topology domains and distributes evenly:

$$\text{maxPodsPerTopology} = \left\lceil \frac{\text{replicas}}{3} \right\rceil$$

For 5 TiKV replicas: $\lceil 5/3 \rceil = 2$. Pods distribute as 1-2-2 or 2-2-1 across 3 nodes.

```
  5 TiKV replicas across 3 nodes (max 2 per node):

  +----------+   +----------+   +----------+
  | Node A   |   | Node B   |   | Node C   |
  |          |   |          |   |          |
  | [tikv-0] |   | [tikv-1] |   | [tikv-3] |
  |          |   | [tikv-2] |   | [tikv-4] |
  +----------+   +----------+   +----------+

  Node B goes down:
  - Lost 2 out of 5 TiKV instances
  - Each Raft group has 3 replicas spread across nodes
  - At most 1 replica per group lost -> quorum maintained
```

### Scheduling Serialization

A subtle problem: if the scheduler evaluates two TiKV pods concurrently, both might see the same cluster state and both decide to land on the same node, violating the HA constraint.

`tidb-scheduler` solves this with **scheduling serialization**. It uses an annotation (`AnnPVCPodScheduling`) as a lock:

```
  tikv-0 scheduling:
    1. Set annotation "scheduling=tikv-0" on TidbCluster
    2. Filter nodes, pick Node A
    3. Bind tikv-0 to Node A
    4. Wait for PVC to bind
    5. Clear annotation

  tikv-1 scheduling:
    1. See annotation "scheduling=tikv-0" -> wait
    2. Annotation cleared -> proceed
    3. Set annotation "scheduling=tikv-1"
    4. Filter nodes (now sees tikv-0 on Node A)
    5. Pick Node B
    ...
```

This ensures each pod sees the effect of previously scheduled pods, maintaining HA invariants.

## Where Karpenter Fits In

Karpenter is **not a scheduler**. It is a **node provisioner** that works alongside the scheduler.

Here is the sequence when a pod cannot be scheduled due to lack of capacity:

```
  1. You submit a pod requesting 8 CPUs
  2. kube-scheduler tries to place it
  3. No node has 8 free CPUs -> pod marked Unschedulable
  4. Karpenter detects the Unschedulable pod
  5. Karpenter provisions a new EC2 instance (node)
  6. New node registers with the cluster
  7. kube-scheduler sees the new node, places the pod
```

```
  +--------------------+       +-------------------+
  |   kube-scheduler   |       |    Karpenter      |
  |                    |       |                   |
  |  "Where should     |       |  "Do we need      |
  |   this pod run?"   |       |   more nodes?"    |
  +--------+-----------+       +--------+----------+
           |                            |
           v                            v
  +--------+-----------+       +--------+----------+
  |  Assigns pods to   |       |  Creates/removes  |
  |  existing nodes    |       |  cloud VMs        |
  +--------------------+       +-------------------+
```

### Karpenter vs. Cluster Autoscaler

Before Karpenter, the standard tool for node provisioning was **Cluster Autoscaler**. The key differences:

| | Cluster Autoscaler | Karpenter |
|---|---|---|
| **Scope** | Scales existing node groups | Provisions individual nodes |
| **Instance selection** | Fixed instance types per group | Chooses instance types dynamically |
| **Speed** | Minutes (adjusts ASG desired count) | Seconds (launches instances directly) |
| **Consolidation** | Limited | Actively consolidates underutilized nodes |
| **Cloud support** | Multi-cloud | Primarily AWS (community providers for Azure/GCP) |

Karpenter's `NodePool` custom resource defines constraints:

```yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
      - key: kubernetes.io/arch
        operator: In
        values: ["amd64", "arm64"]
      - key: karpenter.sh/capacity-type
        operator: In
        values: ["on-demand", "spot"]
      - key: node.kubernetes.io/instance-type
        operator: In
        values: ["m5.xlarge", "m5.2xlarge", "m6g.xlarge"]
  limits:
    cpu: "100"       # max 100 CPUs across all nodes in this pool
  disruption:
    consolidateAfter: 30s
```

When Karpenter sees an unschedulable pod, it picks the cheapest instance type from the allowed list that satisfies the pod's resource requests, launches it, and the scheduler takes over.

## Putting It All Together

Here is how all the pieces interact in a TiDB-on-Kubernetes deployment:

```
  kubectl apply TidbCluster CR
         |
         v
  TiDB Operator (tidb-controller-manager)
  - Creates StatefulSets for PD, TiKV, TiDB
  - Sets schedulerName: tidb-scheduler in pod templates
         |
         v
  Pods created (Unscheduled, schedulerName=tidb-scheduler)
         |
         v
  tidb-scheduler picks up pods
  - Applies HA predicate: spread across nodes/zones
  - Filters nodes, scores, binds
         |
         +--> Not enough nodes?
         |         |
         |         v
         |    Pod stays Unschedulable
         |         |
         |         v
         |    Karpenter detects it
         |    - Provisions new node matching constraints
         |    - Node joins cluster
         |         |
         |         v
         |    tidb-scheduler retries
         |    - New node is now feasible
         |
         v
  Pod bound to node
  - kubelet starts container
  - PD/TiKV joins the cluster
```

## Summary

| Component | Role | When It Acts |
|---|---|---|
| **kube-scheduler** | Assigns pods to existing nodes | Pod created without `nodeName` |
| **Scheduling Framework** | Plugin-based filter/score pipeline | Inside kube-scheduler |
| **Custom scheduler** (e.g., tidb-scheduler) | Domain-specific scheduling logic | Pods with matching `schedulerName` |
| **Karpenter** | Provisions/removes cloud nodes | Pods stuck as Unschedulable |
| **Cluster Autoscaler** | Scales node groups up/down | Pods stuck as Unschedulable |

The scheduler answers "**where** should this pod run?" Karpenter answers "**do we have enough infrastructure** to run it?" Custom schedulers like `tidb-scheduler` answer "where should this pod run **given my application's topology requirements**?"

## References

1. Kubernetes docs, kube-scheduler [doc](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/)
2. Kubernetes docs, Scheduling Framework [doc](https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/)
3. Kubernetes docs, Configure Multiple Schedulers [doc](https://kubernetes.io/docs/tasks/extend-kubernetes/configure-multiple-schedulers/)
4. Karpenter concepts [doc](https://karpenter.sh/docs/concepts/)
5. TiDB Operator architecture [doc](https://docs.pingcap.com/tidb-in-kubernetes/stable/architecture/)
6. TiDB Operator scheduler source [`pkg/scheduler/scheduler.go`](https://github.com/pingcap/tidb-operator/blob/master/pkg/scheduler/scheduler.go)
7. TiDB Operator HA predicate [`pkg/scheduler/predicates/ha.go`](https://github.com/pingcap/tidb-operator/blob/master/pkg/scheduler/predicates/ha.go)
8. Kubernetes Scheduler Plugins [repo](https://github.com/kubernetes-sigs/scheduler-plugins)
