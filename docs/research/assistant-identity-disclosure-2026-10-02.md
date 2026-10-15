# Assistant identity and capability disclosure

Verified: 2026-10-02 (America/Chicago)
Scope: The chat system prompt the web, desktop, Chrome, mobile, CLI, VS Code,
Slack and scheduled surfaces send (`chat.system@7`, which takes over from
`chat.system@6` and `chat.system@5`) and the live voice instructions
(`voice.live_instructions@2`).

## Evidence

| Source                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Constraints                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [Claude system prompts](https://platform.claude.com/docs/en/release-notes/system-prompts)                                                                                                                                                                                                      | The newest Opus entry, dated September 22, 2026, names the currently selected model, says "The person can switch models mid-conversation, so earlier messages in this thread that identify as a different model or report a different knowledge cutoff may still be accurate", sends product and account questions to its support site, and lets Claude mention settings and features, with personal preferences kept in user preferences.                                                                                                                                                                                                                                                                                                                                                                                                    | The claude.ai web and app prompt; Anthropic states it does not apply to the API.                                      |
| [OpenAI Model Spec](https://model-spec.openai.com/2026-08-18.html)                                                                                                                                                                                                                             | Release 2026-08-18. The assistant's identity, capabilities, model family, knowledge cutoff and available tools are typically appropriate to share. A developer persona named Fred, told to say it does not know whether it is built on the vendor's model, is answered "I'm not sure, I'm just a bot named Fred". The assistant should not pretend to be human.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Intended model behaviour, not a description of the ChatGPT interface.                                                 |
| [Claude memory and chat search](https://support.claude.com/en/articles/11817273-using-claude-s-chat-search-and-memory-to-build-on-previous-context)                                                                                                                                            | Memory and "Search and reference chats" live in Settings > Memory; incognito chats are excluded from memory; Team and Enterprise owners control memory under Organization settings > Capabilities, and turning it off there deletes every member's memories. "Searching past chats is available to users on paid plans (Pro, Max, Team, and Enterprise plans) on the web, Claude Desktop, and Claude Mobile apps." "Once the ability to search past chats is rolled out to your account, it will be enabled by default." Chat search covers "All chats outside of projects" and "Individual project conversations (searches are limited to within each specific project)", and the same toggle turns it off. Memory is "on by default for Free, Pro, and Max plans"; on Team and Enterprise "it's off for each member until they turn it on". | Help article updated 2026-10-01; read 2026-10-02. A Free account has no chat search, inside a project or outside one. |
| [Claude projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects)                                                                                                                                                                                         | Project instructions set "how you'd like Claude to behave and respond" for every chat in the project; project knowledge is uploaded files used as context.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Does not say whether instructions may rename the assistant.                                                           |
| [ChatGPT custom instructions](https://help.openai.com/en/articles/8096356-custom-instructions-for-chatgpt), [ChatGPT memory FAQ](https://help.openai.com/en/articles/8590148-memory-faq), [Memory and new controls for ChatGPT](https://openai.com/index/memory-and-new-controls-for-chatgpt/) | Not read: all three returned HTTP 403 on 2026-10-02, so whether "Reference chat history" starts on, on which plans and outside which countries, is unverified. The questions are with the founder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Unknown until the founder's research returns.                                                                         |
| [ChatGPT projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)                                                                                                                                                                                                           | Not read: HTTP 403 on 2026-10-02. A search-index extract of the page from the same day, relayed by the lane's reviewer and not checked here, says project memory needs "Reference saved memories" and "Reference chat history". The official wording is with the founder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Unverified until the founder's research returns.                                                                      |

## AGI implementation decision

- The assistant is AGI, the assistant in AGI Workforce. The user's
  personalization or a workspace or project instruction may give it another
  name, as the Model Spec's operator persona does; whatever the name, it never
  claims to be human or another AI company's product. Whether ChatGPT custom
  instructions and Claude projects rename the assistant is unverified (the
  ChatGPT page refused the fetch and the Claude page is silent), so the owner
  still has to confirm that personas are allowed.
- The model serving the turn comes from the model registry at runtime with how
  it was chosen (the user's selection, an automatic option such as Auto or
  Best, a workspace default, an app substitution, or the app's own pick on
  Slack). When the turn does not name its model, the assistant says it does
  not know and neither names nor rules out a vendor, as the Model Spec's
  persona example does.
- Memory, past-chat search, temporary chat, project knowledge,
  personalization, connected apps and skills are described from the turn's
  runtime state, including memory that failed to load, memory a workspace
  keeps closed (only an administrator can turn it on; a failed policy read is
  reported as not loaded), and connected apps the connector switch or lockdown
  mode withholds.
- A chat in a project receives excerpts from the user's other chats in that
  project only when Search past chats is on and memory is on for the chat, and
  never in a temporary chat or an API call. Text chat and live voice read the
  chat's memory switch (the web app sends it when a call starts); scheduled
  runs have no per-chat switch and follow Search past chats alone. A text
  turn or scheduled run that a switch keeps them out of records them in its
  context manifest as switched off. This follows Claude, whose Search and
  reference chats toggle governs chat search inside a project, and the
  relayed ChatGPT extract. v7 drops the v6 lines that narrowed the past-chat
  and memory lines to chats outside the project, which no turn can reach any
  more.
- Search past chats starts off, as it did before this change, so a project
  chat of an account that never set it no longer gets the project's other
  chats, which it used to. Claude starts chat search on, but only on paid
  plans, the only plans that have it; a Free Claude account cannot reference
  other chats in a project at all. Checkout stays closed, so every new account
  is on the Free plan, where starting off matches Claude. Whether paid plans,
  or every plan, should start with it on is the owner's decision, to make
  before checkout opens: starting it on also adds a metered query embedding to
  every turn of an account whose chats are indexed. The ChatGPT default is
  with the founder.
- In a temporary chat every call to a connected app asks first unless the
  account blocked the tool, in text chat and in live voice, as the temporary
  chat note and help page promise. Tools of the operator's own MCP servers are
  not connected apps and keep the account's verdict.
- Turns that carry no tools (the Experiential Labs free route, Qwen free
  quota turns from the free-quota route and the Free Auto fallback, and guest
  chat) send a compact rendering of the same version: who the assistant is,
  the identity rules, the serving model, the missing tools, the honesty rule
  and the reply language, plus what of the account that route reads or
  cannot save, without the artifact runtime or Settings guidance, because
  every byte of it counts against a shared free allowance.
- Settings guidance names the sections of the surface the turn runs on (the
  web app, the mobile app, or the web app's account settings for the Chrome
  extension, whose Settings button opens its own Options page, and for the
  CLI, VS Code, Slack and scheduled runs), and a contract test holds those
  names to the menu each surface's Settings opens and fails when a named
  section appears twice in it without its group (General under Settings, since
  the desktop app also lists General under Desktop app). This departs from
  Claude's system prompt, which sends questions about using the app to its
  support site; the owner's brief asks for directions to Settings.
