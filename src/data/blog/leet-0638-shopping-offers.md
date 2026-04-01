---
author: JZ
pubDatetime: 2026-03-28T06:00:00Z
modDatetime: 2026-03-28T06:00:00Z
title: LeetCode 638 Shopping Offers
featured: true
tags:
  - a-dp
  - a-dfs
  - a-backtracking
  - a-memoization
description:
  "Solutions for LeetCode 638, medium, tags: array, dynamic programming, backtracking, bitmask, memoization."
---

## Table of contents

## Description

In LeetCode Store, there are `n` items to sell. Each item has a price. However, there are some special group-discount offers, each represented as a list of integers where the last number is the bundle price, and the preceding numbers indicate how many of each item the offer includes.

Given the `price` for each item, a list of `special` offers, and the `needs` for each item, return the lowest price you have to pay for **exactly** the items you need. You cannot buy more items than you want, even if that would lower the overall price. You can use any of the special offers as many times as you want.

```
Example 1:

Input: price = [2,5], special = [[3,0,5],[1,2,10]], needs = [3,2]
Output: 14
Explanation: Buy items individually: 3*2 + 2*5 = 16.
  Offer [3,0,5]: 3 of item 0 for 5.
  Offer [1,2,10]: 1 of item 0, 2 of item 1 for 10.
  Best: use offer [3,0,5] once (cost 5), buy 2 of item 1 individually (cost 2*5=10) → but wait:
  Actually: offer1 gives 3 of item0 for 5, then 2 of item1 at price 5 each = 5+10 = 15?
  No: use offer2 [1,2,10] once → 1 of item0, 2 of item1 for 10. Then 2 of item0 at 2 each = 4.
  Total = 10 + 4 = 14.

Example 2:

Input: price = [2,3,4], special = [[1,1,0,4],[2,2,1,9]], needs = [1,2,1]
Output: 11
Explanation: Use offer [1,1,0,4] once → 1 of item0, 1 of item1 for 4.
  Buy remaining: 1 of item1 at 3, 1 of item2 at 4 → 4 + 3 + 4 = 11.
```

**Constraints:**

- `n == price.length == needs.length`
- `1 <= n <= 6`
- `0 <= price[i], needs[i] <= 10`
- `1 <= special.length <= 100`
- `special[i].length == n + 1`
- `0 <= special[i][j] <= 50`

## Solution 1: DFS + Memoization

Use the remaining `needs` as state. At each state, the base cost is buying everything at individual prices. For each offer that doesn't exceed any remaining need, try applying it and recurse. Memoize on the needs tuple so each distinct state is computed exactly once.

First, filter out offers that cost more than buying their items individually — these can never help.

```
dfs(needs):
  res = Σ needs[i] * price[i]        ← buy everything individually
  for each offer:
    updated = needs - offer           ← subtract offer quantities
    if all updated[i] >= 0:           ← offer doesn't exceed any need
      res = min(res, offer_price + dfs(updated))
  memo[needs] = res
  return res
```

Complexity: Time $O(n \cdot k \cdot m^n)$, Space $O(n \cdot m^n)$.

Where $n$ = number of items (≤6), $k$ = number of offers (≤100), $m$ = max need value (≤10). There are at most $m^n$ distinct need states. At each state, we try $k$ offers with $O(n)$ work each.

## Solution 2: Backtracking

Process offers by index. For offer at index `idx`, try using it 0, 1, 2, ... times, then recurse to `idx + 1`. Fixing the order avoids counting the same combination twice (e.g., offer A then B vs B then A). No memoization needed.

```
dfs(idx, needs):
  if idx == len(offers):
    return Σ needs[i] * price[i]      ← buy remaining individually
  res = dfs(idx + 1, needs)            ← skip this offer (0 times)
  for times = 1, 2, ...:
    needs -= offer[idx]                ← apply offer once more
    if any need < 0: break
    res = min(res, offer_price * times + dfs(idx + 1, needs))
  return res
```

Complexity: Time $O(n \cdot (m+1)^k)$, Space $O(k \cdot n)$.

At each of $k$ levels, we branch into up to $m+1$ choices (use offer 0 to $m$ times). Each branch does $O(n)$ work. Space is just the recursion stack: depth $k$, each frame stores $O(n)$ needs.

### Java

