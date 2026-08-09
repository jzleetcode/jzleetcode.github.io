---
author: JZ
pubDatetime: 2026-08-09T06:00:00Z
modDatetime: 2026-08-09T06:00:00Z
title: LeetCode 1438 Longest Continuous Subarray With Absolute Diff Less Than or Equal to Limit
featured: true
tags:
  - a-sliding-window
  - a-monotonic-queue
  - a-ordered-set
description:
  "Solutions for LeetCode 1438, medium, tags: array, queue, sliding window, ordered set, monotonic queue."
---

## Table of contents

## Description

Question Links: [LeetCode 1438](https://leetcode.com/problems/longest-continuous-subarray-with-absolute-diff-less-than-or-equal-to-limit/description/)

Given an array of integers `nums` and an integer `limit`, return the size of the longest non-empty subarray such that the absolute difference between any two elements of this subarray is less than or equal to `limit`.

```
Example 1:
Input: nums = [8,2,4,7], limit = 4
Output: 2
Explanation: All subarrays are:
[8] with maximum absolute diff |8-8| = 0 <= 4.
[8,2] with maximum absolute diff |8-2| = 6 > 4.
[2,4] with maximum absolute diff |4-2| = 2 <= 4.
[2,4,7] with maximum absolute diff |7-2| = 5 > 4.
[4,7] with maximum absolute diff |7-4| = 3 <= 4.
So the size of the longest subarray is 2.

Example 2:
Input: nums = [10,1,2,4,7,2], limit = 5
Output: 4
Explanation: The subarray [2,4,7,2] is the longest since the max absolute diff is |7-2| = 5 <= 5.

Example 3:
Input: nums = [4,2,2,2,4,4,2,2], limit = 0
Output: 3

Constraints:
1 <= nums.length <= 10^5
1 <= nums[i] <= 10^9
0 <= limit <= 10^9
```

## Solution 1: Monotonic Deques

### Idea

The absolute difference between any two elements in a subarray equals `max - min` of that subarray. We use a sliding window with two monotonic deques:

- A **decreasing deque** tracks the window maximum (front = max index).
- An **increasing deque** tracks the window minimum (front = min index).

As we expand the right pointer, we maintain both deques. When `max - min > limit`, we shrink from the left until the constraint is satisfied.

Each element is pushed and popped at most once from each deque, so the total work across all iterations is linear.

```
nums = [10, 1, 2, 4, 7, 2], limit = 5

r=0: window=[10]       max_dq=[10] min_dq=[10]  diff=0  res=1
r=1: window=[10,1]     max_dq=[10] min_dq=[1]   diff=9>5 → shrink
     window=[1]        max_dq=[]→[1] min_dq=[1] diff=0  res=1
r=2: window=[1,2]      max_dq=[2] min_dq=[1]    diff=1  res=2
r=3: window=[1,2,4]    max_dq=[4] min_dq=[1]    diff=3  res=3
r=4: window=[1,2,4,7]  max_dq=[7] min_dq=[1]    diff=6>5 → shrink
     window=[2,4,7]    max_dq=[7] min_dq=[2]    diff=5  res=3→ still 3? no, len=3
     Actually after shrinking l=1→2: window=[2,4,7] len=3
     Wait l was 1, diff=7-1=6>5, l→2, diff=7-2=5<=5, len=r-l+1=4-2+1=3
     Hmm... let me redo: after r=3, l=1, window=[1,2,4] len=3
r=4: push 7, max_dq=[7] min_dq=[1,2,4,7]→[1], diff=7-1=6>5
     l=1→2, min_dq front was idx1(=1)<2 → pop, now min_dq front=idx2(=2)
     diff=7-2=5<=5, window=[2,4,7] res=max(3,3)=3... 
     Actually l started at 1: r=4, r-l+1=4-1+1=4, then shrink: l=2, r-l+1=4-2+1=3
     Hmm but expected=4. Let me re-check: subarray [2,4,7,2] at indices 2-5.
r=5: push 2, max_dq=[7,2] min_dq=[2], diff=7-2=5<=5, res=max(3,5-2+1)=max(3,4)=4 ✓
```

Complexity: Time $O(n)$, Space $O(n)$.

#### Java

```java []
public static int longestSubarrayDeque(int[] nums, int limit) {
    int n = nums.length, res = 0, left = 0;
    ArrayDeque<Integer> maxDq = new ArrayDeque<>(); // decreasing: front is max index
    ArrayDeque<Integer> minDq = new ArrayDeque<>(); // increasing: front is min index
    for (int right = 0; right < n; right++) { // O(n) each element enqueued/dequeued at most once
        while (!maxDq.isEmpty() && nums[maxDq.peekLast()] <= nums[right]) maxDq.removeLast();
        maxDq.addLast(right);
        while (!minDq.isEmpty() && nums[minDq.peekLast()] >= nums[right]) minDq.removeLast();
        minDq.addLast(right);
        while (nums[maxDq.peekFirst()] - nums[minDq.peekFirst()] > limit) { // O(1) amortized
            left++;
            if (maxDq.peekFirst() < left) maxDq.removeFirst();
            if (minDq.peekFirst() < left) minDq.removeFirst();
        }
        res = Math.max(res, right - left + 1);
    }
    return res;
}
```

#### Python

```python []
class Solution:
    """Monotonic deques: O(n) time, O(n) space"""

    def longestSubarray(self, nums: List[int], limit: int) -> int:
        max_dq, min_dq = deque(), deque()  # O(n) space for both deques
        l = 0
        res = 0
        for r, n in enumerate(nums):  # O(n) outer loop
            while max_dq and n >= nums[max_dq[-1]]:
                max_dq.pop()
            while min_dq and n <= nums[min_dq[-1]]:
                min_dq.pop()
            max_dq.append(r)
            min_dq.append(r)
            while nums[max_dq[0]] - nums[min_dq[0]] > limit:  # amortized O(1)
                l += 1
                if max_dq[0] < l:
                    max_dq.popleft()
                if min_dq[0] < l:
                    min_dq.popleft()
            res = max(res, r - l + 1)
        return res
```

#### C++

```cpp []
class Solution {
public:
    int longestSubarray(vector<int>& nums, int limit) {
        int n = nums.size();
        deque<int> maxQ, minQ; // O(n) space for both deques
        int ans = 0;
        for (int l = 0, r = 0; r < n; r++) {
            while (!maxQ.empty() && nums[maxQ.back()] <= nums[r]) maxQ.pop_back(); // O(1) amortized
            maxQ.push_back(r);
            while (!minQ.empty() && nums[minQ.back()] >= nums[r]) minQ.pop_back();
            minQ.push_back(r);
            while (nums[maxQ.front()] - nums[minQ.front()] > limit) {
                l++;
                if (maxQ.front() < l) maxQ.pop_front();
                if (minQ.front() < l) minQ.pop_front();
            }
            ans = max(ans, r - l + 1);
        }
        return ans;
    }
};
```

#### Rust

```rust []
impl Solution {
    pub fn longest_subarray(nums: Vec<i32>, limit: i32) -> i32 {
        let mut max_dq: VecDeque<usize> = VecDeque::new(); // decreasing deque (front = max)
        let mut min_dq: VecDeque<usize> = VecDeque::new(); // increasing deque (front = min)
        let (mut l, mut res) = (0, 0);
        for r in 0..nums.len() {
            while let Some(&back) = max_dq.back() {
                if nums[back] <= nums[r] { max_dq.pop_back(); } else { break; }
            }
            max_dq.push_back(r);
            while let Some(&back) = min_dq.back() {
                if nums[back] >= nums[r] { min_dq.pop_back(); } else { break; }
            }
            min_dq.push_back(r);
            while nums[*max_dq.front().unwrap()] - nums[*min_dq.front().unwrap()] > limit {
                l += 1;
                if *max_dq.front().unwrap() < l { max_dq.pop_front(); }
                if *min_dq.front().unwrap() < l { min_dq.pop_front(); }
            }
            res = res.max(r - l + 1);
        }
        res as i32
    }
}
```

## Solution 2: Sorted Container (TreeMap / multiset / BTreeMap / SortedList)

### Idea

Instead of monotonic deques, we maintain a sorted data structure of elements in the current window. This gives us $O(\log n)$ access to min and max. We expand right, insert, then shrink left while `max - min > limit`.

This approach is simpler to reason about but slightly slower due to the logarithmic factor per insertion/removal.

Complexity: Time $O(n \log n)$, Space $O(n)$.

#### Java

```java []
public static int longestSubarrayTreeMap(int[] nums, int limit) {
    int n = nums.length, res = 0, left = 0;
    TreeMap<Integer, Integer> map = new TreeMap<>(); // O(n) space for window elements
    for (int right = 0; right < n; right++) {
        map.merge(nums[right], 1, Integer::sum); // O(log n) insert/update
        while (map.lastKey() - map.firstKey() > limit) { // O(log n) for firstKey/lastKey
            int val = nums[left++];
            int cnt = map.get(val);
            if (cnt == 1) map.remove(val);
            else map.put(val, cnt - 1);
        }
        res = Math.max(res, right - left + 1);
    }
    return res;
}
```

#### Python

```python []
class Solution2:
    """Sorted list (balanced BST): O(n log n) time, O(n) space"""

    def longestSubarray(self, nums: List[int], limit: int) -> int:
        sl = SortedList()  # O(n) space
        l = 0
        res = 0
        for r, n in enumerate(nums):  # O(n) outer loop
            sl.add(n)  # O(log n) per insertion
            while sl[-1] - sl[0] > limit:
                sl.remove(nums[l])  # O(log n) per removal
                l += 1
            res = max(res, r - l + 1)
        return res
```

#### C++

```cpp []
class Solution2 {
public:
    int longestSubarray(vector<int>& nums, int limit) {
        int n = nums.size();
        multiset<int> window; // O(n) space, maintains sorted order
        int ans = 0;
        for (int l = 0, r = 0; r < n; r++) {
            window.insert(nums[r]); // O(log n) insertion
            while (*window.rbegin() - *window.begin() > limit) {
                window.erase(window.find(nums[l])); // O(log n) erasure
                l++;
            }
            ans = max(ans, r - l + 1);
        }
        return ans;
    }
};
```

#### Rust

```rust []
impl Solution2 {
    pub fn longest_subarray(nums: Vec<i32>, limit: i32) -> i32 {
        let mut map: BTreeMap<i32, i32> = BTreeMap::new(); // element -> count
        let (mut l, mut res) = (0, 0);
        for r in 0..nums.len() {
            *map.entry(nums[r]).or_insert(0) += 1; // O(log n) insert
            while *map.keys().next_back().unwrap() - *map.keys().next().unwrap() > limit {
                let e = map.entry(nums[l]).or_insert(0);
                *e -= 1;
                if *e == 0 { map.remove(&nums[l]); } // O(log n) removal
                l += 1;
            }
            res = res.max(r - l + 1);
        }
        res as i32
    }
}
```
