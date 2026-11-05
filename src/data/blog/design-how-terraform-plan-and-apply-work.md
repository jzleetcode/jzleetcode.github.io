---
author: JZ
pubDatetime: 2026-11-05T19:30:00Z
modDatetime: 2026-11-05T19:30:00Z
title: System Design - How Terraform Plan and Apply Work
tags:
  - design-system
  - design-infrastructure
description: "A beginner-friendly walkthrough of Terraform's plan and apply workflow: providers, state, dependency graphs, saved plans, and the API operations that change infrastructure."
---

## Table of contents

- [A change begins as configuration](#a-change-begins-as-configuration)
- [Plan: calculate before changing](#plan-calculate-before-changing)
- [Apply: carry out the plan](#apply-carry-out-the-plan)
- [State connects names to real objects](#state-connects-names-to-real-objects)
- [Controls that matter](#controls-that-matter)
- [References](#references)

## A Change Begins as Configuration

Imagine a small team needs a private network and a subnet for an application. One engineer could create them through a cloud console. That works once, but later nobody can tell which clicks were intentional, and repeating the setup in another environment means doing the same work by hand.

Terraform lets the team describe the desired infrastructure in configuration files. A provider translates Terraform's resource operations into calls to a service such as AWS, Azure, or Google Cloud. For example, these two resources describe a network and a subnet inside it:

```hcl
terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

provider "aws" {
  region = "us-west-2"
}

resource "aws_vpc" "app" {
  cidr_block = "10.20.0.0/16"
}

resource "aws_subnet" "app" {
  vpc_id     = aws_vpc.app.id
  cidr_block = "10.20.1.0/24"
}
```

The `aws_vpc.app.id` reference says more than “use this value.” It also tells Terraform that the subnet depends on the network. Terraform can create the network first, wait for its ID, then create the subnet.

The team's normal workflow is:

```text
Configuration files
        |
        v
terraform init  ---> download providers and configure the backend
        |
        v
terraform plan ---> inspect state, query providers, calculate changes
        |
        v
review the plan ---> decide whether the proposed changes are right
        |
        v
terraform apply -> call provider APIs and record the results in state
```

## Plan: Calculate Before Changing

`terraform init` prepares the working directory. It installs the provider plugins required by the configuration and initializes the chosen backend, which is where Terraform reads and writes state.

When an engineer runs `terraform plan`, Terraform compares three things:

1. **Configuration:** what the files say should exist.
2. **State:** Terraform's last recorded mapping of resource names to remote objects.
3. **Observed infrastructure:** what the provider can currently read from the remote service.

That comparison helps Terraform notice both requested edits and drift. Drift is an outside change, such as someone resizing a virtual machine through a cloud console after Terraform last recorded it.

Terraform then builds a dependency graph. Edges come from references like `aws_vpc.app.id`; a resource with no dependency on another can often be handled at the same time. The plan shows actions such as create, update, or destroy, and explains when a value is not known until apply.

Planning normally reads provider APIs to refresh managed objects, but it does not carry out the proposed infrastructure creates, updates, or deletes. This gives a reviewer a chance to catch an overly broad change before Terraform starts making it.

## Apply: Carry Out the Plan

Without a saved plan, `terraform apply` calculates a plan and asks for approval before executing it. The provider then makes the API calls for each operation in dependency order. Independent operations can run concurrently, while a dependent operation waits for its prerequisite.

For a team review, an engineer can save the plan and show that exact artifact to a reviewer:

```bash
terraform plan -out=network.tfplan
terraform show network.tfplan
terraform apply network.tfplan
```

Applying a saved plan uses the proposed actions in that file instead of prompting for approval of a newly generated plan. Terraform still has to make real API calls, so the operation can fail if the remote service rejects a request or the outside world changes in the meantime. A saved plan is a reviewable proposal, not a transaction that can lock a cloud provider's entire environment.

Terraform also does not make a multi-resource apply atomic. If one API call fails after earlier operations succeeded, those successful changes are not magically rolled back. Terraform records completed work in state and can calculate a new plan that reconciles the partial result.

## State Connects Names to Real Objects

The resource name `aws_vpc.app` is a stable address in configuration. The cloud provider gives the created network a separate remote ID. Terraform state records the relationship between the two, along with metadata needed to plan future changes.

State is therefore a coordination record, not a replacement for the real infrastructure. Terraform refreshes its view through the provider and compares that observation with the configuration. Teams can keep state in a local file or use a remote backend so multiple engineers share the same record.

When a backend supports state locking, Terraform takes a lock during operations that could change state. The lock prevents two Terraform runs from writing competing versions at the same time. It does not prevent someone from changing the cloud resource through a separate tool, which is one reason the next plan checks for drift.

## Controls That Matter

- **Backend:** Choose where state lives before collaborating. A shared backend makes state available to the team; a backend with locking protects concurrent Terraform operations.
- **Saved plan (`-out`):** Use this when a reviewer should approve the same actions that will be applied. Treat plan files as sensitive artifacts because they can contain configuration values.
- **Parallelism (`-parallelism`):** This sets how many independent operations Terraform may run at once. Lower it when a provider or API has strict rate limits; higher concurrency does not remove dependency ordering.
- **Explicit dependencies (`depends_on`):** Use this only when a real dependency is not visible through an attribute reference. Extra edges can make Terraform wait unnecessarily.

A useful mental model is: configuration describes the goal, state remembers Terraform's last mapping, providers observe and change remote objects, and the plan is the proposed path between them.

## References

1. HashiCorp, [`terraform init`](https://developer.hashicorp.com/terraform/cli/commands/init).
2. HashiCorp, [`terraform plan`](https://developer.hashicorp.com/terraform/cli/commands/plan).
3. HashiCorp, [`terraform apply`](https://developer.hashicorp.com/terraform/cli/commands/apply).
4. HashiCorp, [Terraform state](https://developer.hashicorp.com/terraform/language/state).
5. HashiCorp, [Resource dependencies](https://developer.hashicorp.com/terraform/language/resources/behavior#resource-dependencies).
