---
author: JZ
pubDatetime: 2026-11-04T19:31:08Z
modDatetime: 2026-11-04T19:31:08Z
title: "System Design - How GraphQL Executes a Query"
tags:
  - design-system
  - design-api
description: "Follow a GraphQL request from its typed schema through validation and resolver execution to a nested response, including batching and partial errors."
---

## Table of contents

- [One screen needs data from several places](#one-screen-needs-data-from-several-places)
- [The schema is the server's contract](#the-schema-is-the-servers-contract)
- [A request becomes a tree of resolver calls](#a-request-becomes-a-tree-of-resolver-calls)
- [Resolvers need help with repeated lookups](#resolvers-need-help-with-repeated-lookups)
- [Errors can leave some data intact](#errors-can-leave-some-data-intact)
- [What GraphQL does not decide](#what-graphql-does-not-decide)
- [References](#references)

## One screen needs data from several places

Imagine a book page in a mobile app. It needs the book title, the author's name, and a few reviews. In a REST design, the app might call one endpoint for the book, another for the author, and a third for reviews. It may also receive fields that the screen never uses.

GraphQL lets the client describe the fields it wants in one typed request. The server checks that request against a schema, calls application code for the requested fields, and shapes the response to match the selection. GraphQL does not fetch database rows by itself: the application's **resolvers** decide where each field's value comes from.

```text
Mobile app
   |
   | GraphQL document: book { title author { name } }
   v
+------------------+
| GraphQL server   |---- schema: allowed types and fields
| parse + validate |---- resolvers: application data lookups
+--------+---------+
         |                         |
         v                         v
     book store                author store
         \                         /
          +------ nested JSON -----+
```

The GraphQL specification defines the query language and how a server executes it. HTTP is a common transport, but it is a separate layer: GraphQL itself does not require a particular network protocol.

## The schema is the server's contract

A schema describes the types and fields a client may ask for. Here is a small schema for the book page:

```graphql
type Query {
  book(id: ID!): Book
}

type Book {
  id: ID!
  title: String!
  author: Author
}

type Author {
  id: ID!
  name: String!
}
```

`Query` is the entry point for reading data. The `book` field accepts an `id` argument and may return a `Book`. The exclamation mark means a value is non-null: `ID!` must be provided, and `title: String!` promises a title when a `Book` exists. The `author` field is nullable, so a missing or failed author lookup can be represented as `null`.

The client writes a selection set that follows these types:

```graphql
query BookPage($id: ID!) {
  book(id: $id) {
    title
    author {
      name
    }
  }
}
```

The request asks only for the book title and nested author name. The variable declaration gives `$id` a type, while the separate variables object supplies its value. The server can reject a misspelled field or an argument of the wrong type before it starts doing the data lookups.

## A request becomes a tree of resolver calls

The server processes a request in stages:

1. **Parse** the document into an operation and fields.
2. **Validate** those fields against the schema. An unknown field, missing required argument, or invalid selection is an error at this stage.
3. **Execute** the valid selection set by resolving fields and passing parent results down to nested fields.
4. **Serialize** the result as data with the same shape as the requested selection, plus any execution errors.

In an Apollo-style server, application code can provide resolvers like these (the exact API depends on the GraphQL server library):

```javascript
const resolvers = {
  Query: {
    book: (_parent, { id }, { books }) => books.findById(id),
  },
  Book: {
    author: (book, _args, { authors }) => authors.findById(book.authorId),
  },
};
```

The `Query.book` resolver receives the requested ID and looks up the book. Its returned object becomes the parent value for the nested `Book.author` resolver. That resolver uses `book.authorId` to find the author. The `name` field may come directly from the returned author object through the library's default field resolver.

```text
Query.book(id)
   |
   | returns { title, authorId }
   v
Book.title --------------------> "The Left Hand of Darkness"
Book.author(book)
   |
   | returns { name }
   v
Author.name -------------------> "Ursula K. Le Guin"
```

For a query operation, independent fields are generally eligible to resolve in parallel. A mutation operation has different semantics: its top-level mutation fields execute serially so that a later mutation can observe an earlier one. In either case, resolver code owns the actual database calls, authorization checks, and service requests.

The response follows the requested fields rather than returning every property from the stored records:

```json
{
  "data": {
    "book": {
      "title": "The Left Hand of Darkness",
      "author": {
        "name": "Ursula K. Le Guin"
      }
    }
  }
}
```

## Resolvers need help with repeated lookups

Nested resolvers make it easy to express a request, but a naive implementation can do too much work. Suppose the client requests ten books and each book's resolver fetches its author separately. A server might make one query for the books and then ten more queries for the authors. This is the **N+1 query problem**.

A common fix is a request-scoped data loader. Each resolver asks the loader for an author ID. The loader gathers IDs requested during the same event-loop turn, performs one batch lookup, and gives each resolver the matching result:

```text
10 Book.author resolvers
          |
          | load(7), load(12), load(7), ...
          v
     request-scoped loader
          |
          | one batched lookup for unique IDs
          v
     author data source
```

The loader should usually live only for one request. Reusing a cache across users can accidentally mix authorization scopes or return stale data. Batching improves the number of backend calls; it does not remove the need to check permissions for the requested records.

## Errors can leave some data intact

A field resolver can fail even after the request passes validation—for example, if an optional review service is unavailable. GraphQL responses can include both `data` and an `errors` array, so a failure in one nullable field need not discard unrelated fields:

```json
{
  "data": {
    "book": {
      "title": "The Left Hand of Darkness",
      "author": null
    }
  },
  "errors": [
    {
      "message": "Author service unavailable",
      "path": ["book", "author"]
    }
  ]
}
```

Nullability controls how far a failed value travels. If a resolver for a nullable field fails, that field can become `null`. If a non-null field fails, the null propagates to its nearest nullable parent. This makes `!` an API promise, not just a type annotation: use it only when the server can uphold the promise or when nulling the larger parent is the intended behavior.

## What GraphQL does not decide

GraphQL gives a server a typed way to request and resolve data. It does not automatically make those lookups fast, authorize them, or limit how much work a client can request. Production APIs commonly add pagination, query depth or cost limits, timeouts, and resolver-level authorization. A single GraphQL request can still fan out into many slow service calls if the schema and resolvers are designed carelessly.

The useful mental model is a typed execution tree: the schema says which paths are legal, the client selects paths, and resolvers fill in values along those paths. That separation lets an API evolve without requiring every client to receive the same fixed response shape.

## References

1. GraphQL Foundation, [GraphQL Specification](https://spec.graphql.org/October2021/).
2. GraphQL Foundation, [Queries](https://graphql.org/learn/queries/).
3. GraphQL Foundation, [Schemas and Types](https://graphql.org/learn/schema/).
4. Apollo, [Resolvers](https://www.apollographql.com/docs/apollo-server/data/resolvers).
5. GraphQL DataLoader, [batching and caching utility](https://github.com/graphql/dataloader).
