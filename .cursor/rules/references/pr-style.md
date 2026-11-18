# PR style (pack-draft)

## One PR per ticket

Each ticket gets its own branch and PR. Do not mix work from two tickets on one branch. If spill landed on the wrong branch, split it before you push or open the PR.

## Commit history

Prefer a short, reviewable history on the PR branch:

- Commits follow `type(TICKET): description`
- Each commit is a coherent step, not a dump of unrelated edits
- Do not rewrite commits that are already on the remote (no amend + force-push)

## Description

Orient the reviewer. Do not restate the diff.

**Context** — what this change is for, and what is true when it lands.

Then only what matters for review: decisions and tradeoffs, risky areas, and anything to push back on. Skip the obvious.

Keep it concise. Match `.github/PULL_REQUEST_TEMPLATE.md` when that file exists.
