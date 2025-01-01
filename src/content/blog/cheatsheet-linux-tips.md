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

## I

### id

```shell
% id  # mac
uid=501(<username>) gid=20(staff) groups=20(staff),12(everyone),61(localaccounts),79(_appserverusr),80(admin),81(_appserveradm),98(_lpadmin),701(com.apple.sharepoint.group.1),33(_appstore),100(_lpoperator),204(_developer),250(_analyticsusers),395(com.apple.access_ftp),398(com.apple.access_screensharing),399(com.apple.access_ssh),400(com.apple.access_remote_ae)
(base) root@43a8fed75479:/# id  # linux
uid=0(root) gid=0(root) groups=0(root)
```

### IO redirection

1. The Linux Document Project (TLDP) [doc](https://tldp.org/LDP/abs/html/io-redirection.html)

## J

### jobs

```shell
$ jobs # list jobs
[1]  + suspended (tty output)  vim
```

## S

## shell

```shell
$ echo $SHELL
/bin/zsh  # mac os 15 default
/bin/bash  # linux default
```

## U

### `ulimit`

```shell
(base) root@43a8fed75479:/# ulimit -a  # docker container from image condaforge/miniforge-pypy3
core file size          (blocks, -c) 0
data seg size           (kbytes, -d) unlimited
scheduling priority             (-e) 0
file size               (blocks, -f) unlimited
pending signals                 (-i) 31325
max locked memory       (kbytes, -l) unlimited
max memory size         (kbytes, -m) unlimited
open files                      (-n) 1048576
pipe size            (512 bytes, -p) 8
POSIX message queues     (bytes, -q) 819200
real-time priority              (-r) 0
stack size              (kbytes, -s) 8192
cpu time               (seconds, -t) unlimited
max user processes              (-u) unlimited
virtual memory          (kbytes, -v) unlimited
file locks                      (-x) unlimited
(base) root@43a8fed75479:/# cat /proc/sys/fs/file-max
801566
(base) root@43a8fed75479:/# cat /proc/sys/fs/file-nr
352	0	801566

% ulimit -a  # mac os single admin user
-t: cpu time (seconds)              unlimited
-f: file size (blocks)              unlimited
-d: data seg size (kbytes)          unlimited
-s: stack size (kbytes)             8176
-c: core file size (blocks)         0
-v: address space (kbytes)          unlimited
-l: locked-in-memory size (kbytes)  unlimited
-u: processes                       4000
-n: file descriptors                256
% ulimit -Hn
unlimited
% ulimit -Sn
256
```

File Descriptor ([wiki](https://en.wikipedia.org/wiki/File_descriptor)) limit references:

1. limits on the number of file descriptors [unix stack exchange question](https://unix.stackexchange.com/questions/84227/limits-on-the-number-of-file-descriptors)
2. linux kernel file-max and file-nr [doc](https://www.kernel.org/doc/html/latest/admin-guide/sysctl/fs.html#file-max-file-nr)
3. limits on the number of linux file descriptors [Baeldung](https://www.baeldung.com/linux/limit-file-descriptors)
4. increase max for file descriptors [cyberciti](https://www.cyberciti.biz/faq/linux-increase-the-maximum-number-of-open-files/)

### uname

```shell
uname -s # os name,e.g., GNU/Linux, Darwin(mac)

(base) root@43a8fed75479:/# uname -r  # linux
6.10.14-linuxkit
% uname -r  # mac
24.2.0

(base) root@43a8fed75479:/# uname -v  # linux
#1 SMP Thu Oct 24 19:28:55 UTC 2024
% uname -v  # mac
Darwin Kernel Version 24.2.0: Fri Dec  6 18:51:28 PST 2024; root:xnu-11215.61.5~2/RELEASE_ARM64_T8112

uname -m # platform x86_64, arm64
```

MacOS Darwin name references:

1. https://apple.stackexchange.com/questions/401832/why-is-macos-often-referred-to-as-darwin
2. https://en.wikipedia.org/wiki/Darwin_(operating_system)
3. https://www.howtogeek.com/295067/why-is-macos-software-sometimes-labeled-darwin/

## W

### which

How to find the file location/path of the executable/command?

Sometimes you may have different versions of the executable from different sources installed. Once I encountered a unique bug caused by the `jq` installed with `conda` shadowing the other `jq` installed with homebrew.

```shell
$ which whoami
/usr/bin/whoami
```

## References

1. multi-lingual [manpages.org](https://manpages.org/)
2. Michael Kerrisk [man-pages](https://www.man7.org/linux/man-pages/dir_all_alphabetic.html)
