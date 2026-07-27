# Research Brief — ChatGPT & Claude, July 2026

**For:** an external research agent with **no access to our repository.**
**Deliverable:** answers to the questions below, with sources.
**Requested by:** platform lead · 2026-07-27

Everything here is a question about **ChatGPT and Claude as shipped products**.
You do not need to know anything about our codebase, and nothing here asks you
to evaluate our implementation.

---

## ⚠️ Read this first — a previous research corpus was contaminated

We commissioned a prior benchmark corpus (~206,000 words). It turned out to
contain **fabricated product surface**: it listed tool names and slash commands
as shipping Claude Code features when they only exist inside a _Claude Code
agent session harness_ — the scaffolding an AI coding agent runs inside, not the
product a user installs.

Confirmed fabrications in that corpus included tools named `CronCreate`,
`Monitor`, `ToolSearch`, `TaskStop`, `ScheduleWakeup`, `PushNotification`,
`RemoteTrigger`, `Workflow`, `Artifact`, `SendUserFile`, `WaitForMcpServers`,
and commands `/deep-research`, `/dataviz`, `/simplify`, `/verify`, `/run`,
`/loop`, `/advisor`, `/goal`, `/scroll-speed`, `/radio`, `/cd`. It also listed
seven hook events (`ConfigChange`, `CwdChanged`, `InstructionsLoaded`,
`MessageDisplay`, `PostToolUseFailure`, `TaskCompleted`, `TaskCreated`) that are
not documented product hooks.

**This cost us real money** — we built one of those phantom features before
catching it.

**So, rules for this brief:**

1. **Cite a primary source for every claim** — official docs, official changelog,
   official help centre, a first-party blog post, or your own screenshot of the
   running product. A secondary blog or an LLM's recollection is not a source.
2. **Mark confidence explicitly** on every answer: `[CONFIRMED]` (primary source
   cited) · `[OBSERVED]` (you saw it yourself, say where) · `[INFERRED]` (your
   reasoning, say from what) · `[UNKNOWN]` (say so — this is a _useful_ answer).
3. **`[UNKNOWN]` is always better than a plausible guess.** We can plan around a
   known hole. We cannot plan around a confident fabrication.
4. **Screenshots beat prose** for anything visual. Annotate what we're looking at.
5. If a feature is **plan-gated, region-gated, or in staged rollout**, say so and
   name the tier/region — we have been misled by "it exists" that meant
   "it exists on Enterprise in the US".

---

## Priority 1 — Enterprise & admin consoles (our largest blind spot)

We have **zero** evidence about these surfaces. This section is worth more than
the rest of the brief combined. Screenshots strongly preferred.

### 1.1 Console structure

- What **panes/sections** exist in the **ChatGPT Business/Enterprise** admin
  console? Give the actual navigation tree.
- Same question for **Claude Team/Enterprise** admin.
- Which settings are **workspace-wide** vs **per-member**?

### 1.2 Identity

- Walk through **SSO setup** as an admin sees it: SAML and OIDC. What fields does
  the admin fill in? Is there a metadata-URL path and an upload path? What does
  the verification/test step look like?
- Walk through **SCIM / directory sync** setup. Which IdPs are supported by name?
  What gets provisioned — users only, or groups/roles too? Is de-provisioning
  automatic?
- Is there **JIT provisioning**? **Domain verification**? What does claiming a
  domain require?
- **Do ChatGPT and Claude support passkeys / WebAuthn** for end users today?
  Consumer tier and enterprise tier — answer both.
- Is MFA **enforceable** by an admin as a policy, or only opt-in per user?

### 1.3 Governance

- What does the **audit log** UI show? Which event types, which fields per event,
  what retention, and what export formats/APIs?
- Is there a **Compliance API**? What does it expose?
- **Data residency** — what regions are offered, at what tier, and is it chosen
  at workspace creation or changeable later?
- **Customer-managed / external key management (EKM)** — offered? At what tier?
- **Legal hold** — does either product offer it? How is it invoked?
- **Retention controls** — can an admin set a retention period? What granularity?

### 1.4 Seats, policy, spend

- How are **licensed seats** managed — assignment, reclamation, over-provisioning?
- What can an admin **restrict**? Specifically: which models are available,
  which connectors/MCP servers may be installed, which tools may run, whether
  members can create public share links.
- Is there an **allowlist/blocklist for connectors** at org level?
- What **usage analytics** does an admin see — which charts, what granularity
  (per member? per model? per day?), and is it exportable?
- Are there **spend controls / budget caps** at org level, and what happens when
  one is hit?
- Is there **per-workspace model pinning** (admin forces a specific model or
  blocks a model)?

---

## Priority 2 — Agentic surfaces: ChatGPT Work and Claude Cowork

We have one screenshot of each and no understanding of the flows.

- **Entry point:** how does a user start a Work/Cowork task? What does the
  composer look like at that moment — is it a different composer?
- **Plan:** does the agent show a plan before acting? Can the user edit or
  approve the plan? Is approval per-step or per-plan?
- **Progress:** what does the in-flight UI show — steps, tool calls, elapsed
  time, token/cost? Is there a live activity feed?
- **Deliverables:** what is the _output object_? A file? A document in the
  product? Something the user can re-open later as a first-class item?
- **Background execution:** Claude's onboarding claims _"your work continues in
  the background, even when you close the app."_ What is the actual behaviour —
  how long does it run, what are the limits, and how is the user notified?
- **Check-in across devices:** the same onboarding says check in from phone,
  browser, or desktop. What does the phone view of a running task look like? Can
  you _steer_ it from the phone, or only observe?
- **Scheduling:** can a Work/Cowork task be scheduled or recurring? What does the
  scheduling UI offer (cadence options, timezone, run history)?
