---
author: JZ
pubDatetime: 2026-11-04T19:50:30Z
modDatetime: 2026-11-04T19:50:30Z
title: LeetCode 1718 Construct the Lexicographically Largest Valid Sequence
featured: true
tags:
  - a-array
  - a-backtracking
description: "Backtracking solutions for LeetCode 1718, medium, tags: array, backtracking."
---

## Table of contents

## Description

Question link: [LeetCode 1718](https://leetcode.com/problems/construct-the-lexicographically-largest-valid-sequence/description/)

Given an integer `n`, build a sequence of length `2n - 1`. The value 1 appears once. Every value from 2 through `n` appears twice, and the two copies of a value `k` must be exactly `k` positions apart. Return the lexicographically largest sequence: at the first position where two valid answers differ, the answer with the larger value wins.

**Constraints:**

- `1 <= n <= 20`

**Example 1:**

- Input: `n = 3`
- Output: `[3, 1, 2, 3, 2]`

**Example 2:**

- Input: `n = 5`
- Output: `[5, 3, 1, 4, 3, 5, 2, 4, 2]`

## Idea: Descending Backtracking

Fill the leftmost empty position `i`. Try each unused value from `n` down to 1. For a value greater than 1, its second copy must fit at `i + k`, and that position must still be empty. Value 1 needs only the current slot.

After placing a value, continue from the next index. If the remaining slots cannot be completed, undo that placement and try the next smaller unused value. The search returns the first complete sequence it finds.

This order gives the lexicographically largest answer. At each step, all positions before `i` are already fixed. The search tries larger values first, and only accepts one when it can lead to a complete valid sequence. So the first complete answer has the largest possible value at the earliest position where another valid answer could differ.

For `n = 5`, the result places each larger pair as far left as its required distance allows:

```text
index:  0 1 2 3 4 5 6 7 8
value:  5 3 1 4 3 5 2 4 2

5 occurs at positions 0 and 5
3 occurs at positions 1 and 4
4 occurs at positions 3 and 7
2 occurs at positions 6 and 8
1 occurs once at position 2
```

The search explores at most `n!` partial value-placement sequences. Each state tries up to `n` candidates, so the conservative worst-case time is `O(n · n!)`. The sequence, used-value table, and recursion stack use `O(n)` space.

### Java

```java []
package array;

/**
 * LeetCode 1718, medium, tags: array, backtracking.
 * For 1 <= n <= 20, construct the lexicographically largest sequence of length 2*n-1.
 * Use 1 once and every value k from 2 to n twice, with its two indices exactly k apart.
 */
public final class ConstructDistancedSequence {
    private ConstructDistancedSequence() {}

    public static int[] constructDistancedSequence(int n) {
        int[] sequence = new int[2 * n - 1];
        backtrack(sequence, new boolean[n + 1], 0);
        return sequence;
    }

    private static boolean backtrack(int[] sequence, boolean[] used, int index) {
        while (index < sequence.length && sequence[index] != 0) index++;
        if (index == sequence.length) return true;

        // Conservative worst case: O(n * n!) time (O(n) work per search node), O(n) space.
        // Fill the leftmost empty slot in descending order: the first completion is largest.
        for (int value = used.length - 1; value >= 1; value--) {
            if (used[value]) continue;
            int secondIndex = value == 1 ? index : index + value;
            if (secondIndex >= sequence.length || sequence[secondIndex] != 0) continue;

            sequence[index] = value;
            sequence[secondIndex] = value;
            used[value] = true;
            if (backtrack(sequence, used, index + 1)) return true;
            used[value] = false;
            sequence[index] = 0;
            sequence[secondIndex] = 0;
        }
        return false;
    }
}
```

### Python

```python []
"""leet 1718, medium"""


class Solution:
    """Build the lexicographically largest distanced sequence by backtracking."""

    def constructDistancedSequence(self, target_number: int) -> list[int]:
        """Return a valid sequence, trying larger values before smaller ones.

        Time: O(n * n!) in the conservative worst case; there are at most n!
        partial placement orders, each trying or skipping up to n values/slots.
        Space: O(n) for the result, used-number table, and recursion stack.
        """
        # Initialize the result sequence with size 2*n - 1 filled with 0s
        result_sequence = [0] * (target_number * 2 - 1)

        # Keep track of which numbers are already placed in the sequence
        is_number_used = [False] * (target_number + 1)

        # Start recursive backtracking to construct the sequence
        self.find_lexicographically_largest_sequence(
            0, result_sequence, is_number_used, target_number
        )

        return result_sequence

    # Recursive function to generate the desired sequence
    def find_lexicographically_largest_sequence(
            self, current_index, result_sequence, is_number_used, target_number
    ):
        # If we have filled all positions, return true indicating success
        if current_index == len(result_sequence):
            return True

        # If the current position is already filled, move to the next index
        if result_sequence[current_index] != 0:
            return self.find_lexicographically_largest_sequence(
                current_index + 1,
                result_sequence,
                is_number_used,
                target_number,
            )

        # Descending choices make the first complete solution lexicographically
        # largest. In the worst case this explores O(n!) placement orders.
        for number_to_place in range(target_number, 0, -1):
            if is_number_used[number_to_place]:
                continue

            is_number_used[number_to_place] = True
            result_sequence[current_index] = number_to_place

            # If placing number 1, move to the next index directly
            if number_to_place == 1:
                if self.find_lexicographically_largest_sequence(
                        current_index + 1,
                        result_sequence,
                        is_number_used,
                        target_number,
                ):
                    return True
            # Place larger numbers at two positions if valid
            elif (
                    current_index + number_to_place < len(result_sequence)
                    and result_sequence[current_index + number_to_place] == 0
            ):
                result_sequence[current_index + number_to_place] = (
                    number_to_place
                )

                if self.find_lexicographically_largest_sequence(
                        current_index + 1,
                        result_sequence,
                        is_number_used,
                        target_number,
                ):
                    return True

                # Undo the placement for backtracking
                result_sequence[current_index + number_to_place] = 0

            # Undo current placement and mark the number as unused
            result_sequence[current_index] = 0
            is_number_used[number_to_place] = False

        return False
```

### C++

```cpp []
#ifndef CONSTRUCT_DISTANCED_SEQUENCE_HPP
#define CONSTRUCT_DISTANCED_SEQUENCE_HPP

#include <vector>

using namespace std;

// LeetCode 1718. Construct the Lexicographically Largest Valid Sequence.
class ConstructDistancedSequence {
public:
    static vector<int> constructDistancedSequence(int n) {
        vector<int> sequence(2 * n - 1, 0);
        vector<bool> used(n + 1, false);
        search(0, n, sequence, used);
        return sequence;
    }

private:
    static bool search(int index, int n, vector<int>& sequence, vector<bool>& used) {
        while (index < (int)sequence.size() && sequence[index] != 0) ++index;
        if (index == (int)sequence.size()) return true;

        // O(n * n!) worst-case time, O(n) auxiliary space. Descending choices at
        // the leftmost empty slot make the first solution lexicographically largest.
        for (int value = n; value >= 1; --value) {
            if (used[value]) continue;
            const int second = value == 1 ? index : index + value;
            if (second >= (int)sequence.size() || sequence[second] != 0) continue;

            sequence[index] = sequence[second] = value;
            used[value] = true;
            if (search(index + 1, n, sequence, used)) return true;
            used[value] = false;
            sequence[index] = sequence[second] = 0;
        }
        return false;
    }
};

#endif
```

### Rust

```rust []
/// leet 1718
pub struct Solution;

impl Solution {
    pub fn construct_distanced_sequence(n: i32) -> Vec<i32> {
        let n = n as usize;
        let mut sequence = vec![0; 2 * n - 1];
        let mut used = vec![false; n + 1];
        Self::search(0, &mut sequence, &mut used);
        sequence
    }

    /// Conservative worst case: O(n * n!) time, O(n) auxiliary space.
    /// Each level places one unused value; scanning slots and candidates costs O(n).
    /// Descending choices at the leftmost empty slot make the first solution largest.
    fn search(mut index: usize, sequence: &mut [i32], used: &mut [bool]) -> bool {
        while index < sequence.len() && sequence[index] != 0 {
            index += 1;
        }
        if index == sequence.len() {
            return true;
        }

        for value in (1..used.len()).rev() {
            if used[value] {
                continue;
            }
            let second = if value == 1 { index } else { index + value };
            if second >= sequence.len() || sequence[second] != 0 {
                continue;
            }

            used[value] = true;
            sequence[index] = value as i32;
            sequence[second] = value as i32;
            if Self::search(index + 1, sequence, used) {
                return true;
            }
            sequence[index] = 0;
            sequence[second] = 0;
            used[value] = false;
        }
        false
    }
}
```
