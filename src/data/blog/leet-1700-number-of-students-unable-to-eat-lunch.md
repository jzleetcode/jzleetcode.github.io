---
author: JZ
pubDatetime: 2026-10-29T11:32:29Z
modDatetime: 2026-10-29T11:32:29Z
title: LeetCode 1700 Number of Students Unable to Eat Lunch
featured: true
tags:
  - a-array
  - a-queue
description:
  "Solutions for LeetCode 1700, easy, tags: array, queue, simulation, counting."
---

## Table of contents

## Description

Question Links: [LeetCode 1700](https://leetcode.com/problems/number-of-students-unable-to-eat-lunch/description/)

The cafeteria has a stack of sandwiches and a queue of students. Each student prefers either a circular sandwich (`0`) or a square sandwich (`1`). At each step, the student at the front takes the top sandwich if it matches their preference. Otherwise, that student moves to the back of the queue.

When no student wants the top sandwich, the process stops. Return the number of students unable to eat.

```
Example 1:

Input: students = [1,1,0,0], sandwiches = [0,1,0,1]
Output: 0

Example 2:

Input: students = [1,1,1,0,0,1], sandwiches = [1,0,0,0,1,1]
Output: 3

Constraints:

1 <= students.length, sandwiches.length <= 100
students.length == sandwiches.length
students[i], sandwiches[i] is either 0 or 1.
```

## Solution 1: Count Preferences

### Idea

Queue rotation changes only the order of students; it never changes how many students want each sandwich shape. Count how many `0` and `1` preferences remain. Scan the sandwich stack from top to bottom:

- If the required shape has at least one interested student, decrement that count.
- If its count is zero, nobody can take this sandwich. Every remaining student is therefore unable to eat.

```
students:   [1, 1, 1, 0, 0, 1]
counts:          0 -> 2,  1 -> 4
sandwiches: [1, 0, 0, 0, 1, 1]

take 1  -> [2, 3]
take 0  -> [1, 3]
take 0  -> [0, 3]
need 0, but count[0] = 0
                         ^ stop: 3 students remain
```

Complexity: Time $O(n)$, Space $O(1)$.

#### Java

```java []
public static int countStudents(int[] students, int[] sandwiches) {
    int[] remaining = new int[2];
    for (int student : students) { // O(n)
        remaining[student]++;
    }
    for (int sandwich : sandwiches) { // O(n) overall
        if (remaining[sandwich] == 0) {
            return remaining[1 - sandwich];
        }
        remaining[sandwich]--;
    }
    return 0;
}
```

#### Python

```python []
def countStudents(self, students: list[int], sandwiches: list[int]) -> int:
    remaining = [0, 0]
    for student in students:  # O(n), O(1) extra space
        remaining[student] += 1

    for sandwich in sandwiches:  # O(n) overall
        if remaining[sandwich] == 0:
            return remaining[1 - sandwich]
        remaining[sandwich] -= 1

    return 0
```

#### C++

```cpp []
int countStudents(vector<int>& students, vector<int>& sandwiches) {
    array<int, 2> remaining{};
    for (int student : students) { // O(n)
        ++remaining[student];
    }
    for (int sandwich : sandwiches) { // O(n) overall
        if (remaining[sandwich] == 0) {
            return remaining[1 - sandwich];
        }
        --remaining[sandwich];
    }
    return 0;
}
```

#### Rust

```rust []
pub fn count_students(students: Vec<i32>, sandwiches: Vec<i32>) -> i32 {
    let mut remaining = [0_i32; 2];
    for student in students { // O(n)
        remaining[student as usize] += 1;
    }
    for sandwich in sandwiches { // O(n) overall
        let sandwich = sandwich as usize;
        if remaining[sandwich] == 0 {
            return remaining[1 - sandwich];
        }
        remaining[sandwich] -= 1;
    }
    0
}
```

## Solution 2: Queue Simulation

### Idea

The literal simulation uses a queue. When the front student dislikes the top sandwich, move that student to the back. A full rotation with no student eating proves that the current sandwich has no match, so stop.

This mirrors the statement closely, but repeated rotations make it slower than counting.

Complexity: Time $O(n^2)$ in the worst case, Space $O(n)$.

#### Java

```java []
public static int countStudentsQueue(int[] students, int[] sandwiches) {
    Queue<Integer> studentsInLine = new ArrayDeque<>();
    for (int student : students) studentsInLine.offer(student); // O(n)

    int sandwichIndex = 0;
    int rotationsWithoutEating = 0;
    while (!studentsInLine.isEmpty() && rotationsWithoutEating < studentsInLine.size()) {
        if (studentsInLine.peek() == sandwiches[sandwichIndex]) {
            studentsInLine.poll();
            sandwichIndex++;
            rotationsWithoutEating = 0;
        } else {
            studentsInLine.offer(studentsInLine.poll());
            rotationsWithoutEating++;
        }
    }
    return studentsInLine.size();
}
```

#### Python

```python []
def countStudentsQueue(self, students: list[int], sandwiches: list[int]) -> int:
    queue = list(students)
    sandwich_index = 0
    rotations_without_eating = 0

    while queue and rotations_without_eating < len(queue):
        if queue[0] == sandwiches[sandwich_index]:
            queue.pop(0)
            sandwich_index += 1
            rotations_without_eating = 0
        else:
            queue.append(queue.pop(0))
            rotations_without_eating += 1
    return len(queue)
```

#### C++

```cpp []
int countStudentsQueue(vector<int>& students, vector<int>& sandwiches) {
    queue<int> waiting(students.begin(), students.end());
    size_t sandwichIndex = 0;
    size_t rotationsWithoutEating = 0;

    while (!waiting.empty() && rotationsWithoutEating < waiting.size()) {
        if (waiting.front() == sandwiches[sandwichIndex]) {
            waiting.pop();
            ++sandwichIndex;
            rotationsWithoutEating = 0;
        } else {
            waiting.push(waiting.front());
            waiting.pop();
            ++rotationsWithoutEating;
        }
    }
    return static_cast<int>(waiting.size());
}
```

#### Rust

```rust []
pub fn count_students_queue(students: Vec<i32>, sandwiches: Vec<i32>) -> i32 {
    let mut queue: VecDeque<i32> = students.into();
    let mut sandwich_index = 0;
    let mut rotations_without_eating = 0;

    while !queue.is_empty() && rotations_without_eating < queue.len() {
        if queue.front() == sandwiches.get(sandwich_index) {
            queue.pop_front();
            sandwich_index += 1;
            rotations_without_eating = 0;
        } else {
            let student = queue.pop_front().unwrap();
            queue.push_back(student);
            rotations_without_eating += 1;
        }
    }
    queue.len() as i32
}
```
