---
author: JZ
pubDatetime: 2024-10-10T08:22:00Z
modDatetime: 2024-10-10T10:12:00Z
title: Docker Cheatsheet
tags:
  - cheatsheet-apps
description:
  "tips and cheatsheet for using docker"
---

## Table of contents

## Knowledge

1. Image is immutable and container is a box started from an image

## Cheatsheet

list all containers with sizes

```shell
docker ps -as
```

list all images

```shell
docker images
```

```shell
docker run [options] <image>
# best to use image id or image:tag
# -p hostPort:containerPort expose port, -P publish all exposed ports. 8888 for jupyter notebook
# -t terminal pseudo-TTY
# -i Keep STDIN open even if not attached
# -v /host/dir:/<container-path>
# --name Assign a name to the container
```

```shell
docker start -ai <container>
# can use container id or name
# -a Attach STDOUT/STDERR and forward signals
# -i Attach container's STDIN
```

```shell
jupyter notebook --ip 0.0.0.0 --no-browser
# run server at ip 0.0.0.0 and access in host at localhost(127.0.0.1) at the allowed port
```
