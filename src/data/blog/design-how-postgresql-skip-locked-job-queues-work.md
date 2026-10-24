---
author: JZ
pubDatetime: 2026-10-24T18:35:00Z
modDatetime: 2026-10-24T18:35:00Z
title: System Design - How PostgreSQL SKIP LOCKED Powers a Job Queue
tags:
  - design-system
  - design-database
  - design-concurrency
description: "Follow two workers claiming jobs with PostgreSQL row locks, then add leases and fencing to survive crashes without promising exactly-once execution."
---

This post is for engineers who know basic SQL and want to run a small background-job queue without introducing a separate broker. We will follow two workers racing for the same email job, then see what happens when one crashes. The SQL uses PostgreSQL's documented `FOR UPDATE SKIP LOCKED` and `UPDATE ... RETURNING` behavior, not a promise of strict FIFO or exactly-once delivery.

## Table of contents

## Two workers, one email

Suppose an application inserts an email job whenever somebody registers. Worker A and worker B both ask for the oldest pending job. A plain `SELECT` can return the same row to both workers: reading a row does **not** reserve it. If both later send the email, the user gets two copies.

A row lock lets one transaction reserve a job while it changes its state. The `SKIP LOCKED` option tells the other transaction to look past a row another worker already locked, rather than waiting for it. PostgreSQL's [locking-clause documentation](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE) explicitly describes this as useful for queue-like tables and warns that the resulting view is inconsistent. That is fine for _claiming available work_, not for a general-purpose report.

```text
  workers                         PostgreSQL jobs
  +----------+                    +-----------------------+
  | worker A | -- claim --------> | #41 pending, due now  |
  +----------+    locks #41       | #42 pending, due now  |
                                  +-----------------------+
  +----------+                    | #41 locked by A        |
  | worker B | -- claim --------> | skip #41, claim #42   |
  +----------+                    +-----------------------+

  A and B commit their claims; the row locks are released.
  Work happens afterward, outside those short transactions.
```

## Give a job a state and a deadline

The example queue stores due time, a state, and a lease. A lease is a deadline after which a crashed worker's job may be offered again. `attempts` doubles as a _generation number_: each new claim increments it, so an older worker cannot acknowledge a newer attempt.

```sql
CREATE TABLE jobs (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payload      jsonb NOT NULL,
    state        text NOT NULL DEFAULT 'pending'
                 CHECK (state IN ('pending', 'running', 'done')),
    run_at       timestamptz NOT NULL DEFAULT now(),
    leased_until timestamptz,
    attempts     integer NOT NULL DEFAULT 0
);

CREATE INDEX jobs_pending_due_idx ON jobs (run_at, id)
WHERE state = 'pending';
```

Inserting a job is an ordinary `INSERT`; it can even share a transaction with the business change that created it. The partial index helps find pending, due rows without indexing completed work. The [PostgreSQL partial-index documentation](https://www.postgresql.org/docs/current/indexes-partial.html) explains why a query must imply the index predicate to benefit from it.

## Claim and commit before doing the work

Run the following as one **short transaction**. The application keeps the returned `id` and `attempts`, then commits before contacting the email provider.

```sql
BEGIN;

WITH candidate AS (
    SELECT id
    FROM jobs
    WHERE state = 'pending' AND run_at <= now()
    ORDER BY run_at, id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
UPDATE jobs AS job
SET state = 'running',
    attempts = job.attempts + 1,
    leased_until = now() + interval '5 minutes'
FROM candidate
WHERE job.id = candidate.id
RETURNING job.id, job.payload, job.attempts, job.leased_until;

COMMIT;
```

The common table expression selects and locks at most one eligible row. The `UPDATE` changes _that same row_ and returns the new attempt number. Competing workers cannot both update the same claim: while the first transaction holds the row lock, the other's `SKIP LOCKED` scan moves on. If nothing is available, `RETURNING` produces no row. PostgreSQL documents both [row locking](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE) and [the `RETURNING` clause](https://www.postgresql.org/docs/current/sql-update.html) separately.

Why not leave the transaction open while sending the email? That would hold a database lock for the entire external request. A slow provider would keep other transactions waiting, and a failed process would throw away the claim. Committing first makes ownership explicit in the row, with a deadline for recovery.

## An acknowledgement needs a generation check

After the side effect succeeds, the worker marks its own attempt done. The returned attempt number is a small fencing token: a worker whose lease expired and whose job was reclaimed must not complete the _new_ owner's attempt.

```sql
UPDATE jobs
SET state = 'done', leased_until = NULL
WHERE id = $1
  AND state = 'running'
  AND attempts = $2
  AND leased_until > now()
RETURNING id;
```

Here `$1` is the claimed job ID and `$2` is the `attempts` value returned by the claim. **Zero returned rows means this attempt no longer owns the job**; do not report it as acknowledged. A long-running worker could renew its lease with a similarly guarded `UPDATE` before expiry, but it still needs a policy for when to give up.

A separate, short reaper operation puts expired jobs back in the pending pool:

```sql
UPDATE jobs
SET state = 'pending', leased_until = NULL
WHERE state = 'running' AND leased_until < now();
```

The reaper and claimer use row updates, so a job is not simultaneously pending and running in the database. Consider adding retry delays, a maximum-attempt policy, and a failed-job state in a production queue; the three-state example deliberately leaves those policies out.

## Walk through the failure windows

| Failure                                             | Database state                                 | Next step                              |
| --------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| Worker dies before claim commit                     | Its update rolls back; the job remains pending | Another worker can claim it            |
| Worker dies after claim commit, before sending      | Job is running until the lease expires         | Reaper returns it to pending           |
| Email is sent, but worker dies before acknowledging | Job is eventually retried                      | The provider may receive a second send |
| Old worker finishes after another worker reclaims   | `attempts` changed                             | Old acknowledgement updates zero rows  |

The third row is crucial. A lease and a fencing check protect **queue ownership**, not an external email provider from duplicates. Give the external operation an idempotency key (for example, the stable job ID) _if that provider supports one_, or make the consumer's side effect idempotent. An expired worker may still perform an external side effect even though its database acknowledgement is rejected.

## What this queue does not guarantee

`ORDER BY run_at, id` chooses which **unlocked** row to try first; `SKIP LOCKED` can pass over an older locked row. It is not a strict FIFO guarantee. PostgreSQL also notes that `SKIP LOCKED` applies to row-level locks, not the table-level lock acquired by the statement; `NOWAIT` or a separate `LOCK` is needed if waiting for a table lock is unacceptable. Keep claim transactions brief and monitor repeatedly expired jobs. See the [locking-clause caveats](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE) and [explicit-locking guide](https://www.postgresql.org/docs/current/explicit-locking.html).

For a modest queue already using PostgreSQL, this is a useful starting point: one atomic claim, short transactions, a lease for recovery, and idempotent processing for the unavoidable retry window. If you need broker features such as consumer replay or very high fan-out, a database table alone does not provide them.

## References

1. PostgreSQL documentation: [`SELECT`, row-locking clauses and `SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE).
2. PostgreSQL documentation: [`UPDATE ... RETURNING`](https://www.postgresql.org/docs/current/sql-update.html).
3. PostgreSQL documentation: [explicit row and table locking](https://www.postgresql.org/docs/current/explicit-locking.html).
4. PostgreSQL documentation: [partial indexes](https://www.postgresql.org/docs/current/indexes-partial.html).
