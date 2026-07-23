---
author: JZ
pubDatetime: 2026-07-23T10:36:00Z
modDatetime: 2026-07-23T10:36:00Z
title: LeetCode 901 Online Stock Span
featured: true
tags:
  - a-stack
  - a-monotonic-stack
  - a-design
description:
  "Solutions for LeetCode 901, medium, tags: stack, design, monotonic stack, data stream."
---

## Table of contents

## Description

Question Links: [LeetCode 901](https://leetcode.com/problems/online-stock-span/description/)

Design an algorithm that collects daily price quotes for some stock and returns the **span** of that stock's price for the current day.

The span of the stock's price in one day is the maximum number of consecutive days (starting from that day and going backward) for which the stock price was less than or equal to that day's price.

For example, if the prices of the stock in the last four days is `[7,2,1,2]` and the price of the stock today is `2`, then the span of today is `4` because starting from today, the price of the stock was less than or equal `2` for 4 consecutive days.

Implement the `StockSpanner` class:

- `StockSpanner()` Initializes the object of the class.
- `int next(int price)` Returns the span of the stock's price given that today's price is `price`.

```
Example 1:

Input
["StockSpanner", "next", "next", "next", "next", "next", "next", "next"]
[[], [100], [80], [60], [70], [60], [75], [85]]
Output
[null, 1, 1, 1, 2, 1, 4, 6]

Explanation
StockSpanner stockSpanner = new StockSpanner();
stockSpanner.next(100); // return 1
stockSpanner.next(80);  // return 1
stockSpanner.next(60);  // return 1
stockSpanner.next(70);  // return 2, prices 60 and 70 are <= 70
stockSpanner.next(60);  // return 1
stockSpanner.next(75);  // return 4, prices 60, 70, 60, 75 are <= 75
stockSpanner.next(85);  // return 6, prices 80, 60, 70, 60, 75, 85 are <= 85

Constraints:

1 <= price <= 10^5
At most 10^4 calls will be made to next.
```

## Solution 1: Monotonic Decreasing Stack

### Idea

We maintain a stack of `(price, span)` pairs in monotonically decreasing order of price. When a new price arrives, we pop all entries whose price is ≤ the current price and accumulate their spans. The key insight is that once an entry is absorbed (popped), we never need it again — the current entry's span already accounts for it.

```
Prices: [100, 80, 60, 70, 60, 75, 85]

Step 1: price=100 -> stack: [(100,1)]         -> span=1
Step 2: price=80  -> stack: [(100,1),(80,1)]   -> span=1
Step 3: price=60  -> stack: [(100,1),(80,1),(60,1)] -> span=1
Step 4: price=70  -> pop (60,1), span=1+1=2
                     stack: [(100,1),(80,1),(70,2)] -> span=2
Step 5: price=60  -> stack: [(100,1),(80,1),(70,2),(60,1)] -> span=1
Step 6: price=75  -> pop (60,1) span=1+1=2
                     pop (70,2) span=2+2=4
                     stack: [(100,1),(80,1),(75,4)] -> span=4
Step 7: price=85  -> pop (75,4) span=1+4=5
                     pop (80,1) span=5+1=6
                     stack: [(100,1),(85,6)]   -> span=6
```

Each element is pushed and popped at most once across all calls, so the amortized time per call is $O(1)$.

Complexity: Time $O(1)$ amortized per call. Space $O(n)$.

#### Java

```java []
public int next(int price) {
    int span = 1;
    while (!stack.isEmpty() && stack.peek()[0] <= price) { // pop while top price <= current
        span += stack.pop()[1]; // accumulate spans, O(1) amortized
    }
    stack.push(new int[]{price, span}); // push (price, accumulated_span)
    return span;
}
```

#### Python

```python []
def next(self, price: int) -> int:
    span = 1
    while self.stack and self.stack[-1][0] <= price:  # O(1) amortized
        span += self.stack.pop()[1]
    self.stack.append((price, span))
    return span
```

#### C++

```cpp []
int next(int price) {
    int span = 1;
    while (!st.empty() && st.top().first <= price) { // O(1) amortized
        span += st.top().second;
        st.pop();
    }
    st.push({price, span});
    return span;
}
```

#### Rust

```rust []
fn next(&mut self, price: i32) -> i32 {
    let mut span = 1;
    while let Some(&(top_price, top_span)) = self.stack.last() {
        if top_price <= price {
            span += top_span;
            self.stack.pop();
        } else {
            break;
        }
    }
    self.stack.push((price, span));
    span
}
```

## Solution 2: DP Jump-Back

### Idea

Instead of a stack, store all prices and spans in arrays. When computing the span for a new price, jump backwards through the array using previously computed spans to skip over already-counted elements. If `prices[j] <= price`, we know `spans[j]` consecutive days before (and including) day `j` are also ≤ `prices[j]` ≤ `price`, so we can jump `i -= spans[j]` instead of decrementing one-by-one.

This gives the same amortized performance as the stack approach but uses a different data structure.

Complexity: Time $O(1)$ amortized per call. Space $O(n)$.

#### Java

```java []
public int next(int price) {
    int span = 1;
    int i = prices.size() - 1;
    while (i >= 0 && prices.get(i) <= price) { // jump back using spans
        span += spans.get(i);
        i -= spans.get(i); // skip over already-computed span
    }
    prices.add(price);
    spans.add(span);
    return span;
}
```

#### Python

```python []
def next(self, price: int) -> int:
    self.prices.append(price)
    span = 1
    i = len(self.prices) - 2
    while i >= 0 and self.prices[i] <= price:  # O(n) worst case per call
        span += self.spans[i]
        i -= self.spans[i]  # jump backwards by span[i]
    self.spans.append(span)
    return span
```

#### C++

```cpp []
int next(int price) {
    prices.push_back(price);
    int idx = prices.size() - 1;
    int span = 1;
    int j = idx - 1;
    while (j >= 0 && prices[j] <= price) { // O(1) amortized
        span += spans[j];
        j -= spans[j]; // jump back by span[j] positions
    }
    spans.push_back(span);
    return span;
}
```

#### Rust

```rust []
fn next(&mut self, price: i32) -> i32 {
    let mut span = 1;
    let mut i = self.prices.len() as i32 - 1;
    while i >= 0 && self.prices[i as usize] <= price {
        span += self.spans[i as usize];
        i -= self.spans[i as usize]; // jump back by the span at position i
    }
    self.prices.push(price);
    self.spans.push(span);
    span
}
```
