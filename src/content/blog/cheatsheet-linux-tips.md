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

## A

### adb

```shell
# get device mac address mac_addr mac secret mac_sec
adb shell idme print
# start adb shell as root
adb shell su
# reboot
adb reboot
# get properties
adb shell get-dynconf-value <property_name>
# sendText
adb shell sendText <text>
```

### alias

```shell
alias sshp
# how to set ssh to not use proxy command?
alias sshp='ssh -o ProxyCommand=none'
```

## B

### bg

```shell
# ctrl + z to suspend a foreground job
bg %1 # resume job 1 in background
```

## C

### chown

```shell
sudo chown -R <user1> ./folder # recursively change owner to user1 for folder
```

## F

### fg

```shell
fg %4 # bring job 4 to foreground
```

## G

### Git

#### How to check a github repo size?

See stackoverflow [reference](https://stackoverflow.com/questions/8646517/how-can-i-see-the-size-of-a-github-repository-before-cloning-it).

We can check with `GET /repos/:user/:repo` with GitHub API.

You can access `https://api.github.com/repos/<user_or_organization_name>/<repo_name>` with a browser such as google chrome.

or use `curl`

#### How to Check the Summary (Changed Files) of the Last Commit?

```shell
git log -1 --stat # show basic info and all changes
git show -1 --summary  # show basic info and created or removed files, does not include changed files
```

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
