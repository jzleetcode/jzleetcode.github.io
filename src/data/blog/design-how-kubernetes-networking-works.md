---
author: JZ
pubDatetime: 2026-08-15T08:00:00Z
modDatetime: 2026-08-15T08:00:00Z
title: System Design - How Kubernetes Networking Works
tags:
  - design-system
  - design-networking
description:
  "How Kubernetes networking works: the flat network model, pod-to-pod communication via CNI plugins, Service abstraction with kube-proxy iptables/IPVS, DNS resolution with CoreDNS, and how packets actually flow from one pod to another."
---

## Table of contents

## Context

When you run containers on a single machine, Docker gives each container a virtual network interface and uses a bridge (`docker0`) to let them talk. This works fine on one host, but what happens when containers are spread across dozens or hundreds of machines?

Kubernetes solves this with a deceptively simple rule: **every pod gets its own IP address, and every pod can reach every other pod directly using that IP — no NAT required**. This is called the "flat network model." It sounds simple, but making it work across physical machines requires several layers of clever networking.

Let's trace how a packet gets from Pod A on Node 1 to Pod B on Node 2.

## The Three Levels of Kubernetes Networking

Kubernetes networking breaks down into three distinct problems:

```
  Level 1: Pod-to-Pod (within a node)
  Level 2: Pod-to-Pod (across nodes)
  Level 3: Pod-to-Service (virtual IP abstraction)

  +--Node 1---------------------------+    +--Node 2---------------------------+
  |                                    |    |                                    |
  |  +-------+  +-------+  +-------+  |    |  +-------+  +-------+  +-------+  |
  |  | Pod A |  | Pod B |  | Pod C |  |    |  | Pod D |  | Pod E |  | Pod F |  |
  |  |10.1.1.|  |10.1.1.|  |10.1.1.|  |    |  |10.1.2.|  |10.1.2.|  |10.1.2.|  |
  |  |  2    |  |  3    |  |  4    |  |    |  |  2    |  |  3    |  |  4    |  |
  |  +---+---+  +---+---+  +---+---+  |    |  +---+---+  +---+---+  +---+---+  |
  |      |          |          |       |    |      |          |          |       |
  |  +---+----------+----------+---+   |    |  +---+----------+----------+---+   |
  |  |        cbr0 (bridge)        |   |    |  |        cbr0 (bridge)        |   |
  |  |        10.1.1.1             |   |    |  |        10.1.2.1             |   |
  |  +-------------+---------------+   |    |  +-------------+---------------+   |
  |                |                   |    |                |                   |
  |  +-------------+---------------+   |    |  +-------------+---------------+   |
  |  |         eth0                |   |    |  |         eth0                |   |
  |  |      192.168.1.10           |   |    |  |      192.168.1.11           |   |
  |  +-------------+---------------+   |    |  +-------------+---------------+   |
  +----------------|-------------------+    +----------------|-------------------+
                   |                                         |
         +---------+-----------------------------------------+----------+
         |                    Physical Network                           |
         +--------------------------------------------------------------+
```

Each node gets a **pod CIDR** (e.g., `10.1.1.0/24` for Node 1, `10.1.2.0/24` for Node 2). Pods on a node get IPs from that node's range.

## Level 1: Pod-to-Pod on the Same Node

On a single node, Kubernetes uses a **Linux bridge** (often called `cbr0` or `cni0`) to connect pod network namespaces. Each pod gets a **veth pair** — one end inside the pod's network namespace, the other plugged into the bridge.

```
  Pod A (netns: pod-a)                      Pod B (netns: pod-b)
  +------------------+                      +------------------+
  |  eth0 (10.1.1.2) |                      |  eth0 (10.1.1.3) |
  +--------+---------+                      +--------+---------+
           |                                         |
       veth-pod-a                                veth-pod-b
           |                                         |
  +--------+-----------------------------------------+---------+
  |                    cbr0 bridge (10.1.1.1)                   |
  +-------------------------------------------------------------+
```

When Pod A sends a packet to Pod B (10.1.1.3):

1. The packet leaves Pod A's `eth0` (which is actually the veth pair endpoint inside the namespace)
2. It arrives at `veth-pod-a` on the host side
3. The bridge sees the destination MAC in its forwarding table
4. The bridge sends it out `veth-pod-b`
5. It arrives at Pod B's `eth0`

This is essentially the same as two computers plugged into the same Ethernet switch. No routing or NAT — pure Layer 2 forwarding.

### What is a veth pair?

A **virtual Ethernet pair** is a Linux kernel construct: two virtual NICs connected by an invisible cable. Whatever goes in one end comes out the other. Kubernetes puts one end inside a pod's network namespace and the other in the host namespace (attached to the bridge).

