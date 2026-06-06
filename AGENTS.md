# AGENTS.md

Use this file to orient to the project. Prefer direct task execution over documentation maintenance unless the user starts or ends a formal session.

---

## Core principle

Use the project memory system when it helps the task.

Do not treat every request as a full work session. For small, local tasks, inspect the relevant files directly and make the change.

---

## Context files

* `docs/state.md` — Current project status. Read when the task depends on current project state.
* `docs/decisions.md` — Durable project decisions. Read before changing architecture, data model, major UX, dependencies, or settled behavior.
* `docs/plans/` — Active or past plans. Read only when continuing a plan, following an active plan linked from `state.md`, or when the user asks for planned work.
* `docs/spec/` — Versioned specs. Read when implementing or revising project intent.
* `docs/log/` — Session history. Read only for recovery, handoff, or when asked to reconstruct prior work.

---

## Default behavior

For small or focused tasks:

1. Inspect the relevant files.
2. Make the smallest useful change.
3. Do not update project docs unless the change affects current state, decisions, plans, or known issues.
4. Do not create a session log unless the user asks for a formal session closeout.
5. Report what changed and what was verified.

---

## When to read project docs

Read `docs/state.md` before broad, state-dependent, or multi-step work.

Read `docs/decisions.md` before:

* adding or changing dependencies;
* changing architecture;
* changing data models;
* changing major UX patterns;
* reversing or questioning an existing project direction.

Read `docs/plans/` only when:

* the user asks to continue a plan;
* `state.md` links to an active plan relevant to the task;
* the task is explicitly planning-oriented.

Read `docs/log/` only when:

* recovering lost context;
* reconstructing prior work;
* checking what happened in a previous session;
* resolving a mismatch between files and `state.md`.

---

## Timestamps

All filenames and timestamps use:

```text
YYYY-MM-DD HHMM
```

Use 24-hour time and no colon.

When creating or updating timestamped docs, get the current timestamp with:

```bash
date '+%Y-%m-%d %H%M'
```

Do not guess timestamps for new logs, plans, decisions, or state updates.

---

## Format templates

Formats for `state.md`, `decisions.md`, log files, and plan files are in `docs/templates/`.

Read the relevant template only when creating or updating one of those files.

---

## Formal session mode

Use formal session mode when the user says `/session`, asks for a closeout, asks to continue a prior session, or when completing a substantial multi-step work session.

In formal session mode:

1. Read `docs/state.md`.
2. Read `docs/decisions.md` if the work may touch durable decisions.
3. Check `docs/plans/` if `state.md` links an active plan.
4. Do the work.
5. Update `docs/state.md` if the project state changed.
6. Create a log in `docs/log/`.
7. Report what changed, what was verified, and what remains unfinished.

---

## Fresh project setup

For a fresh project:

1. Check `docs/spec/` for the most recent spec file. The most recent spec is current intent.
2. Create `docs/state.md` using `docs/templates/state.md`.
3. Create an initial log using `docs/templates/log.md`:

   ```text
   docs/log/YYYY-MM-DD HHMM Kickoff.md
   ```
4. Begin work.

---

## Docs structure

```text
docs/
├── spec/          Versioned specs. Most recent file is current intent.
├── state.md       Current project state. Rewritten in place.
├── decisions.md   Durable decisions. Append-only.
├── log/           Session logs. Append-only.
├── plans/         Plans. One file per plan.
└── templates/     Format references. Read only when creating/updating docs.
```

---

## Non-negotiable rules

* Prefer small, targeted changes over broad rewrites.
* Do not silently fix unrelated issues. If you find unrelated problems, note them under Known Issues only when project docs are being updated.
* Do not add dependencies without a specific reason.
* Do not edit generated files unless explicitly asked.
* Do not perform destructive or irreversible actions without saying so first.
* Cross-check `decisions.md` before adding or reversing durable decisions.
* Use `/session` procedures only for formal session closeout or substantial multi-step work.

---

## Recovery

If `state.md` seems wrong or out of date:

1. Read the most recent relevant log file.
2. Check the current files directly.
3. Rewrite `state.md` to reflect current reality.
4. Note the correction in a new log only if this is a formal session.

If a plan link in `state.md` is broken or the plan file is missing:

1. Note the issue if project docs are being updated.
2. Look for the most recent relevant plan in `docs/plans/`.
3. Relink only if the plan is clearly still active.
4. Otherwise remove the broken active-plan reference from `state.md`.

---

## Closeout

For ordinary tasks, close with:

* what changed;
* what was checked;
* anything still unresolved.

For formal session mode, also update `state.md` and create a log.
