# Brief templates

Fill in the brackets and delete lines that do not apply. A brief is the only context a worker has, so write it as you would for a capable colleague who has not seen the conversation. Point at files and sources; do not paste them.

## Routing note to the user (step 5)

```
Route: [direct | sub-agents | agent team | workflow]
Why this arrangement: [one sentence]
Workers:
- [profile] on [family], [effort]: [what it does], owns [files or artifact]
- ...
I keep: [integration, the decisions that depend on each other, verification, the final answer]
Checks before I report: [tests, sources opened, independent review]
```

## Scout (find, read, extract, check)

```
Question: [one question with a checkable answer]
Why: [what the answer will be used for]
Search area: [paths, sources, time window]. Do not go outside it.
Already known: [verified findings, so you do not repeat them]
Reply with: the answer; each finding with path:line, command output, or URL and quote;
what you covered and what you did not; what you could not establish.
Stop and say so if the question needs a judgment call rather than a lookup.
Budget (Haiku): read excerpts, not whole files; at most [N] files or [N] pages. If the
search area is bigger than that, stop and report what you covered so far rather than
reading on: past 100K tokens of context every turn costs five times as much.
Read-only. Do not start other agents.
```

## Builder (scoped coding or execution)

```
Goal: [the outcome, and how it will be used]
Context: [paths to read first; conventions to match; findings already verified]
In scope: [what to build or change]
Out of scope: [what to leave alone]
You own: [files you may edit]. If the work needs another file, stop and tell me which and why.
Done means: [acceptance criteria; the commands that must pass]
Constraints: [no new dependencies, no weakened tests, no destructive or outward-facing actions, ...]
Reply with: what is not done or not verified; files changed and why; each command and its result;
what you noticed but left alone.
Stop and report if the goal has two reasonable readings, or the same approach fails twice.
Plan your own approach. Do not start other agents.
```

## Principal (judgment, synthesis, a main deliverable)

```
Goal: [the deliverable and who it is for]
Why it matters: [the decision or outcome that rests on it]
Material: [paths, sources, prior findings and how far each was verified]
Open questions you are expected to resolve: [list]. State each choice and the alternative you rejected.
Not yours to decide: [money, access, irreversible actions, product direction]. Flag these instead.
You own: [files or artifact]
Done means: [acceptance criteria and how the result will be checked]
Reply with: what is not done, not verified, or decided differently from this brief;
the deliverable or its location; the evidence; risks and open questions.
Do not start other agents.
```

## Assessor (independent read)

```
Assess: [the decision, plan, diagnosis or change], here: [paths, diff range, documents]
The question: [is this safe to do | is this diagnosis right | what is wrong with this]
What matters most, in order: [harm to users, money, security, data, ...]
Do not assume: [anything the author took as given that you want tested]
Not provided on purpose: my own conclusion. Form yours from the material.
Reply with: a one-paragraph verdict; findings ranked by harm, each confirmed or suspected,
with where, the concrete failing case and the smallest fix; what you found sound;
what you did not examine.
Read-only. Do not start other agents.
```

If the assessor is brought in because an investigation stalled, add: `Already tried: [approach and result]. Take a different approach and say which.`

## Agent team

Give every teammate the shared objective and the list of who owns what, then its own part:

```
Team objective: [one sentence]
Members and ownership: [name: files or area], ...
Your part: [goal, scope, deliverable]
Shared decisions: [interfaces, formats, names] are agreed by message before anyone builds on them.
Tell [name] when [event]. Ask [name] before changing [shared thing].
Report to the lead when your part is done or blocked; do not edit another member's files.
```

Keep the team small, give each member files nobody else edits, and close the team when the coordination is no longer needed.

## Workflow

Before proposing or writing one, decide and tell the user:

```
Stages: [1. ..., 2. ..., 3. ...] and what passes between them
Fan-out: about [N] agents ([items] x [dimensions])
Family per stage: [stage: family, effort]
Checkpoints: [where results are verified or filtered before the next stage]
Output: [what comes back at the end]
```

Every agent in a workflow gets a brief of its own in the same form as above; a workflow does not remove the need for scope, ownership and evidence.
