# App Store listing — AGI Workforce (iOS)

Every claim below is bounded by what the iOS binary actually does, which is
narrower than the web surface: `apps/mobile/lib/v1FeatureFlags.ts` ships
`byokKeys`, `computerUse` and `crossDeviceSync` switched off, and there is no
in-app purchase path (`billing: false`). Prices come from
`BILLING_PLAN_PRICING` in `packages/contracts/types/src/billing-catalog.ts`.
Provider names come from the same call the iOS picker builds its rows from —
`getModelsForTierAndSurface('max', 'mobile/cloud-chat')`, see
`apps/mobile/lib/models.ts`; a provider registered in `models.json` but absent
from every `tierAllowedModels` bucket cannot be selected in the shipped binary
and must not be named here.

`apps/web/lib/__tests__/public-billing-copy.test.ts` holds this file to three
things: each of the three flags above must still read `false` and its sales
copy must be absent, each priced bullet must carry exactly the amounts its
named plan charges, and every provider named must be one the mobile picker can
select. Flipping a flag, repricing a plan, or naming an unselectable provider
fails CI here rather than in App Review.

## Subtitle (30 chars)

`Multi-model AI assistant`

## Promotional text (170 chars, can be updated without re-review)

`Beyond one model. Beyond one surface. Switch between Claude, GPT, Gemini, and Grok mid-conversation. Run a model entirely on your device, or reach Managed Cloud.`

## Description (4,000 chars)

```
AGI Workforce is the AI assistant that doesn't lock you to one model.

Switch between Claude, GPT, Gemini, Grok, DeepSeek, Qwen, Kimi and GLM mid-conversation. The same chat thread works across all of them — Claude for nuance, GPT for tools, Gemini for vision, Llama for offline. One UI. One conversation. Your choice.

KEY FEATURES

• Multi-provider chat — Anthropic Claude, OpenAI GPT, Google Gemini, xAI Grok, DeepSeek, Qwen, Moonshot Kimi and Z.ai
• On-device models — download a model and run it entirely on your iPhone or iPad. No account, no network, nothing leaves the device.
• Send to Desktop — pair the desktop app, hand a task to it from your phone, and pick the result back up here
• Scheduled tasks — set a prompt to run on a schedule and get the result as a push notification
• Voice transcription — speak your prompts instead of typing them
• Web search — the model searches and cites sources inside the answer
• Image generation — describe an image and get it back in the thread

WHY IT'S DIFFERENT

Most AI apps ship with one provider's models locked in. We've built the cross-vendor plumbing — payload normalization, schema cleanup, reasoning-effort routing — so any model is one tap away. And when you want privacy over capability, the same app runs a model on the device itself, with the network off.

PRICING

Plans are bought and managed on the web. The app has no purchase screen.

• Local — Free. On-device models, no account required.
• Free — Managed Cloud, in public alpha, with a usage ceiling.
• Basic — $7/mo. Managed Cloud with a base monthly allowance.
• Pro — $20/mo, or $200/yr.
• Max 5x — $100/mo.
• Max 15x — $200/mo.
• Team — $25 per seat/mo, or $240 per seat/yr. Central billing and seat management.
• Enterprise — SSO, SCIM, custom retention. Contact sales.

PRIVACY

• We never send your messages to a model you didn't pick.
• Local mode runs on the device and makes no network call to answer you.
• No training on your conversations. Ever.
• Managed Cloud sign-in is handled by Clerk and your data is stored in Neon Postgres. Every processor we use — including the services that relay push notifications and app updates — is listed at https://agiworkforce.com/subprocessors.

SUPPORT

• Visit https://agiworkforce.com for docs and support
• Email support@agiworkforce.com
```

## Keywords (100 chars total, comma-separated)

```
ai,llm,chat,assistant,gpt,claude,gemini,llama,offline,coding,multi-model,on-device
```

## Category

Primary: **Productivity**
Secondary: **Developer Tools**

## Age rating

4+ (no objectionable content; the agent will refuse harmful requests at the model layer)

## Screenshot specs (Apple requires sets per device)

You need separate sets for:

- 6.9" iPhone (1320 × 2868) — iPhone 17 Pro Max class
- 6.5" iPhone (1242 × 2688) — older flagship class
- 12.9" iPad (2048 × 2732)

**Recommended 8 screenshots, in this order:**

1. **Hero**: Multi-provider picker showing Claude / GPT / Gemini / Grok side-by-side with the same prompt. Tagline: "One conversation. Every model."
2. **Provider switch mid-conversation**: a single thread with messages alternating provider badges.
3. **On-device model**: the model picker with a downloaded on-device model selected, airplane mode on in the status bar. Tagline: "Runs on your phone."
4. **Scheduled task**: the recurrence editor plus the push notification it produces. Tagline: "Set it. Forget it."
5. **Voice + transcribe**: the voice button mid-conversation. Tagline: "Speak it. Send it."
6. **Send to Desktop**: phone showing "Sent to Desktop". Tagline: "Start here. Finish there."
7. **Tools / agent step**: tool-call rendering (file search, web fetch, etc.). Tagline: "More than chat."
8. **Plans**: the plan comparison as it renders in the app. Tagline: "Start free. Stay free if you want."

## App preview video (optional, 15-30s)

Recommend: a single 20s screen recording cycling through 3-4 provider switches in one chat thread.

## Privacy policy URL

`https://agiworkforce.com/privacy`

## Support URL

`https://agiworkforce.com/support`

## Marketing URL (optional)

`https://agiworkforce.com`
