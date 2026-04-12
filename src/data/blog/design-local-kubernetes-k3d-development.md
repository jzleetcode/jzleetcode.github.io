---
author: JZ
pubDatetime: 2026-04-12T06:23:00Z
modDatetime: 2026-04-12T06:23:00Z
title: System Design - Local Kubernetes with k3d for Development
tags:
  - design-system
  - design-devtools
description:
  "How to set up a local Kubernetes cluster with k3d for development: cluster creation, port mapping with NodePort, Mac vs Linux access patterns, kubectl port-forward vs NodePort, and why ctr digest errors are harmless."
---

## Table of contents

## Context

You are building an application that runs on Kubernetes in production. Maybe it is a database, a web service, or a data pipeline. You want to test it locally before pushing to a shared staging cluster. Spinning up a full cloud cluster for every code change is slow and expensive. What you really want is a lightweight Kubernetes cluster on your laptop or dev server that behaves close enough to production.

**k3d** solves this. It runs [k3s](https://k3s.io/) (a lightweight Kubernetes distribution by Rancher) inside Docker containers. You get a real Kubernetes API, real pods, real services — all inside Docker, all disposable.

```
  Your Machine (Mac or Linux)
  +----------------------------------------------------+
  |                                                    |
  |  Docker Engine                                     |
  |  +----------------------------------------------+  |
  |  |  k3d cluster ("my-app")                      |  |
  |  |                                              |  |
  |  |  +------------------+  +------------------+  |  |
  |  |  |  k3s server node |  |  k3s agent node  |  |  |
  |  |  |  (control plane) |  |  (worker)        |  |  |
  |  |  |                  |  |                  |  |  |
  |  |  |  your app pods   |  |  your app pods   |  |  |
  |  |  +------------------+  +------------------+  |  |
  |  |                                              |  |
  |  +----------------------------------------------+  |
  |                                                    |
  +----------------------------------------------------+
```

This article walks through how k3d port mapping works, how traffic reaches your application, the differences between Mac and Linux, and a common error message from `ctr` that looks scary but is harmless.

## Creating a k3d Cluster with Port Mappings

The basic command to create a cluster:

```bash
k3d cluster create my-app \
  --api-port 16443 \
  --port "8080:30080@server:0" \
  --port "3000:30300@server:0" \
  --port "9090:30090@server:0"
```

Let's break down what `--port "8080:30080@server:0"` means:

```
  --port "8080:30080@server:0"
           |     |       |    |
           |     |       |    +-- node index (first server node)
           |     |       +------- node role filter
           |     +--------------- container port (NodePort inside k3s)
           +--------------------- host port (what you access)
```

This tells Docker to bind **port 8080 on your host** and forward traffic to **port 30080 inside the k3d container**. Port 30080 is where Kubernetes listens for NodePort traffic. The `@server:0` part means "apply this to the first server node."

The two port numbers live in completely different worlds:

- **Host port** (left, 8080): any free port on your machine.
- **Container port** (right, 30080): must be in the Kubernetes NodePort range, which is **30000–32767** by default.

You could use `30080:30080` if you don't mind accessing your app at `localhost:30080`. You cannot use `8080:8080` because 8080 is outside the NodePort range — Kubernetes won't allocate it without reconfiguring the API server's `--service-node-port-range`.

## How Traffic Flows: NodePort + k3d Port Mapping

Once the cluster is up and your application is deployed, traffic flows through several hops:

```
  browser / curl
       |
       | localhost:8080
       v
  +----------+
  | Docker   |  docker-proxy binds 0.0.0.0:8080
  | proxy    |  on the host machine
  +----+-----+
       |
       | :30080
       v
  +------------------+
  | k3d container    |
  | (k3s node)       |
  |                  |
  |  kube-proxy      |  Kubernetes NodePort listener
  |  routes :30080   |  on port 30080
  |  to Service      |
  +--------+---------+
           |
           v
  +------------------+
  | Service          |  ClusterIP service with
  | (my-app-svc)     |  nodePort: 30080
  +--------+---------+
           |
           v
  +------------------+
  | Pod              |  your application
  | (my-app-xyz)     |  listening on :8080
  +------------------+
```

For this to work, **the Kubernetes Service's `nodePort` must match the container port you told k3d about**. If your application operator assigns a random NodePort like 31742 instead of 30080, then `host:8080 → docker-proxy → container:30080` hits nothing because Kubernetes is listening on 31742.

This is why many local-dev scripts include a step to **patch the Service** to force the nodePort to the expected value:

```bash
kubectl patch svc my-app-svc -n my-namespace --type merge \
  -p '{"spec":{"ports":[{"port":8080,"nodePort":30080}]}}'
```

## Accessing Your Cluster: Mac vs Linux

This is where things get interesting. The access pattern depends on where Docker runs relative to where you are typing commands.

### Use Case 1: k3d on a Linux dev server, access from that server and from Mac

On the **Linux server** (where Docker runs natively), when k3d creates the cluster with `--port 8080:30080@server:0`, `docker-proxy` binds `0.0.0.0:8080` directly on the host. `curl localhost:8080` works immediately.

On your **Mac**, you don't have direct access to the Linux server's localhost. You SSH-tunnel the ports:

```bash
ssh -L 8080:localhost:8080 \
    -L 3000:localhost:3000 \
    -L 9090:localhost:9090 \
    -L 16443:localhost:16443 \
    my-devserver
```

Now `localhost:8080` on your Mac tunnels through SSH to the dev server's port 8080, which docker-proxy forwards into k3d.

Port 16443 is the Kubernetes API server. You tunnel it so that `kubectl` on your Mac talks to the remote cluster:

```
  Mac                          Linux Dev Server
  +------------------+         +---------------------------+
  |                  |   SSH   |                           |
  | kubectl          | tunnel  | k3d cluster               |
  | localhost:16443  |-------->| k3s API :16443            |
  |                  |         |                           |
  | curl             |         | docker-proxy              |
  | localhost:8080   |-------->| :8080 -> :30080 -> pod    |
  |                  |         |                           |
  | browser          |         |                           |
  | localhost:3000   |-------->| :3000 -> :30300 -> pod    |
  |                  |         |                           |
  +------------------+         +---------------------------+
```

### Use Case 2: k3d directly on Mac (via Docker Desktop)

Docker Desktop runs a Linux VM under the hood. When k3d creates the cluster, Docker Desktop publishes host ports through that VM to your Mac — same as any `docker run -p` command. `localhost:8080` works directly. No tunnels needed.

```
  Mac
  +-----------------------------------------------+
  |                                               |
  | browser / curl                                |
  | localhost:8080                                |
  |       |                                       |
  |       v                                       |
  | Docker Desktop                                |
  | +-------------------------------------------+ |
  | | Linux VM                                  | |
  | |                                           | |
  | |  docker-proxy :8080 -> k3d :30080 -> pod  | |
  | |                                           | |
  | +-------------------------------------------+ |
  +-----------------------------------------------+
```

This behaves identically to the native Linux case from the application's perspective.

### Summary Table

| Scenario | How you access `localhost:8080` | NodePort patching | Notes |
|---|---|---|---|
| Linux (native Docker) | Directly — docker-proxy binds the port | Essential | Simplest setup |
| Mac → remote Linux | SSH tunnel `-L 8080:localhost:8080` | Essential on the remote | Tunnel each service port + 16443 |
| Mac (Docker Desktop) | Directly — Docker Desktop publishes the port | Essential | Same as Linux, just through a VM |

### NodePort vs kubectl port-forward

You might wonder: why not skip all this NodePort business and just use `kubectl port-forward`?

```bash
kubectl port-forward -n my-namespace svc/my-app-svc 8080:8080
```

This opens a tunnel from your machine through the Kubernetes API server directly to a pod. It bypasses NodePort entirely.

The problem is that **both mechanisms try to bind the same host port**. On Linux (or Mac with Docker Desktop), docker-proxy already holds port 8080 from the k3d `--port` mapping. When `kubectl port-forward` tries to also bind port 8080, it gets:

```
unable to listen on port 8080: Listeners failed to create with the following errors:
  [unable to create listener: Error listen tcp4 127.0.0.1:8080: bind: address already in use]
```

It fails silently if your script discards stderr, making it look like everything is fine when the port-forward process is actually dead.

The one scenario where `kubectl port-forward` *does* work is the SSH-tunnel case: k3d runs on a remote Linux box where docker-proxy holds ports on the *remote* host, but `kubectl port-forward` runs on your *Mac* where those ports are free. However, SSH tunneling achieves the same result more simply.

**The clean approach**: pick one mechanism. NodePort + k3d port mapping works on all platforms. `kubectl port-forward` is useful for ad-hoc debugging but should not be the primary access path in a scripted setup.

```
  NodePort path (recommended)
  host:8080 -> docker-proxy -> container:30080 -> kube NodePort -> svc -> pod
    - Works on all platforms
    - Survives pod restarts (kube-proxy routes to new pod)
    - No background process to babysit

  kubectl port-forward
  host:8080 -> kubectl -> kube API -> pod
    - Only works if port 8080 is free (conflicts with NodePort)
    - Dies when the pod restarts (must be restarted manually)
    - Useful for one-off debugging, not for scripted setups
```

## Pre-flight: Checking Port Availability

Before creating a cluster, check that the host ports are free. If another process (or a previous k3d cluster, or an SSH tunnel) is holding a port, k3d will fail with an unhelpful Docker error.

A simple check in a setup script:

```python
import socket

def is_port_open(port, host="127.0.0.1"):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0

host_ports = [8080, 3000, 9090]
busy = [p for p in host_ports if is_port_open(p)]
if busy:
    print(f"Ports already in use: {busy}. Free them before creating the cluster.")
    sys.exit(1)
```

The NodePorts (30080, 30300, etc.) inside the k3d container don't need checking — you own the entire cluster and nothing else competes for those ports.

## Importing Images into k3d

If your application uses custom Docker images that aren't in a public registry, you need to import them into the k3d cluster:

```bash
docker pull my-registry/my-app:latest
k3d image import my-registry/my-app:latest -c my-app
```

k3d copies the image tarball into the cluster node's containerd store. This is where a common scary-looking error appears.

## The ctr "content digest not found" Error

When importing images, you will likely see output like this:

```
ERRO[0000] failed to get existing image digest ...
ctr: content digest sha256:abc123... not found
INFO[0000] Successfully imported image "my-registry/my-app:latest"
```

An `ERRO` line followed by `Successfully imported` looks contradictory. Here is what is happening and why it is harmless.

### What is ctr?

**`ctr`** is the command-line client for [containerd](https://containerd.io/), the container runtime that actually manages images and containers under the hood. Docker, k3s, and k3d all use containerd internally. When k3d does `k3d image import`, it calls `ctr` inside the cluster node to load image layers into the node's containerd content store.

### What is a content digest?

Container images are split into **layers** (compressed filesystem snapshots). Each layer is identified by a **digest** — a `sha256:...` hash of its contents. Think of it like a git commit hash: the content determines the ID. Containerd uses these digests to look up and deduplicate layers.

### Why "not found"?

The error means: **containerd's metadata says a blob with this digest should exist, but the blob isn't in the content store at that moment.** In layman's terms, it's like a library catalog saying "book X is on shelf 3" but when you go to shelf 3, it's not there yet — because it's still being shelved.

This happens during `k3d image import` for benign reasons:

```
  Image import timeline
  ============================================================

  1. k3d streams image tarball into the node
  2. ctr begins loading layers into the content store

       layer A  -->  written to store  -->  digest registered  OK
       layer B  -->  written to store  -->  digest registered  OK
       layer C  -->  manifest references digest X
                     ctr looks up digest X...
                     not in store YET      -->  ERRO: not found!
                     ...but import continues
       layer C  -->  written to store  -->  digest registered  OK

  3. Final check: all layers present  -->  Successfully imported
```

Three common reasons the digest lookup fails mid-import:

1. **Deduplication**: the same layer exists under a different digest (e.g., already unpacked from a previous import). The manifest references one digest, but the store knows the content by another.
2. **Ordering**: import writes layers in sequence. A manifest might reference a digest before that layer's blob has been flushed to the store.
3. **Store vs tarball mismatch**: the tarball layout from `docker save` doesn't always match what the node's store expects, especially after previous imports left partial state.

### Why is it harmless?

Containerd is strict about content-addressed lookups — it logs an error whenever a digest lookup fails, even during a multi-step import where the failure is transient. But the import pipeline **recovers**. The blob either arrives later, or the content is available under an equivalent reference.

**The rule of thumb**: if k3d says `Successfully imported` and your pods don't hit `ImagePullBackOff`, you can safely ignore the `ctr: content digest ... not found` lines. They are containerd being pedantic about an intermediate state, not a sign that the image is broken.

If pods *do* fail to pull the image after import, then the error is real and you should investigate the containerd state on the node — but in practice, this is rare.

### Dealing with the noise

These errors repeat for **every image** you import. If your application has many components (app server, monitoring, dashboards, sidecars), you'll see the same pattern dozens of times. There is no k3d flag to suppress these lines — they come from containerd inside the node, not from k3d itself.

You can filter them in scripts if the noise is distracting:

```bash
k3d image import my-image:latest -c my-app 2>&1 | \
  grep -v "content digest.*not found"
```

But be cautious about filtering all stderr — you might hide real errors. A safer approach is to check the exit code and look for the "Successfully imported" line, then treat any `content digest ... not found` pattern as informational noise.

## Putting It All Together

Here is a generalized workflow for setting up a local Kubernetes cluster for any application:

```
  Step 1: Create cluster
  $ k3d cluster create my-app --api-port 16443 \
      --port "8080:30080@server:0" \
      --port "3000:30300@server:0"

  Step 2: Import custom images
  $ k3d image import my-app:latest -c my-app
    (ignore ctr digest noise if import succeeds)

  Step 3: Deploy application
  $ kubectl apply -f manifests/

  Step 4: Patch NodePorts if needed
  $ kubectl patch svc my-app-svc --type merge \
      -p '{"spec":{"ports":[{"port":8080,"nodePort":30080}]}}'

  Step 5: Verify
  $ curl localhost:8080
```

On a remote dev server, add SSH tunnels for Mac access:

```bash
ssh -L 8080:localhost:8080 -L 3000:localhost:3000 \
    -L 16443:localhost:16443 my-devserver
```

## Teardown

Cleaning up is one command:

```bash
k3d cluster delete my-app
```

This removes the Docker containers, networks, and volumes. Your host ports are freed immediately. No stray `kubectl port-forward` processes to hunt down.

## References

1. k3d documentation [docs](https://k3d.io/)
2. k3s — Lightweight Kubernetes [docs](https://k3s.io/)
3. containerd — an industry-standard container runtime [github](https://github.com/containerd/containerd)
4. Kubernetes NodePort documentation [docs](https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport)
5. kubectl port-forward documentation [docs](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_port-forward/)
6. Docker Desktop networking [docs](https://docs.docker.com/desktop/networking/)
