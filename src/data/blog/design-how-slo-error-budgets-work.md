---
author: JZ
pubDatetime: 2026-11-03T19:30:00Z
modDatetime: 2026-11-03T19:30:00Z
title: System Design - How SLO Error Budgets Work
tags:
  - design-system
  - design-observability
description: "How service-level objectives turn availability targets into an error budget, how to calculate and measure it, and how teams use it to balance reliability and delivery speed."
---

## Table of contents

## The promise behind a service

Imagine Maya owns a checkout API. Her team agrees that customers should be able to complete checkout successfully 99.9% of the time in a rolling 30-day window. That sentence is more useful than a dashboard full of CPU graphs: it describes the experience the service promises.

This is a **service-level objective** (**SLO**). Its measured quantity is a **service-level indicator** (**SLI**), and the limit of acceptable failure is the **error budget**. These names sound formal, but together they answer a practical question: _can Maya safely ship a risky change today?_

```
customer requests  --->  SLI: successful eligible requests / eligible requests
                              |
                              v
                         SLO: 99.9% in 30 days
                              |
                              v
                 error budget: the remaining 0.1% failures
```

The important word is **eligible**. A browser that closes a connection before the API can respond may not represent an API failure. A 400 response caused by invalid user input often should not either. Define the population before calculating a percentage, otherwise a beautiful number can describe the wrong thing.

## From percentage to a budget people can spend

For 99.9% availability, the allowed bad fraction is:

$$1 - 0.999 = 0.001 = 0.1\%$$

If checkout receives 10,000,000 eligible requests in 30 days, its budget is:

$$10,000,000 \times 0.001 = 10,000 \text{ bad requests}$$

The budget is not a prediction that exactly 10,000 failures are harmless. It is a shared decision boundary. Incidents, failed deployments, and dependency outages all consume it. When there is plenty left, the team can take sensible delivery risks. When it is exhausted, reliability work takes priority until service health recovers.

This framing avoids two unhealthy extremes. “Never fail” makes teams too afraid to improve the system; “ship fast” without a limit makes customers silently pay for experiments. An error budget makes the trade-off visible.

## Choose an SLI that follows the user journey

For a request/response API, a common availability SLI is:

```
good event = response is non-5xx AND latency is below the user-facing limit
total event = every eligible request

availability = good events / total events
```

Latency belongs in the definition when a technically successful but very late answer is useless. For checkout, “HTTP 200 in less than two seconds” may be a better good event than merely “HTTP 200.” A batch export, by contrast, may need a completion-time SLI rather than per-request latency.

Start with the experience, then choose telemetry. Useful inputs include load-balancer metrics, application metrics, and synthetic checks. Avoid averaging latency: one fast request can hide one unusably slow request. Count requests that meet the threshold, or use a latency histogram to compute that count.

## A rolling window tells a better story

SLO systems normally evaluate a rolling window. Every minute, the system looks back over the most recent 30 days instead of resetting on the first day of a calendar month. This means a midnight boundary cannot erase yesterday's outage.

```
time -------------------------------------------------------------->
       [---------------- rolling 30-day window ----------------]
       ^                                                        ^
    30 days ago                                               now

       failures inside this window consume today's budget
```

The same 99.9% target also implies a calendar-time allowance: roughly 43.2 minutes per 30 days. That can be intuitive, but request-based measurement is usually fairer. A five-minute outage during a quiet night affects fewer customers than a five-minute outage during peak traffic.

## Burn rate: are we spending too quickly?

Remaining budget alone is not enough. Suppose 90% remains, but a new release is failing 10% of requests right now. Waiting for the monthly percentage to look bad wastes precious time.

**Burn rate** compares the current error rate with the sustainable rate. For a 99.9% SLO, the sustainable error rate is 0.1%. If the service currently fails 1% of eligible requests:

$$\text{burn rate} = \frac{1\%}{0.1\%} = 10$$

At 10× burn, a 30-day budget would be gone in roughly three days if the rate continued. Teams often alert only when both a short window and a longer window burn quickly. The short window catches sudden incidents; the longer one filters a single noisy minute.

```
short window:  "is this failing badly right now?"
long window:   "has it continued long enough to matter?"
both true:     page a human
```

The exact thresholds are policy choices. They should match the service's importance and the team's ability to respond, rather than copying a number from another company.

## What happens when the budget is empty?

An SLO without a response policy is only a report. A small, explicit policy can make it useful:

1. Budget healthy: ship normally, including measured experiments.
2. Budget declining rapidly: investigate, pause especially risky releases, and tighten alerting around the suspected path.
3. Budget exhausted: prioritize rollback, capacity, dependency, test, or design work that restores the SLI; defer reliability-unrelated launches.

This is not punishment for the engineers who happened to be on call. It is a system-level agreement: product delivery and reliability share the same customer promise. Leadership must support the pause, or the budget will be ignored exactly when it matters.

## Common traps

- **Measuring what is easy instead of what users see.** CPU utilization is valuable diagnostic data, not usually an availability SLI.
- **One global SLO for unequal customers.** A payment write and an optional recommendation widget deserve different objectives.
- **Including planned maintenance by default.** Decide transparently whether maintenance consumes the same budget; hidden exclusions make an SLO untrustworthy.
- **Treating the target as a contract.** An internal 99.9% objective is not automatically a customer-facing legal commitment.
- **Optimizing the graph.** If a team can improve the SLI while customers get a worse experience, revise the SLI.

## The practical starting point

Pick one critical journey, write down what a good event means, and measure it for a few weeks before attaching a strict policy. The first target is a hypothesis. Review incidents and customer reports to see whether the SLI reflected reality, then refine it.

Maya's error budget does not prevent checkout failures. It gives her team a common language for deciding when failures are normal operational noise and when they must stop feature work to earn back customer trust.

## References

1. Google SRE Book, [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
2. Google SRE Workbook, [Implementing SLOs](https://sre.google/workbook/implementing-slos/)
3. OpenSLO, [specification](https://openslo.com/)
