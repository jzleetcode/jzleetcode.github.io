---
author: JZ
pubDatetime: 2024-11-01T08:22:00Z
modDatetime: 2024-11-01T10:12:00Z
title: MongoDB CheatSheet
tags:
  - cheatsheet-db
description:
  "tips for using mongodb"
---

## Table of contents

## Context

For MongoDB 8.0.1 installed with HomeBrew.

## `mongosh` commands

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

## Pymongo

How to set log levels for `pymongo` python mongodb client?

By default, the client log level is `DEBUG`. You can change the log level as below. This line changes for the whole client.

```python
logging.getLogger('pymongo').setLevel(logging.ERROR)
```

For more control at the module level,
see pymongo doc [logging](https://pymongo.readthedocs.io/en/latest/examples/logging.html).

## References

1. multiple databases vs multiple collections: https://www.mongodb.com/community/forums/t/multiple-databases-vs-multiple-collections/211758
2. update across multiple collections in the same database https://www.mongodb.com/community/forums/t/update-data-across-multiple-collections-within-the-same-database/118979
