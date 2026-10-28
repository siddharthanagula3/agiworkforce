# Tasks

- [x] T1 Generous limits: 24-hour runs on paid plans, 2 to 20 parallel sandboxes, agent
      turns of about 12 minutes (`b2f398d44d`).
- [x] T2 Any coding agent, with the person's own key when it needs one (`4cead01f91`).
- [x] T3 Code first-run wizard test fixed on main (`2352802709`).
- [ ] T4 Setup script per session, run after the clone as a real step.
- [ ] T5 Real provisioning steps and grouped tool activity in the transcript.
- [ ] T6 Permission modes (Auto, Accept edits, Plan) mapped per harness.
- [ ] T7 Saved environments: name, network level, variables.
- [ ] T8 Network secrets substituted by the proxy outside the sandbox.
- [ ] T9 Setup snapshot cache.
- [ ] T10 Background turns with polling, no request time limit.
- [ ] T11 Shared capacity ceiling, queue and paid priority.
- [ ] T12 Pinned agent templates sized to the plan (needs approval to build).
- [ ] T13 Mark as unread, sections, several repositories, repository access check.
- [ ] T14 End-to-end check on a preview deployment with a real GitHub repository.
- [x] T15 Each coding agent runs on a model its plan includes, picked from its own provider;
      the proxy checks the plan and the workspace model policy (`3551d71a14`, `a41b4fd2a0`).
- [x] T16 A coding agent turn is charged once, by the provider proxy (`6221a5c89f`).
- [ ] T17 Keep a session's chosen model across reloads; until then the server falls back to
      the agent provider's plan model.
