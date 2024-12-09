---
author: JZ
pubDatetime: 2024-12-04T08:22:00Z
modDatetime: 2024-12-04T10:12:00Z
title: Linux Cheatsheet, tips and Commands
featured: true
tags:
  - cheatsheet-apps
description:
  "tips for linux commands and tips"
---

## Table of contents

## B

### bg

```shell
# ctrl + z to suspend a foreground job
bg %1 # resume job 1 in background
```

## F

### fg

```shell
fg %4 # bring job 4 to foreground
```

## G

### Git

How to check a github repo size?
See stackoverflow [reference](https://stackoverflow.com/questions/8646517/how-can-i-see-the-size-of-a-github-repository-before-cloning-it).

We can check with `GET /repos/:user/:repo` with GitHub API.

https://api.github.com/repos/<user_or_organization_name>/<repo_name>

or use `curl`

## J

### jobs

```shell
$ jobs # list jobs
[1]  + suspended (tty output)  vim
```

## U

### uname

```shell
uname -s # os name,e.g., GNU/Linux, Darwin(mac)
unamr -r # kernel release, 6.10.14-linuxkit, 24.0.1
uname -v # #1 SMP Thu Oct 24 19:28:55 UTC 2024,
# Darwin Kernel Version 24.1.0: Thu Oct 10 21:02:45 PDT 2024; root:xnu-11215.41.3~2/RELEASE_ARM64_T8112

uname -m # platform x86_64, arm64
```
