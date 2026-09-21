# Incident Postmortem Template

Status: Current
Owner: Platform lead
Last updated: 2026-09-21

Copy this file for every severity 1 and severity 2 incident, fill it in within
five working days, and leave the headings in place: a heading with nothing
under it is a finding, not an omission. `docs/runbooks/incident-response.md`
owns the severity ladder, the rotation and the notice process; this file owns
what is written afterwards.

It is blameless. The subject of every sentence is the system that let the
failure through, never the person who typed the command. "The deploy pipeline
accepted a migration with no down file" is a finding; "X forgot the down file"
is not.

---

## Summary

One paragraph a customer could read. What did not work, for whom, between when
and when, and whether it is fixed.

- **Severity:** 1 / 2
- **Detected by:** which detector in the runbook table, or a customer report
- **Detected at / started at / resolved at:** UTC timestamps
- **Customer impact:** who was affected and what they could not do
- **Error budget spent:** which objectives in `apps/web/lib/server/slo/catalogue.ts`
  burned, and how much of the month's budget went with them. Leave blank when
  the affected domain has no instrument, and say which one it was.

## Timeline

Times in UTC, one line each, no narration. Start at the first event that made
the incident possible, not at the alert.

| Time | What happened | How we knew |
| ---- | ------------- | ----------- |

## What happened

The mechanism, in enough detail that a reader who has never seen this code can
follow it. Name the files.

## Has this happened before

Link every earlier postmortem whose incident failed through the same mechanism,
or write "no earlier incident" after reading them. When there is one, this
postmortem is finished by the decision record the "When the same cause comes
back" section of `docs/runbooks/incident-response.md` asks for; cite it here.

## Why it was not caught earlier

Each of these gets an answer, including "it did, and that worked":

- Which test, guard or review should have caught it, and why it did not.
- How long detection took, and what the detector was measuring instead.
- What a person had to notice for this to surface.

## What made it worse

Everything that lengthened the incident after detection: a missing runbook
step, an alert that reached nobody, a rollback that was not safe to run, a
dashboard that lied.

## What went right

Named, because the next incident depends on knowing which defences held.

## Follow-ups

Every row lands in `ACTIVE_ISSUES.md` with the same owner and date before this
postmortem is finished, or in `docs/agent-context/known-flaws.md` when it is a
known behaviour rather than work in flight. A follow-up that exists only here
is a follow-up nobody owns.

| #   | Follow-up | Kind (detect / prevent / mitigate) | Owner | Due | Tracked as |
| --- | --------- | ---------------------------------- | ----- | --- | ---------- |

At least one follow-up is a **detect** item unless the detector already fired
first, and at least one is a **prevent** item that is a guard, a test or a type
rather than a promise to be careful. AGENTS.md §12: a rule worth never
violating belongs in a guard, not in prose.

## Customer communication

What was sent, to whom, and when. Paste the notice that went out. If nothing
was sent, say why that was the right call.
