---
author: JZ
pubDatetime: 2026-09-09T06:23:00Z
modDatetime: 2026-09-09T06:23:00Z
title: System Design - How the Linux Boot Process Works
tags:
  - design-system
  - design-linux
description:
  "How a Linux machine boots: from pressing the power button through firmware (BIOS/UEFI), bootloader (GRUB2), kernel decompression, the init process, and systemd — with source code walkthrough from the Linux kernel."
---

## Table of contents

## Context

You press the power button. A few seconds later, you see a login prompt. What happened in between?

The Linux boot process is a relay race. Each stage does just enough work to hand off to the next. The baton passes through at least five runners: **firmware**, **bootloader**, **kernel setup**, **kernel init**, and **userspace init**. Each runner lives in a completely different world — the first one doesn't even know what an operating system is.

Understanding this sequence is useful for anyone who has debugged a machine that won't boot, tuned startup times, or wondered why certain things happen before others. It also reveals elegant design decisions: how do you go from "the CPU just woke up and can only address 1 MB of memory" to "here's your full 64-bit operating system with networking, filesystems, and a graphical desktop"?

```
  The Boot Relay Race

  +----------+     +----------+     +--------+     +---------+     +---------+
  | Firmware |---->| Boot-    |---->| Kernel |---->| Kernel  |---->| User-   |
  | (BIOS/   |     | loader   |     | Setup  |     | Init    |     | space   |
  |  UEFI)   |     | (GRUB2)  |     | (real  |     | (start  |     | (systemd|
  |          |     |          |     |  mode  |     |  _kernel|     |  or     |
  |          |     |          |     |  -> 64)|     |  -> PID1|     |  init)  |
  +----------+     +----------+     +--------+     +---------+     +---------+
    16-bit           32-bit          16->64-bit      64-bit          64-bit
    real mode        protected       transition      kernel          user
                     mode                            space           space
```

Let's follow the baton from the very beginning.

## Stage 1: Firmware — Waking Up the Hardware

### The First Instruction

When you press the power button, the motherboard's power supply sends a "power good" signal to the CPU. The CPU resets all its registers to known values and starts executing instructions at a hardcoded address: `0xFFFFFFF0` (on x86). This address, called the **reset vector**, is just 16 bytes before the top of the 4 GB address space.

```
  Memory Map at Power-On (x86)

  0xFFFFFFFF  +------------------+  4 GB
              |                  |
  0xFFFFFFF0  |  reset vector    |  <-- CPU starts here
              |  (JMP to BIOS)   |
              |                  |
              |  Firmware ROM    |  mapped by chipset
              |  (BIOS/UEFI)    |
  0xFFFC0000  +------------------+  ~4 GB - 256 KB
              |                  |
              |      ...         |  (not yet usable)
              |                  |
  0x000A0000  +------------------+  640 KB
              |  Conventional    |
              |  Memory (RAM)    |  the only RAM we can use
  0x00000000  +------------------+  0
```

The reset vector contains a jump instruction to the firmware's entry point. The CPU is in **real mode** — a 16-bit mode inherited from the 8086 processor (1978). It can only address 1 MB of memory. The firmware's job is to test the hardware and find something to boot from.

### POST and Device Discovery

The firmware runs **Power-On Self-Test** (POST): it checks the CPU, initializes RAM, discovers PCI devices, sets up interrupt controllers, and initializes the video output. If POST fails, most motherboards emit diagnostic beep codes.

After POST, the firmware looks for a boot device. The method depends on whether you're using legacy BIOS or modern UEFI:

