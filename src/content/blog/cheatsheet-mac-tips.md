---
author: JZ
pubDatetime: 2024-10-01T08:22:00Z
modDatetime: 2024-10-01T10:12:00Z
title: Mac Tips and Great Apps 
tags:
  - cheatsheet-mac
description:
  "tips for using mac"
---

## Table of contents

## Apps

1. Homebrew
2. Karabiner-Elements (I am using microsoft Nano Transceiver v2.1 wireless keyboard, map `application` key (keys in pc keyboards -> application) to `fn` key (modifier keys -> fn) to switch input languages)
3. OneMenu (window management, keyboard cleaning, external monitor brightness, and clipboard history)

### Homebrew

list all installed packages, optionally can add the `package_name` parameter

```shell
$ brew list [package_name]
```

## Case Sensitive Volume

Some code may depend on case-sensitive naming as permitted with linux file system. How to create a case-sensitive volume on a Mac?

With Mac Sequoia (macOS 15), we could use disk utility.

1. Select where you want to create the case-sensitive volume, recommend creating in the "Macintosh HD" volume container
2. use menu, Edit > add APFS volume, type name
3. select "APFS (Case-sensitive)" or "APFS (Case-sensitive, Encrypted)" from the format dropdown
4. click size options and type in the reserve size (min start size) and quta size (max size)
5. click add

For older mac OS

1. use menu, File > new image, blank image
2. provide save as name "code.dmg" and select save location
3. provide name, size, format can select "Mac OS extended (Case-sensitive, Journaled)" or "APFS (Case-sensitive)"
4. add the image to log-in items so the image can be automatically mounted at OS startup.

## Keyboard Shortcuts

1. `ctrl + k` to delete till the end of line, vim `d, $`
2. `cmd + backspace` or `cmd + shift + left, delete` delete to the beginning of the line
3. `alt + left-arrow` to move cursor word by word, `b` in vim, `ctrl + left-arrow` in windows.
4. `cmd + left-arrow` to move to the beginning of the line, `home` key in windows
