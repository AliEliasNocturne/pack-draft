---
name: coding-style
description: >-
  Shared coding style for expressiveness, single responsibility, and design
  boundaries. Use when writing or reviewing code. Repo-specific layout,
  tooling, and local exceptions stay in that repo's own skill.
---

# Coding style

Follow these guidelines. If the code you are changing does not, say so, and consider whether to rework it now or later.

Leave the code better than you found it. The exception is a conscious decision to take on, or keep a bit of strategic tech debt. Say what that debt is and why it stays.

Part of that is unifying behavior. If two code workflows are really the same thing, they belong in one shared service. Do not repeat them. Do not abstract things that only look similar, and do not invent a shared service for a single caller. That said, if the refactor is too large, it may warrant a separate ticket. Confer with the human if unsure.

If this repo has its own skill for layout, tooling, logging, models, or a local exception, follow that skill for those details. This skill is the shared craft.

## Comments

Comments should almost never be used. If you need one to explain something, first ask whether the code can be made more expressive.

A comment is only for the rare case of a non-obvious decision or constraint that the code cannot say. Do not narrate what the code already says.

## Readability

Readability is single responsibility and expressiveness.

A function, type, or module does one thing. Names, types, and structure say what that thing is. If a name needs a comment, rename it.

- One idea per line. A clear few lines beat a nested one-liner.
- Use names that carry meaning, not bare action verbs. A name like `_check()` or `_look()` says what the code does but not what it is for. Prefer a name that says what is being decided or produced, such as `_is_customer_eligible_for_refund()` or `_find_overdue_invoices()`.
- When a value changes meaning, give it a new name.
- Branch on the decision, not on the mechanism that happens to implement it today.
- Name a magic number and its unit once. Compare against the enum or constant, not a bare string copied at each call site.
- Return early instead of nesting.
- Delete dead code. Do not comment it out.
- Fix the lint finding. Silencing it needs a short comment that says why.

## Design rules

Follow the usual design practices: SOLID, encapsulation, loose coupling, and no hidden side effects.

The only time to break one is when there is no way around it, and keeping it would create far more complexity, mess, and risk. If that happens, call it out.
