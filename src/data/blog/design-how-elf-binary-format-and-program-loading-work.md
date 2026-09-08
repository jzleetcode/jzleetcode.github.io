---
author: JZ
pubDatetime: 2026-09-08T06:23:00Z
modDatetime: 2026-09-08T06:23:00Z
title: System Design - How the ELF Binary Format and Program Loading Work
tags:
  - design-system
  - design-os
description:
  "How the ELF binary format works on Linux: file structure, headers, sections vs segments, how the kernel loads a program via execve and load_elf_binary, dynamic linking with PLT/GOT, and the journey from ./a.out to the first instruction."
---

## Table of contents

## Context

Every time you type `./hello` in a terminal on Linux, a remarkable chain of events unfolds in a few milliseconds. The shell calls `execve()`, the kernel parses a binary file, maps memory regions, possibly invokes a dynamic linker, and eventually jumps to your `main()` function. The binary file at the center of all this is almost certainly in **ELF** format — the Executable and Linkable Format.

ELF is the standard binary format on Linux, FreeBSD, Solaris, and most Unix-like systems. It is used for executables, shared libraries (`.so`), object files (`.o`), and core dumps. Understanding ELF is understanding the bridge between the code you write and the process the CPU runs.

```
  You write this:              The compiler produces this:         The kernel loads this:

  #include <stdio.h>           +------------------+                Virtual Memory
                               |   ELF Header     |                +------------------+
  int main() {                 +------------------+                | 0x400000  .text  |
      printf("hello\n");  --> | Program Headers  |  -- execve --> | 0x600000  .data  |
      return 0;                +------------------+                | 0x7fff... stack  |
  }                            | .text  (code)    |                | 0x7f...   libc   |
                               | .data  (globals) |                +------------------+
                               | .symtab (symbols)|
                               | ...              |
                               +------------------+
```

Let's trace this journey from the binary file on disk to a running process in memory.

## The ELF File Structure

An ELF file has a layered structure. At the very beginning is a fixed-size header that describes everything else. After that, two different "views" of the file coexist: **sections** (used by the linker at build time) and **segments** (used by the kernel at load time).

```
  Offset 0
  +=============================+
  |        ELF Header           |   64 bytes (on 64-bit)
  |  (magic, type, entry point) |
  +=============================+
  |     Program Header Table    |   describes segments (for loading)
  |  [LOAD] [LOAD] [INTERP] ...|
  +=============================+
  |                             |
  |     .text section           |   machine code
  |     .rodata section         |   read-only data ("hello\n")
  |     .data section           |   initialized globals
  |     .bss section            |   zero-initialized globals
  |     .symtab section         |   symbol table
  |     .strtab section         |   string table
  |     .rel.plt section        |   relocation entries
  |     ...                     |
  |                             |
  +=============================+
  |    Section Header Table     |   describes sections (for linking)
  |  [.text] [.data] [.bss] ...|
  +=============================+
```

### The ELF Header

The first 64 bytes (on a 64-bit system) are the ELF header. You can inspect it with `readelf -h`:

```
$ readelf -h /bin/ls
ELF Header:
  Magic:   7f 45 4c 46 02 01 01 00 ...
  Class:                             ELF64
  Type:                              DYN (Position-Independent Executable)
  Machine:                           Advanced Micro Devices X86-64
  Entry point address:               0x6ab0
  Start of program headers:          64 (bytes into file)
  Start of section headers:          140224 (bytes into file)
  Number of program headers:         13
  Number of section headers:         30
```