```
  Legacy BIOS Boot                    UEFI Boot
  ========================           ========================

  1. Read first 512 bytes            1. Read GPT partition table
     of disk (MBR)                   2. Find EFI System Partition
  2. Check magic bytes                  (ESP, FAT32 formatted)
     0x55AA at offset 510            3. Load EFI application from
  3. Load MBR to 0x7C00                ESP (e.g., grubx64.efi)
  4. Jump to 0x7C00                  4. Execute via UEFI Boot
                                        Services API

  MBR = 446 bytes code               EFI app can be megabytes,
      + 64 bytes partition table      has access to UEFI runtime
      + 2 bytes signature             services (GOP for graphics,
  Total: 512 bytes only!              file I/O, network stack...)
```

**Legacy BIOS** loads exactly 512 bytes — the Master Boot Record (MBR) — to address `0x7C00` and jumps there. This is the handoff to the bootloader, but 512 bytes isn't much. The bootloader's first stage has to be incredibly compact.

**UEFI** is far more capable. It understands GPT partition tables and FAT32 filesystems natively. It loads a full EFI application (like `grubx64.efi`) directly from the **EFI System Partition** (ESP). UEFI also provides runtime services that the OS can use even after booting — for example, reading/writing NVRAM variables.

## Stage 2: Bootloader — Finding and Loading the Kernel

The bootloader's job is simple in concept: load the Linux kernel into memory and jump to it. In practice, this requires understanding filesystems, presenting a menu, and setting up the right environment.

### GRUB2: The Most Common Linux Bootloader

GRUB2 (GRand Unified Bootloader, version 2) boots in stages:

```
  GRUB2 Boot Stages

  +----------------+     +----------------+     +------------------+
  | boot.img       |---->| core.img       |---->| normal.mod +     |
  | (MBR, 446 B)   |     | (~32 KB)       |     | grub.cfg         |
  |                |     |                |     |                  |
  | Just loads     |     | Mini filesystem|     | Full menu system,|
  | core.img       |     | driver + logic |     | fs drivers, boot |
  |                |     | to find /boot  |     | Linux or chain-  |
  |                |     |                |     | load other OS    |
  +----------------+     +----------------+     +------------------+
    disk sector 0         gap before 1st         /boot/grub/
    (BIOS) or ESP         partition or           (on root or
    (UEFI)                separate /boot         separate partition)
```

On a BIOS system, `boot.img` lives in the MBR (first 446 bytes). It loads `core.img`, which is embedded in the gap between the MBR and the first partition (or in a dedicated BIOS boot partition on GPT disks). `core.img` has enough filesystem knowledge to find and load GRUB modules from `/boot/grub/`.

When GRUB has loaded its modules, it reads `/boot/grub/grub.cfg`, which specifies where to find the kernel and initial ramdisk:

```bash
menuentry 'Ubuntu' {
    linux   /vmlinuz-6.8.0-45-generic root=UUID=abc123 ro quiet
    initrd  /initrd.img-6.8.0-45-generic
}
```

GRUB does three things with this configuration:

1. **Loads the kernel image** (`vmlinuz`) into memory
2. **Loads the initial ramdisk** (`initrd`) into memory
3. **Sets up the kernel command line** (the `root=...` parameters)

### The Linux Boot Protocol

GRUB doesn't just dump the kernel at a random address. It follows the **Linux x86 Boot Protocol**, defined in the kernel source at [`Documentation/arch/x86/boot.rst`](https://github.com/torvalds/linux/blob/master/Documentation/arch/x86/boot.rst). The kernel image (`vmlinuz`) has a specific header that tells the bootloader:

```
  vmlinuz File Layout

  +-------------------+  offset 0
  | Legacy boot sector|  (512 bytes, for direct-boot compatibility)
  +-------------------+
  | Setup header      |  contains boot protocol version, load addresses,
  | (struct setup_    |  command line pointer, initrd address, etc.
  |  header)          |
  +-------------------+  offset = (setup_sects + 1) * 512
  | Compressed kernel |  the actual vmlinux, compressed with gzip/lz4/zstd
  | payload           |
  +-------------------+
```