```java
// lc 638, DFS + memo, n*k*m^n time, n*m^n space.
static List<List<Integer>> filterSpecial(List<Integer> price, List<List<Integer>> special) {
    int n = price.size();
    List<List<Integer>> filtered = new ArrayList<>();
    for (List<Integer> s : special) {
        int sum = 0;
        for (int i = 0; i < n; i++) sum += s.get(i) * price.get(i);
        if (sum > s.get(n)) filtered.add(s);
    }
    return filtered;
}

static int individualCost(List<Integer> price, List<Integer> needs) {
    int res = 0;
    for (int i = 0; i < price.size(); i++) res += price.get(i) * needs.get(i);
    return res;
}

public int shoppingOffers(List<Integer> price, List<List<Integer>> special, List<Integer> needs) {
    List<List<Integer>> filtered = filterSpecial(price, special);
    HashMap<List<Integer>, Integer> memo = new HashMap<>();
    return dfs(price, filtered, needs, memo);
}

private int dfs(List<Integer> price, List<List<Integer>> special,
                List<Integer> needs, HashMap<List<Integer>, Integer> memo) {
    if (memo.containsKey(needs)) return memo.get(needs);
    int n = price.size();
    int res = individualCost(price, needs);
    for (List<Integer> offer : special) {
        List<Integer> updated = IntStream.range(0, n)
                .mapToObj(i -> needs.get(i) - offer.get(i)).toList();
        if (updated.stream().allMatch(v -> v >= 0))
            res = Math.min(res, offer.get(n) + dfs(price, special, updated, memo));
    }
    memo.put(needs, res);
    return res;
}
```

```java
// lc 638, backtracking, n*(m+1)^k time, k*n space.
public int shoppingOffers(List<Integer> price, List<List<Integer>> special, List<Integer> needs) {
    List<List<Integer>> filtered = filterSpecial(price, special);
    return dfs(0, price, filtered, needs);
}

private int dfs(int idx, List<Integer> price, List<List<Integer>> special, List<Integer> needs) {
    int n = price.size();
    if (idx == special.size()) return individualCost(price, needs);
    int res = dfs(idx + 1, price, special, needs);
    List<Integer> updated = new ArrayList<>(needs);
    int times = 0;
    while (true) {
        boolean neg = false;
        for (int i = 0; i < n; i++) {
            int v = updated.get(i) - special.get(idx).get(i);
            updated.set(i, v);
            if (v < 0) neg = true;
        }
        if (neg) break;
        times++;
        res = Math.min(res, special.get(idx).get(n) * times + dfs(idx + 1, price, special, updated));
    }
    return res;
}
```

### Python

```python
# lc 638, DFS + memo, n*k*m^n time, n*m^n space. 47ms, 19.74mb.
class Solution:
    def shoppingOffers(self, price, special, needs):
        n = len(price)
        special = [s for s in special if sum(s[i] * price[i] for i in range(n)) > s[-1]]

        @lru_cache(maxsize=None)
        def dfs(needs):
            res = sum(needs[i] * price[i] for i in range(n))
            for offer in special:
                updated = tuple(needs[i] - offer[i] for i in range(n))
                if all(u >= 0 for u in updated):
                    res = min(res, offer[-1] + dfs(updated))
            return res

        return dfs(tuple(needs))
```

```python
# lc 638, backtracking, n*(m+1)^k time, k*n space. 23ms, 19.65mb.
class Solution2:
    def shoppingOffers(self, price, special, needs):
        n = len(price)
        special = [s for s in special if sum(s[i] * price[i] for i in range(n)) > s[-1]]

        def dfs(idx, needs):
            if idx == len(special):
                return sum(needs[i] * price[i] for i in range(n))
            res = dfs(idx + 1, needs)
            updated = list(needs)
            times = 0
            while True:
                updated = [updated[i] - special[idx][i] for i in range(n)]
                if any(u < 0 for u in updated):
                    break
                times += 1
                res = min(res, special[idx][-1] * times + dfs(idx + 1, updated))
            return res

        return dfs(0, needs)
```

### C++