The magic bytes `7f 45 4c 46` spell out `\x7fELF` — this is how the kernel identifies an ELF file. The header structure is defined in the Linux kernel at [`include/uapi/linux/elf.h`](https://github.com/torvalds/linux/blob/master/include/uapi/linux/elf.h):

```c
typedef struct elf64_hdr {
    unsigned char e_ident[16];  /* "\x7fELF" + class + endianness + ... */
    Elf64_Half    e_type;       /* ET_EXEC, ET_DYN, ET_REL, ... */
    Elf64_Half    e_machine;    /* EM_X86_64, EM_AARCH64, ... */
    Elf64_Word    e_version;    /* EV_CURRENT */
    Elf64_Addr    e_entry;      /* virtual address of first instruction */
    Elf64_Off     e_phoff;      /* offset to program header table */
    Elf64_Off     e_shoff;      /* offset to section header table */
    Elf64_Word    e_flags;      /* processor-specific flags */
    Elf64_Half    e_ehsize;     /* size of this header (64 bytes) */
    Elf64_Half    e_phentsize;  /* size of one program header entry */
    Elf64_Half    e_phnum;      /* number of program header entries */
    Elf64_Half    e_shentsize;  /* size of one section header entry */
    Elf64_Half    e_shnum;      /* number of section header entries */
    Elf64_Half    e_shstrndx;   /* index of the section name string table */
} Elf64_Ehdr;
```

The most important field for loading is `e_entry` — the virtual memory address where the CPU will start executing. For a dynamically linked executable, this points to `_start` in your program (not `main` — we'll see why later).

## Sections vs Segments: Two Views of the Same File

This is the most confusing part of ELF for newcomers. The same file has two overlapping organizational schemes:

```
         File on disk                  Two views of the same bytes

  +========================+     Linking View          Loading View
  |     ELF Header         |     (Sections)           (Segments)
  +========================+
  |  .text  (code)         | --> [.text section]   --> [LOAD segment, R+X]
  |  .rodata (strings)     | --> [.rodata section] -/
  +------------------------+
  |  .data  (globals)      | --> [.data section]   --> [LOAD segment, R+W]
  |  .bss   (zeroed)       | --> [.bss section]    -/
  +========================+

  Sections: fine-grained, named, used by linker (ld) and debugger (gdb)
  Segments: coarse-grained, used by kernel to set up memory mappings
```

**Sections** are the linker's view. When the linker (`ld`) combines multiple `.o` files into an executable, it merges `.text` sections together, `.data` sections together, and so on. Each section has a name, type, and flags. An executable can be **stripped** of its section headers entirely and still run — the kernel doesn't need them.

**Segments** (described by program headers) are the kernel's view. Each segment says: "map these bytes from file offset X to virtual address Y, with permissions R/W/X." The kernel only reads the program header table to load a binary.

You can see both views with `readelf`:

```bash
# Sections (linker view)
$ readelf -S /bin/ls | head -20

# Segments (kernel view)
$ readelf -l /bin/ls
```

A typical `readelf -l` output looks like:

```
Program Headers:
  Type      Offset   VirtAddr           FileSiz  MemSiz   Flg Align
  PHDR      0x000040 0x0000000000000040 0x0002d8 0x0002d8 R   0x8
  INTERP    0x000318 0x0000000000000318 0x00001c 0x00001c R   0x1
      [Requesting program interpreter: /lib64/ld-linux-x86-64.so.2]
  LOAD      0x000000 0x0000000000000000 0x022e50 0x022e50 R   0x1000
  LOAD      0x023000 0x0000000000023000 0x013581 0x013581 R E 0x1000
  LOAD      0x037000 0x0000000000037000 0x007530 0x007530 R   0x1000
  LOAD      0x03ef50 0x000000000003ff50 0x001098 0x002560 RW  0x1000
  DYNAMIC   0x03f9f8 0x00000000000409f8 0x0001f0 0x0001f0 RW  0x8
  ...
```

Each `LOAD` segment becomes one `mmap()` call by the kernel. The `INTERP` segment names the dynamic linker. Let's see how the kernel uses this.

## The Loading Process: From `execve()` to Running Code

When you run `./hello`, the shell calls the `execve()` system call. Here is what happens inside the kernel, step by step:

```
  Shell                    Kernel                              User Space
    |                        |                                      |
    |  execve("./hello",     |                                      |
    |         argv, envp)    |                                      |
    |----------------------->|                                      |
    |                        |                                      |
    |               1. Open file, read first 128 bytes              |
    |               2. Check magic: "\x7fELF"?                      |
    |               3. Call load_elf_binary()                        |
    |                        |                                      |
    |               4. Parse program headers                        |
    |               5. mmap() each LOAD segment                     |
    |               6. Set up stack (argv, envp, auxv)              |
    |               7. Found PT_INTERP? Load ld-linux.so            |
    |                        |                                      |
    |               8. Set instruction pointer:                     |
    |                  - static: e_entry of hello                   |
    |                  - dynamic: e_entry of ld-linux.so            |
    |                        |                                      |
    |               9. Return to user space                         |
    |                        |-------------------------------------->|
    |                        |                                      |
    |                        |           (if dynamic linking)       |
    |                        |           ld-linux.so runs:          |
    |                        |           - load shared libraries    |
    |                        |           - resolve symbols          |
    |                        |           - jump to hello's _start   |
    |                        |                                      |
    |                        |           _start calls __libc_start_main
    |                        |           which calls main()         |
```

### Step 1-3: Identifying the Binary Format

The kernel's `execve()` implementation lives in [`fs/exec.c`](https://github.com/torvalds/linux/blob/master/fs/exec.c). It reads the first 128 bytes of the file (the `struct linux_binprm` buffer) and tries each registered binary handler:

```c
/* fs/exec.c — simplified */
static int search_binary_handler(struct linux_binprm *bprm)
{
    list_for_each_entry(fmt, &formats, lh) {
        retval = fmt->load_binary(bprm);
        if (retval == 0)
            return 0;  /* success — process is now replaced */
    }
    return retval;
}
```

The ELF handler checks for the `\x7fELF` magic and calls `load_elf_binary()` in [`fs/binfmt_elf.c`](https://github.com/torvalds/linux/blob/master/fs/binfmt_elf.c). This is one of the most important functions in the Linux kernel for user-space programs.

### Step 4-5: Mapping Segments into Memory

`load_elf_binary()` iterates through the program headers and maps each `PT_LOAD` segment:

```c
/* fs/binfmt_elf.c — simplified */
static int load_elf_binary(struct linux_binprm *bprm)
{
    struct elfhdr *elf_ex = (struct elfhdr *)bprm->buf;

    /* Validate: is this really an ELF executable? */
    if (memcmp(elf_ex->e_ident, ELFMAG, SELFMAG) != 0)
        return -ENOEXEC;

    /* Read program header table from file */
    elf_phdata = load_elf_phdrs(elf_ex, bprm->file);

    /* Look for PT_INTERP (dynamic linker path) */
    for (i = 0; i < elf_ex->e_phnum; i++) {
        if (elf_phdata[i].p_type == PT_INTERP) {
            /* Read the interpreter path, e.g. "/lib64/ld-linux-x86-64.so.2" */
            elf_interpreter = kmalloc(elf_phdata[i].p_filesz, GFP_KERNEL);
            elf_read(bprm->file, elf_interpreter, ...);
            /* Open and validate the interpreter ELF */
            interpreter = open_exec(elf_interpreter);
            break;
        }
    }

    /* Flush the old process image */
    retval = begin_new_exec(bprm);

    /* Map each LOAD segment */
    for (i = 0; i < elf_ex->e_phnum; i++) {
        if (elf_phdata[i].p_type != PT_LOAD)
            continue;
        error = elf_map(bprm->file, load_bias + vaddr,
                        &elf_phdata[i], prot, type, total_size);
    }

    /* Set up BSS (zero-filled pages beyond file data) */
    set_brk(elf_bss, elf_brk, bss_prot);

    /* If there's an interpreter, load it too */
    if (interpreter) {
        elf_entry = load_elf_interp(interp_elf_ex, interpreter, ...);
    } else {
        elf_entry = elf_ex->e_entry;
    }

    /* Set the instruction pointer */
    START_THREAD(regs, elf_entry, bprm->p);
    return 0;
}
```

Each `elf_map()` call translates to an `mmap()` that maps a chunk of the file into the process's virtual address space. The permissions come from the segment's flags: `PF_R` → readable, `PF_W` → writable, `PF_X` → executable.

After this function returns, the old process is gone — its memory, file descriptors (marked close-on-exec), and signal handlers are replaced. There is no going back from `execve()`.

### Step 6: Setting Up the Stack

Before jumping to user code, the kernel prepares the stack with everything the program needs to start:

```
  High address (stack grows downward)
  +================================+
  |  environment strings           |   "PATH=/usr/bin:..."
  |  "HOME=/home/user"             |
  +--------------------------------+
  |  argument strings              |   "./hello"
  |  "world"                       |
  +--------------------------------+
  |  padding / alignment           |
  +================================+
  |  auxv[N] = {AT_NULL, 0}        |   end marker
  |  auxv[2] = {AT_ENTRY, 0x401000}|   program entry point
  |  auxv[1] = {AT_PHDR, 0x400040} |   program header address
  |  auxv[0] = {AT_PHNUM, 13}      |   number of program headers
  +--------------------------------+
  |  NULL                          |   end of envp[]
  |  envp[1] = ptr to "HOME=..."   |
  |  envp[0] = ptr to "PATH=..."   |
  +--------------------------------+
  |  NULL                          |   end of argv[]
  |  argv[1] = ptr to "world"      |
  |  argv[0] = ptr to "./hello"    |
  +--------------------------------+
  |  argc = 2                      |   <-- initial stack pointer
  +================================+
  Low address
```

The **auxiliary vector** (`auxv`) is particularly interesting. It passes kernel-level information to user space that the dynamic linker and C library need: the location of program headers in memory, the page size, the UID/GID, and more. The dynamic linker reads `AT_PHDR` and `AT_PHNUM` to find the program's own program headers without re-reading the file.

## Dynamic Linking: PLT and GOT

Most real-world programs are dynamically linked — they call functions in shared libraries like `libc.so`. But at compile time, the linker doesn't know where `printf` will be in memory (shared libraries are loaded at random addresses due to ASLR). ELF solves this with two cooperating data structures: the **PLT** (Procedure Linkage Table) and the **GOT** (Global Offset Table).

### The First Call: Lazy Binding

When your code calls `printf` for the first time, here is what actually happens:

```
  Your code                PLT                    GOT                  ld-linux.so
     |                      |                      |                      |
     | call printf@plt      |                      |                      |
     |--------------------->|                      |                      |
     |                      |                      |                      |
     |              jmp *GOT[printf]               |                      |
     |                      |--------------------->|                      |
     |                      |                      |                      |
     |                      |  (first time: GOT    |                      |
     |                      |   points back to PLT)|                      |
     |                      |<---------------------|                      |
     |                      |                      |                      |
     |              push relocation_index          |                      |
     |              jmp PLT[0] (resolver)          |                      |
     |                      |--------------------------------------------->|
     |                      |                      |                      |
     |                      |                      |   _dl_runtime_resolve:|
     |                      |                      |   1. look up "printf" |
     |                      |                      |      in libc.so      |
     |                      |                      |   2. patch GOT entry |
     |                      |                      |      to real address |
     |                      |                      |   3. jump to printf  |
     |                      |                      |<------ patch --------|
     |                      |                      |                      |
     |  printf runs         |                      |                      |
     |<--------------------------------------------------------------------|
```

### The Second Call: Direct Jump

After the first call, the GOT entry has been patched to point directly to `printf` in `libc.so`:

```
  Your code                PLT                    GOT
     |                      |                      |
     | call printf@plt      |                      |
     |--------------------->|                      |
     |                      |                      |
     |              jmp *GOT[printf]               |
     |                      |--------------------->|
     |                      |                      |
     |                      |  (GOT now points to  |
     |                      |   real printf!)       |
     |                      |                      |
     |  printf runs         |                      |
     |<-------------------------------------------------+
```

No resolver, no lookup — just an indirect jump through the GOT. This is **lazy binding**: symbols are resolved on first use, not at program startup. It makes startup faster because unused functions are never resolved.

### The Assembly

Here is what `printf@plt` typically looks like in x86-64:

```asm
; PLT entry for printf (index 1)
printf@plt:
    jmp    QWORD PTR [rip+0x2fe2]   ; jump through GOT[printf]
    push   0x0                       ; relocation index
    jmp    PLT[0]                    ; fall through to resolver stub

; PLT[0] — the resolver stub
PLT[0]:
    push   QWORD PTR [rip+0x2fe4]   ; push link_map pointer
    jmp    QWORD PTR [rip+0x2fe6]   ; jump to _dl_runtime_resolve
```

The GOT is a writable table of function pointers in the `.got.plt` section. Initially, each entry points back to the `push` instruction in the corresponding PLT entry (the fallback path). After resolution, it points to the actual function.

You can see this in action with GDB:

```bash
$ gdb ./hello
(gdb) break main
(gdb) run
(gdb) x/gx &printf@got.plt       # before first call
0x404018:  0x0000000000401036     # points to PLT fallback
(gdb) call printf("test\n")
(gdb) x/gx &printf@got.plt       # after first call
0x404018:  0x00007ffff7e44e10     # points to printf in libc
```

## The Dynamic Linker: `ld-linux.so`

The dynamic linker (`/lib64/ld-linux-x86-64.so.2`) is itself an ELF shared object, but it is special: it must be able to bootstrap itself without any external dependencies. The kernel loads it and jumps to its entry point before your program runs.

The dynamic linker's job:

```
  Kernel loads ld-linux.so and jumps to its entry point
                    |
                    v
  +------------------------------------------+
  |  1. Relocate itself (bootstrap)          |
  |     - ld-linux.so is position-independent|
  |     - patches its own GOT entries        |
  +------------------------------------------+
                    |
                    v
  +------------------------------------------+
  |  2. Read the program's DYNAMIC segment   |
  |     - find DT_NEEDED entries (shared     |
  |       libraries the program depends on)  |
  |     - find DT_RPATH / DT_RUNPATH         |
  +------------------------------------------+
                    |
                    v
  +------------------------------------------+
  |  3. Load shared libraries (recursive)    |
  |     - open libc.so, libm.so, etc.        |
  |     - mmap their LOAD segments           |
  |     - process THEIR DT_NEEDED entries    |
  +------------------------------------------+
                    |
                    v
  +------------------------------------------+
  |  4. Perform relocations                  |
  |     - patch GOT entries for globals      |
  |     - set up PLT stubs for lazy binding  |
  +------------------------------------------+
                    |
                    v
  +------------------------------------------+
  |  5. Run initialization functions          |
  |     - call .init and .init_array entries  |
  |       for each loaded library             |
  +------------------------------------------+
                    |
                    v
  +------------------------------------------+
  |  6. Transfer control to the program      |
  |     - jump to e_entry (which is _start)  |
  +------------------------------------------+
                    |
                    v
         _start -> __libc_start_main -> main()
```

The `DYNAMIC` segment (visible as `readelf -d`) is a table of key-value pairs that the dynamic linker reads. Key entries include:

```
$ readelf -d /bin/ls | head -15
Dynamic section at offset 0x3f9f8:
  Tag        Type          Name/Value
  0x0000001  (NEEDED)      Shared library: [libselinux.so.1]
  0x0000001  (NEEDED)      Shared library: [libc.so.6]
  0x000000c  (INIT)        0x4000
  0x000000d  (FINI)        0x36c14
  0x0000019  (INIT_ARRAY)  0x3ef50
  0x0000017  (JMPREL)      0x1d4d8       <-- PLT relocations
  0x0000002  (PLTRELSZ)    2688
  0x0000003  (PLTGOT)      0x40b80       <-- GOT address
  ...
```

The glibc implementation lives in [`elf/dl-load.c`](https://sourceware.org/git/?p=glibc.git;a=blob;f=elf/dl-load.c) (loading) and [`elf/dl-runtime.c`](https://sourceware.org/git/?p=glibc.git;a=blob;f=elf/dl-runtime.c) (lazy symbol resolution).

## From `_start` to `main()`

Even after the dynamic linker finishes, your program doesn't jump straight to `main()`. The C runtime has its own startup sequence:

```
  ld-linux.so
       |
       | jumps to _start (in crt1.o, linked into your binary)
       v
  _start:                              (arch-specific assembly)
       xor  %ebp, %ebp                ; mark outermost stack frame
       mov  (%rsp), %rdi              ; argc
       lea  8(%rsp), %rsi             ; argv
       call __libc_start_main
       |
       v
  __libc_start_main:                   (in libc.so)
       - set up thread-local storage
       - register atexit handlers
       - call __libc_csu_init()        ; runs .init_array constructors
       - call main(argc, argv, envp)
       - call exit(return_value)       ; runs atexit handlers, .fini_array
```

The `_start` function comes from `crt1.o` (C Runtime startup object), which the linker automatically includes. It is the true entry point of your program. By the time `main()` runs, the C library is fully initialized: `stdout` is set up, the heap is ready, and signal handlers are in their default state.

## Position-Independent Code and ASLR

Modern executables are compiled as **PIE** (Position-Independent Executables). This means the entire binary can be loaded at any address, not just the one hardcoded in the ELF headers. Combined with ASLR (Address Space Layout Randomization), the base address changes every run:

```
  Run 1:                          Run 2:
  +------------------+            +------------------+
  | 0x55a3f0000000   |            | 0x560012340000   |
  |   .text          |            |   .text          |
  | 0x55a3f0200000   |            | 0x560012540000   |
  |   .data          |            |   .data          |
  +------------------+            +------------------+
  | 0x7f3a10000000   |            | 0x7f8b20000000   |
  |   libc.so        |            |   libc.so        |
  +------------------+            +------------------+
  | 0x7ffd50000000   |            | 0x7ffc80000000   |
  |   stack          |            |   stack          |
  +------------------+            +------------------+
```

The kernel achieves this by adding a random `load_bias` to all segment addresses in `load_elf_binary()`:

```c
/* fs/binfmt_elf.c — for ET_DYN (PIE) binaries */
if (elf_ex->e_type == ET_DYN) {
    load_bias = ELF_ET_DYN_BASE;   /* base address */
    if (current->flags & PF_RANDOMIZE)
        load_bias += arch_mmap_rnd(); /* random offset */
}
```

Position-independent code uses **RIP-relative addressing** (on x86-64) — instructions reference data relative to the current instruction pointer, not via absolute addresses. This is why PIE code works at any load address without patching every instruction.

## Practical Tools

Here are the essential tools for inspecting ELF files:

```bash
# Full header
readelf -h /bin/ls

# Program headers (segments — what the kernel sees)
readelf -l /bin/ls

# Section headers (what the linker and debugger see)
readelf -S /bin/ls

# Dynamic section (shared library dependencies)
readelf -d /bin/ls

# Symbol table
readelf -s /bin/ls

# Shared library dependencies (recursive)
ldd /bin/ls

# Disassemble a section
objdump -d -j .text /bin/ls | head -40

# Hex dump a section
objdump -s -j .rodata /bin/ls | head -20

# Trace dynamic linker activity
LD_DEBUG=libs ./hello     # show library loading
LD_DEBUG=bindings ./hello # show symbol resolution
LD_DEBUG=all ./hello      # show everything
```

`LD_DEBUG` is particularly powerful for debugging dynamic linking issues. Setting it to `all` produces verbose output showing every step the dynamic linker takes.

## Summary

The journey from `./hello` to a running process involves a precise collaboration between the compiler, the kernel, and the dynamic linker:

```
  gcc hello.c -o hello
         |
         | produces ELF with headers, sections, segments
         v
  ./hello
         |
         | shell calls execve()
         v
  Kernel: load_elf_binary()
         |
         | reads ELF header and program headers
         | mmap() each LOAD segment
         | sets up stack with argc, argv, envp, auxv
         | loads ld-linux.so (if PT_INTERP present)
         v
  ld-linux.so
         |
         | loads shared libraries (libc.so, etc.)
         | resolves non-lazy relocations
         | sets up PLT/GOT for lazy binding
         | calls .init_array constructors
         v
  _start -> __libc_start_main -> main()
         |
         | your code runs
         | printf@plt -> GOT -> _dl_runtime_resolve -> printf
         | (second call: printf@plt -> GOT -> printf directly)
         v
  exit() -> .fini_array destructors -> _exit()
```

ELF is elegant in its separation of concerns. The format itself is just a container with two indexing schemes (sections and segments). The kernel only needs segments to load the binary. The linker only needs sections to build it. The dynamic linker bridges runtime resolution. And all of it happens in milliseconds, thousands of times a day, every time you run a command.

## References

1. ELF specification (System V ABI) [pdf](https://refspecs.linuxfoundation.org/elf/elf.pdf)
2. Linux kernel ELF loader [`fs/binfmt_elf.c`](https://github.com/torvalds/linux/blob/master/fs/binfmt_elf.c)
3. Linux kernel ELF header definitions [`include/uapi/linux/elf.h`](https://github.com/torvalds/linux/blob/master/include/uapi/linux/elf.h)
4. Linux kernel `execve` implementation [`fs/exec.c`](https://github.com/torvalds/linux/blob/master/fs/exec.c)
5. glibc dynamic linker source [`elf/dl-load.c`](https://sourceware.org/git/?p=glibc.git;a=blob;f=elf/dl-load.c)
6. glibc lazy resolution [`elf/dl-runtime.c`](https://sourceware.org/git/?p=glibc.git;a=blob;f=elf/dl-runtime.c)
7. Ian Lance Taylor, "Linkers" blog series [blog](https://www.airs.com/blog/archives/38)
8. Eli Bendersky, "How statically linked programs run on Linux" [blog](https://eli.thegreenplace.net/2012/08/13/how-statically-linked-programs-run-on-linux)
9. LWN.net, "How programs get run" [article](https://lwn.net/Articles/630727/)
