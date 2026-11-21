---
author: JZ
pubDatetime: 2026-11-21T19:31:03Z
modDatetime: 2026-11-21T19:31:03Z
title: System Design - How HashiCorp Vault Issues Dynamic Database Credentials
tags:
  - design-system
  - design-security
  - design-database
description: "Follow a database credential from workload authentication through Vault policies, a secrets engine, and a renewable lease to expiration and revocation."
---

## Table of contents

- [A password that lives too long](#a-password-that-lives-too-long)
- [Vault has three separate jobs](#vault-has-three-separate-jobs)
- [Requesting a credential](#requesting-a-credential)
- [A lease controls the credential's lifetime](#a-lease-controls-the-credentials-lifetime)
- [What to configure](#what-to-configure)
- [References](#references)

## A password that lives too long

Imagine a service that reads orders from PostgreSQL. The team gives every copy of the service the same database password and puts it in a deployment manifest. Months later, the password has spread to old containers, local files, and incident notes. Rotating it means finding every copy and coordinating a restart.

HashiCorp Vault can issue a separate, temporary database login to each service instance. The service asks Vault for credentials when it starts, uses them to connect directly to PostgreSQL, and renews or replaces them before their lease expires. Vault is not a proxy for the database traffic; it manages how the application obtains and retires its credentials.

## Vault has three separate jobs

Vault keeps identity, permission, and secret creation as separate steps:

1. An **auth method** checks who or what is making the request. A Kubernetes workload, for example, can authenticate with its service account identity.
2. Vault returns a **token** with policies that describe which API paths the caller may use. The token is an authorization credential for Vault; it is not the PostgreSQL password.
3. A **secrets engine** handles a particular kind of secret. The database engine knows how to connect to a database and run the statements needed to create and later revoke a login.

The database engine is mounted at a path such as `database/`. A Vault role such as `orders-read` configures the database connection and the statements for creating and revoking a matching database user. The Vault role is a recipe for issuing credentials; it is not itself a PostgreSQL role.

```text
                         +----------------------+
Workload identity -----> | Vault auth method    |
       (JWT, etc.)       +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         | Vault token + policy |
                         +----------+-----------+
                                    |
     read database/creds/orders-read
                                    |
                                    v
                         +----------------------+
                         | Database secrets     |------ SQL ------> PostgreSQL
                         | engine + role        |                   creates login
                         +----------+-----------+
                                    |
                       username, password, lease
                                    v
                              Application ------------------------> PostgreSQL
                                  connects directly with its temporary login
```

## Requesting a credential

Suppose a workload is allowed to read `database/creds/orders-read`. The request and response look like this:

```text
Application              Vault                         PostgreSQL
    |                       |                                |
    | authenticate          |                                |
    |---------------------->| validate workload identity     |
    |<----------------------| token with a limited policy    |
    |                       |                                |
    | read database/creds/orders-read                        |
    |---------------------->|                                |
    |                       | run role's creation statements |
    |                       |------------------------------->|
    |                       |<-------------------------------|
    | username, password, lease ID, duration                 |
    |<----------------------|                                |
    | connect using the temporary login                      |
    |-------------------------------------------------------->|
```

The application receives a generated username and password, plus lease information such as an ID, a duration, and whether the lease can be renewed. It then connects to PostgreSQL itself. Other application instances can receive different credentials, which makes database activity easier to attribute and lets Vault revoke one instance's access without rotating a shared password.

A policy should grant only the read capability on the credential endpoint the application needs:

```hcl
path "database/creds/orders-read" {
  capabilities = ["read"]
}
```

This policy controls the application's request to Vault. The SQL statements configured for the database role control what the resulting PostgreSQL user can do. Both layers matter: a narrow Vault path does not compensate for a database user with excessive grants.

## A lease controls the credential's lifetime

A **lease** is Vault's record of how long an issued secret is valid and how it can be managed. The credential response includes a lease ID and a time-to-live (TTL). An application can renew a renewable lease or request a replacement before the current credential expires.

When a lease expires or is revoked, Vault asks the database secrets engine to run the configured revocation statements. Those statements can disable or drop the temporary database user. The application should stop using the credential when its lease ends; Vault's lease does not make an application close an existing database connection by itself.

```text
Issue credential                 Renew                         Expire or revoke
      |                             |                                 |
      v                             v                                 v
create DB user ------------> extend lease if allowed ----------> run revoke SQL
return lease ID + TTL        within the role's max TTL             disable user
```

The application and the database remain separate systems. If PostgreSQL is unavailable when Vault tries to revoke a user, cleanup can be delayed. A short TTL reduces the period a forgotten credential can remain useful, but it also means more frequent renewals or credential requests. Teams still need to monitor lease failures and clean up database users according to their operational policy.

Static credentials are different. A static role maps to an existing database username and rotates its password on a schedule. Dynamic credentials create a distinct database login for a lease. Dynamic roles improve per-instance isolation, while static roles can be useful when an application requires a fixed database username.

## What to configure

| Setting or object | What it controls | Practical trade-off |
| --- | --- | --- |
| Auth method and Vault policy | Which workload can request credentials, and from which path | Narrow policies limit the damage from a leaked Vault token. |
| Database connection and allowed roles | Which database Vault can reach and which Vault roles can use it | Limit the configured connection to the intended database and network. |
| Creation and revocation statements | Database permissions granted to a temporary user and how it is removed | Keep grants small and make the revoke statement match the created login. |
| Role `default_ttl` and `max_ttl` | How long database credentials last and how far a renewal may extend them | Shorter leases reduce exposure but increase credential churn. |
| Vault `default_lease_ttl` and `max_lease_ttl` | Server-wide default and maximum lease durations for tokens and secrets | A role can choose a tighter lifetime; server limits prevent unexpectedly long leases. |

The Vault token's TTL and the database credential's lease are separate clocks. A service needs a valid Vault token to ask for or renew secrets, while its database login has its own lease. Monitoring only one of those lifetimes can leave a service unable to renew the other.

## References

1. HashiCorp Vault, [Lease, Renew, and Revoke](https://developer.hashicorp.com/vault/docs/concepts/lease).
2. HashiCorp Vault, [Database secrets engine](https://developer.hashicorp.com/vault/docs/secrets/databases) — dynamic and static database roles.
3. HashiCorp Vault, [Tokens](https://developer.hashicorp.com/vault/docs/concepts/tokens).
4. HashiCorp Vault, [Policies](https://developer.hashicorp.com/vault/docs/concepts/policies).
5. HashiCorp Vault, [Configuration](https://developer.hashicorp.com/vault/docs/configuration) — default and maximum lease TTLs.
