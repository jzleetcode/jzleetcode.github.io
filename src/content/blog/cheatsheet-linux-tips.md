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

### chmod

```shell
chmod 777 -R <dir> # set read write executable for directory by user, group, others
chmod a+rwx -R <dir> # same as above
chmod +x <file> # make file executable by anyone, +x, a+x, same as ugo+x
```

### chown

```shell
sudo chown -R <user1> ./folder # recursively change owner to user1 for folder
```

## D

### date

```shell
date +%F # today's date 2018-04-21
date # Sat Apr 21 16:43:16 PDT 2018
date -r <epoch seconds> # example 1547927682
> date +%s           # Current time seconds, mac
1544081888
> date -v -15M +%s   # 15 minutes ago in seconds, mac
1544081034
> date -r 1544081034 # seconds to readable, mac
Thu Dec  6 09:23:54 IST 2018
> date +%s                  # Current time seconds, linux
1544082214
> date -d "15 mins ago" +%s # 15 minutes ago in seconds, linux
1544081345
> date -d @1544081345       # seconds to readable, linux
Thu Dec  6 07:29:05 UTC 2018
today=$(date +%Y/%m/%d) # today's date in format 2020/02/22
today=$(date) # Sat Feb 22 06:15:12 UTC 2020
date -d $today +%Y/%m/%d # reformat date
```

### df

How to check disk space on the command line?

```shell
% df -h
# mac result
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk3s1s1   460Gi    10Gi   343Gi     3%    412k  3.6G    0%   /
devfs            204Ki   204Ki     0Bi   100%     706     0  100%   /dev
/dev/disk3s6     460Gi    20Ki   343Gi     1%       0  3.6G    0%   /System/Volumes/VM
/dev/disk3s2     460Gi   6.4Gi   343Gi     2%    1.2k  3.6G    0%   /System/Volumes/Preboot
/dev/disk3s4     460Gi   3.0Mi   343Gi     1%      53  3.6G    0%   /System/Volumes/Update
/dev/disk1s2     500Mi   6.0Mi   483Mi     2%       1  4.9M    0%   /System/Volumes/xarts
/dev/disk1s1     500Mi   5.6Mi   483Mi     2%      32  4.9M    0%   /System/Volumes/iSCPreboot
/dev/disk1s3     500Mi   824Ki   483Mi     1%      74  4.9M    0%   /System/Volumes/Hardware
/dev/disk3s5     460Gi    99Gi   343Gi    23%    1.4M  3.6G    0%   /System/Volumes/Data
map auto_home      0Bi     0Bi     0Bi   100%       0     0     -   /System/Volumes/Data/home
/dev/disk3s3     460Gi   986Mi   343Gi     1%      41  3.6G    0%   /Volumes/Recovery
/dev/disk4s2     167Gi   2.7Gi   165Gi     2%    108k  4.3G    0%   /Volumes/code
```

### du

How to check disk space usage on the command line?

```shell
du -b <file> | cut -f1 # get file size in bytes
# list file and folder sizes in current directory
sudo du -sh * | sort -h -r
du -ahx . | sort -rh | head -5
du -hd 1 . # mac
```

## F

### fg

```shell
fg %4 # bring job 4 to foreground
```

### find

```shell
# search text in gz zipped log
find . -name "*.gz" -exec zgrep -nI "text to search" {} +
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

#### other commands

```shell
# rename branch
git branch -m <new_branch_name>

# view branch detailed info
git branch -vv

# set upstream
git branch -u <remote>/<branch_name>

# cherry pick remote commit
git fetch origin
git cherry-pick <commit hash>

# stash change for later
git stash save <useful message>
git stash show -p stash@{1}

git push <remote-name> <local-branch-name>:<remote-branch-name>  # add -u to track remote branch with local branch, i.e. set as upstream
# delete remote branch
git push -d <remote_name> <branch_name>
git push origin --delete <branch_name>

# show last three tags
git tag -l | tail -3