```bash
# See veth pairs on a node:
$ ip link show type veth
5: vethab12@if4: <BROADCAST,MULTICAST,UP> mtu 1500 ... link-netns pod-a
7: vethcd34@if6: <BROADCAST,MULTICAST,UP> mtu 1500 ... link-netns pod-b
```

## Level 2: Pod-to-Pod Across Nodes

When Pod A (10.1.1.2 on Node 1) talks to Pod D (10.1.2.2 on Node 2), the packet must cross the physical network. The bridge doesn't know about 10.1.2.x, so the packet goes to the node's routing table.

This is where **CNI plugins** come in. CNI (Container Network Interface) is a specification that defines how networking is set up for containers. The kubelet calls the CNI plugin when creating/deleting pods.

Different CNI plugins solve cross-node routing differently:

### Approach 1: Overlay Networks (Flannel VXLAN, Calico IPIP)

The packet is **encapsulated** inside another packet. The outer packet uses the host IPs that the physical network already knows how to route.

```
  Original packet (inside):
  +---------------------------------------------------+
  | Src: 10.1.1.2 (Pod A)  Dst: 10.1.2.2 (Pod D)    |
  | [application data]                                 |
  +---------------------------------------------------+

  Encapsulated (VXLAN outer):
  +---------------------------------------------------+
  | Outer Src: 192.168.1.10  Outer Dst: 192.168.1.11 |
  | UDP port 4789 (VXLAN)                              |
  | VXLAN header (VNI identifies the virtual network) |
  |  +-----------------------------------------------+|
  |  | Src: 10.1.1.2  Dst: 10.1.2.2                 ||
  |  | [application data]                             ||
  |  +-----------------------------------------------+|
  +---------------------------------------------------+
```

The flow:
1. Pod A sends to 10.1.2.2
2. Node 1's routing table says: "10.1.2.0/24 → via flannel.1 device"
3. The `flannel.1` VXLAN device wraps the packet in UDP (port 4789) with outer headers using real node IPs
4. Physical network routes the outer packet to Node 2
5. Node 2's `flannel.1` device decapsulates → original packet arrives at cbr0
6. Bridge delivers to Pod D

**Tradeoff:** Works on any network (even across clouds), but adds ~50 bytes overhead per packet and slightly increases latency due to encapsulation/decapsulation.

### Approach 2: Native Routing (Calico BGP, Cilium native)

No encapsulation. Instead, the CNI plugin programs **routes directly** into the network infrastructure.

With Calico in BGP mode, each node runs a BGP agent (`bird`) that announces its pod CIDR to the network routers:

```
  Node 1 announces via BGP:
    "I can reach 10.1.1.0/24 via 192.168.1.10"

  Node 2 announces via BGP:
    "I can reach 10.1.2.0/24 via 192.168.1.11"

  Router / Switch:
    routing table:
      10.1.1.0/24 → 192.168.1.10
      10.1.2.0/24 → 192.168.1.11
```

The flow:
1. Pod A sends to 10.1.2.2
2. Node 1's route says: "10.1.2.0/24 → via 192.168.1.11"
3. Packet goes out eth0 with next-hop 192.168.1.11
4. Network routes it to Node 2
5. Node 2 routes it to Pod D

**Tradeoff:** No overhead, line-rate performance, but requires the physical network to participate (must support BGP or allow custom routes).

### Approach 3: Cloud Provider Routes (AWS VPC CNI, GKE)

In cloud environments, the CNI plugin uses the cloud's API to program routes in the virtual network (VPC). AWS VPC CNI is special — it assigns **actual VPC IPs** to pods by attaching secondary IPs to the node's Elastic Network Interface:

```
  Node 1 (i-abc123):
    ENI primary:   192.168.1.10
    ENI secondary: 10.1.1.2, 10.1.1.3, 10.1.1.4  (pod IPs)

  VPC route table already knows how to reach any VPC IP.
  No overlay. No BGP. Just native VPC routing.
```

**Tradeoff:** Best performance and simplest debugging, but limited by cloud ENI/IP quotas and locks you to one provider.

## Level 3: Service Networking (The Virtual IP Layer)

Pods are ephemeral — they come and go. You don't want to hard-code `10.1.2.2` in your application. Kubernetes **Services** provide a stable virtual IP (ClusterIP) that load-balances across healthy pods.

```
  apiVersion: v1
  kind: Service
  metadata:
    name: my-app
  spec:
    selector:
      app: my-app       # matches pods with this label
    ports:
      - port: 80
        targetPort: 8080
    clusterIP: 10.96.0.15   # stable virtual IP
```

When any pod connects to `10.96.0.15:80`, the packet is transparently redirected to one of the backing pods on port 8080. But `10.96.0.15` doesn't exist on any network interface — no device answers ARP for it. So how does it work?

### kube-proxy: The Packet Rewriter

