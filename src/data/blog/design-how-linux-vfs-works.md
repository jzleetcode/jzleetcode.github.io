---
author: JZ
pubDatetime: 2026-08-27T08:00:00Z
modDatetime: 2026-08-27T08:00:00Z
title: System Design - How the Linux Virtual File System (VFS) Works
tags:
  - design-system
  - design-os
description:
  "How the Linux Virtual File System works: the abstraction layer that lets Linux support ext4, XFS, tmpfs, procfs, and hundreds of other filesystems through a single unified interface. Covers inodes, dentries, superblocks, file operations, and a source code walkthrough."
---

## Table of contents

## Context

When you type `cat /home/user/notes.txt`, you probably don't think about what filesystem stores that file. It could live on ext4, XFS, Btrfs, or even a network filesystem like NFS. Yet the same `cat` binary works regardless. How?

The answer is the **Virtual File System** (VFS) — an abstraction layer inside the Linux kernel that defines a common interface for all filesystems. Every filesystem implements this interface, and the rest of the kernel (and userspace) only talks to VFS, never directly to the underlying filesystem.

```
                    Linux I/O Stack (simplified)

  +-----------------------------------------------------+
  |              User Space                              |
  |   cat, vim, python, your application                |
  +-----------------------------------------------------+
          |  open(), read(), write(), stat()
          v
  +-----------------------------------------------------+
  |              System Call Interface                    |
  +-----------------------------------------------------+
          |
          v
  +-----------------------------------------------------+
  |          Virtual File System (VFS)                   |
  |                                                     |
  |   Defines: inode, dentry, superblock, file_ops      |
  |   Implements: path lookup, permission checks,       |
  |               caching (dcache, icache, page cache)   |
  +-----------------------------------------------------+
          |            |           |           |
          v            v           v           v
  +----------+  +----------+  +--------+  +--------+
  |   ext4   |  |   XFS    |  | tmpfs  |  | procfs |
  +----------+  +----------+  +--------+  +--------+
          |            |
          v            v
  +-----------------------------------------------------+
  |              Block Layer / Device Drivers            |
  +-----------------------------------------------------+
          |
          v
  +-----------------------------------------------------+
  |              Physical Storage (SSD, HDD, NVMe)      |
  +-----------------------------------------------------+
```

This design is powerful: you can mount a USB drive formatted with FAT32, a network share via NFS, and a RAM-backed tmpfs — all visible in the same directory tree, all accessed with the same system calls. VFS makes this possible.

## The Four Core Objects

VFS defines four fundamental data structures. Every filesystem must provide implementations for (most of) them. Think of these as the "interface" that filesystems implement:

```
  +------------------+     +------------------+     +------------------+
  |   superblock     |     |     inode        |     |     dentry       |
  |                  |     |                  |     |                  |
  | One per mounted  |     | One per file/dir |     | One per path     |
  | filesystem       |     | on disk          |     | component        |
  |                  |     |                  |     |                  |
  | - fs type        |     | - permissions    |     | - name           |
  | - block size     |     | - size           |     | - parent dentry  |
  | - root inode     |     | - timestamps     |     | - inode pointer  |
  | - operations     |     | - data block     |     | - children list  |
  |   table          |     |   pointers       |     |                  |
  +------------------+     | - link count     |     +------------------+
                           | - operations     |
                           |   table          |     +------------------+
                           +------------------+     |      file        |
                                                    |                  |
                                                    | One per open()   |
                                                    | call             |
                                                    |                  |
                                                    | - current offset |
                                                    | - access mode    |
                                                    | - dentry pointer |
                                                    | - operations     |
                                                    |   table          |
                                                    +------------------+
```

Let's walk through each one.

### Superblock: the filesystem's identity card

When you mount a filesystem (`mount /dev/sda1 /mnt`), the kernel creates a **superblock** object. It holds metadata about the entire mounted filesystem: block size, maximum file size, the root inode, and a pointer to the operations table that lets VFS ask the filesystem to do things like allocate inodes or sync metadata.

