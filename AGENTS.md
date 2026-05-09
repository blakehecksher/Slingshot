# AGENTS.md

Read this file first, every session. It tells you how to orient, how to maintain project state, and how to close out.

\---

## Timestamps

All filenames and timestamps use `YYYY-MM-DD HHMM` (24-hour, no colon).

Get the current timestamp by running:

```bash
date '+%Y-%m-%d %H%M'
```

Always run this command. Never guess or approximate a timestamp.

\---

## Starting a session

### Fresh project

1. Check `docs/spec/` for the most recent spec file. That's current intent.
2. Create `docs/state.md` using the format below.
3. Create an initial log: `docs/log/YYYY-MM-DD HHMM Kickoff.md`
4. Begin work.

### Existing project

1. Read `docs/state.md` — current focus, what's working, what's next.
2. Read `docs/decisions.md` — don't re-litigate settled decisions.
3. Check `docs/plans/` for the active plan linked in state.md. Follow it unless you have a specific reason not to. If you diverge, log why.
4. Begin work.

\---

## During a session

Update `docs/state.md` whenever the project state changes meaningfully — don't wait until the end. If something breaks, gets resolved, or changes direction, reflect that immediately. State.md should describe where the project *is*, not where it was at session start.

Use `/session` when the user signals a stopping point, or when work on a discrete chunk is complete.

\---

## Docs structure

```
docs/
├── spec/          Versioned specs. Most recent file is current truth.
├── state.md       Single file. Rewritten to reflect current reality, not appended.
├── decisions.md   Append-only. One entry per decision. Cross-check before adding.
├── log/           Append-only. One file per session.
└── plans/         One file per plan. Each has a status line at the top.
```

\---

## state.md format

Keep state.md current. Update any section that's changed. Remove anything that's no longer true. Don't append — edit in place.

```
# State
\\\_Last updated: YYYY-MM-DD HHMM\\\_

## Current focus

## What's working

## In progress

## Known issues

## Next actions
1.
2.
3.

## Active plan
docs/plans/YYYY-MM-DD HHMM Plan - Subject.md

## Recent logs
- docs/log/YYYY-MM-DD HHMM Subject.md — one line summary
```

\---

## decisions.md format

Append only. Before adding a new entry, scan existing entries and flag any conflicts.

```
## YYYY-MM-DD HHMM — Short title

Decision: What was decided.
Reason: Why.
Supersedes: \\\[link to prior decision if applicable]
```

\---

## Plan file format

Each plan file starts with a status line. Keep it current.

```
status: active | complete | abandoned

# Plan — Subject
\\\_Created: YYYY-MM-DD HHMM\\\_

## Goal

## Steps
1.
2.
3.

## Notes
```

\---

## Log file format

One file per session. Filename: `YYYY-MM-DD HHMM Subject.md`

```
# YYYY-MM-DD HHMM — Subject

## What was done

## What worked

## What didn't and why

## Decisions made
(or "none")

## Left unfinished

## state.md updated: yes / no
```

\---

## Non-negotiable rules

* Read state.md before writing any code.
* Cross-check decisions.md before appending to it.
* Use `/session` to close out properly — don't skip it.
* If you find something broken that you weren't asked to fix, log it under Known Issues. Don't silently fix unrelated things.
* If you're about to do something destructive or irreversible, say so before doing it.

\---

## Recovery

If `state.md` seems wrong or out of date: read the most recent log file to reconstruct context, rewrite state.md from that, and note the correction in a new log entry.

If a plan link in state.md is broken or the plan file is missing: note it in Known Issues, find the most recent plan file in `docs/plans/`, and relink.

