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
db.<collection_name>.find({'field':'value'}) # filter
db.<collection_name>.findOne({'_id':'value'}) # filter
```
