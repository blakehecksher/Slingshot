# decisions.md format

Append-only. Before adding, scan existing entries for conflicts or superseded decisions.

Only add decisions that are durable and likely to matter later. Not implementation notes, debugging choices, or minor preferences.

---

```md
## YYYY-MM-DD HHMM — Short title

Decision: What was decided.
Reason: Why.
Supersedes: [link to prior decision if applicable]
```
