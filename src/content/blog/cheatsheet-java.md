---
author: JZ
pubDatetime: 2024-12-26T08:22:00Z
modDatetime: 2024-12-26T10:12:00Z
title: Java CheatSheet
featured: true
tags:
  - cheatsheet-java
description:
  "tips for using java"
---

## Table of contents

## Context

This is a collection of useful references about java. May not be used every day but can keep as a reference.

## How to find class conflict

```shell
findjar () {
  pattern=$1
  shift
  for jar in $(find $* -type f -name "*.jar")
  do
    match=`<YOUR_JAVA_PATH_HERE>/bin/jar -tvf $jar | grep $pattern`
    if [ ! -z "$match" ]
    then
      echo "Found in: $jar"
      echo "$match"
    fi
  done
}

cd / findjar org.codehaus.stax2.ri.EmptyIterator 2>/dev/null
```
