---
author: JZ
pubDatetime: 2026-08-17T10:00:00Z
modDatetime: 2026-08-17T10:00:00Z
title: System Design - How Filesystem Journaling Works
tags:
  - design-system
  - design-storage
description:
  "How filesystem journaling works: the crash consistency problem, write-ahead logging in ext4/jbd2, journal transactions, checkpointing, ordered vs writeback vs journal modes, and a source code walkthrough from the Linux kernel."
---

## Table of contents

## Context: The Crash Consistency Problem

Imagine you are writing a file to disk. This single high-level operation — "append data to a file" — actually requires multiple low-level disk writes:

1. Write the new data blocks to disk.
2. Update the file's **inode** (metadata: file size, timestamp, pointers to blocks).
3. Update the **bitmap** that tracks which blocks are in use.

If the power goes out mid-operation, you might end up with:

- **Data written, but inode not updated:** The file looks unchanged. Your new data is on disk but unreachable (leaked space).
- **Inode updated, but data not written:** The file size increased, but the new blocks contain garbage (or worse, someone else's data).
- **Inode and data updated, but bitmap not updated:** The blocks appear free, so they can be allocated to another file (corruption).

This is the **crash consistency problem**: how do you ensure that multi-step disk operations leave the filesystem in a consistent state, even if the system crashes partway through?

The naive solution is **fsck** (filesystem check): scan the entire disk on boot, reconstruct metadata, fix inconsistencies. This works, but for a multi-terabyte disk, fsck can take hours. You cannot afford that downtime.

The modern solution is **journaling** (also called **write-ahead logging** in databases). Before making changes to the filesystem, you write a description of those changes to a special on-disk area called the **journal**. If the system crashes, you replay the journal on the next boot. Recovery takes seconds instead of hours because you only need to check the journal, not the entire disk.

Linux ext4 uses the **jbd2** (Journaling Block Device 2) layer to implement journaling. Let's see how it works.

## Write-Ahead Logging: The Core Idea

The fundamental principle is simple:

1. **Log first:** Write the changes to the journal.
2. **Commit:** Mark the journal entry as complete (with a commit block).
3. **Checkpoint:** Write the changes to their final locations on disk.
4. **Free the log space:** Once checkpointing is done, the journal space can be reused.

If the system crashes:

- **After step 1, before step 2:** The journal entry is incomplete (no commit block). Discard it. The filesystem is unchanged.
- **After step 2, before step 3:** The journal entry is complete. Replay it on the next boot to finish the operation.
- **After step 3:** The changes are on disk. The journal entry can be ignored (or cleaned up).

This guarantees **atomicity**: either the entire multi-step operation happens, or none of it happens. The filesystem is never left in a half-updated state.

## Journal Layout on Disk

The journal is a **circular log** stored in a reserved area of the disk (either as a file inside the filesystem, or as a separate partition). It consists of several types of blocks:

```
 Journal Structure (circular buffer)

 +------------------+
 |   Superblock     |  Stores journal metadata (start, end, sequence numbers)
 +------------------+
 |   Descriptor     |  Lists which blocks are in this transaction
 |   Block          |
 +------------------+
 |   Data/Metadata  |  The actual changed blocks (metadata or data)
 |   Block          |
 +------------------+
 |   Data/Metadata  |
 |   Block          |
 +------------------+
 |   Commit Block   |  Marks the transaction as complete (with checksum)
 +------------------+
 |   Descriptor     |  Next transaction starts here
 |   Block          |
 +------------------+
 |      ...         |
 +------------------+
 |   (wraps around  |
 |    to beginning) |
 +------------------+
```

Each **transaction** in the journal consists of:

1. **Descriptor block(s):** Lists the block numbers that are part of this transaction (e.g., "blocks 1024, 1025, 2048").
2. **Data/metadata blocks:** The actual content of those blocks (copied from memory before being written to their final locations).
3. **Commit block:** Marks the transaction as complete. Contains a checksum (CRC32) so the system can detect incomplete or corrupted transactions.

There is also a **revoke block** (not shown) used to cancel a previously journaled block if it was freed before checkpointing.

The **superblock** (not to be confused with the filesystem superblock) stores:

- `s_start`: The first valid block in the journal (head of the log).
- `s_sequence`: The transaction ID of the oldest transaction in the journal.
- `s_first`: The physical block number where the journal begins.

The journal wraps around: when it reaches the end of the reserved space, new transactions start writing at the beginning again (overwriting old, checkpointed transactions).

## Transaction Lifecycle

Filesystems group multiple operations (e.g., creating a file, writing data, updating directory entries) into a single **compound transaction**. This amortizes the cost of journaling: instead of one commit per operation, you batch many operations and commit once.

A transaction goes through three states:

```
 Transaction States

 +----------+         +------------+         +--------------+
 | Running  |  --->   | Committing |  --->   | Checkpointed |
 +----------+         +------------+         +--------------+
      ^                                             |
      |                                             |
      +---------------------------------------------+
                 (journal space freed)
```

### 1. Running

The transaction is open. Filesystem operations (creating files, writing data, etc.) add their metadata changes to the transaction's in-memory list of modified blocks. Each operation gets a **handle** to the current transaction:

```c
// From fs/jbd2/transaction.c
handle_t *jbd2_journal_start(journal_t *journal, int nblocks)
{
    handle_t *handle;
    // Get or create the current running transaction
    transaction_t *transaction = journal->j_running_transaction;
    
    if (!transaction) {
        // Start a new transaction if none is running
        transaction = start_this_handle(journal, nblocks);
    }
    
    handle = new_handle(nblocks);
    handle->h_transaction = transaction;
    transaction->t_outstanding_credits += nblocks;
    return handle;
}
```

The `nblocks` parameter is a **credit system**: the caller estimates how many blocks it will modify. If the transaction's credit count exceeds a threshold, jbd2 closes it and starts a new one. This prevents transactions from growing unboundedly.

### 2. Committing

When the transaction is closed (either explicitly or because it hit the credit limit), jbd2 writes it to the journal:

```c
// From fs/jbd2/commit.c
void jbd2_journal_commit_transaction(journal_t *journal)
{
    transaction_t *commit_transaction = journal->j_committing_transaction;
    
    // Step 1: Write descriptor blocks
    write_descriptor_blocks(commit_transaction);
    
    // Step 2: Write metadata blocks to journal
    write_metadata_blocks(commit_transaction);
    
    // Step 3: Issue a cache flush (barrier) to ensure writes hit disk
    blkdev_issue_flush(journal->j_dev);
    
    // Step 4: Write the commit block with checksum
    write_commit_block(commit_transaction);
    
    // Step 5: Issue another flush to ensure commit block is durable
    blkdev_issue_flush(journal->j_dev);
    
    // Now the transaction is committed
    commit_transaction->t_state = T_COMMIT_DURABLE;
}
```

The **commit protocol** is critical for correctness:

- **Write metadata to journal:** The descriptor and data/metadata blocks are written.
- **Flush:** A barrier (or cache flush) ensures those blocks are on disk.
- **Write commit block:** This block contains a magic number, a checksum, and the transaction ID.
- **Flush again:** Ensures the commit block is durable.

If the commit block is on disk, the transaction is **atomically committed**. If the system crashes before the commit block is written, the transaction is discarded on recovery (because the commit block will be missing or have a bad checksum).

### 3. Checkpointing

After the transaction is committed to the journal, the changes still need to be written to their **final locations** on disk. This is called **checkpointing**:

```c
// From fs/jbd2/checkpoint.c
int jbd2_log_do_checkpoint(journal_t *journal)
{
    transaction_t *transaction;
    int result = 0;
    
    transaction = journal->j_checkpoint_transactions;
    if (!transaction)
        return 0;
    
    // Write each dirty buffer to its final location
    while (transaction) {
        result = __flush_batch(journal, transaction);
        if (result < 0)
            break;
        transaction = transaction->t_cpnext;
    }
    
    // Once done, free the journal space
    __cleanup_transaction(journal, transaction);
    return result;
}
```

Checkpointing can happen:

- **In the background:** A kernel thread (`kjournald2`) periodically checkpoints old transactions.
- **On demand:** If the journal fills up, new transactions block until space is freed.
- **At unmount time:** The filesystem forces a final checkpoint before unmounting.

Once checkpointing is complete, the journal space used by that transaction can be reused (the circular buffer wraps around).

## The Handle/Transaction/Journal Hierarchy

Let's clarify the three-level structure:

```
 Hierarchy of Journaling Objects

 +---------------------+
 |      Journal        |  One per filesystem (ext4 superblock points to it)
 |  (journal_t)        |
 |                     |
 |  j_running_txn      |  Currently open transaction (accepts new operations)
 |  j_committing_txn   |  Transaction being written to journal
 |  j_checkpoint_txns  |  List of committed transactions waiting to checkpoint
 +---------------------+
        |
        |  (has many)
        v
 +---------------------+
 |    Transaction      |  Groups many filesystem operations
 | (transaction_t)     |
 |                     |
 |  t_outstanding_     |  Total reserved space (in blocks)
 |    credits          |
 |  t_buffers          |  List of modified blocks
 |  t_state            |  Running / Committing / Finished
 +---------------------+
        |
        |  (contains many)
        v
 +---------------------+
 |      Handle         |  Per-operation handle (short-lived)
 |  (handle_t)         |
 |                     |
 |  h_transaction      |  Points back to the transaction
 |  h_buffer_credits   |  Blocks reserved for this operation
 +---------------------+
```

- **Journal:** One per filesystem. Manages the circular log and transaction lifecycle.
- **Transaction:** Groups many operations. Committed as a unit.
- **Handle:** Returned to filesystem code (e.g., ext4) when starting an operation. Allows the operation to modify blocks within the transaction.

Here is how ext4 uses this API when creating a file (simplified from `fs/ext4/namei.c`):

```c
static int ext4_create(struct inode *dir, struct dentry *dentry, ...)
{
    handle_t *handle;
    struct inode *inode;
    int err;
    
    // Start a transaction (reserve credits for inode, directory entry, etc.)
    handle = ext4_journal_start(dir, EXT4_HT_DIR,
                                 EXT4_DATA_TRANS_BLOCKS(dir->i_sb) + ...);
    if (IS_ERR(handle))
        return PTR_ERR(handle);
    
    // Allocate a new inode
    inode = ext4_new_inode(handle, dir, mode, ...);
    if (IS_ERR(inode)) {
        err = PTR_ERR(inode);
        goto out_stop;
    }
    
    // Add directory entry
    err = ext4_add_entry(handle, dentry, inode);
    if (err)
        goto out_clear_inode;
    
    // Mark metadata as dirty (adds to transaction)
    ext4_mark_inode_dirty(handle, inode);
    
out_stop:
    // Commit the transaction
    ext4_journal_stop(handle);
    return err;
}
```

The `ext4_journal_start` call asks jbd2 for a handle. All subsequent modifications (new inode, directory entry, etc.) are added to the transaction. When `ext4_journal_stop` is called, the handle is released. If this was the last handle for the transaction, jbd2 closes the transaction and schedules it for commit.

## Journaling Modes

Ext4 supports three journaling modes (set via the `data=` mount option), trading off between safety and performance:

### 1. `data=journal` (safest, slowest)

Both metadata **and** data blocks are written to the journal before being checkpointed.

```
 data=journal mode

 User writes 4KB data
       |
       v
 +------------------+
 | Write data block |  Data goes to journal
 | to journal       |
 +------------------+
       |
       v
 +------------------+
 | Write metadata   |  Inode, bitmap go to journal
 | to journal       |
 +------------------+
       |
       v
 +------------------+
 | Commit block     |  Transaction is atomic
 +------------------+
       |
       v
 +------------------+
 | Checkpoint       |  Write data + metadata to final locations
 +------------------+
```

**Pros:** Full atomicity. If the system crashes, both data and metadata are consistent.

**Cons:** Data is written twice (once to journal, once to final location). Slow for write-heavy workloads.

### 2. `data=ordered` (default, balanced)

Only **metadata** is journaled. Data blocks are written directly to their final locations **before** the metadata is committed.

```
 data=ordered mode

 User writes 4KB data
       |
       v
 +------------------+
 | Write data block |  Data goes directly to final location
 | to final location|  (NOT to journal)
 +------------------+
       |
       v
 +------------------+
 | Wait for data    |  Ensure data is on disk
 | to be durable    |
 +------------------+
       |
       v
 +------------------+
 | Write metadata   |  Inode, bitmap go to journal
 | to journal       |
 +------------------+
       |
       v
 +------------------+
 | Commit block     |  Metadata transaction is atomic
 +------------------+
```

**Pros:** Faster than `journal` mode (data not written twice). Files never contain garbage after a crash (because data is written before the inode update is committed).

**Cons:** If the system crashes after data is written but before metadata is committed, the data blocks are leaked (unreachable, but not corrupted).

### 3. `data=writeback` (fastest, least safe)

Only **metadata** is journaled. Data blocks are written directly to their final locations, but **without ordering**: data and metadata writes can happen in any order.

```
 data=writeback mode

 User writes 4KB data
       |
       v
 +------------------+       +------------------+
 | Write data block |       | Write metadata   |  (can happen in parallel)
 | to final location|       | to journal       |
 +------------------+       +------------------+
       |                            |
       +----------------------------+
                    |
                    v
            (no ordering guarantee)
```

**Pros:** Fastest. No synchronization between data and metadata writes.

**Cons:** If the system crashes, files can contain garbage (because the inode might point to blocks that were allocated but not yet written with data).

## Commit Protocol and Barriers

The commit protocol relies on **write barriers** (or **cache flushes**) to enforce ordering. Modern disks have write caches that reorder writes for performance. Without barriers, the commit block might reach the disk **before** the metadata blocks, even if you issued the commit write second. This would violate atomicity.

Jbd2 uses two mechanisms:

1. **`blkdev_issue_flush`:** Issues a `FLUSH CACHE` command to the disk, forcing all buffered writes to be written to the platter.
2. **`REQ_FUA` (Force Unit Access):** A flag on individual writes that bypasses the disk cache.

The commit sequence (simplified from `fs/jbd2/commit.c`):

```c
void jbd2_journal_commit_transaction(journal_t *journal)
{
    // 1. Write descriptor + metadata blocks
    submit_bh_array(commit_transaction->t_buffers);
    
    // 2. Wait for writes to complete
    wait_for_io_completion();
    
    // 3. Issue a flush
    if (journal->j_flags & JBD2_BARRIER)
        blkdev_issue_flush(journal->j_dev);
    
    // 4. Write commit block with FUA
    submit_bh(WRITE_FUA, commit_bh);
    
    // 5. Wait for commit block to be durable
    wait_on_buffer(commit_bh);
}
```

If barriers are disabled (e.g., on SSDs with supercapacitors that guarantee write ordering), jbd2 skips the flush and relies on the disk's guarantees.

## Recovery: Replaying the Journal

On the next mount after a crash, the kernel runs **journal recovery** (in `fs/jbd2/recovery.c`):

```c
int jbd2_journal_recover(journal_t *journal)
{
    // 1. Scan the journal from the last known position
    int err = do_one_pass(journal, PASS_SCAN);
    if (err)
        return err;
    
    // 2. Replay all complete transactions
    err = do_one_pass(journal, PASS_REPLAY);
    if (err)
        return err;
    
    // 3. Clear the journal (reset head/tail pointers)
    jbd2_journal_clear_features(journal);
    
    return 0;
}
```

**PASS_SCAN** reads through the journal, looking for valid commit blocks. A transaction is valid if:

- Its commit block has the correct magic number (`JBD2_MAGIC_NUMBER`).
- The checksum matches (protects against partial writes).

**PASS_REPLAY** replays each valid transaction: it reads the descriptor blocks to find out which blocks were modified, then writes those blocks to their final locations.

Incomplete transactions (missing or corrupt commit blocks) are discarded. This is safe because the filesystem's on-disk state is still consistent (the transaction was never committed).

Here is the core replay logic (simplified):

```c
static int do_one_pass(journal_t *journal, int pass)
{
    unsigned int sequence = journal->j_tail_sequence;
    unsigned int first_commit_id = sequence;
    unsigned int next_commit_id = sequence;
    
    while (1) {
        struct buffer_head *bh = journal_bread(journal, next_log_block++);
        journal_header_t *header = (journal_header_t *)bh->b_data;
        
        if (header->h_magic != JBD2_MAGIC_NUMBER)
            break; // End of valid journal
        
        switch (header->h_blocktype) {
        case JBD2_DESCRIPTOR_BLOCK:
            if (pass == PASS_REPLAY)
                replay_descriptor_block(journal, bh);
            break;
        
        case JBD2_COMMIT_BLOCK:
            if (pass == PASS_REPLAY)
                commit_transaction(journal, next_commit_id);
            next_commit_id++;
            break;
        
        case JBD2_REVOKE_BLOCK:
            if (pass == PASS_REPLAY)
                scan_revoke_records(journal, bh);
            break;
        }
    }
    
    return 0;
}
```

Recovery is fast: it only reads the journal (a few megabytes to a few hundred megabytes), not the entire filesystem.

## Performance Considerations

### Journal Size

The journal is typically 128MB to 4GB. Larger journals allow more transactions to accumulate before checkpointing is required, reducing I/O. But larger journals also take longer to replay on recovery.

You can set the journal size when creating the filesystem:

```bash
mkfs.ext4 -J size=512 /dev/sda1  # 512MB journal
```

### Compound Transactions

Batching multiple operations into one transaction amortizes the commit cost. Instead of committing after every `write()` syscall, ext4 waits until the transaction times out (default 5 seconds) or hits the credit limit.

### Separate Journal Device

You can place the journal on a separate, faster disk (e.g., an SSD):

```bash
mkfs.ext4 -J device=/dev/nvme0n1 /dev/sda1
```

This reduces contention: metadata writes (journaled) go to the SSD, data writes go to the HDD.

### Async Commit

Ext4 supports **async commit mode** (`commit=async`), where the commit block is written without waiting for previous blocks to be flushed. This improves throughput but slightly weakens the atomicity guarantee (a very rare race condition can cause corruption if the disk lies about write completion).

## Real-World Example: Creating a File

Let's trace what happens when you run:

```bash
echo "hello" > /mnt/test.txt
```

Assuming `data=ordered` mode:

1. **Start transaction:** `ext4_journal_start` reserves credits for: inode allocation, directory entry, bitmap updates.
2. **Allocate inode:** `ext4_new_inode` allocates inode 12345. Mark inode dirty (adds to transaction).
3. **Write data:** `ext4_writepages` writes "hello" to data block 99999. This goes directly to its final location (not journaled in ordered mode).
4. **Update directory:** `ext4_add_entry` adds "test.txt -> inode 12345" to the directory. Mark directory inode dirty.
5. **Stop transaction:** `ext4_journal_stop` releases the handle. If this was the last handle, the transaction enters the commit queue.
6. **Commit thread wakes up:** `kjournald2` sees a transaction ready to commit.
7. **Wait for data:** Before committing metadata, wait for data block 99999 to hit disk (this is the "ordered" part).
8. **Write journal:** Write descriptor block (listing inode 12345, directory inode, bitmaps), then write their contents, then write commit block.
9. **Checkpoint (later):** Write inode 12345, directory inode, and bitmaps to their final locations. Free the journal space.

If the power dies at step 8 (after commit block is written), recovery will replay the transaction and the file will exist. If the power dies at step 7 (before commit block), the transaction is discarded and the file does not exist. Either way, the filesystem is consistent.

## Source Code References

All code paths discussed are in the Linux kernel:

- **Jbd2 core:** [`fs/jbd2/transaction.c`](https://github.com/torvalds/linux/blob/master/fs/jbd2/transaction.c) (transaction start/stop)
- **Commit logic:** [`fs/jbd2/commit.c`](https://github.com/torvalds/linux/blob/master/fs/jbd2/commit.c) (writing journal)
- **Checkpoint logic:** [`fs/jbd2/checkpoint.c`](https://github.com/torvalds/linux/blob/master/fs/jbd2/checkpoint.c) (freeing journal space)
- **Recovery logic:** [`fs/jbd2/recovery.c`](https://github.com/torvalds/linux/blob/master/fs/jbd2/recovery.c) (replaying journal on mount)
- **Ext4 integration:** [`fs/ext4/super.c`](https://github.com/torvalds/linux/blob/master/fs/ext4/super.c) (mounting filesystem with journal)
- **Ext4 file operations:** [`fs/ext4/namei.c`](https://github.com/torvalds/linux/blob/master/fs/ext4/namei.c) (creating files, directories)

## Summary

Filesystem journaling solves the crash consistency problem by using **write-ahead logging**:

1. **Log first:** Write changes to a journal before applying them.
2. **Commit atomically:** Mark the journal entry complete with a commit block.
3. **Checkpoint later:** Write changes to their final locations in the background.
4. **Recover fast:** Replay the journal on the next boot (takes seconds, not hours).

Ext4 and jbd2 implement this with:

- A **circular journal** on disk (descriptor blocks, metadata blocks, commit blocks).
- **Compound transactions** that batch many operations into one commit.
- Three **journaling modes** (journal, ordered, writeback) with different safety/performance trade-offs.
- **Barriers and flushes** to enforce write ordering on modern disks.

This design makes ext4 resilient to crashes while keeping recovery time short, making it the workhorse filesystem for Linux servers and desktops.

## References

- [Linux Kernel Documentation: ext4](https://www.kernel.org/doc/html/latest/filesystems/ext4/index.html)
- [OSTEP Chapter: Crash Consistency: FSCK and Journaling](https://pages.cs.wisc.edu/~remzi/OSTEP/file-journaling.pdf)
- [Ext4 Wiki: Ext4 Disk Layout](https://ext4.wiki.kernel.org/index.php/Ext4_Disk_Layout)
- [LWN.net: The ext4 filesystem](https://lwn.net/Articles/276920/)
- [Stephen Tweedie's 1998 paper: Journaling the Linux ext2fs Filesystem](https://web.archive.org/web/20070927233605/http://olstrans.sourceforge.net/release/OLS2000-ext3/OLS2000-ext3.html)