```cpp
// lc 638, DFS + memo, n*k*m^n time, n*m^n space.
struct VectorHash {
    size_t operator()(const vector<int> &v) const {
        size_t seed = v.size();
        for (auto x : v) seed ^= hash<int>()(x) + 0x9e3779b9 + (seed << 6) + (seed >> 2);
        return seed;
    }
};

int shoppingOffers(vector<int> &price, vector<vector<int>> &special, vector<int> &needs) {
    int n = static_cast<int>(price.size());
    vector<vector<int>> filt;
    for (const auto &s : special) {
        int sum = 0;
        for (int i = 0; i < n; ++i) sum += s[i] * price[i];
        if (sum > s.back()) filt.push_back(s);
    }
    unordered_map<vector<int>, int, VectorHash> memo;
    function<int(const vector<int> &)> dfs = [&](const vector<int> &cur) -> int {
        if (auto it = memo.find(cur); it != memo.end()) return it->second;
        int res = 0;
        for (int i = 0; i < n; ++i) res += cur[i] * price[i];
        for (const auto &off : filt) {
            vector<int> updated(n);
            for (int i = 0; i < n; ++i) updated[i] = cur[i] - off[i];
            if (all_of(updated.begin(), updated.end(), [](int v) { return v >= 0; }))
                res = min(res, off.back() + dfs(updated));
        }
        memo[cur] = res;
        return res;
    };
    return dfs(needs);
}
```

```cpp
// lc 638, backtracking, n*(m+1)^k time, k*n space.
int shoppingOffers2(vector<int> &price, vector<vector<int>> &special, vector<int> &needs) {
    int n = static_cast<int>(price.size());
    vector<vector<int>> filt;
    for (const auto &s : special) {
        int sum = 0;
        for (int i = 0; i < n; ++i) sum += s[i] * price[i];
        if (sum > s.back()) filt.push_back(s);
    }
    function<int(int, vector<int>)> dfs = [&](int idx, vector<int> nd) -> int {
        if (idx == static_cast<int>(filt.size())) {
            int s = 0;
            for (int i = 0; i < n; ++i) s += nd[i] * price[i];
            return s;
        }
        int res = dfs(idx + 1, nd);
        vector<int> updated = nd;
        int times = 0;
        while (true) {
            for (int i = 0; i < n; ++i) updated[i] -= filt[idx][i];
            if (any_of(updated.begin(), updated.end(), [](int u) { return u < 0; }))
                break;
            ++times;
            res = min(res, filt[idx].back() * times + dfs(idx + 1, updated));
        }
        return res;
    };
    return dfs(0, needs);
}
```

### Rust

```rust
// lc 638, DFS + memo, n*k*m^n time, n*m^n space. 0ms, 2.31mb.
fn filter_specials(price: &[i32], special: Vec<Vec<i32>>) -> Vec<Vec<i32>> {
    let n = price.len();
    special.into_iter().filter(|s| {
        let bundle: i32 = (0..n).map(|i| s[i] * price[i]).sum();
        bundle > s[n]
    }).collect()
}

impl Solution {
    pub fn shopping_offers(price: Vec<i32>, special: Vec<Vec<i32>>, needs: Vec<i32>) -> i32 {
        let n = price.len();
        let special = filter_specials(&price, special);
        let mut memo = HashMap::new();
        Self::dfs(&price, &special, &needs, n, &mut memo)
    }

    fn dfs(price: &[i32], special: &[Vec<i32>], needs: &[i32], n: usize,
           memo: &mut HashMap<Vec<i32>, i32>) -> i32 {
        if let Some(&v) = memo.get(needs) { return v; }
        let mut res: i32 = (0..n).map(|i| needs[i] * price[i]).sum();
        for offer in special {
            let updated: Vec<i32> = (0..n).map(|i| needs[i] - offer[i]).collect();
            if updated.iter().all(|&u| u >= 0) {
                let cost = offer[n] + Self::dfs(price, special, &updated, n, memo);
                res = res.min(cost);
            }
        }
        memo.insert(needs.to_vec(), res);
        res
    }
}
```

```rust
// lc 638, backtracking, n*(m+1)^k time, k*n space. 0ms, 2.35mb.
impl Solution2 {
    pub fn shopping_offers(price: Vec<i32>, special: Vec<Vec<i32>>, needs: Vec<i32>) -> i32 {
        let n = price.len();
        let special = filter_specials(&price, special);
        Self::dfs(0, &price, &special, &needs, n)
    }

    fn dfs(idx: usize, price: &[i32], special: &[Vec<i32>], needs: &[i32], n: usize) -> i32 {
        if idx == special.len() { return (0..n).map(|i| needs[i] * price[i]).sum(); }
        let mut res = Self::dfs(idx + 1, price, special, needs, n);
        let mut updated = needs.to_vec();
        let mut times = 0;
        loop {
            for i in 0..n { updated[i] -= special[idx][i]; }
            if updated.iter().any(|&u| u < 0) { break; }
            times += 1;
            let branch = special[idx][n] * times + Self::dfs(idx + 1, price, special, &updated, n);
            res = res.min(branch);
        }
        res
    }
}
```
