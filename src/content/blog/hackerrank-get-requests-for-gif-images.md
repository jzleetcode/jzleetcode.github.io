---
author: JZ
pubDatetime: 2024-12-08T06:23:00Z
modDatetime: 2024-12-08T06:23:00Z
title: HackerRank GET Requests for GIF Images
featured: true
tags:
  - a-hash
  - a-file
  - c-salesforce
description:
  "Solutions for hacker rank get requests for gif images, medium, tags: file, hash set."
---

## Table of contents

## Description

You are given a log file with a list of responses, some of the records in the log file may contain filenames.

Generate a new file containing the unique names of all gif files that were requested via `GET` and that had a response code of 200.

A sample and the structure of the text file containing the responses are given below.

Sample log record:

```
burger.letters.com - - [01/Jul/1995:00:00:12 -0400] "GET /shuttle/countdown/video/Livevideo.GIF HTTP/1. 0" 200 0
burger.letters.com - - [01/Jul/1995:00:00:12 -0400] "GET / images/NASA-logosmall.gif HTTP/1.0" 304 0
```

Log File Structure contains Hostname, Timestamp, Request, HTTP Response Code, and Bytes.

Missing column values are denoted by a hyphen (i.e. -).

Timestamp Format: DD: day of the month, mmm: name of the month, YYYY: year, HH:MM:SS - 24-hour time format, -0400 is the time zone.

Given a filename that denotes a text file in the current working directory. Create an output file with the name "gifs_" prefixed to the filename (gifs_filename) which stores the unique gif filenames that match the requirements.

Example: filename = "hosts_access_log_00.txt", process the records in hosts_access_log_00.txt and create an output file named gifs_hosts_access_log_00.txt.

Write the name of a GIF file (without its path) to the output file, for each of the records in the input file which satisfy the below:

- The GIF file was requested by a GET request.
- The record has an HTTP response code of 200.

Note:

- The output file has to be written to the current directory.
- The line order in the output file does not matter.
- There must not be any duplicates (if duplicates exist, you will receive only 70% of the score).

Sample Input 0

hosts_access_log_00.txt

Sample Output 0

Given filename = "hosts_access_log_00.txt", process the records in hosts_access_log_00.txt and create an output file named gifs_hosts_access_log_00.txt that contains the following rows:

```
livevideo.GIF
count. gif
NASA-Logosmall-gif
KSC-logosmall gif
```

Explanation 0

The log file hosts_access_log_00.txt contains the following log records:

```
unicomp6.unicomp.net - - [01/Jul/1995:00:00:06 -0400] "GET /shuttle/countdown/ HTTP/1.0" 200 3985
burger.letters.com - - [01/Jul/1995:00:00:11 -0400] "GET /shuttle/countdown/liftoff.html HTTP/1.0" 304 0
burger.letters.com - - [01/Jul/1995:00:00:12 -0400] "GET /images/NASA-logosmall.gif HTTP/1.0" 304 0
burger.letters.com - - [01/Jul/1995:00:00:12 -0400] "GET /shuttle/countdown/video/livevideo.GIF HTTP/1.0" 200 0
d104.aa.net - - [01/Jul/1995:00:00:13 -0400] "GET /shuttle/countdown/ HTTP/1.0" 200 3985
unicomp6.unicomp.net - - [01/Jul/1995:00:00:14 -0400] "GET /shuttle/countdown/count.gif HTTP/1.0" 200 40310
unicomp6.unicomp.net - - [01/Jul/1995:00:00:14 -0400] "GET /images/NASA-logosmall.gif HTTP/1.0" 200 786
unicomp6.unicomp.net - - [01/Jul/1995:00:00:14 -0400] "GET /images/KSC-logosmall.gif HTTP/1.0" 200 1204
d104. aa.net - - [01/Jul/1995:00:00:15 -0400] "GET /shuttle/countdown/count.gif HTTP/1.0" 200 40310
d104. aa.net - - [01/Jul/1995:00:00:15 -0400] "GET /images/NASA-logosmall.gif HTTP/1.0" 200 786
```

A review of the data above:

```
The fourth log record:
   burger.letters.com - - [01/Jul/1995:00:00:12 -0400] "GET /shuttle/countdown/video/livevideo.GIF HTTP/1. 0" 200 0
   A GET request requested a file named livevide. GIF and the HTTP response code was 200.
The sixth log record:
   unicomp6.unicomp.net - - [01/Jul/1995:00:00:14 -0400] "GET /shuttle/countdown/count.gif HTTP/1.0" 200 40310
And the ninth log record:
   d104.aa.net - - [01/Jul/1995:00:00:15 -0400] "GET /shuttle/countdown/count.gif HTTP/1.0" 200 40310
```