- **Notifications:** what triggers one — completion, failure, awaiting-approval?
  Which channels (push, email, in-app)?
- **Concurrency:** can multiple Work runs be active at once? Is there a queue or
  a limit?

---

## Priority 3 — Claude Desktop "Record a skill"

This blocks a specific architecture decision for us. Its consent dialog reads:
_"Your screen, clicks, typing, and voice are recorded, then sent to Claude and
turned into a repeatable skill."_

- What is the **output artifact**? Show it if you can. Is it a Markdown file, a
  structured object, something else?
- **Does the model name and describe the skill itself**, or does the user type a
  name and description? (This is the crux of the question.)
- Can the user **review and edit** the generated skill before it is saved? After?
- Where do recorded skills **live**, and how are they later invoked — explicitly
  by name, automatically when relevant, or both?
- What does the **recording playback / event timeline** show?
- What happens on **capture failure** (the product appears to have a specific
  failure state)?
- Does Claude **improve an existing skill** from later usage, or is each
  recording a fresh skill?
- Is there any **size, duration, or step limit** on a recording?

### 3.1 The `agentskills.io` open standard

- **Is this a real, published standard?** If so: who maintains it, what is the
  current spec version, and where is the specification?
- What is the **exact file/folder format** — frontmatter fields, required vs
  optional, how resources/attachments are bundled?
- **Which products actually implement it** today?
- Treat this one with extra suspicion: it appeared in the contaminated corpus.
  If you cannot find a primary source, answer `[UNKNOWN]`.

---

## Priority 4 — Feature-existence checks

Our contaminated corpus asserts all of these. **Verify each independently.** For
each: does it exist, on which product, at which tier, since when?

| #    | Claim to verify                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------- |
| 4.1  | Per-workspace / admin-enforced **model pinning**                                                      |
| 4.2  | **Custom domains** for published artifacts or GPTs                                                    |
| 4.3  | **Viewer-billed usage** (the viewer of a shared artifact pays for its compute)                        |
| 4.4  | **Per-plan storage quotas** — what are the actual numbers?                                            |
| 4.5  | **Artifact remix** — can a viewer fork someone else's artifact?                                       |
| 4.6  | **Shared projects with member roles** (not just share links)                                          |
| 4.7  | **Comments / mentions** inside a conversation or project                                              |
| 4.8  | **Study mode** on ChatGPT — what is it, is it still shipping?                                         |
| 4.9  | **Conversation table-of-contents** or long-conversation navigation aid                                |
| 4.10 | **Interactive charts** rendered in chat (not static images)                                           |
| 4.11 | **DOCX** upload support — accepted or rejected? Max file size and file count per message, per product |
| 4.12 | **Trash / restore** for deleted conversations                                                         |
| 4.13 | **Family / parental controls** — what exists beyond age gating?                                       |
| 4.14 | Published **enterprise SLA** — uptime number and remedy                                               |
| 4.15 | Public **status page** — does it show component-level incident history and subscribe-to-updates?      |

---

## Priority 5 — Mobile OS integration (iOS and Android)

Be precise about platform; do not generalise from one to the other.

- **Home-screen widgets** — does ChatGPT and/or Claude ship them? What do they
  show and what sizes?
- **Live Activities / Dynamic Island** (iOS) — used for anything? Long-running
  tasks?
- **App Intents / Siri** — which intents are exposed? Can you start a chat, or
  more?
- **Quick Actions** (long-press app icon) — what entries?
- **Share Extension** — what can be shared _into_ the app, and what happens on
  receipt?
- **Control Center / Action Button / Lock Screen** integration?
- **CarPlay / Android Auto** — supported at all?
- **Background audio** for voice mode — does voice keep running with the screen
  locked?
- **ChatGPT Health** (we have screenshots of the iOS surface): is this iOS-only
  or also Android/web? What tier? Which regions? Is there any public statement
  about its data handling / HIPAA posture?

---

## Priority 6 — Browser extension (Claude in Chrome, and any OpenAI equivalent)

- Does the extension have a **toolbar popup** distinct from the side panel? What
  is in it?
- What is the **permission model** — per-site grants, autonomy modes, how is
  consent captured and revoked?
- Is there a **plan view** before the agent acts, or only per-action approval?
- Can the extension **download files**?
- Is there an **enterprise/managed deployment** path (force-install policy,
  managed allowlist)?
- What is the **tier requirement** to use it at all?

---

## Priority 7 — MCP protocol

- The **2026-07-28 revision** was finalising as this brief was written. What
  actually shipped? Summarise the breaking changes and the migration path from
  `2025-11-25`.
- What protocol version do **Claude Desktop, Claude Code, and the ChatGPT/Codex
  clients** currently advertise in their initialize handshake?
- How does version negotiation behave when a client advertises an older revision
  than the server supports — graceful downgrade, or refusal?

---

## Priority 8 — Volatile figures (please re-fetch, do not recall)

- Current **pricing** for every consumer and business tier on both products,
  including regional variants.
- Current **usage limits** per tier — message caps, rate windows, and what the
  user sees when a limit is hit.
- Current **model lineup** per tier and which models are default vs opt-in.
- Any **education / nonprofit** programme and its eligibility.

---

## Output format

One section per question, each carrying:

```
[CONFIRMED|OBSERVED|INFERRED|UNKNOWN]  <answer>
Source: <url, doc title, or "screenshot: <filename>">
Tier/region caveats: <if any>
As-of date: <when you verified it>
```

An answer set that is 60% `[CONFIRMED]` and 40% `[UNKNOWN]` is far more valuable
to us than one that is 100% confident. We will build from this document.
