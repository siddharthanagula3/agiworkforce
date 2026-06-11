# AGI Product Decisions

Status: Current
Owner: Founder + platform lead
Last updated: 2026-06-11

This is the plain-English product decision note for AGI. It explains what we are building, how the product should feel, and what must stay consistent across the app.

## What AGI Is

AGI is a flexible AI workspace for people who already use AI every day.

Today, serious AI users switch between chat apps, coding agents, research tools, file tools, local models, cloud models, browser tools, and automation tools. AGI brings those workflows into one familiar product across phone, desktop, web, terminal, browser, and editor.

The long-term goal is simple:

AGI should become the default AI workspace for developers, founders, researchers, creators, operators, and small technical teams.

The product should feel polished and familiar, but it must be AGI-owned. We can study leading AI apps for quality, but the app should use AGI names, AGI wording, AGI layout decisions, and AGI product rules.

## The Three Ways People Use AGI

AGI has three major usage modes.

### Local Mode

Local Mode is for users who want privacy, offline use, and free local inference.

The model runs on the user’s device or local machine when the device supports it. Local Mode should feel like a real product, not a limited demo. It is important because it lets people try AGI without paying for cloud usage and without sending their work to a remote server.

Local Mode is an adoption funnel. It should make users trust AGI, use AGI often, and eventually want cloud features when they need sync, stronger models, team workflows, or managed compute.

Local conversations, local memory, local projects, local files, local settings, and local personalization must stay local. They should not appear in AGI Cloud and should not be used by AGI Cloud unless the user clearly chooses an explicit transfer or continuation flow.

### BYOK

BYOK means "bring your own key."

This is for users who already pay AI providers directly and want AGI’s app experience on top of those providers. They bring their own provider access, and AGI gives them the workspace, tools, files, memory, projects, agents, artifacts, and automation layer.

BYOK is for Desktop and CLI. It is not for Mobile right now.

When BYOK is used, the app should be honest about which provider and model the user selected. The user should understand where the request is going and what account pays for it.

Local work should never quietly become BYOK work. If a user wants to continue local work with a provider, AGI should show what is being sent and ask for clear approval.

### AGI Cloud

AGI Cloud is the managed cloud version of AGI.

AGI Cloud is for users who want synced chats, stronger hosted models, subscriptions, managed compute, cloud projects, cloud artifacts, connectors, plugins, skills, and cross-device continuity.

AGI Cloud is shared between Web, Mobile, and Desktop.

Users should not get unrestricted AGI Cloud compute for free. Cloud usage needs a subscription, invite, tester access, or another clear entitlement. This matters because cloud AI usage costs real money and needs proper billing, limits, abuse controls, refunds, support, and account management.

The generic product label should be "AGI Cloud." The app should not say "AGI Cloud OpenAI," "AGI Cloud Anthropic," or similar names. Provider names can appear where the user is actually choosing, connecting, or reviewing a provider.

AGI Cloud has its own chats, projects, memory, artifacts, personalization, profile, and settings. These are account-scoped and can sync across Web, Mobile, and Desktop only after sign-in and entitlement checks.

Local settings and Cloud settings should be separate. A Local user should be able to configure Local Mode without creating an account. A Cloud user should be able to configure account, subscription, connectors, plugins, skills, Cloud memory, Cloud projects, and Cloud personalization without changing Local Mode.

If AGI offers a "Sync to Cloud" or "Continue in Cloud" option, it must be explicit and user-controlled. The app should show what will be transferred, where it will go, which account will receive it, and what will stay local. The default must never be automatic sync from Local Mode into AGI Cloud.

## What Each App Surface Is For

### Mobile

Mobile is the current demo priority.

Mobile should make Local Mode feel polished, private, useful, and free. A user should be able to open the app, set up local chat, send messages, use the sidebar, open settings, and understand the product without feeling blocked by technical language.

Mobile also shows that AGI Cloud exists, but cloud access can be invite-gated or subscription-gated.

Mobile should not show BYOK. No provider-key setup, no BYOK settings, and no BYOK marketing inside Mobile for now.

Apple on-device AI is a future Local Mode opportunity on supported Apple devices. It should not appear as an active AGI model until the app can confirm that the device supports it and the response actually comes from that Apple on-device path. For the current demo, Mobile should present the real local runtime honestly as AGI Standard or another AGI-owned local model label.

Mobile settings should include profile, personalization, memory, appearance, accent color, general, notifications, voice, safety and security, data controls, parental controls, report issue, help center, and about.

Mobile cloud settings can include email or phone, subscription, restore purchases, connectors, plugins, skills, logout, and AGI Agent, but cloud-only features should be clearly gated until the user has access.

Mobile should separate Local settings from Cloud settings. Local settings control device-only profile, personalization, memory, appearance, permissions, voice, storage, projects, and data controls. Cloud settings control account, subscription, Cloud chats, Cloud projects, Cloud memory, Cloud artifacts, connectors, plugins, skills, and logout.

### Web

Web is the cloud account surface.

Web should handle the landing page, cloud chats, projects, artifacts, billing, subscriptions, waitlist, account settings, connectors, plugins, and skills.

