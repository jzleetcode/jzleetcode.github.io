---
author: JZ
pubDatetime: 2026-11-26T19:30:48Z
modDatetime: 2026-11-26T19:30:48Z
title: System Design - How KVM Runs a Virtual Machine
tags:
  - design-system
  - design-infrastructure
description: "How Linux KVM and QEMU work together to create a virtual machine: vCPU execution, guest memory, VM exits, virtual devices, and the settings that choose hardware acceleration."
---

## Table of contents

## A computer inside a computer

Imagine a Linux server running a virtual machine. Inside that VM, a second Linux kernel boots, sees four CPUs and 4 GB of memory, and starts ordinary programs. The host still owns the actual CPU cores and memory. How does the guest use those resources without taking over the whole server?

On Linux, two pieces share the work:

- **KVM** is the Linux kernel's interface for hardware-assisted virtualization. It runs virtual CPUs and manages the boundary between a guest and the host.
- **QEMU** is a userspace virtual machine monitor. It creates the machine model, supplies virtual devices, and talks to KVM when hardware acceleration is enabled.

They fit together like this:

```text
                    Host Linux
  +---------------------------------------------+
  |  QEMU process                               |
  |  - VM setup and virtual devices             |
  |  - disk and network backends                |
  +----------------------+----------------------+
                         | /dev/kvm ioctls
  +----------------------v----------------------+
  |  KVM kernel interface                       |
  |  - virtual CPUs and guest memory             |
  |  - interrupts and hardware coordination     |
  +----------------------+----------------------+
                         | hardware-assisted execution
                         v
                Host CPU running guest code
                         |
                         v
                      Guest OS
```

QEMU builds the machine model and device interfaces; KVM provides the kernel execution path for guest CPU instructions.

## Creating the virtual machine

QEMU uses the Linux KVM API through file descriptors and `ioctl` calls. The [KVM API documentation](https://docs.kernel.org/virt/kvm/api.html) describes the steps:

1. Open `/dev/kvm` and check which API features the host supports.
2. Use `KVM_CREATE_VM` to create a VM object.
3. Give the VM a region of host memory to use as guest RAM with `KVM_SET_USER_MEMORY_REGION`.
4. Use `KVM_CREATE_VCPU` to create each virtual CPU.
5. Enter guest execution with `KVM_RUN` on a vCPU file descriptor.

QEMU hides these low-level calls behind its command line and device model. The relationship looks like a small conversation:

```text
QEMU userspace       KVM kernel       CPU hardware
      |                   |                 |
      | create VM/vCPU    |                 |
      |------------------>|                 |
      | register RAM      |                 |
      |------------------>|                 |
      | KVM_RUN           |                 |
      |------------------>| enter guest     |
      |                   |---------------->| guest runs
      |<------------------| userspace exit  |
      | handle device     |                 |
      |------------------>| resume guest    |
```

The CPU runs normal guest instructions directly. Hardware virtualization extensions keep guest execution isolated and let the processor switch between guest and host execution. The kernel does not need to interpret each instruction one by one.

## Why execution sometimes returns to the host

Some events need help from the host. A guest can request an operation that the virtual machine does not perform directly, access a device that needs emulation, or receive an interrupt. The processor leaves guest mode with an **exit reason**. KVM handles some events in the kernel; for others, it returns control to QEMU so QEMU can act as the device or machine model.

This return is called a **VM exit**. It is part of normal virtualization. The goal is to let common CPU work stay on the processor while giving the host a safe place to handle events that need mediation.

Memory translation has a similar two-step shape. A guest program uses a guest virtual address. The guest operating system maps it to a guest physical address, and the processor's second-level translation maps that to host physical memory. KVM configures this boundary so the guest can use its assigned RAM without gaining access to unrelated host memory.

## Virtual devices shape I/O cost

The guest expects devices such as a disk, network card, and console. QEMU provides device models that make these resources appear inside the VM. For example, QEMU can connect a virtual disk to a file on the host and expose a network device backed by a host network connection.

An emulated device behaves like a piece of familiar hardware, but the host must process the guest's device operations. **Virtio** provides a device interface designed for virtual machines. A guest with a virtio driver and a host with a virtio backend can exchange work with less device-emulation overhead. QEMU's [system introduction](https://www.qemu.org/docs/master/system/introduction.html) describes its accelerators and virtual devices.

That distinction explains why a VM can have fast CPU execution and still be slow on storage or networking: CPU acceleration and device I/O use related pieces of the system, but they are separate paths.

## The settings that matter

A small QEMU command might look like this:

```bash
qemu-system-x86_64 \
  -accel kvm \
  -m 4G \
  -smp 4 \
  -drive file=guest.qcow2,if=virtio
```

- `-accel kvm` asks QEMU to use KVM for hardware-assisted execution. QEMU's [invocation guide](https://www.qemu.org/docs/master/system/invocation.html) lists the available accelerators and notes that TCG is the default when no accelerator is selected.
- `-m 4G` assigns 4 GB of guest memory.
- `-smp 4` gives the guest four virtual CPUs.
- `if=virtio` exposes the disk through a virtio interface.

The host must provide a usable `/dev/kvm`, compatible processor support, and permission for QEMU to access the device. The `-accel` option selects how guest CPU instructions run; memory size, vCPU count, and device choices determine the virtual machine the guest sees.

## The short version

QEMU describes the virtual computer and connects its devices to host resources. KVM provides the kernel interface that lets a guest use hardware-assisted CPU and memory virtualization. Guest code runs directly on the processor for most of its work; a VM exit returns control to KVM or QEMU when the host needs to handle an event.

## References

1. Linux kernel documentation, [KVM API](https://docs.kernel.org/virt/kvm/api.html).
2. QEMU documentation, [Introduction to QEMU system emulation](https://www.qemu.org/docs/master/system/introduction.html).
3. QEMU documentation, [Invocation](https://www.qemu.org/docs/master/system/invocation.html).
