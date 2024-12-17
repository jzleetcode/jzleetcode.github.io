---
author: JZ
pubDatetime: 2024-11-22T08:22:00Z
modDatetime: 2024-11-22T10:12:00Z
title: Vim CheatSheet
featured: true
tags:
  - cheatsheet-vim
description:
  "tips for using vim"
---

## Table of contents

## Context

This is a collection of useful commands and keyboard shortcuts for using vim. Most should work with vanilla vim.
Will label if any plugin is needed.

## Tips

-   jump to corresponding bracket or parenthesis, parenthesis: use `%` key
-   copy to system clipboard: type "\*y or "+y, see this [stackoverflow question](https://stackoverflow.com/questions/3961859/how-to-copy-to-clipboard-in-vim), can use `pbcopy` on mac

### commenting multiple lines

How to comment multiple lines? Method below can achieve single line comment style, e.g., `//` in Java.

comment: Esc, ctrl+v (visual block mode), select multiple lines, shift+i, insert text, Esc
uncomment: select (double click), ctrl+v, up down select multiple lines, delete
see this [stackoverflow question](https://stackoverflow.com/questions/1676632/whats-a-quick-way-to-comment-uncomment-lines-in-vim)

Alternatively, you can use the record and repeat method below.

### delete

How to delete word by word?

```shell
10dw # delete 10 words after the cursor
```

### fix ^M windows line return

```
:e ++ff=dos
:set ff=unix
```

### jump to where you want

How to quickly jump to where you want in vim?

```shell
10gg # jump to line 10
G # jump to file end
10w # jump forward 10 words
10b # jump backwards 10 words
alt(mac)/ctrl(windows) + left/right arrow # jump by word in insert mode or other editors such as Notepad or TextEdit
f<letter> # jump to the first letter of the word you would like to jump to
```

### record and repeat

`Esc q` followed by `a`: start recording and store in register a
`q` to stop recording
`98@a` to repeat the recording 98 times

### search replace

```shell
:%s/foo/bar/g  # replace all
:6,10s/foo/bar/g  # replace in lines [6,10] inclusive
```

See this [stackoverflow question](https://stackoverflow.com/questions/19994922/find-and-replace-strings-in-vim-on-multiple-lines)

```
:s/<search_string>/<replace_string>/c # step through and ask for confirmation to replace on this line
:6,10s/foo/bar/g # replace in lines 6-10 inclusive
:%s/foo/bar/g # replace all
```
