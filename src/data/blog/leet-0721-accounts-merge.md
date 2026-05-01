---
author: JZ
pubDatetime: 2026-03-31T06:00:00Z
modDatetime: 2026-03-31T06:00:00Z
title: LeetCode 721 Accounts Merge
featured: false
tags:
  - a-union-find
  - a-dfs
  - a-graph
description:
  "Solutions for LeetCode 721, medium, tags: array, hash table, string, depth-first search, breadth-first search, union find, sorting."
---

## Table of contents

## Description

Question Links: [LeetCode 721](https://leetcode.com/problems/accounts-merge/description/)

Given a list of `accounts` where each element `accounts[i]` is a list of strings, the first element `accounts[i][0]` is a name, and the rest are **emails** belonging to that account.

Now, we want to merge these accounts. Two accounts definitely belong to the same person if there is some common email to both accounts. Even if two accounts have the same name, they may belong to different people (people can have the same name). A person can have any number of accounts initially, but all of their accounts definitely have the same name.

After merging, return the accounts in the following format: the first element of each account is the name, and the rest are emails **in sorted order**. The accounts themselves can be returned in any order.

```
Example 1:

Input: accounts = [["John","johnsmith@mail.com","john_newyork@mail.com"],
                   ["John","johnsmith@mail.com","john00@mail.com"],
                   ["Mary","mary@mail.com"],
                   ["John","johnnybravo@mail.com"]]
Output: [["John","john00@mail.com","john_newyork@mail.com","johnsmith@mail.com"],
         ["Mary","mary@mail.com"],
         ["John","johnnybravo@mail.com"]]
Explanation: The first and second John's share "johnsmith@mail.com", so they
  are the same person. The third John has no overlap, so stays separate.

Example 2:

Input: accounts = [["Gabe","Gabe0@m.co","Gabe3@m.co","Gabe1@m.co"],
                   ["Kevin","Kevin3@m.co","Kevin5@m.co","Kevin0@m.co"],
                   ["Ethan","Ethan5@m.co","Ethan4@m.co","Ethan0@m.co"],
                   ["Hanzo","Hanzo3@m.co","Hanzo1@m.co","Hanzo0@m.co"],
                   ["Fern","Fern5@m.co","Fern1@m.co","Fern0@m.co"]]
Output: [["Ethan","Ethan0@m.co","Ethan4@m.co","Ethan5@m.co"],
         ["Fern","Fern0@m.co","Fern1@m.co","Fern5@m.co"],
         ["Gabe","Gabe0@m.co","Gabe1@m.co","Gabe3@m.co"],
         ["Hanzo","Hanzo0@m.co","Hanzo1@m.co","Hanzo3@m.co"],
         ["Kevin","Kevin0@m.co","Kevin3@m.co","Kevin5@m.co"]]
```

**Constraints:**

- `1 <= accounts.length <= 1000`
- `2 <= accounts[i].length <= 10`
- `1 <= accounts[i][j].length <= 30`
- `accounts[i][0]` consists of English letters.
- `accounts[i][j] (for j > 0)` is a valid email.

## Solution 1: Union-Find (Rank + Path Compression)

The key insight is that emails within the same account belong to the same person, and if two accounts share an email, they belong to the same person. This is a classic connectivity problem — perfect for Union-Find.

Map each email to a parent pointer. For every account, union all its emails together (using the first email as the representative). After processing all accounts, group emails by their root and reconstruct the result.

The union-find uses **union by rank** and **path compression (path halving)** for near-constant amortized operations.

```
accounts: [["John", "a@m", "b@m"],
           ["John", "b@m", "c@m"],
           ["Mary", "d@m"]]

Step 1 — Initialize & Union:
  account 0: union(a@m, b@m)     parent: a@m ← b@m
  account 1: union(b@m, c@m)     parent: a@m ← b@m ← c@m
  account 2: d@m (single, self-parent)

Step 2 — Group by root:
  find(a@m) = a@m  →  group a@m: [a@m, b@m, c@m]
  find(d@m) = d@m  →  group d@m: [d@m]

Step 3 — Sort & prepend name:
  ["John", "a@m", "b@m", "c@m"]
  ["Mary", "d@m"]
```

Complexity: Time \( O(nk \cdot \alpha(nk) + nk \cdot \log(nk)) \), Space \( O(nk) \).

Where \( n \) = number of accounts, \( k \) = max emails per account, \( \alpha \) = inverse Ackermann function (nearly constant). The union-find operations are nearly linear; the \( nk \cdot \log(nk) \) term comes from sorting emails in the final result.

## Solution 2: DFS on Graph

Build an undirected graph where each email is a node. For each account, connect all its emails to the first email (star topology). Then run DFS to find connected components — each component is one person's merged email set.

```
accounts: [["John", "a@m", "b@m"],
           ["John", "b@m", "c@m"]]

Graph (star edges from first email in each account):
  a@m — b@m
  b@m — c@m

DFS from a@m → visits a@m, b@m, c@m → one component
```

Complexity: Time \( O(nk \cdot \log(nk)) \), Space \( O(nk) \).

Building the graph is \( O(nk) \). DFS visits every node and edge once: \( O(nk) \). Sorting emails per component dominates at \( O(nk \cdot \log(nk)) \).

### Java

```java
// lc 721, union-find (rank + path compression), nk·α(nk)+nk·log(nk) time, nk space.
public static List<List<String>> accountsMergeUF(List<List<String>> accounts) {
    HashMap<String, String> parent = new HashMap<>();
    HashMap<String, Integer> rank = new HashMap<>();
    HashMap<String, String> emailToName = new HashMap<>();
    for (List<String> account : accounts) {
        String name = account.get(0);
        for (int i = 1; i < account.size(); i++) {
            String email = account.get(i);
            emailToName.putIfAbsent(email, name);
            parent.putIfAbsent(email, email);
            rank.putIfAbsent(email, 0);
        }
    }
    for (List<String> account : accounts) {
        if (account.size() <= 2) continue;
        String first = account.get(1);
        for (int i = 2; i < account.size(); i++)
            union(parent, rank, first, account.get(i));
    }
    HashMap<String, List<String>> rootToEmails = new HashMap<>();
    for (String email : parent.keySet()) {
        String root = find(parent, email);
        rootToEmails.computeIfAbsent(root, k -> new ArrayList<>()).add(email);
    }
    List<List<String>> res = new ArrayList<>();
    for (List<String> emails : rootToEmails.values()) {
        Collections.sort(emails);
        List<String> row = new ArrayList<>();
        row.add(emailToName.get(emails.get(0)));
        row.addAll(emails);
        res.add(row);
    }
    return res;
}

private static String find(HashMap<String, String> parent, String x) {
    while (!parent.get(x).equals(x)) {
        parent.put(x, parent.get(parent.get(x)));
        x = parent.get(x);
    }
    return x;
}

private static void union(HashMap<String, String> parent, HashMap<String, Integer> rank,
                           String a, String b) {
    String ra = find(parent, a), rb = find(parent, b);
    if (ra.equals(rb)) return;
    int cra = rank.get(ra), crb = rank.get(rb);
    if (cra < crb) { parent.put(ra, rb); }
    else if (cra > crb) { parent.put(rb, ra); }
    else { parent.put(rb, ra); rank.put(ra, cra + 1); }
}
```

```java
// lc 721, DFS, nk·log(nk) time, nk space.
public static List<List<String>> accountsMergeDFS(List<List<String>> accounts) {
    HashMap<String, String> emailToName = new HashMap<>();
    HashMap<String, Set<String>> graph = new HashMap<>();
    for (List<String> account : accounts) {
        String name = account.get(0), first = account.get(1);
        for (int i = 1; i < account.size(); i++) {
            String email = account.get(i);
            emailToName.putIfAbsent(email, name);
            graph.computeIfAbsent(email, k -> new HashSet<>());
            if (!email.equals(first)) {
                graph.get(first).add(email);
                graph.get(email).add(first);
            }
        }
    }
    Set<String> visited = new HashSet<>();
    List<List<String>> res = new ArrayList<>();
    for (String email : graph.keySet()) {
        if (visited.contains(email)) continue;
        List<String> comp = new ArrayList<>();
        dfs(graph, visited, email, comp);
        Collections.sort(comp);
        List<String> row = new ArrayList<>();
        row.add(emailToName.get(comp.get(0)));
        row.addAll(comp);
        res.add(row);
    }
    return res;
}

private static void dfs(Map<String, Set<String>> graph, Set<String> visited,
                         String email, List<String> comp) {
    visited.add(email);
    comp.add(email);
    for (String nei : graph.getOrDefault(email, Collections.emptySet()))
        if (!visited.contains(nei)) dfs(graph, visited, nei, comp);
}
```

### Python

```python
# lc 721, union-find (rank + path compression), nk·α(nk)+nk·log(nk) time, nk space.
class Solution:
    def accountsMerge(self, accounts):
        parent, rank, email_to_name = {}, {}, {}

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a, b):
            ra, rb = find(a), find(b)
            if ra == rb: return
            if rank[ra] < rank[rb]: ra, rb = rb, ra
            parent[rb] = ra
            if rank[ra] == rank[rb]: rank[ra] += 1

        for account in accounts:
            name = account[0]
            for email in account[1:]:
                if email not in parent:
                    parent[email] = email
                    rank[email] = 0
                email_to_name[email] = name
                union(account[1], email)

        groups = defaultdict(list)
        for email in parent:
            groups[find(email)].append(email)
        return [[email_to_name[root]] + sorted(emails) for root, emails in groups.items()]
```

```python
# lc 721, DFS, nk·log(nk) time, nk space.
class Solution2:
    def accountsMerge(self, accounts):
        graph, email_to_name = defaultdict(set), {}
        for account in accounts:
            name, first = account[0], account[1]
            for email in account[1:]:
                graph[first].add(email)
                graph[email].add(first)
                email_to_name[email] = name
        visited = set()

        def dfs(node, component):
            visited.add(node)
            component.append(node)
            for neighbor in graph[node]:
                if neighbor not in visited:
                    dfs(neighbor, component)

        res = []
        for email in graph:
            if email not in visited:
                component = []
                dfs(email, component)
                res.append([email_to_name[email]] + sorted(component))
        return res
```

### C++

```cpp
// lc 721, union-find (rank + path compression), nk·α(nk)+nk·log(nk) time, nk space.
vector<vector<string>> accountsMerge(vector<vector<string>> &accounts) {
    unordered_map<string, string> parent, emailToName;
    unordered_map<string, int> rank_;
    auto add = [&](const string &e) {
        if (!parent.contains(e)) { parent[e] = e; rank_[e] = 0; }
    };
    auto find = [&](string x) -> string {
        while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }
        return x;
    };
    auto unite = [&](string a, string b) {
        a = find(a); b = find(b);
        if (a == b) return;
        if (rank_[a] < rank_[b]) swap(a, b);
        parent[b] = a;
        if (rank_[a] == rank_[b]) ++rank_[a];
    };
    for (auto &acc : accounts)
        for (size_t i = 1; i < acc.size(); ++i) {
            add(acc[i]); emailToName.emplace(acc[i], acc[0]); unite(acc[1], acc[i]);
        }
    unordered_map<string, vector<string>> groups;
    for (auto &[email, _] : parent) groups[find(email)].push_back(email);
    vector<vector<string>> res;
    for (auto &[root, emails] : groups) {
        sort(emails.begin(), emails.end());
        vector<string> row{emailToName[root]};
        row.insert(row.end(), emails.begin(), emails.end());
        res.push_back(std::move(row));
    }
    return res;
}
```

```cpp
// lc 721, DFS, nk·log(nk) time, nk space.
vector<vector<string>> accountsMerge2(vector<vector<string>> &accounts) {
    unordered_map<string, unordered_set<string>> graph;
    unordered_map<string, string> emailToName;
    for (auto &acc : accounts)
        for (size_t i = 1; i < acc.size(); ++i) {
            emailToName.emplace(acc[i], acc[0]);
            graph[acc[1]].insert(acc[i]); graph[acc[i]].insert(acc[1]);
        }
    unordered_set<string> visited;
    function<void(const string &, vector<string> &)> dfs =
        [&](const string &e, vector<string> &comp) {
        visited.insert(e); comp.push_back(e);
        for (const string &n : graph[e])
            if (!visited.contains(n)) dfs(n, comp);
    };
    vector<vector<string>> res;
    for (auto &[email, _] : graph) {
        if (visited.contains(email)) continue;
        vector<string> comp; dfs(email, comp);
        sort(comp.begin(), comp.end());
        vector<string> row{emailToName[email]};
        row.insert(row.end(), comp.begin(), comp.end());
        res.push_back(std::move(row));
    }
    return res;
}
```

### Rust

```rust
// lc 721, union-find (rank + path compression), nk·α(nk)+nk·log(nk) time, nk space.
impl Solution {
    pub fn accounts_merge(accounts: Vec<Vec<String>>) -> Vec<Vec<String>> {
        let mut parent: HashMap<String, String> = HashMap::new();
        let mut rank: HashMap<String, i32> = HashMap::new();
        let mut email_to_name: HashMap<String, String> = HashMap::new();
        for acct in &accounts {
            let name = &acct[0];
            let emails: Vec<&str> = acct[1..].iter().map(|s| s.as_str()).collect();
            for &e in &emails {
                parent.entry(e.to_string()).or_insert_with(|| e.to_string());
                rank.entry(e.to_string()).or_insert(0);
                email_to_name.entry(e.to_string()).or_insert_with(|| name.clone());
                Self::union(&mut parent, &mut rank, emails[0], e);
            }
        }
        let mut groups: HashMap<String, Vec<String>> = HashMap::new();
        for email in parent.keys().cloned().collect::<Vec<_>>() {
            let r = Self::find(&mut parent, &email);
            groups.entry(r).or_default().push(email);
        }
        groups.into_iter().map(|(root, mut emails)| {
            emails.sort();
            emails.dedup();
            let mut row = vec![email_to_name[&root].clone()];
            row.extend(emails);
            row
        }).collect()
    }

    fn find(parent: &mut HashMap<String, String>, x: &str) -> String {
        let mut cur = x.to_string();
        loop {
            let p = parent[&cur].clone();
            if p == cur { return cur; }
            let gp = parent[&p].clone();
            *parent.get_mut(&cur).unwrap() = gp.clone();
            cur = gp;
        }
    }

    fn union(parent: &mut HashMap<String, String>, rank: &mut HashMap<String, i32>,
             a: &str, b: &str) {
        let (mut ra, mut rb) = (Self::find(parent, a), Self::find(parent, b));
        if ra == rb { return; }
        if *rank.get(&ra).unwrap_or(&0) < *rank.get(&rb).unwrap_or(&0) {
            std::mem::swap(&mut ra, &mut rb);
        }
        parent.insert(rb.clone(), ra.clone());
        if rank.get(&ra) == rank.get(&rb) { *rank.entry(ra).or_insert(0) += 1; }
    }
}
```

```rust
// lc 721, DFS, nk·log(nk) time, nk space.
impl Solution2 {
    pub fn accounts_merge(accounts: Vec<Vec<String>>) -> Vec<Vec<String>> {
        let mut graph: HashMap<String, HashSet<String>> = HashMap::new();
        let mut email_to_name: HashMap<String, String> = HashMap::new();
        for acct in &accounts {
            let (name, first) = (&acct[0], &acct[1]);
            for email in &acct[1..] {
                email_to_name.entry(email.clone()).or_insert_with(|| name.clone());
                graph.entry(first.clone()).or_default().insert(email.clone());
                graph.entry(email.clone()).or_default().insert(first.clone());
            }
        }
        fn dfs(email: &str, graph: &HashMap<String, HashSet<String>>,
               visited: &mut HashSet<String>, comp: &mut Vec<String>) {
            visited.insert(email.to_string());
            comp.push(email.to_string());
            if let Some(nbrs) = graph.get(email) {
                for nbr in nbrs {
                    if !visited.contains(nbr.as_str()) { dfs(nbr, graph, visited, comp); }
                }
            }
        }
        let mut visited: HashSet<String> = HashSet::new();
        let mut res = Vec::new();
        for email in graph.keys().cloned().collect::<Vec<_>>() {
            if visited.contains(&email) { continue; }
            let mut comp = Vec::new();
            dfs(&email, &graph, &mut visited, &mut comp);
            comp.sort();
            let mut row = vec![email_to_name[&email].clone()];
            row.extend(comp);
            res.push(row);
        }
        res
    }
}
```
