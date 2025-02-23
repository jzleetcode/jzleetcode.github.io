---
author: JZ
pubDatetime: 2024-11-01T08:22:00Z
modDatetime: 2024-11-01T10:12:00Z
title: Database (MongoDB, Microsoft SQL Server) CheatSheet
tags:
  - cheatsheet-db
description:
  "tips for using mongodb"
---

## Table of contents

## Tools

1. DBeaver https://dbeaver.io/
2. PGAdmin for PostgreSQL https://www.pgadmin.org/
3. Jetbrains Datagrip https://www.jetbrains.com/datagrip/, IntelliJ Idea community edition with plugin https://www.logicbig.com/how-to/intellij/intellij-community-edition-connecting-database.html, and IntelliJ Idea ultimate edition https://www.jetbrains.com/help/idea/connecting-to-a-database.html.

## Microsoft SQL Server

Use Microsoft SQL Server Management Studio in a Windows machine (virtual or actual Windows).

1. File -> Connect Object Explorer
2. In the popup, put in server name (sql server name)
3. Authentication dropdown, use "Windows Authentication"
4. User name and password section is grayed out. User name is <Domain>\<user_name>
5. Change Encryption dropdown to optional

See active directory [overview doc](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/get-started/virtual-dc/active-directory-domain-services-overview), [domain account doc](https://learn.microsoft.com/en-us/windows/win32/ad/domain-user-accounts)

How to check the Databases and Tables in the Microsoft SQL Server?

You can expand the database project structure (tree view) in the top left Object Explorer view. Or you could use SQL script below.

```sql
select * from information_schema.tables
-- table below shows columns: table_catalog (default should be master db), table_schema (dbo), table_name, and table_type (base_table, view)
select * from master.information_schema.tables
-- by default should be the same result as above
select * from <db>.information_schema.tables
-- tables in db
select name, database_id, create_date from sys.databases; go
-- list databses in this server: master, msdb, model, tempdb, .etc
```

## MongoDB

For MongoDB 8.0.1 installed with HomeBrew.

### `mongosh` commands

```shell
brew services start mongodb-community@8.0
brew services stop mongodb-community@8.0

mongosh
show dbs # to show databases
show collections # to show collections
use <db_name>
db.<collection_name>.find() # scan the collection
db.<collection_name>.countDocuments() # total count in collection

# scan with a filter
db.<collection_name>.find({'field':'value'})
db.<collection_name>.findOne({'_id':'value'})

# delete with a filter
db.<collection_name>.deleteMany({'field':'value'})
{ acknowledged: true, deletedCount: 2 }
```

### Pymongo

How to set log levels for `pymongo` python mongodb client?

By default, the client log level is `DEBUG`. You can change the log level as below. This line changes for the whole client.

```python
logging.getLogger('pymongo').setLevel(logging.ERROR)
```

For more control at the module level,
see pymongo doc [logging](https://pymongo.readthedocs.io/en/latest/examples/logging.html).

### References

1. multiple databases vs multiple collections: https://www.mongodb.com/community/forums/t/multiple-databases-vs-multiple-collections/211758
2. update across multiple collections in the same database https://www.mongodb.com/community/forums/t/update-data-across-multiple-collections-within-the-same-database/118979
3. how to choose a shard key [doc](https://www.mongodb.com/docs/manual/core/sharding-choose-a-shard-key/)