## Idea

We could use string search in each line of the text in the log file with logic below. KMP algorithm can be used for linear time complexity string search. In practice, the standard library string search is typically used.

1. We search for `GET`.
2. If `GET` was found, we search for `gif` ignore case. Let index `j` be the index of the end for `gif`.
3. If both `GET` and `gif` was found, we search for the last `/`: index `i`.
4. The gif file name is between the index `i` and `j`.
5. We add the gif file name to a hash set.
6. We iterate through the unique `gif` file names in the hash set and write to the output file.

Alternatively we could use regular expression to match the pattern of `GET ... /<gif file name> ... 200`. For what characters can be contained in a file name, we could start with [wikipedia](https://en.wikipedia.org/wiki/Filename#Comparison_of_filename_limitations).

`let m = size for the regular expression`

Complexity: Time $O(n)-O(2^m)$, Space $O(m)$. See this stackoverflow [question](https://stackoverflow.com/questions/5892115/whats-the-time-complexity-of-average-regex-algorithms) for complexity analysis.

### Python

```python
import re

LOG = ("""
unicomp6.unicomp.net - - [01/Jul/1995:00:00:06 -0400] "GET /shuttle/countdown/ HTTP/1.0" 200 3985
burger.letters.com - - [01/Jul/1995:00:00:11 -0400] "GET /shuttle/countdown/liftoff.html HTTP/1.0" 304 0
burger.letters.com - - [01/Jul/1995:00:00:12 -0400] "GET /images/NASA-logosmall.gif HTTP/1.0" 304 0
burger.letters.com - - [01/Jul/1995:00:00:12 -0400] "GET /shuttle/countdown/video/livevideo.GIF HTTP/1.0" 200 0
d104.aa.net - - [01/Jul/1995:00:00:13 -0400] "GET /shuttle/countdown/ HTTP/1.0" 200 3985
unicomp6.unicomp.net - - [01/Jul/1995:00:00:14 -0400] "GET /shuttle/countdown/count.gif HTTP/1.0" 200 40310
unicomp6.unicomp.net - - [01/Jul/1995:00:00:14 -0400] "GET /images/NASA-logosmall.gif HTTP/1.0" 200 786
unicomp6.unicomp.net - - [01/Jul/1995:00:00:14 -0400] "GET /images/KSC-logosmall.gif HTTP/1.0" 200 1204
d104. aa.net - - [01/Jul/1995:00:00:15 -0400] "GET /shuttle/countdown/count.gif HTTP/1.0" 200 40310
d104. aa.net - - [01/Jul/1995:00:00:15 -0400] "GET /images/NASA-logosmall.gif HTTP/1.0" 200
d104. aa.net - - [01/Jul/1995:00:00:15 -0400] "POST /images/NASA-logosmall.gif HTTP/1.0" 200
""")


# https://stackoverflow.com/questions/40894264/when-are-files-too-large-to-be-read-as-strings-in-python
def unique_gif(lines: str) -> set[str]:
    p = r"GET .*/(*.gif).*200"
    res = re.findall(p, lines, flags=re.IGNORECASE)
    # print(res)
    return set(res)


def get_gif_from_log_file(fn: str):
    lines = set()
    with open(fn, "r") as f:
        lines.update(unique_gif(f.read()))
    with open(f'gifs_fn', "w") as f:
        f.write(f'l\n')


if __name__ == "__main__":
    for l in unique_gif(LOG):
        print(l)
```

Unit Test

You can see that the lines `burger.letters.com - - [01/Jul/1995:00:00:12 -0400] "GET /images/NASA-logosmall.gif HTTP/1.0" 304 0` and `104. aa.net - - [01/Jul/1995:00:00:15 -0400] "POST /images/NASA-logosmall.gif HTTP/1.0" 200` were not matched by the regular expression.

And the hash set deduplicated the `gif` file names.

```shell
['livevideo.GIF', 'count.gif', 'NASA-logosmall.gif', 'KSC-logosmall.gif', 'count.gif', 'NASA-logosmall.gif']
NASA-logosmall.gif
count.gif
livevideo.GIF
KSC-logosmall.gif
```
