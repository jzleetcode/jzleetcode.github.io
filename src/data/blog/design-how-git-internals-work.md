---
author: JZ
pubDatetime: 2026-05-02T12:00:00Z
modDatetime: 2026-05-02T12:00:00Z
title: System Design - How Git Internals Work
tags:
  - design-system
  - design-storage
description:
  "How Git works under the hood: the four object types (blob, tree, commit, tag), content-addressable storage, refs and branches, the staging area (index), packfiles and delta compression, and merge strategies — with ASCII diagrams and source code walkthrough from the git/git repository."
---

## Table of contents

## Context

Most developers use Git every day — `git add`, `git commit`, `git push` — without thinking about what happens underneath. Git feels like a black box that tracks file changes. But Git is not a diff-based system. It is a **content-addressable filesystem** with a version control layer on top. Understanding this distinction changes how you think about branches, merges, rebases, and even garbage collection.

Linus Torvalds created Git in 2005 to manage the Linux kernel source code after the BitKeeper license was revoked. He designed it around three goals:

1. **Speed** — operations like branching and committing should be nearly instant.
2. **Data integrity** — every object is checksummed with SHA-1 (now transitioning to SHA-256).
3. **Distributed** — every clone is a full repository with complete history.

The result is an elegant system built from just a few primitives. Let's open the hood.

## The Object Model: Four Types

Everything Git stores lives in `.git/objects/`. Each object is identified by the SHA-1 hash of its content. There are exactly four types:

```
  Git Object Types
  ================================================================

  blob          tree            commit            tag
  (file         (directory      (snapshot +       (named pointer
   content)      listing)        metadata)         to an object)

  +--------+   +-----------+   +-------------+   +----------+
  | hello  |   | blob f1   |   | tree   abc  |   | object   |
  | world  |   | blob f2   |   | parent def  |   | type     |
  |        |   | tree dir1 |   | author ...  |   | tag name |
  +--------+   +-----------+   | message ... |   | tagger   |
                               +-------------+   | message  |
                                                  +----------+

  Every object is identified by SHA-1(type + size + content)
```

### Blob: raw file content

A blob stores the contents of a single file — nothing else. No filename, no permissions, no timestamps. Just bytes. Two files with identical content share the same blob object, even if they have different names.

You can create a blob manually and inspect it:

```bash
$ echo "hello world" | git hash-object -w --stdin
95d09f2b10159347eece71399a7e2e907ea3df4f

$ git cat-file -t 95d09f2b
blob

$ git cat-file -p 95d09f2b
hello world
```