`kube-proxy` runs on every node and watches the Kubernetes API for Service and Endpoint changes. It programs rules that intercept packets destined for service IPs and redirect them to real pod IPs.

It supports three modes:

#### iptables mode (default)

kube-proxy writes iptables rules that use **DNAT** (Destination NAT) to rewrite the service IP to a pod IP:

```
  Packet from Pod A to service 10.96.0.15:80

  iptables chain KUBE-SERVICES:
    -d 10.96.0.15/32 -p tcp --dport 80 → jump KUBE-SVC-XXXXX

  chain KUBE-SVC-XXXXX (load balancing):
    statistic mode random probability 0.333 → jump KUBE-SEP-AAA
    statistic mode random probability 0.500 → jump KUBE-SEP-BBB
    → jump KUBE-SEP-CCC

  chain KUBE-SEP-AAA:
    -j DNAT --to-destination 10.1.1.5:8080

  chain KUBE-SEP-BBB:
    -j DNAT --to-destination 10.1.2.3:8080

  chain KUBE-SEP-CCC:
    -j DNAT --to-destination 10.1.2.7:8080
```

The probability math gives equal distribution: first rule hits 1/3 of the time, second hits 1/2 of the remaining (= 1/3 total), last gets everything else (= 1/3).

```
  Before DNAT:
    Src: 10.1.1.2   Dst: 10.96.0.15:80

  After DNAT:
    Src: 10.1.1.2   Dst: 10.1.2.3:8080

  conntrack remembers this mapping so replies get un-DNAT'd:
    Reply: Src: 10.1.2.3:8080  Dst: 10.1.1.2
    → rewritten to: Src: 10.96.0.15:80  Dst: 10.1.1.2
```

**Tradeoff:** Proven and stable, but iptables rules scale O(n) — with 10,000 services, the kernel must evaluate thousands of rules linearly for each new connection.

#### IPVS mode

IPVS (IP Virtual Server) is a kernel-level L4 load balancer built into Linux. kube-proxy creates an IPVS virtual server for each ClusterIP:

```bash
$ ipvsadm -Ln
TCP  10.96.0.15:80 rr        # round-robin
  -> 10.1.1.5:8080    Masq   weight 1
  -> 10.1.2.3:8080    Masq   weight 1
  -> 10.1.2.7:8080    Masq   weight 1
```

IPVS uses hash tables internally, giving **O(1) lookup** regardless of how many services exist. It also supports multiple load-balancing algorithms (round-robin, least connections, weighted).

#### nftables mode (Kubernetes 1.31+)

The successor to iptables mode. Uses the newer nftables framework which has better performance characteristics for large rule sets and supports sets/maps natively.

## DNS: Making Services Human-Friendly

Pods don't use service IPs directly — they use DNS names. **CoreDNS** runs as pods in the cluster and serves DNS for the `cluster.local` zone.

```
  Service: my-app in namespace "production"

  DNS records created automatically:
    my-app.production.svc.cluster.local → 10.96.0.15 (ClusterIP)

  Pod resolv.conf (injected by kubelet):
    nameserver 10.96.0.10        # CoreDNS service IP
    search production.svc.cluster.local svc.cluster.local cluster.local
```

When Pod A does `curl http://my-app:80`:

1. Pod's resolver appends search domains → queries `my-app.production.svc.cluster.local`
2. Query goes to CoreDNS (10.96.0.10) — which is itself a service backed by CoreDNS pods!
3. CoreDNS looks up the Service object in its watch cache → returns `10.96.0.15`
4. Pod A connects to `10.96.0.15:80`
5. kube-proxy DNAT rewrites to a real pod IP
6. Packet flows via CNI to the destination pod

### Headless Services

Sometimes you want to bypass the load balancer and discover all pod IPs directly (e.g., for a database cluster where each pod has unique state):

```yaml
  spec:
    clusterIP: None    # headless: no virtual IP
    selector:
      app: my-db
```

DNS for a headless service returns **all pod IPs** as A records, and creates individual records per pod:

```
  my-db.production.svc.cluster.local → 10.1.1.5, 10.1.2.3, 10.1.2.7

  my-db-0.my-db.production.svc.cluster.local → 10.1.1.5
  my-db-1.my-db.production.svc.cluster.local → 10.1.2.3
  my-db-2.my-db.production.svc.cluster.local → 10.1.2.7
```

## Putting It All Together: A Complete Packet Journey

Let's trace a full request from Pod A (10.1.1.2 on Node 1) calling service `my-app` which resolves to Pod D (10.1.2.2 on Node 2):