# github ssh setup
https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent
```

```shell
git log --all  --oneline --graph
# --decorate only applies to the head, --decorate=full example: commit 6b51db131e32e8fcaaa075e7d1134dbf9f7359ee (HEAD -> refs/heads/main, refs/remotes/origin/main)
# --oneline shows the commit hash and commit message
# --graph add a * (star symbol) and try to draw a graph, each commit may take more than one line
# oneline graph for blame
git log --graph --abbrev-commit --decorate --format=format:'%C(bold blue)%h%C(reset) - %C(bold green)(%ar)%C(reset) %C(white)%s%C(reset) %C(dim white)- %an%C(reset)%C(bold yellow)%d%C(reset)' --all
# two line graph for blame
git log --graph --abbrev-commit --decorate --format=format:'%C(bold blue)%h%C(reset) - %C(bold cyan)%aD%C(reset) %C(bold green)(%ar)%C(reset)%C(bold yellow)%d%C(reset)%n''          %C(white)%s%C(reset) %C(dim white)- %an%C(reset)'
```

#### How view and config git at system/global/local(repo) levels?

```shell
# to show config
% git config --list --system
# on mac
fatal: unable to read config file '/etc/gitconfig': No such file or directory
# global config file for unix based OS (linux, macOS) is at ~/.gitconfig, for windows c:\\Users\<username>\.gitconfig
% git config --list --global
user.name=<your_name>
user.email=<your_email>
# local config file location: <repo_path>/.git/config
% git config --list --local
core.repositoryformatversion=0
core.filemode=true
core.bare=false
core.logallrefupdates=true
core.precomposeunicode=true
user.name=<your_name>
user.email=<your_email>
remote.origin.url=git@github.com:<org_or_username>/<repo_name>.git # for ssh connected
# remote.origin.url=https://github.com/<org_or_unsername>/<repo_name>.git # for https connected
remote.origin.fetch=+refs/heads/*:refs/remotes/origin/*
branch.main.remote=origin
branch.main.merge=refs/heads/main
```

1. git configuration [doc](https://git-scm.com/book/en/v2/Customizing-Git-Git-Configuration)
2. where is global config data [betterstack](https://betterstack.com/community/questions/where-is-the-global-config-data-stored/)
3. git config file locations [theserverside](https://www.theserverside.com/blog/Coffee-Talk-Java-News-Stories-and-Opinions/Where-system-global-and-local-Windows-Git-config-files-are-saved)

### grep

```shell
$ grep -c # count of the number of lines
% echo "line 1\nline 2\nline 3"
line 1
line 2
line 3
% echo "line 1\nline 2\nline 3" | grep -c line
3
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

```shell
<command> > /dev/null # redirect standard output to be discarded
<command> > /dev/null 2>&1 # reroute stdout and stderr to be drscarded
nohup myscript.sh >myscript.log 2>&1 </dev/null &
#\__/             \___________/ \__/ \________/ ^
# |                    |          |      |      |
# |                    |          |      |  run in background
# |                    |          |      |
# |                    |          |   don't expect input
# |                    |          |
# |                    |        redirect stderr to stdout
# |                    |
# |                    redirect stdout to myscript.log
# |
# keep the command running
# no matter whether the connection is lost or you logout
```

1. The Linux Document Project (TLDP) [doc](https://tldp.org/LDP/abs/html/io-redirection.html)
2. stackoverflow [question](https://stackoverflow.com/questions/19955260/what-is-dev-null-in-bash) about `< /dev/null`

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

## X

### xclip

```shell
# copy current dir to xclip
pwd | xclip
# copy to clipboard, can be pasted in gui, e.g., in firefox
pwd | xclip -sel clip
# paste from xclip
xclip -o
```

### xrdp

```shell
sudo yum update
sudo yum install xrdp x11rdp xorgxrdp
sudo /etc/init.d/xrdp status
# result should be
xrdp is stopped
xrdp-sesman is stopped
```

update cert when cert auto-renew

```shell
MY_CERT_MS=com.<domain>.certificates.<username>.aka.corp.<domain>.com-STANDARD_SSL_SERVER_INTERNAL_ENDPOINT-RSA
# retrieve the certificate the private key
<command1> -t Certificate $MY_CERT_MS | openssl x509 -inform DER | sudo tee /etc/xrdp/cert.pem > /dev/null
<command1> -t PrivateKey $MY_CERT_MS | openssl pkcs8 -nocrypt -inform DER -outform PEM | sudo tee /etc/xrdp/key.pem > /dev/null
sudo chmod 400 /etc/xrdp/key.pem /etc/xrdp/cert.pem
sudo /etc/init.d/xrdp restart
sudo /etc/init.d/xrdp status
```

## References

1. multi-lingual [manpages.org](https://manpages.org/)
2. Michael Kerrisk [man-pages](https://www.man7.org/linux/man-pages/dir_all_alphabetic.html)
