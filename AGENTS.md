# Repository instructions

## Language

Use English for all future work: conversations, documentation, progress entries,
code comments, commit messages, and project content. Keep proper names and
required external identifiers unchanged.

## Context

Before working, read `getting-started/README.md` and the recent entries in
`getting-started/PROGRESS.md`. The chosen track is **Climate and Territory**
(`environmental`). The current rubric was provided by the participant: 30%
technical complexity, 25% functionality, 20% technical quality, 15% problem and
impact, and 10% clarity. Do not replace it with the older rubric still shown in
the online guide at the time of our initial review.

## Automatic progress logging during sessions

Update `getting-started/PROGRESS.md` without waiting for the user to ask after
completing a task with meaningful changes, making a scope or architecture
decision, verifying a demo, gathering user evidence, or identifying a blocker.
Record the outcome before ending the session. Group minor changes into a useful
entry and avoid duplicates. Queries without findings and individual file edits
do not each need an entry.

- Append entries and preserve the history. Record corrections explicitly.
- Use the actual date and time in `America/Lima`, with the `-05:00` offset.
- Each update must be one short, focused paragraph of 2 to 4 sentences, preceded
  by a timestamp and a short title. State what changed and the next step; include
  a decision, evidence, or blocker only when relevant. Avoid field lists,
  subsections, and lengthy explanations.
- Distinguish verified results, hypotheses, and pending work. Never invent user
  tests, metrics, deployments, or completed features.
- Link files, commits, or demos when available. Do not create commits just to
  populate the log.
- Never store secrets, benefit codes, credentials, or personal data.

This mechanism works when an agent following this file works in the repository.
There is no background process: changes made outside those sessions need their
own entry.

## Updates for the organizers

Local logging is automatic; publishing through `andes` requires a user
instruction authorizing publication, including standing authorization for the
session. Updating the Markdown file alone does not authorize publication.

When authorized, review the remote history, prepare a factual summary using
`getting-started/PROGRESS_TEMPLATE.md`, and publish only the new update. Verify
the content returned by the CLI before recording it as published. If a write has
an uncertain outcome, check the history before retrying.
