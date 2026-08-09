---
author: JZ
pubDatetime: 2026-08-09T06:00:00Z
modDatetime: 2026-08-09T06:00:00Z
title: System Design - How Kubernetes Pod Scheduling Works
tags:
  - design-system
  - design-infrastructure
description:
  "How Kubernetes pod scheduling works: the scheduling queue, filtering (predicates), scoring (priorities), binding, preemption, and a source code walkthrough from the kubernetes/kubernetes repository."
---

## Table of contents

## Context

In a single machine, running a process is simple: the OS scheduler picks a CPU core and runs it. In a Kubernetes cluster, you have dozens or hundreds of machines (nodes), each with different amounts of CPU, memory, disk, and specialized hardware (GPUs, local SSDs). When you ask Kubernetes to run a pod, it must decide: **which node should this pod run on?**

This is the job of the **kube-scheduler**. It's harder than it sounds because:

- **Resources are heterogeneous.** Node A might have 64 CPUs and 256GB RAM. Node B might have 8 CPUs, 32GB RAM, but a GPU. Not every pod fits on every node.
- **Constraints are complex.** A pod might need a specific kernel version, must be co-located with (or kept away from) another pod, requires a particular storage class, or can only run in certain availability zones.
- **Decisions are global.** Unlike the OS scheduler (which picks from local run queues), kube-scheduler must consider the entire cluster state for every scheduling decision.
- **Efficiency matters.** A poor placement wastes resources (a tiny pod on a beefy node), creates hotspots (too many pods on one node), or causes cascading failures (all replicas on the same rack).

Let's follow a single pod from creation to running on a node, tracing through the scheduler's code.

```
                     Kubernetes Cluster Architecture

  +-------------------+
  |    User / CI      |
  | kubectl apply -f  |
  +--------+----------+
           |
           v
  +--------+----------+
  |   API Server      |    (etcd-backed, source of truth)
  +--------+----------+
           |
     +-----+------+-------------------+
     |            |                    |
     v            v                    v
+---------+  +---------+      +-----------------+
| kube-   |  | kube-   |      |  kube-scheduler |
|controller| |  proxy  |      |  (this article) |
| manager |  |         |      +--------+--------+
+---------+  +---------+               |
                                       | Bind(pod, node)
     +----------+----------+-----------+
     |          |          |
     v          v          v
  +------+  +------+  +------+
  |Node A|  |Node B|  |Node C|   each running kubelet
  |      |  |      |  |      |
  +------+  +------+  +------+
```

When you `kubectl apply` a pod spec, the API server stores it in etcd with `spec.nodeName` empty. The scheduler watches for these unscheduled pods, decides where they belong, and writes the node assignment back. Then the kubelet on that node sees the assignment and actually starts the containers.

## The Scheduling Framework

Since Kubernetes 1.19, the scheduler uses a **Scheduling Framework** — a plugin-based architecture that structures the scheduling decision into well-defined extension points. This replaced the older "predicate + priority" functions but the concepts are the same.

```
  Pod arrives (unscheduled)
        |
        v
  +------------------+
  |  Scheduling      |     Sort pods by priority, arrival time
  |  Queue           |
  +--------+---------+
           |
           v
  +------------------+
  | PreFilter        |     Compute per-pod state needed by filters
  +--------+---------+
           |
           v
  +------------------+
  | Filter           |     Remove nodes that cannot run this pod
  | (predicates)     |     e.g., insufficient CPU, wrong zone
  +--------+---------+
           |
           v
  +------------------+
  | PostFilter       |     If no nodes passed: try preemption
  +--------+---------+
           |
           v
  +------------------+
  | PreScore         |     Compute per-pod state needed by scorers
  +--------+---------+
           |
           v
  +------------------+
  | Score            |     Rank the surviving nodes 0-100
  | (priorities)     |     e.g., prefer least-loaded, spread
  +--------+---------+
           |
           v
  +------------------+
  | NormalizeScore   |     Normalize plugin scores to [0, 100]
  +--------+---------+
           |
           v
  +------------------+
  | Reserve          |     Optimistically claim resources
  +--------+---------+
           |
           v
  +------------------+
  | Bind             |     Write nodeName to the pod in API server
  +--------+---------+
           |
           v
  Pod is scheduled. Kubelet takes over.
```