The hash is computed from a header plus the content. From [`object-file.c`](https://github.com/git/git/blob/master/object-file.c):

```c
/*
 * The object header is: "<type> <size>\0"
 * For "hello world\n" (12 bytes):
 *   "blob 12\0hello world\n"
 * SHA-1 of that entire string = 95d09f2b...
 */
void hash_object_file(const struct git_hash_algo *algo,
                      const void *buf, unsigned long len,
                      enum object_type type, struct object_id *oid)
{
    git_hash_ctx ctx;
    /* write header: "blob 12\0" */
    algo->init_fn(&ctx);
    algo->update_fn(&ctx, header, header_len);
    /* write content */
    algo->update_fn(&ctx, buf, len);
    algo->final_fn(oid->hash, &ctx);
}
```

### Tree: directory listing

A tree object maps filenames to blobs (files) or other trees (subdirectories). Each entry has a mode (permissions), a name, and a pointer (SHA-1) to another object:

```bash
$ git cat-file -p HEAD^{tree}
100644 blob 95d09f2b...  README.md
100644 blob a1b2c3d4...  main.go
040000 tree e5f6a7b8...  pkg
```

```
  Tree Structure (mirrors the filesystem)

  tree (root)
  ├── 100644  blob  95d09f  README.md
  ├── 100644  blob  a1b2c3  main.go
  └── 040000  tree  e5f6a7  pkg/
                             ├── 100644  blob  112233  handler.go
                             └── 100644  blob  445566  util.go
```

The tree format is defined in [`tree.c`](https://github.com/git/git/blob/master/tree.c). Each entry is stored as:

```
<mode> <name>\0<20-byte SHA-1>
```

No separators between entries — the null byte after the name marks the boundary before the raw hash bytes. This binary format is compact and fast to parse.

### Commit: snapshot with metadata

A commit object points to exactly one tree (the root directory at that moment) and zero or more parent commits. It also records the author, committer, and message:

```bash
$ git cat-file -p HEAD
tree 8a7b3c...
parent f4e5d6...
author Alice <alice@example.com> 1714640000 -0700
committer Alice <alice@example.com> 1714640000 -0700

Add rate limiter to API gateway
```

The key insight: **a commit does not store diffs.** It stores a complete snapshot via the tree pointer. Git computes diffs on the fly when you run `git diff` or `git log -p` by comparing the trees of two commits.

```
  Commit Chain (linear history)

  commit A          commit B          commit C
  +----------+      +----------+      +----------+
  | tree: t1 |<-----| tree: t2 |<-----| tree: t3 |  <-- HEAD
  | parent:  |      | parent:A |      | parent:B |
  | msg: ... |      | msg: ... |      | msg: ... |
  +----------+      +----------+      +----------+
       |                 |                 |
       v                 v                 v
    tree t1           tree t2           tree t3
    (snapshot)        (snapshot)        (snapshot)
```

### Tag: named pointer

An annotated tag is an object that points to another object (usually a commit) and adds a name, tagger identity, and message. Lightweight tags are just refs (see below) and don't create objects.

```bash
$ git cat-file -p v2.45.0
object 8a7b3c...
type commit
tag v2.45.0
tagger Junio C Hamano <gitster@pobox.com> 1714640000 +0000

Git 2.45.0
```

## Content-Addressable Storage

Git's object store is a **content-addressable filesystem**: the address (SHA-1 hash) is derived from the content itself. This gives Git three powerful properties for free:

1. **Deduplication.** Identical content always produces the same hash. If 50 commits share the same `LICENSE` file, only one blob exists on disk.

2. **Integrity verification.** Recompute the hash and compare. If a single bit flips in storage or transit, the hash won't match. Git checks this automatically during `git fsck` and clone operations.

3. **Immutability.** Changing an object's content changes its hash, which changes every parent that references it. You can't secretly alter history — the hashes form a Merkle tree (technically a Merkle DAG) that makes tampering evident.

```
  Merkle DAG — changing one file cascades upward

  commit C (hash: ccc)
      |
      v
  tree (hash: ttt)                If README.md changes:
  ├── blob (hash: aaa) README.md  - new blob hash: aaa'
  ├── blob (hash: bbb) main.go   - new tree hash: ttt'
  └── tree (hash: ddd) pkg/      - new commit hash: ccc'
                                  main.go and pkg/ are REUSED (same hash)
```

### On-Disk Layout: Loose Objects

When you first create an object, Git stores it as a **loose object**: a single zlib-compressed file under `.git/objects/`:

```
.git/objects/
├── 95/
│   └── d09f2b10159347eece71399a7e2e907ea3df4f   (blob)
├── 8a/
│   └── 7b3c...                                    (tree)
├── f4/
│   └── e5d6...                                    (commit)
└── info/
    └── packs
```

The first two hex characters of the hash become the directory name; the remaining 38 become the filename. This two-level fan-out keeps any single directory from having too many entries (important for filesystem performance).

The file content is: `zlib_compress("<type> <size>\0<content>")`.

## Refs: Making Hashes Human-Friendly

Nobody wants to type `git checkout 8a7b3c4d5e6f...`. **Refs** are human-readable names that point to object hashes:

```
.git/refs/
├── heads/
│   ├── main        → contains: 8a7b3c4d5e6f...
│   └── feature-x   → contains: 1a2b3c4d5e6f...
├── tags/
│   └── v1.0        → contains: aabbccdd...
└── remotes/
    └── origin/
        └── main    → contains: 8a7b3c4d5e6f...
```

A branch is just a file containing a 40-character SHA-1 hash. Creating a branch is writing 41 bytes to a file. That's why `git branch feature-x` is instantaneous — there's no copying of files or history.

**HEAD** is a special ref that usually points to another ref (a "symbolic ref"):

```bash
$ cat .git/HEAD
ref: refs/heads/main
```

When you `git checkout feature-x`, Git updates HEAD to `ref: refs/heads/feature-x`. When you commit, Git:

1. Creates the new commit object.
2. Writes the commit's hash into the file that HEAD points to (e.g., `.git/refs/heads/feature-x`).

This is how branches "move forward" — the ref file is updated to the new commit hash.

```
  How branching works

  Before:
                    main
                      |
                      v
  A <--- B <--- C <--- D

  After: git checkout -b feature

                    main   feature (HEAD)
                      |       |
                      v       v
  A <--- B <--- C <--- D

  After: git commit (on feature)

                    main   feature (HEAD)
                      |       |
                      v       v
  A <--- B <--- C <--- D <--- E
```

No files were copied. The only change was creating a new ref file and later updating it.

## The Index (Staging Area)

Between your working directory and the object store sits the **index** (also called the staging area or cache). It's a binary file at `.git/index` that records what will go into the next commit.

```
  Working Directory          Index              Object Store
  (filesystem)          (.git/index)         (.git/objects/)
  +-----------------+   +---------------+    +----------------+
  | README.md       |   | README.md     |    | blob 95d09f    |
  | main.go  (edit) |   | main.go       |    | blob a1b2c3    |
  | pkg/handler.go  |   | pkg/handler.go|    | blob 112233    |
  +-----------------+   +---------------+    +----------------+

  git add main.go:
  1. Hash the new content → new blob object in store
  2. Update index entry for main.go to point to new blob hash

  git commit:
  1. Write tree objects from the index entries
  2. Create commit object pointing to root tree + parent
  3. Update branch ref to new commit hash
```

The index format (defined in [`read-cache.c`](https://github.com/git/git/blob/master/read-cache.c)) is optimized for speed. Each entry stores:

- **ctime/mtime** — filesystem timestamps for detecting changes without reading file content (the "stat cache" optimization)
- **device, inode** — to detect renames and moves
- **mode** — file permissions
- **SHA-1** — hash of the staged content
- **flags** — merge stage, assume-unchanged, etc.
- **path** — the file's path relative to the repo root

When you run `git status`, Git compares the working directory against the index (to show unstaged changes) and the index against HEAD's tree (to show staged changes). The stat data makes this comparison fast — Git only reads and hashes files whose timestamps changed.

## Packfiles: Compressing History

Loose objects work well for recent data, but a repository with millions of objects would waste space and inodes. Git solves this with **packfiles**.

### When packing happens

Git automatically packs objects during `git gc` (which `git push`, `git pull`, and periodic maintenance trigger). You can also run it manually:

```bash
$ git gc
# or
$ git repack -a -d
```

### How a packfile works

A packfile (`.git/objects/pack/*.pack`) stores many objects in a single file, using **delta compression**:

```
  Packfile Structure

  +------------------+
  | PACK header      |  "PACK" magic + version + object count
  +------------------+
  | Object 1         |  full object (base)
  |   type + size    |
  |   zlib(content)  |
  +------------------+
  | Object 2         |  delta (references Object 1)
  |   type: OFS_DELTA|
  |   base offset    |
  |   zlib(delta)    |  "copy bytes 0-500 from base, insert 'new text'"
  +------------------+
  | Object 3         |  delta (references Object 2)
  |   ...            |
  +------------------+
  | ...              |
  +------------------+
  | SHA-1 checksum   |  integrity check for the entire file
  +------------------+

  Companion: .idx file (index for random access into the .pack)
```

Delta compression finds similar objects and stores only the differences. The delta format (from [`delta.h`](https://github.com/git/git/blob/master/delta.h)) uses two instruction types:

```
  Delta instruction set (extremely simple)

  Copy instruction:     1xxxxxxx  (copy N bytes from base at offset O)
    - followed by offset and size bytes (variable-length encoding)

  Insert instruction:   0xxxxxxx  (insert the next N bytes literally)
    - followed by N raw bytes
```

### Choosing delta bases

Git's packing heuristic (in [`pack-objects.c`](https://github.com/git/git/blob/master/pack-objects.c)) sorts objects by type, then filename, then size. Objects with similar names and sizes are likely similar content (e.g., different versions of the same file), so they become good delta candidates. Git tries multiple potential bases and picks the one that produces the smallest delta.

```
  Delta chain example

  v1 of main.go (1000 lines)  ← stored in full (base object)
       |
       | delta: +5 lines at line 200
       v
  v2 of main.go               ← stored as delta (~50 bytes)
       |
       | delta: -2 lines at line 50, +10 lines at line 800
       v
  v3 of main.go               ← stored as delta (~80 bytes)
```

Without packing: 3 × ~30KB = 90KB. With packing: 30KB + 50B + 80B ≈ 30.1KB. The savings are dramatic for files that change incrementally.

### The pack index (.idx)

The `.idx` file provides $O(\log n)$ random access into the packfile. It contains a fan-out table (256 entries, one per first byte of SHA-1) followed by sorted SHA-1 hashes and their offsets into the `.pack` file:

```
  Pack Index Structure

  +-----------------------+
  | Fan-out table         |  256 × 4 bytes
  | [0x00] = count of     |  "how many objects have hash starting
  |          objects with  |   with 0x00 or less?"
  |          hash <= 0x00  |
  | [0x01] = count <= 0x01|
  | ...                   |
  | [0xff] = total count  |
  +-----------------------+
  | Sorted SHA-1 hashes   |  20 bytes × N objects
  +-----------------------+
  | CRC32 checksums       |  4 bytes × N
  +-----------------------+
  | Pack offsets           |  4 bytes × N (or 8 for large packs)
  +-----------------------+
  | Pack checksum         |
  | Index checksum        |
  +-----------------------+
```

To find an object: use the first byte as an index into the fan-out table to narrow the search range, then binary search within that range.

## The Merge Machinery

When you run `git merge feature-x`, Git needs to combine two diverged histories. The algorithm has three main steps.

### Step 1: Find the merge base

Git walks both branch histories backward to find the **most recent common ancestor** — the merge base:

```
  Finding the merge base

         main                    feature-x
           |                        |
           v                        v
  A <-- B <-- C <-- D          E <-- F
               \                   /
                +------ B --------+
                        ^
                   merge base

  B is the most recent commit reachable from both D and F.
```

Git uses the algorithm in [`commit-reach.c`](https://github.com/git/git/blob/master/commit-reach.c), which is essentially a breadth-first search from both tips, marking commits as reachable from one side or both. The first commit marked as reachable from both is the merge base.

### Step 2: Three-way merge

With the merge base identified, Git does a **three-way merge** by comparing each file across three versions:

```
  Three-way merge logic

  Base (B)     Ours (D)     Theirs (F)     Result
  --------     --------     ----------     ------
  line A       line A       line A         line A      (all same)
  line B       line B'      line B         line B'     (we changed)
  line C       line C       line C'        line C'     (they changed)
  line D       line D'      line D''       CONFLICT    (both changed)
```

The merge driver (in [`ll-merge.c`](https://github.com/git/git/blob/master/ll-merge.c)) processes each file:

- **Both sides identical to base:** no change needed.
- **Only one side changed:** take that side's version.
- **Both sides changed the same way:** take either (they're identical).
- **Both sides changed differently:** mark as conflict; write conflict markers.

### Step 3: Create the merge commit

If there are no conflicts (or after the user resolves them), Git creates a commit with **two parents**:

```
  After merge

           main (HEAD)
              |
              v
  A <-- B <-- C <-- D <-- M
               \         /
                E <-- F--+
                      ^
                  feature-x
```

The merge commit `M` has `parent D` and `parent F`. Its tree is the result of the three-way merge.

### Fast-forward merges

If main hasn't diverged (no new commits since the branch point), Git can simply move the main ref forward:

```
  Fast-forward merge

  Before:
  A <-- B <-- C      (main)
                \
                 D <-- E   (feature-x)

  After: git merge feature-x
  A <-- B <-- C <-- D <-- E   (main, feature-x)

  No merge commit created — main just moved forward.
```

## Garbage Collection

Objects that are no longer reachable from any ref (branch, tag, or reflog entry) become garbage. This happens when you rebase, amend commits, or delete branches. `git gc` cleans them up:

```
  Garbage collection

  Before reset:
  A <-- B <-- C <-- D    (main points to D)

  After git reset --hard B:
  A <-- B                 (main points to B)
           \
            C <-- D       unreachable (but still in .git/objects)

  After git gc (with reflog expired):
  A <-- B                 (main points to B)
                          C and D are deleted
```

By default, unreachable objects are kept for **14 days** (controlled by `gc.pruneExpire`). The reflog also keeps references to old HEAD positions for **90 days** (`gc.reflogExpire`), so `git reflog` can help you recover "lost" commits within that window.

## Putting It All Together

Here is the complete flow of a typical Git workflow, showing which internal structures are involved:

```
  $ echo "hello" > file.txt

  Working Directory    Index    Object Store    Refs
  +------------+
  | file.txt   |
  +------------+

  $ git add file.txt

  Working Directory    Index         Object Store    Refs
  +------------+    +----------+    +----------+
  | file.txt   |    | file.txt |    | blob aaa |
  +------------+    | hash:aaa |    +----------+
                    +----------+

  $ git commit -m "first"

  Working Directory    Index         Object Store         Refs
  +------------+    +----------+    +----------+      +------+
  | file.txt   |    | file.txt |    | blob aaa |      | main |
  +------------+    | hash:aaa |    | tree bbb |      | =ccc |
                    +----------+    | commit c |      +------+
                                    +----------+

  $ echo "world" >> file.txt
  $ git add file.txt
  $ git commit -m "second"

  Working Directory    Index         Object Store         Refs
  +------------+    +----------+    +----------+      +------+
  | file.txt   |    | file.txt |    | blob aaa |      | main |
  | (updated)  |    | hash:ddd |    | blob ddd |      | =fff |
  +------------+    +----------+    | tree bbb |      +------+
                                    | tree eee |
                                    | commit c |
                                    | commit f |
                                    +----------+
```

## Summary

Git's design is remarkably simple at its core:

- **Four object types** (blob, tree, commit, tag) stored in a content-addressable object store.
- **Refs** are just files containing SHA-1 hashes, making branches almost free.
- **The index** sits between the working directory and the object store, enabling precise control over what gets committed.
- **Packfiles** use delta compression to keep repositories compact.
- **Merges** use three-way comparison against a common ancestor.
- **Garbage collection** reclaims unreachable objects while keeping a safety window via the reflog.

Every "complex" Git operation — rebase, cherry-pick, stash, worktree — is built from these primitives. Understanding them makes Git predictable instead of magical.

## References

1. Git Internals chapter of Pro Git book [doc](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain)
2. Git object format [`object-file.c`](https://github.com/git/git/blob/master/object-file.c)
3. Tree object parsing [`tree.c`](https://github.com/git/git/blob/master/tree.c)
4. Index (staging area) [`read-cache.c`](https://github.com/git/git/blob/master/read-cache.c)
5. Pack object writer [`pack-objects.c`](https://github.com/git/git/blob/master/pack-objects.c)
6. Delta compression format [`delta.h`](https://github.com/git/git/blob/master/delta.h)
7. Merge base computation [`commit-reach.c`](https://github.com/git/git/blob/master/commit-reach.c)
8. Low-level merge driver [`ll-merge.c`](https://github.com/git/git/blob/master/ll-merge.c)
9. Linus Torvalds' initial Git commit (2005) [commit](https://github.com/git/git/commit/e83c5163316f89bfbde7d9ab23ca2e25604af290)
10. Git pack format documentation [doc](https://git-scm.com/docs/pack-format)
