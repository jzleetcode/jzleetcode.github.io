---
author: JZ
pubDatetime: 2026-11-17T19:30:00Z
modDatetime: 2026-11-17T19:30:00Z
title: System Design - How Kubernetes Operators Reconcile Applications
tags:
  - design-system
  - design-distributed
  - design-kubernetes
description: "A beginner-friendly walkthrough of Kubernetes operators, custom resources, reconciliation loops, status, ownership, and the settings that shape a controller."
---

## Table of contents

## The problem: Kubernetes does not know your application

Suppose a team runs a database on Kubernetes. They want three database replicas, 100 GiB of storage, daily backups, and an orderly upgrade when a new database version is ready.

Kubernetes already knows how to keep Pods and StatefulSets running. It does not know what a safe database upgrade looks like, when a replica is ready to join the cluster, or how to restore a backup. Those decisions belong to people who understand the database.

An **operator** puts some of that application knowledge into software. A user describes the database they want; the operator watches that description and works with Kubernetes until the running cluster matches it. The [Kubernetes Operator pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/) describes operators as extensions that use custom resources to manage applications and their components.

## Two parts: a resource and a controller

An operator usually has two main pieces:

1. A **CustomResourceDefinition (CRD)** teaches the Kubernetes API about a new kind of object, such as **DatabaseCluster**. The CRD defines the object's fields and validation rules.
2. A **controller** watches objects of that kind and performs the application-specific work.

The object a user creates from the CRD is called a **custom resource**. It is still stored and accessed through the Kubernetes API, like a built-in Deployment or Service. The [custom resources documentation](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/) explains how CRDs extend the API.

Here is a simplified request:

    apiVersion: databases.example.com/v1
    kind: DatabaseCluster
    metadata:
      name: orders
    spec:
      version: "16"
      replicas: 3
      storage: 100Gi

The **spec** is the user's request. It does not say exactly which Pods to create or how to perform a safe upgrade. That is the operator's job.

## Following one request through the cluster

When the user applies this object, the API server validates it against the CRD and stores it. The operator receives a notification that the object may need attention.

    User
      |
      | apply DatabaseCluster/orders
      v
    Kubernetes API server
      |
      | object change notification
      v
    Database operator
      |             |             |
      |             |             +--> Service
      |             +----------------> StatefulSet
      +------------------------------> backup resources
                                         |
                                         v
                                       Pods
                                         |
                 observed state/status --+

The controller decides which Kubernetes objects represent the request. A database operator might create a StatefulSet, a Service, persistent volume claims, and backup jobs. Another operator may choose a different set of resources.

The operator does not usually create all of those objects in one synchronous chain and then declare success. Instead, it reconciles the request repeatedly.

## The reconciliation loop

A controller is a **control loop**: it observes the current state, compares it with the desired state, and makes changes to reduce the difference. The [Kubernetes controller documentation](https://kubernetes.io/docs/concepts/architecture/controller/) uses a thermostat as an example: the requested temperature is the desired state, the room temperature is the current state, and the controller turns the heater on or off.

For the database example, a reconciliation might do this:

1. Read the latest **DatabaseCluster** object.
2. Check which child objects currently exist.
3. Calculate what the StatefulSet, Service, and storage claims should look like.
4. Create missing objects or update objects that differ.
5. Check the database Pods and report progress in the custom resource's **status**.

The controller receives the object's namespace and name as a work item. The notification is a hint to look again; it is not a durable instruction such as “perform exactly this upgrade once.” Controllers can receive repeated notifications, and they can restart between any two steps. A reconciliation should therefore be safe to run again.

This is called **level-based reconciliation**. The controller asks, “What is true now, and what should be true?” It does not depend on replaying every change event in order. If the operator restarts after creating the StatefulSet but before updating status, the next pass reads both objects and continues from the observed state.

## What the user requested and what the operator observed

Kubernetes resources separate the requested configuration from the controller's observations:

- **spec** describes the desired state, such as three replicas.
- **status** describes what the operator has observed, such as two replicas ready and an upgrade in progress.

This separation gives users a stable place to express intent while allowing the operator to report asynchronous work. A status condition might explain that storage is ready but a database member has not joined yet. The CRD can enable a status subresource so updates to status do not accidentally overwrite the user's spec.

An operator should not claim that the database is ready merely because it created a StatefulSet. The Pods still need scheduling, storage attachment, startup, and application-level health checks. The operator's status should reflect those observations.

## Ownership, deletion, and cleanup

When a controller creates child objects, it can set an **owner reference** pointing back to the custom resource. Kubernetes garbage collection can then delete dependent objects when their owner is deleted. See [owners and dependents](https://kubernetes.io/docs/concepts/overview/working-with-objects/owners-dependents/).

Some cleanup must happen before Kubernetes removes the custom resource. For example, an operator might need to remove an external cloud database or archive a final backup. A **finalizer** marks the resource as waiting for that cleanup. The controller performs the work, removes its finalizer, and then Kubernetes can finish deletion. The [finalizers documentation](https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/) explains this lifecycle.

Finalizer work must also be repeatable. If cleanup succeeds but the controller crashes before removing the finalizer, the next reconciliation will try again. The operator needs a way to recognize that the external resource is already gone.

## Important design and configuration choices

- **CRD schema and defaults:** Validate fields such as replica counts and storage sizes at the API boundary. Defaults make the resource easier to use, while clear validation errors keep invalid requests from entering the control loop.
- **RBAC:** Give the controller permission only for the resource kinds it needs to read or change. A controller that manages Services, StatefulSets, and its custom resource does not automatically need broad access to every object in the cluster.
- **Watched resources:** Watch the custom resource and the child resources whose changes affect progress. Owner references help controllers map a changed child object back to its parent.
- **Concurrency and leader election:** Controller frameworks commonly allow several reconciliation workers. Concurrency can improve throughput, but the same object may be reconciled again while another operation is still settling. Leader election is useful when multiple operator replicas are deployed and only one should perform cluster-wide work.
- **Retries and requeueing:** A failed API request or an unfinished external operation should lead to another reconciliation. Return an error for retryable failures or request a timed requeue when the controller should check back later.
- **Status conditions:** Report what is ready, what is still progressing, and what failed. This is more useful than a single boolean because upgrades and recovery have several stages.

The right operator is not a script that runs once after installation. It is a durable control loop that keeps applying application knowledge as the desired state or the cluster changes.

## References

1. Kubernetes documentation, [Operator pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/)
2. Kubernetes documentation, [Controllers](https://kubernetes.io/docs/concepts/architecture/controller/)
3. Kubernetes documentation, [Custom resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)
4. Kubernetes documentation, [Owners and dependents](https://kubernetes.io/docs/concepts/overview/working-with-objects/owners-dependents/)
5. Kubernetes documentation, [Finalizers](https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/)