The source code for the framework lives in [`pkg/scheduler/framework/`](https://github.com/kubernetes/kubernetes/tree/master/pkg/scheduler/framework). The main interface is defined in [`pkg/scheduler/framework/interface.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/framework/interface.go).

## The Scheduling Queue

Before a pod can be scheduled, it enters the **scheduling queue**. This isn't a simple FIFO — it's a priority queue that considers:

1. **Pod priority** (from `PriorityClass`): Higher-priority pods are scheduled first.
2. **Timestamp**: Among pods of equal priority, earlier arrivals go first.

The queue implementation lives in [`pkg/scheduler/internal/queue/scheduling_queue.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/internal/queue/scheduling_queue.go). It actually maintains three sub-queues:

```
  +------------------------------------------------------+
  |              Scheduling Queue                        |
  |                                                      |
  |  +------------------+                                |
  |  | ActiveQ          |  Ready to be scheduled.        |
  |  | (priority heap)  |  Popped one at a time.         |
  |  +------------------+                                |
  |                                                      |
  |  +------------------+                                |
  |  | BackoffQ         |  Recently failed scheduling.   |
  |  | (priority heap)  |  Waiting for backoff timer.    |
  |  +------------------+                                |
  |                                                      |
  |  +------------------+                                |
  |  | Unschedulable    |  Cannot be scheduled now       |
  |  | (map)            |  (e.g., no node has enough     |
  |  |                  |   resources). Re-queued when    |
  |  |                  |   cluster state changes.        |
  |  +------------------+                                |
  +------------------------------------------------------+
```

- **ActiveQ:** Pods ready to be scheduled. The scheduler pops the highest-priority pod from here.
- **BackoffQ:** Pods that recently failed to schedule. They wait with exponential backoff before moving back to ActiveQ.
- **Unschedulable:** Pods that have no hope of scheduling with the current cluster state. They move back to ActiveQ when relevant events happen (e.g., a new node joins, a pod is deleted and frees resources).

The scheduler's main loop is straightforward. From [`pkg/scheduler/scheduler.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/scheduler.go):

```go
func (sched *Scheduler) scheduleOne(ctx context.Context) {
    // 1. Pop the next pod from the queue
    podInfo, err := sched.NextPod(ctx)
    if err != nil {
        return
    }
    pod := podInfo.Pod

    // 2. Run the scheduling cycle (filter + score)
    scheduleResult, err := sched.schedulingCycle(ctx, state, pod, ...)
    if err != nil {
        // Handle failure (maybe trigger preemption)
        sched.handleSchedulingFailure(ctx, pod, err, ...)
        return
    }

    // 3. Run the binding cycle (async)
    go func() {
        err := sched.bindingCycle(ctx, state, scheduleResult, pod, ...)
        if err != nil {
            sched.handleSchedulingFailure(ctx, pod, err, ...)
        }
    }()
}
```

The scheduler processes one pod at a time in the scheduling cycle but runs binding asynchronously so it can start scheduling the next pod without waiting for the API server write to complete.

## Filtering: Which Nodes Can Run This Pod?

Filtering (historically called "predicates") removes nodes that are fundamentally incompatible with the pod. A node must pass **every** filter plugin to remain a candidate. If it fails even one, it's eliminated.

The built-in filter plugins (in [`pkg/scheduler/framework/plugins/`](https://github.com/kubernetes/kubernetes/tree/master/pkg/scheduler/framework/plugins)) include:

```
  Filter Plugin           What It Checks
  ---------------------  ----------------------------------------
  NodeResourcesFit       Does the node have enough CPU + memory?
  NodePorts              Are the requested host ports available?
  NodeAffinity           Does the node match the pod's nodeSelector
                         or nodeAffinity rules?
  TaintToleration        Does the pod tolerate the node's taints?
  PodTopologySpread      Would placing here violate topology
                         spread constraints?
  VolumeBinding          Can the requested PVCs be bound on this
                         node?
  InterPodAffinity       Does this placement satisfy pod affinity/
                         anti-affinity rules?
  NodeUnschedulable      Is the node cordoned?
```

Let's look at the most common one — `NodeResourcesFit`. From [`pkg/scheduler/framework/plugins/noderesources/fit.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/framework/plugins/noderesources/fit.go):

```go
func (f *Fit) Filter(ctx context.Context, state *framework.CycleState,
    pod *v1.Pod, nodeInfo *framework.NodeInfo) *framework.Status {

    insufficientResources := fitsRequest(pod, nodeInfo, f.enableInPlacePodVerticalScaling)

    if len(insufficientResources) != 0 {
        // Return which resources are insufficient
        failureReasons := make([]string, 0, len(insufficientResources))
        for _, r := range insufficientResources {
            failureReasons = append(failureReasons, r.Reason)
        }
        return framework.NewStatus(framework.Unschedulable, failureReasons...)
    }
    return nil
}
```

The `fitsRequest` function compares the pod's resource requests against the node's allocatable capacity minus already-allocated resources:

```
  Node capacity check:

  Node A: 4 CPU, 16Gi memory (allocatable)
  Already scheduled pods using: 3.2 CPU, 12Gi memory

  Remaining: 0.8 CPU, 4Gi memory

  New pod requests: 1 CPU, 2Gi memory
  --> FAIL (needs 1 CPU but only 0.8 available)

  Node B: 8 CPU, 32Gi memory (allocatable)
  Already scheduled pods using: 2 CPU, 8Gi memory

  Remaining: 6 CPU, 24Gi memory

  New pod requests: 1 CPU, 2Gi memory
  --> PASS
```

**Important:** Kubernetes schedules based on **requests**, not limits. A pod's `resources.requests` is what the scheduler uses to decide if a pod fits. The `resources.limits` field is enforced at runtime by the kubelet and cgroup mechanisms but does not affect scheduling decisions.

### Optimization: Not Checking Every Node

In large clusters (thousands of nodes), running every filter on every node is expensive. The scheduler uses a **percentage-based shortcut**: once it finds enough feasible nodes, it stops filtering. The threshold is configurable via `percentageOfNodesToScore` (default: scales with cluster size, minimum 5% for clusters above 5000 nodes).

From [`pkg/scheduler/schedule_one.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/schedule_one.go):

```go
func (sched *Scheduler) findNodesThatFitPod(ctx context.Context, ...) ([]*framework.NodeInfo, error) {
    // Determine how many nodes to evaluate
    numNodesToFind := sched.numFeasibleNodesToFind(
        sched.percentageOfNodesToScore, int32(numAllNodes))

    // Run filters in parallel across nodes
    feasibleNodes, err := sched.findNodesThatPassFilters(ctx, pod, status, nodes, numNodesToFind)
    ...
}
```

Nodes are evaluated in a round-robin starting position that rotates each scheduling cycle, ensuring all nodes get a chance to be considered over time even when only a subset is checked per pod.

## Scoring: Which Node Is Best?

After filtering, we have a list of nodes that **can** run the pod. Scoring ranks them to find the **best** one. Each scoring plugin assigns a score from 0 to 100 for each node, and scores are weighted and summed.

The built-in scoring plugins include:

```
  Score Plugin              What It Optimizes
  -----------------------  ----------------------------------------
  NodeResourcesBalancedAllocation
                            Prefer nodes where CPU/memory usage
                            is balanced (avoid one maxed, one idle)
  NodeResourcesFit          Prefer nodes with most/least resources
                            (configurable: LeastAllocated,
                             MostAllocated, RequestedToCapacityRatio)
  InterPodAffinity          Prefer nodes that satisfy soft affinity
  PodTopologySpread         Prefer nodes that improve spread
  TaintToleration           Prefer nodes with fewer tolerations needed
  ImageLocality             Prefer nodes that already have the
                            container image cached
```

The scoring loop from the framework:

```go
func (f *frameworkImpl) RunScorePlugins(ctx context.Context,
    state *framework.CycleState, pod *v1.Pod,
    nodes []*framework.NodeInfo) ([]framework.NodePluginScores, *framework.Status) {

    pluginToNodeScores := make([]framework.NodePluginScores, len(nodes))

    // Run each scoring plugin on each node
    for _, pl := range f.scorePlugins {
        for i, nodeInfo := range nodes {
            score, status := pl.Score(ctx, state, pod, nodeInfo.Node().Name)
            pluginToNodeScores[i].Scores = append(pluginToNodeScores[i].Scores,
                framework.PluginScore{Name: pl.Name(), Score: score})
        }
        // Normalize scores to [0, 100]
        pl.ScoreExtensions().NormalizeScore(ctx, state, pod, pluginToNodeScores)
    }

    // Weighted sum
    for i := range nodes {
        var totalScore int64
        for _, ps := range pluginToNodeScores[i].Scores {
            totalScore += ps.Score * ps.Weight
        }
        pluginToNodeScores[i].TotalScore = totalScore
    }
    return pluginToNodeScores, nil
}
```

Let's trace through an example with the `LeastAllocated` strategy (the default):

```
  Scoring example (LeastAllocated):

  Pod requests: 1 CPU, 2Gi memory

  Node B: 6 CPU free / 8 total, 24Gi free / 32 total
    CPU score:  (6 - 1) / 8 * 100 = 62
    Mem score:  (24 - 2) / 32 * 100 = 68
    Average: (62 + 68) / 2 = 65

  Node C: 2 CPU free / 4 total, 6Gi free / 8 total
    CPU score:  (2 - 1) / 4 * 100 = 25
    Mem score:  (6 - 2) / 8 * 100 = 50
    Average: (25 + 50) / 2 = 37

  Winner: Node B (score 65 > 37)
  Rationale: Node B has more headroom; placing the pod there
             keeps the cluster more balanced.
```

If multiple nodes tie at the highest score, the scheduler picks one at random. This avoids pathological patterns where the same node always wins.

## Binding: Committing the Decision

Once a node is selected, the scheduler **binds** the pod to the node. This happens in two steps:

1. **Reserve:** Mark the resources as claimed in the scheduler's in-memory cache (so the next pod scheduled in parallel doesn't double-book the same capacity).
2. **Bind:** Write the decision to the API server (set `pod.spec.nodeName`).

The binding call from [`pkg/scheduler/framework/plugins/defaultbinder/default_binder.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/framework/plugins/defaultbinder/default_binder.go):

```go
func (b DefaultBinder) Bind(ctx context.Context, state *framework.CycleState,
    p *v1.Pod, nodeName string) *framework.Status {

    binding := &v1.Binding{
        ObjectMeta: metav1.ObjectMeta{
            Namespace: p.Namespace,
            Name:      p.Name,
            UID:       p.UID,
        },
        Target: v1.ObjectReference{
            Kind: "Node",
            Name: nodeName,
        },
    }
    err := b.handle.ClientSet().CoreV1().Pods(binding.Namespace).
        Bind(ctx, binding, metav1.CreateOptions{})
    if err != nil {
        return framework.AsStatus(err)
    }
    return nil
}
```

Once the API server accepts the bind, the kubelet on the target node sees the pod and starts pulling images, setting up volumes, and launching containers.

```
  Timeline of a pod going from "pending" to "running":

  t=0     User creates pod (spec.nodeName = "")
  t=1ms   Scheduler picks it from the queue
  t=2ms   Filter: 3 of 10 nodes pass
  t=3ms   Score: Node B wins with score 65
  t=4ms   Reserve: scheduler cache updated
  t=5ms   Bind: API server write (async)
  t=15ms  API server confirms bind
  t=16ms  kubelet on Node B sees the pod
  t=17ms  kubelet starts pulling image
  t=30s   Container is running (image pull time dominates)
```

## Preemption: Making Room for High-Priority Pods

What happens when **no node** passes the filter phase? The pod cannot be scheduled. If the pod has a higher priority than some already-running pods, the scheduler can **preempt** — evict lower-priority pods to make room.

Preemption runs in the `PostFilter` phase. The logic lives in [`pkg/scheduler/framework/plugins/defaultpreemption/default_preemption.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/framework/plugins/defaultpreemption/default_preemption.go).

The algorithm:

```
  Preemption algorithm:

  1. For each node, simulate removing lower-priority pods one by one
     until the incoming pod would fit (re-run filters).

  2. Among nodes where preemption is possible, pick the one that:
     a. Evicts the fewest pods
     b. Among ties, evicts pods with the lowest priority
     c. Among ties, pick the node with the highest score

  3. Mark the victim pods for deletion (set their
     status.nominatedNodeName so they know why they died).

  4. The incoming pod enters a "nominated" state — it waits for
     the victims to actually terminate before being re-scheduled.
```

```
  Preemption example:

  Pod X (priority=100) needs 4 CPU. No node has 4 free.

  Node A: 8 CPU total, 7 used by:
    Pod P1 (priority=50, requests 2 CPU)
    Pod P2 (priority=30, requests 3 CPU)
    Pod P3 (priority=80, requests 2 CPU)

  Simulate evicting lowest-priority first:
    Remove P2 (priority=30): frees 3 CPU. Total free: 4 CPU. Fits!
    --> Only need to evict P2.

  Node B: 4 CPU total, 4 used by:
    Pod P4 (priority=90, requests 4 CPU)

  Simulate: P4 has priority 90 < 100, so it's a candidate.
    Remove P4: frees 4 CPU. Fits!
    --> Need to evict P4.

  Compare: Node A evicts 1 pod (priority 30).
           Node B evicts 1 pod (priority 90).
  Pick Node A (evicts lower-priority victim).
```

Important constraints on preemption:
- **PodDisruptionBudget (PDB)** is respected — the scheduler won't preempt if it would violate a PDB.
- **Graceful termination** — victims get their `terminationGracePeriodSeconds` to shut down cleanly.
- **No cascading preemption** — a preemptor that is itself pending will not cause further preemption.

## The Scheduler Cache

The scheduler maintains an in-memory cache of the cluster state to avoid hitting the API server for every scheduling decision. This cache lives in [`pkg/scheduler/internal/cache/cache.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/internal/cache/cache.go).

```
  +--------------------------------------------------+
  |            Scheduler Cache                       |
  |                                                  |
  |  nodeInfoMap:                                    |
  |    "node-a" -> NodeInfo{                         |
  |      Allocatable: {CPU: 8, Mem: 32Gi}           |
  |      Requested:   {CPU: 3.2, Mem: 12Gi}         |
  |      Pods: [pod1, pod2, pod3]                    |
  |    }                                             |
  |    "node-b" -> NodeInfo{...}                     |
  |    "node-c" -> NodeInfo{...}                     |
  |                                                  |
  |  assumedPods:                                    |
  |    set of pods that are "reserved" but not       |
  |    yet confirmed by the API server               |
  |                                                  |
  +--------------------------------------------------+
```

The "assumed pods" concept is important for parallelism. When the scheduler binds a pod (asynchronously), it immediately marks the pod as "assumed" in the cache. This means the next scheduling decision accounts for this pod's resource usage even before the API server confirms the bind. If the bind fails, the assumed pod is removed from the cache and retried.

## Extending the Scheduler

The plugin architecture makes the scheduler highly extensible. You can write custom plugins that hook into any extension point. A plugin implements one or more interfaces:

```go
// From pkg/scheduler/framework/interface.go

type FilterPlugin interface {
    Plugin
    Filter(ctx context.Context, state *CycleState, pod *v1.Pod,
        nodeInfo *NodeInfo) *Status
}

type ScorePlugin interface {
    Plugin
    Score(ctx context.Context, state *CycleState, pod *v1.Pod,
        nodeName string) (int64, *Status)
    ScoreExtensions() ScoreExtensions
}
```

Common reasons to extend the scheduler:
- **GPU scheduling** — consider GPU type, memory, and topology.
- **Cost optimization** — prefer spot instances over on-demand.
- **Data locality** — schedule pods near their data (important for Spark, Flink).
- **Custom balancing** — spread pods across custom failure domains.

You register plugins via the scheduler configuration (`KubeSchedulerConfiguration`):

```yaml
apiVersion: kubescheduler.config.k8s.io/v1
kind: KubeSchedulerConfiguration
profiles:
  - schedulerName: default-scheduler
    plugins:
      filter:
        enabled:
          - name: MyCustomFilter
      score:
        enabled:
          - name: MyCustomScorer
            weight: 5
```

## Putting It All Together: End-to-End Example

Let's follow a concrete pod through the entire journey:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-server
spec:
  priorityClassName: high-priority  # priority = 1000
  containers:
    - name: nginx
      image: nginx:1.25
      resources:
        requests:
          cpu: "500m"
          memory: "256Mi"
        limits:
          cpu: "1000m"
          memory: "512Mi"
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: topology.kubernetes.io/zone
                operator: In
                values: ["us-east-1a", "us-east-1b"]
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule
      labelSelector:
        matchLabels:
          app: web-server
```

Here is what happens:

```
  Step 1: QUEUE
  +------------------------------------------------------------+
  | Pod "web-server" enters ActiveQ with priority 1000.        |
  | It's popped ahead of default-priority (0) pods.            |
  +------------------------------------------------------------+

  Step 2: FILTER (5 nodes in cluster)
  +------------------------------------------------------------+
  | node-1 (us-east-1a, 4CPU/16Gi):  PASS                     |
  | node-2 (us-east-1a, 4CPU/16Gi):  PASS                     |
  | node-3 (us-east-1b, 8CPU/32Gi):  PASS                     |
  | node-4 (us-east-1c, 8CPU/32Gi):  FAIL (wrong zone)        |
  | node-5 (us-east-1c, 4CPU/16Gi):  FAIL (wrong zone)        |
  +------------------------------------------------------------+
  | NodeAffinity eliminated node-4 and node-5.                 |
  | 3 feasible nodes remain.                                   |
  +------------------------------------------------------------+

  Step 3: SCORE (3 nodes)
  +------------------------------------------------------------+
  | Plugin: NodeResourcesFit (LeastAllocated), weight=1        |
  |   node-1: 60    node-2: 45    node-3: 80                   |
  |                                                            |
  | Plugin: PodTopologySpread, weight=2                        |
  |   (2 existing web-server pods in us-east-1a, 0 in 1b)     |
  |   node-1: 0     node-2: 0     node-3: 100                 |
  |                                                            |
  | Weighted totals:                                           |
  |   node-1: 60*1 + 0*2 = 60                                 |
  |   node-2: 45*1 + 0*2 = 45                                 |
  |   node-3: 80*1 + 100*2 = 280                              |
  +------------------------------------------------------------+
  | Winner: node-3 (us-east-1b) with score 280.               |
  | Rationale: it has the most headroom AND placing here       |
  | balances the topology spread (maxSkew would be violated    |
  | if we placed in us-east-1a).                               |
  +------------------------------------------------------------+

  Step 4: BIND
  +------------------------------------------------------------+
  | Reserve: cache now shows node-3 using +500m CPU, +256Mi    |
  | Bind: PATCH pod/web-server spec.nodeName = "node-3"        |
  | kubelet on node-3 pulls nginx:1.25, starts the container   |
  +------------------------------------------------------------+
```

## Performance: How Fast Is the Scheduler?

The default kube-scheduler can schedule **thousands of pods per second** in a well-configured cluster. Key performance characteristics:

- **Scheduling cycle:** typically 1-5ms per pod (depends on cluster size and plugin complexity).
- **Binding cycle:** 5-20ms (dominated by API server write latency).
- **Parallelism:** Scheduling is serial (one pod at a time), but binding is async. The scheduler starts scheduling the next pod while the previous bind is in flight.

For very large clusters (10,000+ nodes), the `percentageOfNodesToScore` optimization is critical. Without it, scoring 10,000 nodes for each pod would make scheduling take 50-100ms per pod, severely limiting throughput.

```
  Scheduler throughput vs cluster size:

  Cluster size    percentageOfNodesToScore    Approx throughput
  -----------    ------------------------    -----------------
  100 nodes      100% (check all)            ~5000 pods/sec
  1000 nodes     50%                         ~2000 pods/sec
  5000 nodes     10%                         ~1000 pods/sec
  10000 nodes    5%                          ~800 pods/sec
```

## Common Scheduling Problems and Debugging

When a pod is stuck in `Pending`, the scheduler records why in the pod's **Events**:

```bash
kubectl describe pod my-pod

# Events:
#   Type     Reason            Message
#   ----     ------            -------
#   Warning  FailedScheduling  0/5 nodes are available:
#     2 Insufficient cpu, 1 node(s) had taint that the pod
#     didn't tolerate, 2 node(s) didn't match pod topology
#     spread constraints.
```

Common causes:
- **Insufficient resources:** Scale up the cluster or reduce pod requests.
- **Taints without tolerations:** Add the toleration to the pod spec, or remove the taint.
- **Topology spread violations:** Relax `maxSkew` or add nodes in under-represented zones.
- **PVC binding failures:** The requested storage class doesn't exist in the node's zone.
- **Affinity/anti-affinity deadlocks:** Two pods that both require anti-affinity from each other and only one node is available.

You can also check the scheduler's own metrics:

```bash
# Scheduling latency histogram
curl localhost:10259/metrics | grep scheduler_scheduling_algorithm_duration

# Pending pods in the queue
curl localhost:10259/metrics | grep scheduler_pending_pods

# Preemption attempts
curl localhost:10259/metrics | grep scheduler_preemption_attempts_total
```

## References

1. Kubernetes Scheduler documentation [doc](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/)
2. Scheduling Framework design [KEP](https://github.com/kubernetes/enhancements/tree/master/keps/sig-scheduling/624-scheduling-framework)
3. kubernetes/kubernetes scheduler source [`pkg/scheduler/`](https://github.com/kubernetes/kubernetes/tree/master/pkg/scheduler)
4. Scheduling queue implementation [`pkg/scheduler/internal/queue/scheduling_queue.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/internal/queue/scheduling_queue.go)
5. Framework interface [`pkg/scheduler/framework/interface.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/framework/interface.go)
6. NodeResourcesFit plugin [`pkg/scheduler/framework/plugins/noderesources/fit.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/framework/plugins/noderesources/fit.go)
7. Default preemption plugin [`pkg/scheduler/framework/plugins/defaultpreemption/default_preemption.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/framework/plugins/defaultpreemption/default_preemption.go)
8. Scheduler cache [`pkg/scheduler/internal/cache/cache.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/scheduler/internal/cache/cache.go)
9. Pod Priority and Preemption [doc](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/)
10. Topology Spread Constraints [doc](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/)
