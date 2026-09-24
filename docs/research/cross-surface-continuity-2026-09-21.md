# Cross-surface ecosystem continuity references

Status: Dated external research
Owner: Product research
Verified: 2026-09-21

## Question

What should AGI learn from current ChatGPT, Claude, and Perplexity applications
when defining one account/subscription ecosystem across Web, Mobile, Desktop,
Chrome, CLI, and VS Code?

This is product evidence, not permission to copy branding, layouts, private
implementation, or proprietary interaction details. Repository contracts and
trust-boundary policy remain authoritative.

The companion chronology
`chatgpt-claude-ecosystem-delta-2026-09-21.md` owns the official July-to-
September feature delta. This file owns the narrower continuity synthesis.

## Official-source observations

### ChatGPT and Codex

- OpenAI documents Cloud Work conversations syncing across web, mobile, and
  desktop while Local conversations remain on the computer. Projects and
  plugins also span supported surfaces. This validates separate synced-cloud
  and host-local continuity domains inside one product rather than treating
  every client as an isolated application.
  Source: [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes).
- A ChatGPT subscription follows the purchasing account to other devices. The
  billing channel may still be Apple, Google, or Web; OpenAI separately warns
  that buying independently through multiple channels can create duplicate
  charges. AGI should do better by enforcing one canonical billing owner and one
  effective entitlement.
  Sources: [Accessing a ChatGPT subscription from another device](https://help.openai.com/en/articles/8980438-can-i-access-my-chatgpt-plus-or-pro-subscription-from-another-device),
  [avoiding duplicate subscriptions](https://help.openai.com/articles/20001043).
- ChatGPT Projects bind chats, files, instructions, app links, tools and memory
  into a durable context that can be continued on another device. Project-only
  memory prevents context from leaking into or out of the project. AGI should
  keep project membership and memory scope canonical rather than making a
  separate project implementation per client.
  Source: [Projects in ChatGPT](https://help.openai.com/en/articles/10169521-projects-in-chatgpt).
- ChatGPT separates explicit saved memory from relevant past-chat history, gives
  the user independent controls, and treats deletion propagation as part of the
  data contract. AGI's current separate account-memory and past-chat retrieval
  controls align with that pattern; it still needs transparent source/progress
  UX and cross-surface verification.
  Source: [Memory in ChatGPT](https://help.openai.com/en/articles/8590148-memory-faq).
- ChatGPT connected apps are account/workspace objects whose availability is
  further constrained by plan, region, role, model, interface and administrator
  policy. The connection and its OAuth grant should not be recreated in each
  client, while capability presentation may differ honestly by surface.
  Source: [Connected apps in ChatGPT](https://help.openai.com/en/articles/11487775-connectors-in-chatgpt).
- ChatGPT's account search spans chats, projects, images and documents, and its
  Library makes uploaded/generated files reusable in later conversations. AGI
  should search canonical object types with scope filters rather than maintain a
  chat-only search per surface.
  Sources: [Finding chats, projects and files](https://help.openai.com/en/articles/10056348-how-do-i-search-my-chat-history-in-the-chatgpt),
  [Using Library to manage files](https://help.openai.com/en/articles/20001052).
- OpenAI's current mobile Codex projection loads live project context,
  approvals, plugins, terminal output, diffs and test results from the connected
  Mac host. This is a direct reference for AGI's remote-projection contract:
  Mobile may steer a host session without becoming the authority for local files
  or execution.
  Source: [ChatGPT release notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes).
- ChatGPT app connections are account/workspace authorized and can vary by
  plan, region, surface, and administrator policy. A connection is therefore a
  shared account object plus a surface capability decision, not a new OAuth
  setup invented independently by every client.
  Source: [Connecting and managing app accounts in ChatGPT](https://help.openai.com/en/articles/20001494-connecting-and-managing-app-accounts-in-chatgpt).
- The desktop built-in browser and Chrome integration have different state and
  policy boundaries. Cross-surface continuity does not require pretending that
  browser-local state and an account Cloud record are identical.
  Source: [Using the built-in browser in the ChatGPT desktop app](https://help.openai.com/en/articles/20001277-using-the-built-in-browser-in-the-chatgpt-desktop-app).

### Claude

- Anthropic distinguishes remote connectors, which are available across
  supported Claude clients, from local desktop extensions that access local
  files and applications. This supports one account connection directory with
  a distinct local-host authorization and execution boundary.
  Source: [When to use desktop and web connectors](https://support.anthropic.com/en/articles/11725091-when-to-use-desktop-and-web-connectors).
- Anthropic states that conversations synchronize across its platforms, so a
  user can begin on one device and continue on another. The transferable lesson
  is continuity of object identity and history, not identical UI on every
  platform.
  Source: [Claude platform synchronization FAQ](https://support.anthropic.com/en/articles/11139144-faqs-on-using-the-claude-enterprise-plan-at-your-university).
- Claude's current Cloud work sessions and files follow the account across Web,
  Desktop, Mobile and the Chrome side panel. Local files, local connectors,
  browser use and computer use remain dependent on the Desktop host being open
  and on previously approved folders/permissions. This is the closest verified
  reference for AGI's Cloud-domain plus host-domain topology.
  Source: [Use Claude Cowork on web, desktop, and mobile](https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile).
- Claude now presents chat and longer-running work from one home: the user asks
  for an outcome and the product decides whether a direct answer or a task is
  appropriate. AGI should preserve one normal conversation entry point and make
  escalation into durable work visible instead of forcing users to choose among
  unrelated products before describing their goal.
  Source: [Claude Cowork and chat are one Claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude).
- Claude memory is shared between Chat and Cloud work but not local computer
  sessions; each project has its own memory space and summary. This reinforces
  shared account memory with explicit project scope and a separate local-session
  context owner.
  Source: [Claude chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context).
- Claude prioritizes a typed connector, then browser automation, then direct
  screen interaction. It requires per-application access and keeps Desktop
  active for local computer use. AGI should adopt the same precision hierarchy
  while retaining its stricter deterministic policy and confirmation authority.
  Source: [Let Claude use your computer](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork).
- Claude treats artifacts as durable editable outputs discoverable outside the
  originating conversation, including designs, decks, documents, dashboards
  and interactive tools. AGI should keep artifact identity, versions, storage,
  permissions and sharing canonical across supported clients.
  Source: [What are artifacts?](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them).

### Perplexity

- Perplexity documents one account plan with shared access to its product
  capabilities and warns that purchasing through multiple billing channels can
  create subscription-management problems. AGI's stronger requirement is one
  effective entitlement with exactly one billing owner.
  Source: [Which Perplexity subscription plan is right for you?](https://www.perplexity.ai/help-center/en/articles/11187416-which-perplexity-subscription-plan-is-right-for-you).
- Perplexity describes Comet on iOS, Android, macOS, and Windows with device
  sync. The useful reference is cross-device continuity with native clients,
  not copying Comet's browser design.
  Source: [Perplexity product changelog, March 27 2026](https://www.perplexity.ai/changelog/what-we-shipped--march-27-2026).

## AGI-owned conclusion

AGI should implement two connected but non-collapsed continuity domains:

1. **Account Cloud domain:** Web, Mobile Cloud, Desktop Cloud, and eligible
   Chrome Managed Cloud share account identity, one effective entitlement,
   chats/messages, memory, projects, Cloud files/artifacts, connected
   tools/apps, OAuth connection metadata, settings, and personalization.
2. **Host developer domain:** Desktop Code, CLI, and VS Code share one trusted
   local runtime for developer sessions, transcripts, tools/extensions,
   permissions, repositories/files, and credential references.

Desktop participates in both domains. Crossing between them requires an
explicit handoff with provenance, secret scanning, payload preview, and consent.
An account OAuth connection may be visible across Cloud clients, but its server
token is never copied into a local client store. A local provider/tool credential
is shared through the host's credential broker, never uploaded merely to make
another surface appear synchronized.

Continuity is complete only when create/update/delete, revocation, account
switching, offline recovery, conflict resolution, and cross-surface resume are
verified. Showing the same navigation labels is not ecosystem integration.
Managed Free is available after sign-in; new paid subscriptions and upgrades
remain waitlist/access-code gated. That acquisition gate is one account policy,
not a separate membership on each surface.

## Capability mixture required for AGI

The target product combines these verified strengths:

| Product behavior                                                      | Primary reference          | AGI requirement                                                                                                         |
| --------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| One account and subscription across devices                           | ChatGPT                    | One effective entitlement and one billing owner across all six surfaces                                                 |
| Chats, projects, files, memory and apps continue across Cloud clients | ChatGPT and Claude         | Canonical Account Cloud objects with convergence, revocation and deletion semantics                                     |
| One conversational entry point can become a durable task              | Claude                     | One composer and transcript contract; direct answer, research and work are typed run modes, not disconnected products   |
| Relevant past chats and durable memory are separately controlled      | ChatGPT and Claude         | Separate opt-in retrieval and memory stores with visible provenance, scope and deletion                                 |
| Remote connectors follow the account                                  | ChatGPT and Claude         | One OAuth connection owner plus per-surface capability/policy evaluation                                                |
| Local extensions, files, browser and computer use are host-owned      | Claude                     | Desktop host authority with explicit folders, permissions, credentials and device availability                          |
| Local coding work can be steered from another client                  | ChatGPT Codex and Claude   | Desktop Code/CLI/VS Code session identity plus a projection protocol for Mobile/Web without copying local authority     |
| Artifacts and generated files are durable reusable objects            | Claude and ChatGPT Library | One artifact/file manifest, version, permission, search and lifecycle contract                                          |
| Prefer structured tools before browser or screen control              | Claude                     | Deterministic planner/policy chooses connector → browser → computer use; semantic classification never grants authority |

AGI must not copy product names, icons, exact layouts, prose, animations or
private behavior. Its defensible product is the integrated contract above plus
multi-provider routing and explicit trust control.
