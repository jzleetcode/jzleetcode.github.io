---
author: JZ
pubDatetime: 2024-10-10T08:22:00Z
modDatetime: 2024-10-10T10:12:00Z
title: Cheatsheet for Python Data/AI Projects (Conda, Docker, Jupyter Notebook)
tags:
  - cheatsheet-apps
description:
  "tips and cheatsheet for python data/AI projects using conda, docker, and jupyter notebook"
---

## Table of contents

## Knowledge

1. A docker image is immutable, and a docker container is a box started from an image.

## Cheatsheet

### Python

```shell
# how to create virtual env with python 3
python3 -m venv test1
cd test1
source bin/activate
which python
which pip
pip install requests
pip list
```

### Conda

```shell
# install vim in the miniforge docker container
conda install -c conda-forge vim
conda list # View list of packages and versions installed in active environment
conda info --envs # list all envs, active shown with *
conda search -f python # Check versions of Python available to install
conda create -n <env_name> biopython # Create an environment and install program(s)
conda remove -n <env_name> --all # Delete an environment
conda env export > <file_name>.yml # Save current environment to a file
conda env create -f <file_name>.yml # Load environment from a file
conda search beautiful-soup # search for a package to see if it is available to conda install
conda create -n py27 python=2.7 ipykernel
# since conda 4.7.1 special package nb_conda_kernels detecting envs with notebook kernels, automatically registers them
conda create -n py36 python=3.6 ipykernel
conda activate <env>
conda deactivate
```

### Docker

How to list all containers with sizes?

```shell
docker ps -as
```

How to list all docker images?

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
exit # exiting a container
docker rm <container_name>  # delete a container
# starting container attaching a local volume (path), this method is now considered legacy
docker run -v /host/directory:/container/directory -other -options image_name command_to_run
# create a container with port mapping for jupyter notebook
docker run -it -p 8888:8888 -p 6006:6006 -v /host/path:/container/path --name <name> <image_name>
# using mount, config platform for apple silicon chip, run from the direction to be mounted
docker run -it --platform linux/amd64 -p 8888:8888 -p 6006:6006 --mount type=bind,src=.,dst=/usr/ai2 --name ai2 condaforge/miniforge-pypy3
```

### Jupyter Notebook

```shell
jupyter notebook --ip 0.0.0.0 --no-browser --allow-root
# run server at ip 0.0.0.0 and access in host at localhost(127.0.0.1) at the allowed port
# jupyter notebook will start from directory where this command was ran
```
