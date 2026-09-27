# Founder decisions needed

Product calls the code cannot settle. Record each decision under `docs/decisions/`, remove it here, and delete this file when none are left.

1. **Workspace model policy fails open** (§2.12). Fail closed for governed workspaces?
2. **Training choice.** It was declined on the premise that no training use exists. Free-plan prompts to providers' free models may be trained on, and there is no opt-out. Revisit the decline, or change the free-model mix.
3. **The mobile bottom tab bar** is hidden (`tabBar={() => null}`) with no decision record. Keep the drawer-only design and record it, or restore the tabs.
4. **The empty evidence portal.** `/trust` has no audit reports or evidence to request, because none exist yet. It's blocked on producing SOC 2 and pen-test evidence.
5. **The Tauri custom-assistant editor.** The only visual assistant editor lives in the internal Tauri app. Custom assistants exist publicly only as CLI files. Port it, or cut custom assistants from the web plan.
6. **The plugin marketplace content.** The web marketplace shows Anthropic's Claude plugin directory, badged "Anthropic verified", with `claude plugin install` commands under a "Desktop and CLI" label. This needs a product and legal decision. The CLI's own registry host isn't served by anything in the repo.
7. **API-key calls and memory.** API-key completions get account memory but no personalization preamble. Decide what the API should inherit, and document the opt-out.
8. **Memory capacity display.** Each turn silently uses only the first 30 (web) or 50 (mobile, VS Code) memories. Decide whether to show the cap.
9. **Shared versus per-seat usage pools** for Team and Enterprise. Today each seat gets its own allowance plus an organization spend cap.
10. **Data residency moves.** Admins can read the workspace region but not change it, and only the home region is provisioned. Moving a region is a founder or ops action.
11. **Staged paid checkout.** Paid checkout is waitlist-gated on purpose ("opening in stages"). Decide when to open it.
12. **Browser-agent isolation.** Every surface uses the user's own Chrome profile. There's no isolated agent browser or incognito control.
13. **Audit-table retention.** The automation and plugin-lifecycle audit tables are classified for erasure but have no maximum age.