```
  Pod A                                         Pod D
  (10.1.1.2, Node 1)                           (10.1.2.2, Node 2)
       |                                             ^
       | 1. DNS: "my-app" → 10.96.0.15              |
       |                                             |
       | 2. connect(10.96.0.15:80)                   |
       v                                             |
  [iptables/IPVS on Node 1]                         |
       |                                             |
       | 3. DNAT: dst → 10.1.2.2:8080               |
       v                                             |
  [routing table on Node 1]                         |
       |                                             |
       | 4. "10.1.2.0/24 → via VXLAN/BGP/VPC"       |
       v                                             |
  [CNI: encapsulate or route]                       |
       |                                             |
       | 5. physical network transit                 |
       v                                             |
  [Node 2: decapsulate or receive]                  |
       |                                             |
       | 6. route to cbr0 → veth → Pod D            |
       +---------------------------------------------+
```

Steps in detail:
1. CoreDNS resolves `my-app` → ClusterIP `10.96.0.15`
2. Pod A opens a TCP connection to `10.96.0.15:80`
3. iptables/IPVS on Node 1 rewrites destination to `10.1.2.2:8080` (conntrack records the mapping)
4. Node 1's routing table knows Pod D's subnet is reachable via the CNI path
5. Depending on the CNI: VXLAN encapsulates it, BGP sends it natively, or VPC routes it
6. Node 2 delivers the packet to Pod D's network namespace via the bridge

The reply follows the reverse path, with conntrack un-DNATing at Node 1 so Pod A sees the response from `10.96.0.15:80`.

## Network Policies: The Firewall Layer

By default, all pods can talk to all other pods (the flat network). **NetworkPolicy** resources act like per-pod firewalls:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-only-frontend
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: my-api         # applies to my-api pods
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend   # only frontend pods can reach my-api
      ports:
        - port: 8080
```

The CNI plugin (not kube-proxy) enforces these. Calico uses iptables rules per pod; Cilium uses eBPF programs attached to pod veth interfaces. If your CNI doesn't support NetworkPolicy (e.g., basic Flannel), the resources are silently ignored.

## Key Source Code Entry Points

For readers who want to explore the implementation:

- **CNI plugin interface:** [`containernetworking/cni`](https://github.com/containernetworking/cni) — the spec and library that kubelet calls
- **kube-proxy iptables mode:** [`kubernetes/kubernetes` `pkg/proxy/iptables/proxier.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/proxy/iptables/proxier.go) — `syncProxyRules()` is the main loop
- **kube-proxy IPVS mode:** [`pkg/proxy/ipvs/proxier.go`](https://github.com/kubernetes/kubernetes/blob/master/pkg/proxy/ipvs/proxier.go)
- **CoreDNS kubernetes plugin:** [`coredns/coredns` `plugin/kubernetes/`](https://github.com/coredns/coredns/tree/master/plugin/kubernetes) — watches Services/Endpoints and serves DNS
- **Calico networking:** [`projectcalico/calico` `felix/`](https://github.com/projectcalico/calico/tree/master/felix) — programs iptables/eBPF rules per endpoint
- **Cilium datapath:** [`cilium/cilium` `bpf/`](https://github.com/cilium/cilium/tree/main/bpf) — eBPF programs that handle pod networking and policy

## Summary

| Layer | Problem | Solution |
|-------|---------|----------|
| Pod-to-Pod (same node) | Connect containers on one host | Linux bridge + veth pairs |
| Pod-to-Pod (across nodes) | Route between host subnets | CNI plugins (overlay/BGP/cloud) |
| Service → Pod | Stable IP + load balancing | kube-proxy (iptables/IPVS) |
| DNS | Human-friendly names | CoreDNS watching the API |
| Policy | Network segmentation | CNI-enforced NetworkPolicy |

The beauty of Kubernetes networking is that each layer is **pluggable**: you can swap the CNI, choose your kube-proxy mode, or replace CoreDNS — as long as the contract is met (every pod gets an IP, every pod can reach every other pod), the rest of the system doesn't care how it's implemented.

## References

- [Kubernetes Networking Model](https://kubernetes.io/docs/concepts/services-networking/) — Official documentation
- [The Kubernetes Network Model](https://kubernetes.io/docs/concepts/cluster-administration/networking/) — Design principles
- [CNI Specification](https://github.com/containernetworking/cni/blob/main/SPEC.md) — Container Network Interface spec
- [Life of a Packet in Kubernetes](https://www.youtube.com/watch?v=0Omvgd7Hg1I) — KubeCon talk by Ricardo Katz
- [Understanding Kubernetes Networking](https://speakerdeck.com/thockin/illustrated-guide-to-kubernetes-networking) — Tim Hockin's slides (Google)
- [Calico Architecture](https://docs.tigera.io/calico/latest/reference/architecture/overview) — How Calico implements networking and policy
- [Cilium Documentation](https://docs.cilium.io/en/stable/network/concepts/) — eBPF-based networking explained
