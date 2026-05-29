# Autonomous Software Company Roadmap

Status: Current
Owner: Founder + platform lead
Last updated: 2026-05-21
Purpose: plan the long-term operating system for a mostly AI-run software company: customer feedback enters, agents triage, patches are proposed, humans approve risk, releases ship, and support closes the loop.

## Thesis

A one-person billion-dollar software company becomes plausible only if the company is designed as an agent-operated system from day one. The founder should not personally route every bug, support ticket, pull request, release note, and installer update. The system should turn customer signals into verified, reviewable work.

Humans still own product judgment, legal risk, billing policy, privacy boundaries, and release approval. Agents should own most repetitive triage, patch generation, testing, documentation, and customer-status drafting.

## External Signals

- OpenAI describes Codex adoption around bounded execution, sandboxing, managed network policy, approval rules, and agent-native telemetry.
- OpenAI's Codex direction includes long-running tasks, mobile check-ins, hooks, and work from local/remote environments.
- GitHub Copilot cloud agent can take issues, Jira items, Dependabot alerts, and PR comments into cloud environments, produce draft PRs, and receive review feedback.
- Claude Code has subagents, web/cloud sessions, desktop session orchestration, and multi-session agent management.
- Zendesk and Intercom frame modern support around autonomous resolution metrics, self-improving agents, human handoff, and measurable resolution outcomes.

Research sources checked on 2026-05-21:

- OpenAI Codex cloud: `https://developers.openai.com/codex/cloud`
- OpenAI Codex launch: `https://openai.com/index/introducing-codex/`
- OpenAI Agents SDK sandbox direction: `https://openai.com/index/the-next-evolution-of-the-agents-sdk/`
- GitHub Copilot cloud agent sessions: `https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/start-copilot-sessions`
- Claude Code subagents: `https://code.claude.com/docs/en/sub-agents`
- Claude Code features overview: `https://code.claude.com/docs/en/features-overview`
- Google Gemini CLI repository: `https://github.com/google-gemini/gemini-cli`
- Intercom Fin AI Agent outcomes: `https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes`
- Zendesk AI agent direction: `https://www.zendesk.com/newsroom/press-releases/zendesk-advances-resolution-platform-with-self-improving-ai-agents-from-proposed-forethought-acquisition/`
- Vapi voice AI agents: `https://docs.vapi.ai/quickstart/introduction`

## Feedback To Patch Pipeline

Target flow:

1. Customer sends feedback, bug report, thumbs-down correction, crash report, support ticket, or telemetry-backed issue.
2. Intake API stores a privacy-labeled case with logs/artifacts after redaction.
3. Triage agent classifies severity, surface, lane, duplicate key, affected version, and whether it is patchable.
4. Human or policy approves `agi:patchable` for code-writing automation.
5. Coding agent creates a branch/worktree in the assigned lane.
6. Agent opens a draft PR with reproduction, fix, tests, and case link.
7. Review/verification agents run targeted checks.
8. Human approves high-risk changes.
9. Release workflow ships a signed update or app-store/TestFlight build.
10. Case is marked fixed in version X; support drafts customer response.

## Required Architecture

| Layer               | Owner Paths                                                      | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Intake schema       | `packages/types/src/feedback.ts`, `apps/web/db/neon/**`          | Shared feedback/case/release-link contract.                      |
| Product intake APIs | `apps/web/app/api/feedback/**`, Desktop/mobile feedback commands | Canonical feedback submission with privacy labels and redaction. |
| Triage service      | `services/ops-triage` or `apps/web/app/api/ops/**`               | Classify, dedupe, route, and create GitHub issues.               |
| Agent task router   | `docs/agent-context/lanes.json`, future service queue            | Map case to lane, owner, checks, and blocked paths.              |
| Patch automation    | GitHub issues/PRs + coding agent tasks                           | Create draft PRs, not direct merges.                             |
| Verification store  | `case_verifications`, CI artifacts                               | Record test commands, screenshots, logs, commit SHA.             |
| Release closure     | release workflows, updater APIs                                  | Link release version/channel to fixed case IDs.                  |
| Support console     | `apps/web/app/admin/support/**`                                  | Inbox, dedupe, status, owner assignment, customer response.      |

## Safety Policy

- Low-risk docs/UI copy can be agent-patched after review.
- Medium-risk behavior changes require owner approval.
- High-risk auth, billing, secrets, local/BYOK/managed routing, migrations, release, native messaging, shell/file access, and provider routing require human approval before merge.
- No agent gets production secrets in untrusted contexts.
- No customer data enters coding prompts until redacted and labeled.
- Every automated support answer must cite product docs or case state.

## Milestones

1. Repo lanes and shared-file policy. Done when `pnpm check:lane-ownership` passes.
2. Feedback schema and canonical intake API.
3. Support/admin inbox with dedupe and GitHub issue creation.
4. Patchable issue label and lane-routed draft PR automation.
5. Verification artifacts linked to cases.
6. Release fix links and customer notification drafts.
7. Support AI that answers from docs/cases and escalates safely.
8. Managed/private compute only after security, billing, fraud, abuse, and privacy controls are proven.