The setup header (defined in [`arch/x86/boot/header.S`](https://github.com/torvalds/linux/blob/master/arch/x86/boot/header.S)) contains fields like:

```asm
    .ascii  "HdrS"          # header signature
    .word   0x020f          # boot protocol version 2.15
    ...
setup_header:
    .byte   setup_sects     # size of setup code in sectors
    .word   root_flags
    .long   syssize         # size of protected-mode kernel
    ...
    .long   code32_start    # 32-bit entry point
    ...
    .long   cmd_line_ptr    # pointer to kernel command line
    .long   initrd_addr_max # max address for initrd
    .long   ramdisk_image   # initrd load address
    .long   ramdisk_size    # initrd size
```

GRUB fills in the pointers (command line, initrd location) and then jumps to the kernel's entry point. The baton has been passed.

## Stage 3: Kernel Setup — From 16-bit to 64-bit

The kernel's setup code performs one of the most dramatic transitions in the boot process: it takes the CPU from 16-bit real mode all the way to 64-bit long mode. This happens in a few hundred lines of assembly.

### Real Mode Setup

The entry point is in [`arch/x86/boot/header.S`](https://github.com/torvalds/linux/blob/master/arch/x86/boot/header.S), which jumps to `start_of_setup`. The setup code in [`arch/x86/boot/main.c`](https://github.com/torvalds/linux/blob/master/arch/x86/boot/main.c) runs while still in real mode:

```c
void main(void)
{
    init_default_io_ops();
    copy_boot_params();      // copy setup header to a safe location
    console_init();          // set up early console for printk
    init_heap();             // set up a small heap for setup code
    validate_cpu();          // check CPU features (need 64-bit?)
    detect_memory();         // call BIOS e820 to get memory map
    keyboard_init();         // basic keyboard setup
    set_video();             // set video mode
    go_to_protected_mode();  // the big transition begins
}
```

The most important call here is `detect_memory()`. It uses BIOS interrupt `INT 0x15, AX=0xE820` to ask the firmware for a map of all physical memory — which ranges are usable RAM, which are reserved for hardware, which are ACPI tables. This **e820 memory map** is the kernel's first understanding of how much RAM exists and where it is:

```
  Example e820 Memory Map

  Start Address      End Address        Type
  ---------------    ---------------    ------------------
  0x0000000000000    0x000000009FBFF    Usable
  0x000000009FC00    0x000000009FFFF    Reserved (BIOS)
  0x00000000F0000    0x00000000FFFFF    Reserved (ROM)
  0x0000000100000    0x000003FFDFFFF    Usable (main RAM)
  0x000003FFDE000    0x000003FFFFFFF    Reserved (ACPI)
```

### The Mode Transitions

After collecting hardware information, the kernel must switch the CPU through three modes:

```
  CPU Mode Transitions During Boot

  Real Mode (16-bit)
       |
       |  1. Disable interrupts (cli)
       |  2. Enable A20 line (access > 1MB)
       |  3. Load GDT (Global Descriptor Table)
       |  4. Set PE bit in CR0
       |
       v
  Protected Mode (32-bit)
       |
       |  5. Set up page tables (identity-mapped)
       |  6. Enable PAE (Physical Address Extension)
       |  7. Set LME bit in EFER MSR
       |  8. Enable paging (set PG bit in CR0)
       |
       v
  Long Mode (64-bit)
       |
       |  9. Load 64-bit GDT
       |  10. Jump to 64-bit code segment
       |
       v
  Kernel runs in 64-bit mode
```

The transition code lives in [`arch/x86/boot/compressed/head_64.S`](https://github.com/torvalds/linux/blob/master/arch/x86/boot/compressed/head_64.S). Here's the critical moment — enabling paging to enter long mode:

```asm
    /* Enable PAE mode */
    movl    %cr4, %eax
    orl     $X86_CR4_PAE, %eax
    movl    %eax, %cr4

    /* Load top-level page table */
    movl    $(early_top_pgt - __START_KERNEL_map), %eax
    movl    %eax, %cr3

    /* Enable long mode in EFER MSR */
    movl    $MSR_EFER, %ecx
    rdmsr
    btsl    $_EFER_LME, %eax       /* Long Mode Enable */
    wrmsr

    /* Enable paging (this activates long mode) */
    movl    $(X86_CR0_PG | X86_CR0_PE), %eax
    movl    %eax, %cr0

    /* Jump to 64-bit code */
    ljmpl   *pa_startup_64_smp(%rip)
```

The moment paging is enabled with the LME bit set, the CPU enters 64-bit long mode. The `ljmpl` (long jump) reloads the code segment with a 64-bit descriptor, and we're finally running 64-bit code.

### Decompressing the Kernel

The kernel image (`vmlinuz`) is compressed. The "z" stands for compressed — typically with gzip, lz4, lzma, or zstd. After entering 64-bit mode, the setup code calls the decompression routine:

```
  vmlinuz Decompression

  Memory before:
  +-------------------+-------------------+
  | Setup code        | Compressed kernel |
  | (head_64.S, etc.) | (gzip/lz4/zstd)  |
  +-------------------+-------------------+

  Memory after:
  +-------------------+-------------------+
  | Setup code        | Decompressed      |
  | (no longer needed)| vmlinux           |
  |                   | (the real kernel) |
  +-------------------+-------------------+
                      ^
                      startup_64 entry point
```

The decompression code in [`arch/x86/boot/compressed/misc.c`](https://github.com/torvalds/linux/blob/master/arch/x86/boot/compressed/misc.c) calls `__decompress()`:

```c
asmlinkage __visible void *extract_kernel(void *rmode, unsigned char *output)
{
    // ... set up output buffer, validate ...

    __decompress(input_data, input_len, NULL, NULL,
                 output, output_len, NULL, error);

    return output;
}
```

A typical kernel image decompresses from ~12 MB to ~40-80 MB. After decompression, the code jumps to the decompressed kernel's entry point: `startup_64` in [`arch/x86/kernel/head_64.S`](https://github.com/torvalds/linux/blob/master/arch/x86/kernel/head_64.S).

## Stage 4: Kernel Init — Building the Operating System

Now the real kernel is running. It's in 64-bit mode with a minimal page table. The function `start_kernel()` in [`init/main.c`](https://github.com/torvalds/linux/blob/master/init/main.c) is where Linux transforms from a bare-metal program into an operating system.

### `start_kernel()` — The Big Bang

```c
asmlinkage __visible void __init start_kernel(void)
{
    // Phase 1: Core infrastructure
    set_task_stack_end_magic(&init_task);  // set up task 0 (swapper)
    local_irq_disable();
    boot_cpu_init();
    page_address_init();
    setup_arch(&command_line);             // arch-specific init (memory, ACPI)
    setup_command_line(command_line);
    build_all_zonelists(NULL);             // NUMA memory zones
    page_alloc_init();
    mm_core_init();                        // memory management

    // Phase 2: Interrupts and scheduling
    trap_init();                           // exception handlers
    irq_init();                            // interrupt controllers
    time_init();                           // timekeeping
    softirq_init();                        // deferred interrupt handling
    sched_init();                          // the scheduler

    // Phase 3: Everything else
    console_init();                        // early console
    vfs_caches_init();                     // Virtual File System
    signals_init();                        // signal handling
    cpuset_init();                         // cgroup cpusets
    proc_root_init();                      // /proc filesystem

    // Phase 4: Hand off to PID 1
    arch_call_rest_init();
}
```

This function is 100+ lines of carefully ordered initialization calls. The order matters — you can't initialize the scheduler before memory management, can't set up interrupts before the trap handlers are installed, and can't mount filesystems before the VFS is ready.

### The init Task and `rest_init()`

At the end of `start_kernel()`, `arch_call_rest_init()` calls `rest_init()`:

```c
noinline void __ref __noreturn rest_init(void)
{
    struct task_struct *tsk;

    // Create kernel thread for PID 1 (runs kernel_init)
    pid = user_mode_thread(kernel_init, NULL, CLONE_FS);
    // --> this becomes /sbin/init (PID 1)

    // Create kernel thread for PID 2 (kthreadd)
    pid = kernel_thread(kthreadd, NULL, ...);
    // --> manages all other kernel threads

    // Become the idle task (PID 0)
    cpu_startup_entry(CPUHP_ONLINE);
    // --> loops forever, runs when nothing else needs the CPU
}
```

```
  Kernel Threads After rest_init()

  PID 0: swapper/idle      PID 1: kernel_init     PID 2: kthreadd
  (runs when CPU is idle)  (becomes /sbin/init)   (spawns kernel threads)
       |                        |                       |
       |                        v                       v
       |                   mount initramfs         [kworker/0:0]
       |                   run /init                [ksoftirqd/0]
       |                   pivot to real root       [migration/0]
       |                   exec /sbin/init          [rcu_gp]
       v                        |                   [kcompactd0]
  cpu_idle_loop()               v                   ...
                           systemd (PID 1)
```

### The initramfs: A Temporary Root Filesystem

Before the kernel can mount your real root filesystem (`/dev/sda2` or an LVM volume), it often needs drivers that aren't compiled into the kernel — disk controller drivers, filesystem modules, encryption support. This is a chicken-and-egg problem: you need drivers to read the disk, but the drivers are on the disk.

The solution is **initramfs** (initial RAM filesystem): a small compressed archive that the bootloader loaded into memory alongside the kernel. The kernel unpacks it as a temporary root filesystem:

```
  initramfs Contents (typical)

  /
  ├── bin/
  │   ├── busybox        # minimal shell + utilities
  │   └── plymouth       # boot splash (optional)
  ├── etc/
  │   └── modprobe.d/    # module loading config
  ├── lib/
  │   └── modules/
  │       └── 6.8.0-45-generic/
  │           ├── ahci.ko           # SATA driver
  │           ├── ext4.ko           # ext4 filesystem
  │           ├── dm-crypt.ko       # disk encryption
  │           └── nvme.ko           # NVMe driver
  ├── init               # the script that runs as PID 1 (initially)
  └── sbin/
      └── modprobe       # module loading tool
```

The `/init` script in the initramfs loads the necessary drivers, assembles RAID arrays or unlocks encrypted volumes, finds the real root filesystem, and then calls `switch_root` to pivot to it:

```bash
#!/bin/sh
# Simplified initramfs /init script

# Mount essential virtual filesystems
mount -t proc proc /proc
mount -t sysfs sysfs /sys
mount -t devtmpfs devtmpfs /dev

# Load disk controller and filesystem drivers
modprobe nvme
modprobe ext4

# Wait for the root device to appear
while [ ! -b /dev/nvme0n1p2 ]; do sleep 0.1; done

# Mount the real root filesystem
mount /dev/nvme0n1p2 /mnt/root

# Pivot: replace initramfs with the real root
exec switch_root /mnt/root /sbin/init
```

The `switch_root` call is a point of no return — the initramfs is deleted from memory, `/mnt/root` becomes the new `/`, and `/sbin/init` replaces the current process. PID 1 is now running from your real disk.

## Stage 5: Userspace Init — systemd and PID 1

The kernel has done its job: hardware is initialized, memory management works, the scheduler is running, and the root filesystem is mounted. Now it hands the baton to userspace by executing the **init process** — the first userspace program, always PID 1.

On modern Linux distributions, PID 1 is **systemd**. Its job is to bring up every service, mount remaining filesystems, configure networking, and present a login prompt.

### Why PID 1 Is Special

PID 1 has unique responsibilities in the kernel:

1. **It cannot be killed.** The kernel ignores fatal signals sent to PID 1 (unless PID 1 explicitly installs a handler). If PID 1 exits, the kernel panics.
2. **It adopts orphaned processes.** When any process's parent dies, the kernel re-parents its children to PID 1.
3. **It reaps zombies.** PID 1 must call `wait()` on adopted children to clean up their process table entries.

This is enforced in [`kernel/signal.c`](https://github.com/torvalds/linux/blob/master/kernel/signal.c):

```c
static bool sig_task_ignored(struct task_struct *t, int sig, bool force)
{
    // PID 1 gets special treatment: ignore fatal signals
    // unless it has explicitly registered a handler
    if (is_global_init(t) && sig_default_action(sig) == SIG_DFL)
        return true;
    ...
}
```

### systemd: Parallel, Dependency-Based Startup

Before systemd, Linux used SysV init scripts — sequential shell scripts that ran one after another (`S01networking`, `S02ssh`, `S03apache`...). This was slow because services waited for each other even when they had no dependency.

systemd represents services as **units** with explicit dependencies, enabling parallel startup:

```
  systemd Dependency Graph (simplified)

  sysinit.target
       |
       +---> local-fs.target (mount all disks)
       |         |
       |         +---> dev-sda2.device
       |         +---> tmp.mount
       |
       +---> swap.target
       |
       v
  basic.target
       |
       +---> timers.target
       +---> sockets.target
       |         |
       |         +---> dbus.socket (socket activation)
       |         +---> sshd.socket
       |
       v
  multi-user.target
       |
       +---> NetworkManager.service
       +---> sshd.service
       +---> cron.service
       +---> docker.service
       |
       v
  graphical.target (if desktop)
       |
       +---> gdm.service (login screen)
```

systemd starts by reading its default target (usually `multi-user.target` for servers or `graphical.target` for desktops). It builds a dependency graph and starts all units whose dependencies are satisfied in parallel:

```
  Sequential (SysV)          Parallel (systemd)
  ==================         ==================
  Time -->                   Time -->

  [mount disks     ]         [mount disks     ]
  [start networking]         [start networking][start logging ]
  [start logging   ]         [start dbus      ][start cron    ]
  [start dbus      ]         [start sshd      ][start docker  ]
  [start sshd      ]
  [start cron      ]         Boot time: ~3 seconds
  [start docker    ]
                             vs.
  Boot time: ~8 seconds
```

### Socket Activation: Start on Demand

One of systemd's clever tricks is **socket activation**. Instead of starting a service immediately, systemd opens its listening socket and holds it. When a client connects, systemd starts the service and hands over the socket:

```
  Socket Activation

  1. systemd creates /run/dbus/system_bus_socket
  2. A program tries to connect to D-Bus
  3. systemd starts dbus-daemon, passes the socket fd
  4. dbus-daemon accepts the connection and replies

  The connecting program never knew D-Bus wasn't running yet!
```

This eliminates ordering problems: if service A depends on service B's socket, you can start A immediately. If B isn't ready yet, A's connection just waits in the kernel's socket buffer until systemd starts B.

### The Login Prompt

The final step. systemd starts a **getty** process on each virtual terminal (and optionally `sshd` for remote access):

```
  systemd
    |
    +---> agetty (tty1)  ---> shows "hostname login: "
    |                          user types username
    |                          agetty execs /bin/login
    |                          login checks /etc/shadow
    |                          login execs user's shell
    |
    +---> agetty (tty2)  ---> (waiting)
    +---> sshd            ---> (listening on port 22)
```

And that's it. From a jolt of electricity to a blinking cursor, the relay race is complete.

## Timing: How Long Does Each Stage Take?

On a modern server with NVMe storage, the typical breakdown is:

```
  Stage                    Duration        Bottleneck
  -----------------------  --------------  -------------------------
  Firmware (UEFI POST)     1-3 seconds     hardware probing, option ROMs
  GRUB2                    0.5-2 seconds   menu timeout (configurable)
  Kernel decompression     0.1-0.5 sec     CPU-bound (zstd is fast)
  Kernel init              0.5-2 seconds   driver probing, ACPI
  initramfs                0.5-3 seconds   disk detection, crypto unlock
  systemd to login         1-5 seconds     service dependencies

  Total                    ~4-15 seconds   (varies widely)
```

You can measure each stage:

- **Firmware:** UEFI logs in the TPM event log, or just use a stopwatch from power button to GRUB menu.
- **GRUB to kernel:** the kernel prints its start timestamp in `dmesg` as offset `[0.000000]`.
- **Kernel:** `dmesg` shows every subsystem's init time.
- **systemd:** `systemd-analyze` shows the full breakdown:

```bash
$ systemd-analyze
Startup finished in 1.2s (firmware) + 1.8s (loader) +
                    2.1s (kernel) + 3.4s (userspace) = 8.5s
graphical.target reached after 3.2s in userspace

$ systemd-analyze blame
  1.1s   NetworkManager.service
  0.8s   docker.service
  0.4s   systemd-udevd.service
  ...
```

## Putting It All Together

Here is the complete journey, following a single instruction through every hand-off:

```
  Power Button
       |
       v
  CPU reset vector (0xFFFFFFF0)
       |  16-bit real mode
       v
  Firmware POST
       |  test RAM, discover PCI, init video
       v
  Find boot device (MBR or ESP)
       |
       v
  GRUB2 boot.img -> core.img -> grub.cfg
       |  load vmlinuz + initrd into memory
       v
  Kernel setup (header.S -> main.c)
       |  detect memory (e820), set video
       v
  Real mode -> Protected mode -> Long mode
       |  enable paging, set up GDT, jump to 64-bit
       v
  Decompress vmlinuz -> vmlinux
       |
       v
  start_kernel()
       |  mm, scheduler, VFS, interrupts, drivers
       v
  rest_init()
       |  create PID 1 (kernel_init) + PID 2 (kthreadd)
       v
  kernel_init -> mount initramfs -> load drivers
       |  find and mount real root filesystem
       v
  switch_root -> exec /sbin/init (systemd)
       |  parallel service startup, socket activation
       v
  agetty / sshd
       |
       v
  Login prompt. You're in.
```

Every stage exists because the previous stage couldn't do everything on its own. Firmware can't parse Linux filesystems. GRUB can't initialize hardware. The kernel can't start services. systemd can't set up page tables. Each runner in the relay does exactly what it's good at, then hands off.

## References

1. Linux kernel x86 boot protocol [`Documentation/arch/x86/boot.rst`](https://github.com/torvalds/linux/blob/master/Documentation/arch/x86/boot.rst)
2. Linux kernel x86 boot entry [`arch/x86/boot/header.S`](https://github.com/torvalds/linux/blob/master/arch/x86/boot/header.S)
3. Kernel setup main [`arch/x86/boot/main.c`](https://github.com/torvalds/linux/blob/master/arch/x86/boot/main.c)
4. 64-bit kernel entry [`arch/x86/kernel/head_64.S`](https://github.com/torvalds/linux/blob/master/arch/x86/kernel/head_64.S)
5. Compressed kernel entry [`arch/x86/boot/compressed/head_64.S`](https://github.com/torvalds/linux/blob/master/arch/x86/boot/compressed/head_64.S)
6. `start_kernel()` [`init/main.c`](https://github.com/torvalds/linux/blob/master/init/main.c)
7. Signal handling for PID 1 [`kernel/signal.c`](https://github.com/torvalds/linux/blob/master/kernel/signal.c)
8. systemd documentation [freedesktop.org](https://www.freedesktop.org/software/systemd/man/)
9. UEFI specification [uefi.org](https://uefi.org/specifications)
10. GRUB2 manual [gnu.org](https://www.gnu.org/software/grub/manual/grub/)
