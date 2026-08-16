---
author: JZ
pubDatetime: 2026-08-16T06:00:00Z
modDatetime: 2026-08-16T06:00:00Z
title: LeetCode 355 Design Twitter
featured: true
tags:
  - a-heap
  - a-design
  - a-hash
description:
  "Solutions for LeetCode 355, medium, tags: hash table, linked list, design, heap."
---

## Table of contents

## Description

Question Links: [LeetCode 355](https://leetcode.com/problems/design-twitter/description/)

Design a simplified version of Twitter where users can post tweets, follow/unfollow another user, and is able to see the 10 most recent tweets in the user's news feed.

Implement the `Twitter` class:

- `Twitter()` Initializes your twitter object.
- `void postTweet(int userId, int tweetId)` Composes a new tweet with ID `tweetId` by the user `userId`. Each call to this function will be made with a unique `tweetId`.
- `List<Integer> getNewsFeed(int userId)` Retrieves the 10 most recent tweet IDs in the user's news feed. Each item in the news feed must be posted by users who the user followed or by the user themself. Tweets must be ordered from most recent to least recent.
- `void follow(int followerId, int followeeId)` The user with ID `followerId` started following the user with ID `followeeId`.
- `void unfollow(int followerId, int followeeId)` The user with ID `followerId` started unfollowing the user with ID `followeeId`.

```
Example 1:

Input
["Twitter", "postTweet", "getNewsFeed", "follow", "postTweet", "getNewsFeed", "unfollow", "getNewsFeed"]
[[], [1, 5], [1], [1, 2], [2, 6], [1], [1, 2], [1]]

Output
[null, null, [5], null, null, [6, 5], null, [5]]

Constraints:

1 <= userId, followerId, followeeId <= 500
0 <= tweetId <= 10^4
All the tweets have unique IDs.
At most 3 * 10^4 calls will be made to postTweet, getNewsFeed, follow, and unfollow.
```

## Solution: HashMap + Heap (Merge K Sorted Lists)

### Idea

The core insight is that each user's tweets form a sorted list (by posting time). When we call `getNewsFeed`, we need the 10 most recent tweets from the user and all their followees — this is exactly the "merge k sorted lists" pattern.

```
User 1 tweets: [t5, t3, t1]  (most recent first)
User 2 tweets: [t4, t2]
User 3 tweets: [t6]

After follow(1,2) and follow(1,3):
News feed for user 1 = merge top-10 from all three lists

           ┌───────────────────────────────┐
           │          Max-Heap             │
           │  Seeded with latest tweet     │
           │  from each followee + self    │
           └───────────────────────────────┘
                        │
       pop top (most recent) ──► add to result
                        │
       push next tweet from same user
                        │
       repeat until 10 tweets or heap empty
```

We maintain:
- `tweets`: HashMap mapping userId to a list of `(timestamp, tweetId)` pairs
- `follows`: HashMap mapping userId to a set of followee IDs
- A global timestamp counter that increments (or decrements) with each post

For `getNewsFeed`, we seed a heap with the latest tweet from each relevant user, then pop the most recent and push that user's next tweet — exactly like merging k sorted lists with a heap.

Complexity: `postTweet` $O(1)$, `getNewsFeed` $O(k \log k)$ where $k$ = number of followees (at most 10 pops each with $O(\log k)$), `follow`/`unfollow` $O(1)$. Space $O(T + F)$ where $T$ = total tweets, $F$ = total follow relationships.

#### Java

```java []
public class DesignTwitter {

    private final Map<Integer, List<int[]>> tweets; // userId -> list of [time, tweetId]
    private final Map<Integer, Set<Integer>> follows; // followerId -> set of followeeIds
    private int time;

    public DesignTwitter() {
        tweets = new HashMap<>();
        follows = new HashMap<>();
        time = 0;
    }

    public void postTweet(int userId, int tweetId) {
        tweets.computeIfAbsent(userId, k -> new ArrayList<>()).add(new int[]{time--, tweetId}); // O(1)
    }

    public List<Integer> getNewsFeed(int userId) {
        // min-heap on time (smaller = more recent since we decrement)
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]); // O(1)
        Set<Integer> users = new HashSet<>();
        users.add(userId);
        if (follows.containsKey(userId)) users.addAll(follows.get(userId)); // O(k)

        for (int uid : users) { // O(k) seed heap with latest tweet from each user
            List<int[]> userTweets = tweets.get(uid);
            if (userTweets != null && !userTweets.isEmpty()) {
                int idx = userTweets.size() - 1;
                int[] tweet = userTweets.get(idx);
                pq.offer(new int[]{tweet[0], tweet[1], uid, idx});
            }
        }

        List<Integer> result = new ArrayList<>();
        while (!pq.isEmpty() && result.size() < 10) { // O(10 * log k)
            int[] top = pq.poll();
            result.add(top[1]);
            int idx = top[3] - 1;
            if (idx >= 0) {
                int[] tweet = tweets.get(top[2]).get(idx);
                pq.offer(new int[]{tweet[0], tweet[1], top[2], idx});
            }
        }
        return result;
    }

    public void follow(int followerId, int followeeId) {
        follows.computeIfAbsent(followerId, k -> new HashSet<>()).add(followeeId); // O(1)
    }

    public void unfollow(int followerId, int followeeId) {
        Set<Integer> set = follows.get(followerId);
        if (set != null) set.remove(followeeId); // O(1)
    }
}
```

#### Python

```python []
class Twitter:
    def __init__(self):
        self.time = 0
        self.tweets = defaultdict(list)   # userId -> [(time, tweetId)]
        self.followees = defaultdict(set)  # userId -> set of followeeIds

    def postTweet(self, userId: int, tweetId: int) -> None:
        self.time -= 1  # negative for max-heap via min-heap, O(1)
        self.tweets[userId].append((self.time, tweetId))

    def getNewsFeed(self, userId: int) -> list[int]:
        heap = []
        self.followees[userId].add(userId)
        for followeeId in self.followees[userId]:  # O(k) seed heap
            if self.tweets[followeeId]:
                idx = len(self.tweets[followeeId]) - 1
                time, tweetId = self.tweets[followeeId][idx]
                heap.append((time, tweetId, followeeId, idx))
        heapq.heapify(heap)  # O(k)

        res = []
        while heap and len(res) < 10:  # O(10 * log k)
            time, tweetId, followeeId, idx = heapq.heappop(heap)
            res.append(tweetId)
            if idx > 0:
                idx -= 1
                time, tweetId = self.tweets[followeeId][idx]
                heapq.heappush(heap, (time, tweetId, followeeId, idx))
        return res

    def follow(self, followerId: int, followeeId: int) -> None:
        self.followees[followerId].add(followeeId)  # O(1)

    def unfollow(self, followerId: int, followeeId: int) -> None:
        self.followees[followerId].discard(followeeId)  # O(1)
```

#### C++

```cpp []
class Twitter {
    int time = 0;
    unordered_map<int, vector<pair<int,int>>> tweets; // userId -> [(time, tweetId)]
    unordered_map<int, unordered_set<int>> follows;   // userId -> set of followeeIds

public:
    Twitter() {}

    void postTweet(int userId, int tweetId) {
        tweets[userId].push_back({time++, tweetId}); // O(1)
    }

    vector<int> getNewsFeed(int userId) {
        using T = tuple<int,int,int,int>; // (time, tweetId, userId, idx)
        priority_queue<T> pq; // max-heap on time

        unordered_set<int> users;
        users.insert(userId);
        if (follows.count(userId))
            users.insert(follows[userId].begin(), follows[userId].end()); // O(k)

        for (int uid : users) { // O(k) seed heap
            if (tweets.count(uid) && !tweets[uid].empty()) {
                int idx = tweets[uid].size() - 1;
                auto& [t, tid] = tweets[uid][idx];
                pq.push({t, tid, uid, idx});
            }
        }

        vector<int> feed;
        while (!pq.empty() && feed.size() < 10) { // O(10 * log k)
            auto [t, tid, uid, idx] = pq.top();
            pq.pop();
            feed.push_back(tid);
            if (idx > 0) {
                int ni = idx - 1;
                auto& [nt, ntid] = tweets[uid][ni];
                pq.push({nt, ntid, uid, ni});
            }
        }
        return feed;
    }

    void follow(int followerId, int followeeId) {
        if (followerId != followeeId)
            follows[followerId].insert(followeeId); // O(1)
    }

    void unfollow(int followerId, int followeeId) {
        if (follows.count(followerId))
            follows[followerId].erase(followeeId); // O(1)
    }
};
```

#### Rust

```rust []
use std::collections::{BinaryHeap, HashMap, HashSet};

pub struct Twitter {
    time: i32,
    tweets: HashMap<i32, Vec<(i32, i32)>>, // userId -> [(time, tweetId)]
    follows: HashMap<i32, HashSet<i32>>,    // followerId -> {followeeIds}
}

impl Twitter {
    pub fn new() -> Self {
        Twitter { time: 0, tweets: HashMap::new(), follows: HashMap::new() }
    }

    pub fn post_tweet(&mut self, user_id: i32, tweet_id: i32) {
        self.time += 1; // O(1)
        self.tweets.entry(user_id).or_default().push((self.time, tweet_id));
    }

    pub fn get_news_feed(&mut self, user_id: i32) -> Vec<i32> {
        let mut heap: BinaryHeap<(i32, i32, i32, usize)> = BinaryHeap::new();
        let mut user_set: HashSet<i32> = self.follows
            .get(&user_id).cloned().unwrap_or_default();
        user_set.insert(user_id); // O(k) collect followees + self

        for &uid in &user_set { // O(k) seed heap with latest tweet from each user
            if let Some(tweets) = self.tweets.get(&uid) {
                if !tweets.is_empty() {
                    let idx = tweets.len() - 1;
                    let (time, tid) = tweets[idx];
                    heap.push((time, tid, uid, idx));
                }
            }
        }

        let mut feed = Vec::with_capacity(10);
        while let Some((_, tid, uid, idx)) = heap.pop() { // O(10 * log k)
            feed.push(tid);
            if feed.len() == 10 { break; }
            if idx > 0 {
                let next_idx = idx - 1;
                let (time, next_tid) = self.tweets[&uid][next_idx];
                heap.push((time, next_tid, uid, next_idx));
            }
        }
        feed
    }

    pub fn follow(&mut self, follower_id: i32, followee_id: i32) {
        self.follows.entry(follower_id).or_default().insert(followee_id); // O(1)
    }

    pub fn unfollow(&mut self, follower_id: i32, followee_id: i32) {
        if let Some(set) = self.follows.get_mut(&follower_id) {
            set.remove(&followee_id); // O(1)
        }
    }
}
```