From [`include/linux/fs.h`](https://github.com/torvalds/linux/blob/master/include/linux/fs.h):

```c
struct super_block {
    struct list_head        s_list;         /* list of all superblocks */
    dev_t                   s_dev;          /* device identifier */
    unsigned long           s_blocksize;    /* block size in bytes */
    loff_t                  s_maxbytes;     /* max file size */
    struct file_system_type *s_type;        /* filesystem type (ext4, xfs...) */
    const struct super_operations *s_op;    /* operations table */
    struct dentry           *s_root;        /* root directory dentry */
    /* ... many more fields ... */
};
```

The `s_op` field is the key: it's a table of function pointers that VFS calls when it needs the filesystem to do something at the superblock level:

```c
struct super_operations {
    struct inode *(*alloc_inode)(struct super_block *sb);
    void (*destroy_inode)(struct inode *);
    void (*dirty_inode)(struct inode *, int flags);
    int (*write_inode)(struct inode *, struct writeback_control *wbc);
    int (*sync_fs)(struct super_block *sb, int wait);
    int (*statfs)(struct dentry *, struct kstatfs *);
    /* ... */
};
```

Each filesystem provides its own implementation. For example, ext4 defines `ext4_alloc_inode()` that allocates an inode from its bitmap, while tmpfs defines `shmem_alloc_inode()` that simply allocates memory.

### Inode: the file's real identity

An **inode** (index node) represents a single file, directory, symlink, device, or any other object in a filesystem. Crucially, an inode is identified by a number — not by a name. Names live in dentries (we'll get there).

```c
struct inode {
    umode_t                 i_mode;     /* file type + permissions */
    unsigned int            i_flags;
    kuid_t                  i_uid;      /* owner */
    kgid_t                  i_gid;      /* group */
    const struct inode_operations *i_op;    /* inode operations */
    struct super_block      *i_sb;      /* parent superblock */
    loff_t                  i_size;     /* file size in bytes */
    struct timespec64       i_atime;    /* last access */
    struct timespec64       i_mtime;    /* last modify */
    struct timespec64       i_ctime;    /* last status change */
    unsigned long           i_ino;      /* inode number */
    unsigned int            i_nlink;    /* hard link count */
    const struct file_operations *i_fop;   /* default file operations */
    struct address_space    *i_mapping; /* page cache mapping */
    /* ... */
};
```

Two things stand out:

1. **No filename.** The inode doesn't know its own name. This is why hard links work: multiple names (dentries) can point to the same inode.
2. **Two operations tables.** `i_op` handles operations on the inode itself (creating children, looking up names, setting attributes), while `i_fop` handles operations on an *open* file (reading, writing, seeking).

The inode operations table for directories includes:

```c
struct inode_operations {
    struct dentry *(*lookup)(struct inode *, struct dentry *, unsigned int);
    int (*create)(struct mnt_idmap *, struct inode *, struct dentry *, umode_t, bool);
    int (*link)(struct dentry *, struct inode *, struct dentry *);
    int (*unlink)(struct inode *, struct dentry *);
    int (*mkdir)(struct mnt_idmap *, struct inode *, struct dentry *, umode_t);
    int (*rename)(struct mnt_idmap *, struct inode *, struct dentry *,
                  struct inode *, struct dentry *, unsigned int);
    /* ... */
};
```

### Dentry: the name-to-inode glue

A **dentry** (directory entry) connects a *name* to an *inode*. When you have the path `/home/user/notes.txt`, VFS breaks it into components: `/`, `home`, `user`, `notes.txt`. Each component is a dentry that points to an inode and to its parent dentry.

```c
struct dentry {
    unsigned int            d_flags;
    struct dentry           *d_parent;   /* parent directory's dentry */
    struct qstr             d_name;      /* the name component */
    struct inode            *d_inode;    /* the inode this name maps to */
    const struct dentry_operations *d_op;
    struct super_block      *d_sb;
    struct list_head        d_child;     /* in parent's d_subdirs list */
    struct list_head        d_subdirs;   /* our children */
    /* ... */
};
```

Dentries form a tree that mirrors the directory hierarchy:

```
  dentry: "/"
    |
    +-- dentry: "home"  -->  inode #2 (directory)
          |
          +-- dentry: "user"  -->  inode #1001 (directory)
                |
                +-- dentry: "notes.txt"  -->  inode #5042 (regular file)
```

VFS aggressively caches dentries in the **dcache** (dentry cache). This is critical for performance because path lookup is one of the most frequent operations in the kernel. Without the dcache, every `open("/home/user/notes.txt")` would require reading the directory from disk three times (once per component after `/`).

### File: the open instance

A **file** object is created every time a process calls `open()`. It represents one specific open instance — capturing the current read/write offset, the access mode (read-only, write-only, read-write), and a pointer back to the dentry/inode.

```c
struct file {
    struct path             f_path;     /* dentry + mount */
    struct inode            *f_inode;
    const struct file_operations *f_op; /* operations for this open file */
    unsigned int            f_flags;    /* O_RDONLY, O_NONBLOCK, etc. */
    fmode_t                 f_mode;
    loff_t                  f_pos;      /* current offset */
    /* ... */
};
```

Multiple processes can have separate `file` objects pointing to the same inode — each with its own `f_pos`. This is how two processes can independently read the same file at different offsets.

The file operations table is what most programmers interact with indirectly:

```c
struct file_operations {
    loff_t (*llseek)(struct file *, loff_t, int);
    ssize_t (*read)(struct file *, char __user *, size_t, loff_t *);
    ssize_t (*write)(struct file *, const char __user *, size_t, loff_t *);
    int (*open)(struct inode *, struct file *);
    int (*release)(struct inode *, struct file *);
    int (*mmap)(struct file *, struct vm_area_struct *);
    long (*unlocked_ioctl)(struct file *, unsigned int, unsigned long);
    /* ... */
};
```

## Path Lookup: From String to Inode

When userspace calls `open("/home/user/notes.txt", O_RDONLY)`, VFS needs to translate that string path into an inode. This process is called **path lookup** (or **namei**, after the original Unix function name), and it's implemented in [`fs/namei.c`](https://github.com/torvalds/linux/blob/master/fs/namei.c).

Here's the simplified algorithm:

```
  open("/home/user/notes.txt")
         |
         v
  Start at root dentry "/"   (from current->fs->root)
         |
         v
  +----------------------------------------------+
  |  For each component in the path:             |
  |                                              |
  |  1. Check dcache for (parent, "component")  |
  |     - HIT?  Use cached dentry, jump to 4    |
  |     - MISS? Continue to 2                   |
  |                                              |
  |  2. Call parent->d_inode->i_op->lookup()     |
  |     This asks the real filesystem to find    |
  |     the entry in the directory on disk       |
  |                                              |
  |  3. Filesystem returns inode, VFS creates    |
  |     a new dentry and adds it to dcache       |
  |                                              |
  |  4. Check permissions (i_mode vs. process    |
  |     credentials)                             |
  |                                              |
  |  5. If this is a mountpoint, cross into      |
  |     the child filesystem's root dentry       |
  |                                              |
  |  6. If this is a symlink, follow it          |
  |     (up to 40 levels deep to prevent loops)  |
  |                                              |
  |  7. Move to next component                   |
  +----------------------------------------------+
         |
         v
  Final component reached: inode found
         |
         v
  Allocate a `struct file`, set f_op from inode
         |
         v
  Return file descriptor to userspace
```

The `lookup` call at step 2 is where VFS delegates to the actual filesystem. For ext4, this means searching the directory's B-tree (or linear list for small directories) for the name. For procfs, it means dynamically creating an inode for a `/proc/[pid]/status` entry.

### RCU path walk: lock-free fast path

Path lookup is so common that Linux uses **RCU (Read-Copy-Update)** to make the common case lock-free. This is called "rcu-walk" mode:

```
              Path Lookup Modes

  +------------------+     +------------------+
  |    rcu-walk      |     |    ref-walk      |
  |  (fast path)     |     |  (slow path)     |
  |                  |     |                  |
  | - No locks held  |     | - Takes d_lock   |
  | - Uses RCU read  |     | - Increments     |
  |   section        |     |   reference      |
  | - Validates      |     |   counts         |
  |   sequence       |     | - Can sleep      |
  |   counters       |     | - Can call into  |
  | - Cannot sleep   |     |   filesystem     |
  | - Cannot call    |     |                  |
  |   filesystem     |     |                  |
  +------------------+     +------------------+
         |                        ^
         | dcache miss or         |
         | contention             |
         +------------------------+
            "drops to ref-walk"
```

In rcu-walk mode, the kernel traverses the dcache without taking any locks. If it finds all components in the cache and permissions check out, the entire path lookup completes without a single lock acquisition. If it encounters a cache miss or needs to call into the filesystem (which might sleep), it "drops down" to the slower ref-walk mode that takes proper references.

This optimization matters enormously: on a busy web server, millions of `open()` and `stat()` calls per second can resolve entirely in the dcache without touching disk.

## How a Filesystem Registers Itself

When you compile a filesystem into the kernel (or load it as a module), it registers with VFS by calling `register_filesystem()`:

```c
static struct file_system_type ext4_fs_type = {
    .owner      = THIS_MODULE,
    .name       = "ext4",
    .init_fs_context = ext4_init_fs_context,
    .parameters = ext4_param_specs,
    .fs_flags   = FS_REQUIRES_DEV | FS_ALLOW_IDMAP,
};

static int __init ext4_init(void)
{
    /* ... initialization ... */
    err = register_filesystem(&ext4_fs_type);
    return err;
}
module_init(ext4_init);
```

When the user runs `mount -t ext4 /dev/sda1 /mnt`, VFS:

1. Finds the registered `file_system_type` with name "ext4"
2. Calls `init_fs_context` to create a filesystem context
3. The filesystem reads the superblock from disk
4. VFS creates a `struct super_block` and connects it to the mount tree
5. The filesystem fills in the superblock's root inode and operations

From this point on, any path that crosses into `/mnt` will use ext4's operations tables.

## Concrete Example: Reading a File

Let's trace what happens when you run `cat /mnt/hello.txt` on an ext4 filesystem:

```
  User: cat /mnt/hello.txt

  1. cat calls open("/mnt/hello.txt", O_RDONLY)
     |
     v
  2. VFS path lookup:
     "/" -> dcache hit, root dentry
     "mnt" -> dcache hit, crosses mount boundary into ext4
     "hello.txt" -> dcache miss!
     |
     v
  3. VFS calls ext4_lookup(dir_inode, "hello.txt")
     - ext4 searches the directory's htree (hashed B-tree)
     - Finds inode number 12345
     - Reads inode 12345 from the inode table on disk
     - Returns new inode with i_fop = ext4_file_operations
     |
     v
  4. VFS creates dentry("hello.txt") -> inode(12345)
     Adds to dcache (next access will be a cache hit)
     |
     v
  5. VFS checks permission: inode.i_mode vs. process creds
     |
     v
  6. VFS allocates struct file:
     f_op = ext4_file_operations
     f_pos = 0
     Returns fd=3 to userspace
     |
     v
  7. cat calls read(fd=3, buf, 4096)
     |
     v
  8. VFS calls file->f_op->read -> ext4_file_read_iter()
     |
     v
  9. ext4 checks page cache (address_space):
     - Page present? Return data from RAM (no disk I/O!)
     - Page absent? Read from disk into page cache, then return
     |
     v
  10. Data copied to userspace buffer. cat writes to stdout.
```

Notice how VFS handles the generic parts (path lookup, permission check, file descriptor allocation, page cache) while ext4 handles only the filesystem-specific parts (directory lookup, on-disk inode reading).

## Pseudo-filesystems: When There's No Disk

One of VFS's most elegant features is that the "filesystem" doesn't need an actual disk. VFS just needs something that implements the operations tables. This enables **pseudo-filesystems**:

| Filesystem | Mount point | What it provides |
|-----------|-------------|-----------------|
| procfs | `/proc` | Process information, kernel tuning |
| sysfs | `/sys` | Device/driver model hierarchy |
| tmpfs | `/tmp`, `/dev/shm` | RAM-backed temporary files |
| cgroup | `/sys/fs/cgroup` | Resource control groups |
| devtmpfs | `/dev` | Device nodes |

For procfs, "reading a file" means the kernel generates content on the fly. There's no disk block to read — the `read` operation constructs the response from live kernel data structures:

```c
static int proc_pid_status(struct seq_file *m, struct pid_namespace *ns,
                           struct pid *pid, struct task_struct *task)
{
    seq_printf(m, "Name:\t%s\n", task->comm);
    seq_printf(m, "State:\t%s\n", get_task_state(task));
    seq_printf(m, "Pid:\t%d\n", pid_nr_ns(pid, ns));
    seq_printf(m, "PPid:\t%d\n", task_ppid_nr_ns(task, ns));
    /* ... dozens more fields ... */
}
```

When you `cat /proc/1234/status`, VFS does a path lookup, finds the procfs inode for that PID, calls the read operation, and procfs generates the text by inspecting the live `task_struct`. The "file" never existed on disk.

## The Page Cache: VFS's Performance Secret

Between VFS and the block layer sits the **page cache** — the kernel's cache of file data in RAM. It's managed per-inode through the `address_space` structure:

```
                        Page Cache Architecture

  +------------------+
  |  struct inode    |
  |  (file identity) |
  |                  |
  |  i_mapping ------+----> +--------------------+
  +------------------+      | struct             |
                            | address_space      |
                            |                    |
                            | - i_pages (xarray) |
                            | - a_ops            |
                            +--------+-----------+
                                     |
              +----------+-----------+-----------+----------+
              |          |           |           |          |
              v          v           v           v          v
           Page 0    Page 1      Page 2      Page 3     Page 4
           (4KB)     (4KB)       (4KB)       (4KB)      (4KB)
           [cached]  [cached]   [not present] [dirty]  [cached]
```

When VFS reads a file, it first checks the page cache. If the page is present, data is served from RAM without any disk I/O. If not (a "page fault" in the cache sense), VFS asks the filesystem to read the data from disk into a new page, which then stays cached for future reads.

Write-back is similar: `write()` goes into the page cache first (marking the page "dirty"), and the kernel's background writeback threads flush dirty pages to disk asynchronously. This is why losing power can lose recent writes — they may still be in RAM.

The `address_space_operations` table defines how the filesystem interacts with the page cache:

```c
struct address_space_operations {
    int (*read_folio)(struct file *, struct folio *);
    int (*writepages)(struct address_space *, struct writeback_control *);
    bool (*dirty_folio)(struct address_space *, struct folio *);
    /* ... */
};
```

## Mount Points: Stitching Filesystems Together

Linux's directory tree is a single unified namespace, but it's assembled from many filesystems stitched together at **mount points**. When VFS path lookup encounters a mount point, it transparently crosses from one filesystem's dentry tree into another's:

```
    Process sees one unified tree:

    /                      (rootfs)
    ├── home/              (ext4 on /dev/sda2)
    │   └── user/
    │       └── notes.txt
    ├── proc/              (procfs, no device)
    │   ├── 1/
    │   └── self/
    ├── tmp/               (tmpfs, RAM-backed)
    │   └── scratch.dat
    └── mnt/
        └── usb/           (vfat on /dev/sdb1)
            └── photo.jpg

    Under the hood, VFS tracks mount relationships:

    dentry("/") --mount--> dentry("/home")  [ext4 root]
    dentry("/") --mount--> dentry("/proc")  [procfs root]
    dentry("/") --mount--> dentry("/tmp")   [tmpfs root]
```

The `struct mount` and `struct vfsmount` track which filesystem is mounted where. During path lookup, when VFS sees that a dentry has a filesystem mounted on top of it, it follows the mount to the child filesystem's root dentry and continues lookup there.

## Why This Design Matters

The VFS abstraction has deep consequences:

1. **Userspace is filesystem-agnostic.** Applications don't need to know (or care) whether data lives on ext4, XFS, NFS, or FUSE. The same `read()` and `write()` work everywhere.

2. **New filesystems are easy to add.** To add a new filesystem, you implement the operations tables and call `register_filesystem()`. You don't touch the rest of the kernel.

3. **Everything is a file.** Devices (`/dev/sda`), process info (`/proc/pid/maps`), kernel parameters (`/sys/class/net/eth0/mtu`) — they all fit the VFS model. This unifies the programming interface.

4. **Caching is centralized.** The dcache, inode cache, and page cache benefit all filesystems automatically. A new filesystem gets caching "for free" just by plugging into VFS.

5. **Layering becomes natural.** Overlay filesystems (used by Docker), encrypted filesystems (fscrypt), and FUSE (userspace filesystems) all work by implementing VFS interfaces and delegating to lower layers.

## References

- [Linux kernel source: `include/linux/fs.h`](https://github.com/torvalds/linux/blob/master/include/linux/fs.h) — VFS data structure definitions
- [Linux kernel source: `fs/namei.c`](https://github.com/torvalds/linux/blob/master/fs/namei.c) — Path lookup implementation
- [Linux kernel source: `Documentation/filesystems/vfs.rst`](https://github.com/torvalds/linux/blob/master/Documentation/filesystems/vfs.rst) — Official VFS documentation
- Robert Love, *Linux Kernel Development*, Chapter 13: The Virtual Filesystem
- [LWN.net: A brief history of union mounts](https://lwn.net/Articles/312641/)
- [LWN.net: RCU-walk path lookup](https://lwn.net/Articles/419811/)