Web should feel visually consistent with Desktop. It should not look like a separate product.

Web should not expose BYOK right now.

### Desktop

Desktop is the richest app surface and the main local-private compute host.

Desktop should support local work, local files, local tools, browser and computer use, artifacts, generated files, memory, projects, settings, connectors, plugins, skills, and cloud continuity.

Desktop should also support BYOK because technical users will want to bring provider keys and local runtimes.

The Desktop app is currently the strongest design reference inside AGI. Web should move closer to Desktop so the product feels unified.

### CLI

CLI is the developer and terminal surface.

CLI should work for local coding, local agents, BYOK routes, approvals, tools, skills, plugins, and automation. It should be usable without internet when local models and local tools are available.

CLI should not quietly sync workspace files or developer sessions into cloud chats. Any cloud handoff should be explicit.

### Chrome And VS Code

Chrome and VS Code are context surfaces.

They should help AGI understand browser pages, code workspaces, files, diffs, and developer tasks. They should not quietly push private context into cloud chats.

Any handoff from browser or editor context into AGI Cloud should be clear, limited, and approved by the user.

## Chat, Tools, Artifacts, And Agents

AGI is not only a chat box.

The product should include chat, writing, coding, research, files, projects, memory, artifacts, connectors, plugins, skills, tools, agents, and automation.

Inline tool calling should be clear and polished. The founder likes the way leading AI products show tool use inline, especially when the user can see what the assistant is doing and whether it succeeded or failed.

Tool usage should never feel fake. If a tool is running, show it. If it failed, show it. If it is locked, show that. If it is not implemented, do not make it look active.

Artifacts should feel like a real workspace, not a preview afterthought. Users should be able to inspect, edit, share, publish, and continue work around artifacts as the product matures.

Memory should make AGI more useful over time without becoming a hidden global bucket. Local memory, local personalization, local projects, cloud memory, cloud personalization, cloud projects, provider memory, and session history are separate things. Users should be able to see, edit, disable, delete, export, or choose whether to sync the memory that affects them.

Personalization should have a stable default profile and temporary chat modes. A user can have durable preferences for tone, work style, and product behavior, but one project, one retrieved document, or one temporary chat should not silently rewrite the user's global preferences.

The agent harness should improve through honest learning loops. AGI should remember useful facts, search older work when needed, detect stalled or unhealthy runs, and surface what changed. It should never pretend it has memory, tools, or autonomy that are not actually wired.

## Visual Direction

AGI should feel familiar, calm, premium, and practical.

The default look should be neutral and close to the modern AI app style users already understand. This is a design direction, not something we should write inside the app.

The app should not say things like:

- "ChatGPT-style"
- "Claude-style"
- "OpenAI-style"
- "AGI Cloud OpenAI"
- "AGI Cloud Anthropic"
- "AGI Cloud Google"

Better user-facing words are:

- "AGI default"
- "Neutral"
- "Local Mode"
- "AGI Cloud"
- "Provider"
- The actual provider name only when the user is choosing or connecting that provider

Official provider logos are acceptable when the UI is about provider choice, OAuth, connectors, integrations, or model routing. For example, a connector row or provider picker can use the official company logo if it is accurate and allowed.

Generic AGI Cloud UI should use AGI-owned wording and AGI-owned visual treatment.

Colors should come from the app’s theme system, not from random one-off color values in each screen. The product should be easy to restyle later without rewriting every component.

## What Users Should Feel

A local user should feel:

"This is useful, private, and free. I can trust it."

A cloud user should feel:

"This is the same AGI experience, now synced and more powerful."

A BYOK user should feel:

"I control the provider and cost, while AGI gives me the app layer."

A developer should feel:

"This can handle serious work without hiding what it is doing."

An investor should understand:

"AGI starts with a useful local product, expands into subscriptions and managed cloud, and can become the AI workspace layer across devices, models, tools, files, and workflows."

## Business Direction

Local Mode is free because it helps users adopt AGI and trust it.

BYOK lets users bring their own provider spend and still use AGI’s workspace.

AGI Cloud is the main long-term business line through subscriptions, managed usage, cloud projects, cloud artifacts, connectors, plugins, skills, and team features.

Cloud must be gated until the business can control cost, billing, abuse, refunds, support, and provider obligations.

## Rules For Builders

Before changing product behavior, labels, provider support, billing, platform rules, app-store behavior, or model behavior, builders must check current sources instead of relying on memory.

Use current official docs when the facts can change. Use the local screenshot references for visual quality. Use the app’s current code to confirm what is real before claiming a feature is ready.

Do not invent features, users, revenue, providers, models, settings, or release status.

Do not leave dead buttons, fake feature states, invisible text, clipped text, duplicate controls, or confusing cloud gates.

If something looks wrong in the app, treat it as a bug and fix it or record the exact blocker.

## Demo-Readiness Standard

For the current demo push, Mobile Local Mode must look and feel polished first.

Cloud mode should be visible, but cleanly gated.

The landing page should feel like a serious company, not a generic AI page.

Web and Desktop should move toward one shared visual language.

CLI should be visually polished first, then tightened for usability.

Demo-ready means the product looks real, works honestly, and does not show half-built features as finished.
