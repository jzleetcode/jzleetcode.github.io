---
author: JZ
pubDatetime: 2024-11-12T04:22:00Z
modDatetime: 2024-11-12T05:12:00Z
title: LeetCode 2064 Minimized Maximum of Products Distributed to Any Store
featured: true
tags:
  - a-array
  - a-binary-search
  - a-heap
description:
  "Solutions for LeetCode 2064, medium, tags: array, binary search, heap."
---

## Table of contents

## Description

You are given an integer `n` indicating there are `n` specialty retail stores. There are `m` product types of varying amounts, which are given as a **0-indexed** integer array `quantities`, where `quantities[i]` represents the number of products of the `ith` product type.

You need to distribute **all products** to the retail stores following these rules:

-   A store can only be given **at most one product type** but can be given **any** amount of it.
-   After distribution, each store will have been given some number of products (possibly `0`). Let `x` represent the maximum number of products given to any store. You want `x` to be as small as possible, i.e., you want to **minimize** the **maximum** number of products that are given to any store.

Return _the minimum possible_ `x`.

```
Example 1:

Input: n = 6, quantities = [11,6]
Output: 3
Explanation: One optimal way is:
- The 11 products of type 0 are distributed to the first four stores in these amounts: 2, 3, 3, 3
- The 6 products of type 1 are distributed to the other two stores in these amounts: 3, 3
The maximum number of products given to any store is max(2, 3, 3, 3, 3, 3) = 3.
Example 2:

Input: n = 7, quantities = [15,10,10]
Output: 5
Explanation: One optimal way is:
- The 15 products of type 0 are distributed to the first three stores in these amounts: 5, 5, 5
- The 10 products of type 1 are distributed to the next two stores in these amounts: 5, 5
- The 10 products of type 2 are distributed to the last two stores in these amounts: 5, 5
The maximum number of products given to any store is max(5, 5, 5, 5, 5, 5, 5) = 5.
Example 3:

Input: n = 1, quantities = [100000]
Output: 100000
Explanation: The only optimal way is:
- The 100000 products of type 0 are distributed to the only store.
The maximum number of products given to any store is max(100000) = 100000.
 

Constraints:

m == quantities.length
1 <= m <= n <= 10^5
1 <= quantities[i] <= 10^5
```

Hint 1

There exists a monotonic nature such that when x is smaller than some number, there will be no way to distribute, and when x is not smaller than that number, there will always be a way to distribute.

Hint 2

If you are given a number k, where the number of products given to any store does not exceed k, could you determine if all products can be distributed?

Hint 3

Implement a function canDistribute(k), which returns true if you can distribute all products such that any store will not be given more than k products, and returns false if you cannot. Use this function to binary search for the smallest possible k.

## Solution

`let k = max(quantities)`, with the constraints above, O(k)=O(n)=O(m)= 10^5

### Idea

The question is similar to capacity ship packages question LeetCode 1011.

We could use binary search starting with range `[1,max(quantities)]`. We calculate the number of stores needed for each product with the ceiling of `quantity/mid` (we can use `(quantity+mid-1)/ mid`). We calculate the total number of stores needed and keep shrinking the range until binary search finishes.

Complexity: Time O(nlogk), Space O(1).

#### Java

```java
class Solution2 {
    public int minimizedMaximum(int n, int[] A) {
        int left = 1, right = 100000;
        while (left < right) {
            int mid = (left + right) / 2, sum = 0;
            for (int a : A) sum += (a + mid - 1) / mid;
            if (sum > n) left = mid + 1;
            else right = mid;
        }
        return left;
    }
}
```
