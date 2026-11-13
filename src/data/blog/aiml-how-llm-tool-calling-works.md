---
author: JZ
pubDatetime: 2026-11-13T19:33:14Z
modDatetime: 2026-11-13T19:33:14Z
title: AI/ML - How LLM Tool Calling Works
tags:
  - aiml-llm
  - aiml-tool-calling
description: "Follow a model tool call from a structured request through application validation and execution, then back into the conversation as evidence for an answer."
---

## Table of contents

- [The model needs a route to live information](#the-model-needs-a-route-to-live-information)
- [A tool call is a request, not an action](#a-tool-call-is-a-request-not-an-action)
- [The application runs the loop](#the-application-runs-the-loop)
- [A small example from start to finish](#a-small-example-from-start-to-finish)
- [What can go wrong](#what-can-go-wrong)
- [References](#references)

## The model needs a route to live information

Imagine a customer asks a store's assistant, “Where is order A-104?” The language model may know how to explain shipping statuses, but it cannot know the current location of this particular package from its training data. That information lives in the store's order system.

The application can give the model a tool named **lookup_order**. The tool description tells the model when it is useful, and its schema describes the input it accepts. If the model decides the question needs current order data, it can ask the application to run that tool.

This pattern is called **tool calling** or **function calling**. The model selects from tools the application has described and produces a structured request. The model does not automatically get access to the database, browser, or other service behind a tool. The application connects the request to real code and decides what is allowed.

```text
  Customer
     |
     v
  Application ---- tool descriptions and conversation ----> Language model
       ^                                                    |
       |                structured tool call request       |
       +----------------------------------------------------+
       |
       +--> validate and authorize --> run the chosen tool --> Order system
       |
       +<----------------------- tool result ----------------+
       |
       +---------------- tool result and conversation -----> Language model
       |
       +<-------------------- final answer -----------------+
     |
     v
  Customer
```

The tool call is a bridge between the model's language skills and the application's live data or actions. It is useful for tasks such as checking an order, querying a database, searching documents, or scheduling a meeting.

## A tool call is a request, not an action

The application first sends the model the conversation and a set of tool definitions. A definition usually has a name, a description, and an input schema such as JSON Schema. A weather tool, for example, might accept a city name and a temperature unit. The schema makes the expected shape visible to the model and can help the API constrain its output.

The model then chooses one of two broad paths:

1. It can respond directly if it already has enough information.
2. It can return a tool call if an available tool can help.

A tool call might look like this in a simplified, provider-neutral form:

```json
{
  "name": "lookup_order",
  "arguments": {
    "order_id": "A-104"
  }
}
```

This is data describing a possible action. It is not a network request, and it has not changed anything yet. The application must map the tool name to a function it knows how to run, parse the arguments, check that the caller is allowed to perform the operation, and decide whether the requested action is safe.

Structured output helps with syntax, but it does not prove that the arguments are true or appropriate. A well-formed order ID can still belong to another customer. The application remains responsible for access control and business rules.

## The application runs the loop

Once the application accepts a tool call, it runs the matching function. For a read-only order lookup, that function might query the order database. For an action such as issuing a refund, it should check the user's permissions and may need a confirmation step before changing data.

The application sends the tool's result back to the model as a new message associated with the original tool call. The model can then explain the result in natural language. If the result does not answer the question, the model may request another tool call. The application repeats the same validate-and-run cycle until the model gives a final answer or the application stops the turn.

```text
  1. Application sends question and tool schemas
  2. Model returns tool call: lookup_order("A-104")
  3. Application validates identity and arguments
  4. Application runs lookup_order and gets "in transit"
  5. Application returns that result to the model
  6. Model answers: "Order A-104 is in transit."
```

The repeated cycle is sometimes called an **agent loop**. A loop does not require the model to run code itself. The model chooses a next step; the application performs that step and supplies the result. The application should set limits such as a maximum number of calls, an overall deadline, and a token or cost budget so a mistaken plan cannot run forever.

APIs use different message formats and names for these pieces. OpenAI's documentation describes function tools and a response containing a tool call; Anthropic's guide describes a **tool_use** block and a corresponding **tool_result**. In both styles, the application handles the client-side tool and sends the result back in the conversation.

## A small example from start to finish

Suppose the assistant is allowed to look up order status but not to issue refunds:

1. The customer asks, “Where is order A-104?”
2. The application sends the conversation and a **lookup_order** tool schema to the model.
3. The model requests **lookup_order** with the order ID **A-104**.
4. The application checks the customer's identity and confirms that this order belongs to them.
5. The application calls the order service, which returns a status and the latest carrier update.
6. The application adds that result to the conversation and asks the model to continue.
7. The model replies, “Order A-104 is in transit. The carrier last scanned it in Oakland this morning.”

The model helps interpret the question and phrase the answer. The order service remains the source of truth for the package status. This division is helpful because the language model can deal with varied wording while the existing application keeps control of data access.

For a multi-step request such as “Find my latest order and reschedule its delivery,” the model might first request an order lookup, then request a delivery change using the result. The application checks authorization at both steps. Each tool has a narrow purpose, which makes it easier to review what the assistant is allowed to do.

## What can go wrong

Tool calling adds a new boundary to an application, and that boundary needs normal security and reliability checks:

- **Validate every argument.** Parse inputs against a schema, then check business rules such as ownership, valid ranges, and allowed values.
- **Authorize at execution time.** A tool description is not an access-control policy. Check the current user and permissions before reading private data or changing state.
- **Treat tool output as data.** Search results, documents, and web pages can contain misleading instructions. A tool result should not silently become a higher-priority instruction to the model.
- **Limit actions and retries.** Set a deadline and a maximum number of tool calls. Make state-changing operations idempotent when possible so a retry does not duplicate an action.
- **Ask before high-impact changes.** Showing a delivery estimate is different from charging a card, deleting a record, or issuing a refund.
- **Keep an audit trail.** Record which tool ran, who requested it, what checks passed, and whether it changed data. Avoid storing secrets or unnecessary personal information in logs.

Tool schemas make a model's choices more structured, but the application still needs to handle malformed requests, missing data, timeouts, and denied actions. If a tool fails, return a clear error result or stop the loop; do not let the model invent a successful outcome.

## References

1. OpenAI, [Function calling](https://platform.openai.com/docs/guides/function-calling)
2. Anthropic, [Tool use with Claude](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
3. Shunyu Yao et al., [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
