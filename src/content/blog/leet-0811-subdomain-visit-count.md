---
author: JZ
pubDatetime: 2024-11-24T06:23:00Z
modDatetime: 2024-11-24T06:23:00Z
title: LeetCode 811 LintCode 1006 Subdomain Visit Count
featured: true
tags:
  - a-array
  - a-hash
  - a-string
  - a-counting
  - c-salesforce
description:
  "Solutions for LeetCode 811 and LintCode 1006, medium, tags: array, hash, string, counting, companies: salesforce."
---

## Table of contents

## Description

A website domain `"discuss.leetcode.com"` consists of various subdomains. At the top level, we have `"com"`, at the next level, we have `"leetcode.com"` and at the lowest level, `"discuss.leetcode.com"`. When we visit a domain like `"discuss.leetcode.com"`, we will also visit the parent domains `"leetcode.com"` and `"com"` implicitly.

A **count-paired domain** is a domain that has one of the two formats `"rep d1.d2.d3"` or `"rep d1.d2"` where `rep` is the number of visits to the domain and `d1.d2.d3` is the domain itself.

-   For example, `"9001 discuss.leetcode.com"` is a **count-paired domain** that indicates that `discuss.leetcode.com` was visited `9001` times.

Given an array of **count-paired domains** `cpdomains`, return _an array of the **count-paired domains** of each subdomain in the input_. You may return the answer in **any order**.

```
Example 1:

Input: cpdomains = ["9001 discuss.leetcode.com"]
Output: ["9001 leetcode.com","9001 discuss.leetcode.com","9001 com"]
Explanation: We only have one website domain: "discuss.leetcode.com".
As discussed above, the subdomain "leetcode.com" and "com" will also be visited. So they will all be visited 9001 times.
Example 2:

Input: cpdomains = ["900 google.mail.com", "50 yahoo.com", "1 intel.mail.com", "5 wiki.org"]
Output: ["901 mail.com","50 yahoo.com","900 google.mail.com","5 wiki.org","5 org","1 intel.mail.com","951 com"]
Explanation: We will visit "google.mail.com" 900 times, "yahoo.com" 50 times, "intel.mail.com" once and "wiki.org" 5 times.
For the subdomains, we will visit "mail.com" 900 + 1 = 901 times, "com" 900 + 50 + 1 = 951 times, and "org" 5 times.
```

**Constraints:**

-   `1 <= cpdomain.length <= 100`
-   `1 <= cpdomain[i].length <= 100`
-   `cpdomain[i]` follows either the `"rep_i d1_i.d2_i.d3_i"` format or the `"rep_i d1_i.d2_i"` format.
-   `rep_i` is an integer in the range `[1, 10^4]`.
-   `d1_i`, `d2_i`, and `d3_i` consist of lowercase English letters.


## Solution

`let n = cpdomains.length, m = number of domain fragments in cpdomains[i]`

### Idea

We use hash map to store each domain and subdomain as keys and map them to their corresponding count. We accumulate
and sum the counts as we process each entry form the input.

Complexity: Time O(nm), Space O(nm).

#### Java

```java
 class Solution {
    public List<String> subdomainVisits(String[] cpdomains) {
        Map<String, Integer> cnt = new HashMap<>(); // domain -> count
        for (String cd : cpdomains) {
            int i = cd.indexOf(' ');
            int n = Integer.parseInt(cd.substring(0, i));
            String s = cd.substring(i + 1);
            cnt.merge(s, n, Integer::sum);
            for (i = 0; i < s.length(); ++i) {
                if (s.charAt(i) != '.') continue;
                String d = s.substring(i + 1);
                cnt.merge(d, n, Integer::sum);
            }
        }
        List<String> res = new ArrayList<>();
        for (String d : cnt.keySet()) res.add(cnt.get(d) + " " + d);
        return res;
    }
}
```

#### Python

```python
class Solution:
    def subdomainVisits(self, cpdomains: list[str]) -> list[str]:
        cnt = collections.Counter()
        for cpd in cpdomains:
            n, d = cpd.split()
            n = int(n)
            cnt[d] += n
            for i, c in enumerate(d):
                if c != '.': continue
                cnt[d[i + 1:]] += n
        return [f'{cnt[k]} {k}' for k in cnt]
```
