# Free quota models

Status: Current
Owner: Platform lead
Last updated: 2026-10-02

Free users chat with Qwen models paid for by the provider's free quota. A free
quota model serves only while two gates hold, and either one lapsing turns every
free quota model off at once:

1. **A terms review** recorded in code, in `apps/web/config/free-pools.json`.
2. **A console check**: a platform admin confirmed in the provider console that
   Free quota only is on, and recorded it in the operator console within the
   last 30 days.

Both gates, what is serving and why the rest is not, are on `/operator#quota`.
The gate logic is `decideFreeQuotaOffering` in
`apps/web/lib/free-quota-authorization.ts`; the terms review standing is in
`apps/web/lib/server/free-pools.ts`.

## Before anything can serve

The deployment needs `QWEN_API_KEY`, a shared state store (Upstash or Redis) and
the inventory in `apps/web/config/free-pools.json`. The panel names whichever is
missing. Only a platform admin, a Clerk user id listed in
`AGI_PLATFORM_ADMIN_USER_IDS`, can open the panel or call
`apps/web/app/api/models/free-quota/attestation/route.ts`.

The key must be a general-purpose pay-as-you-go key: Model Studio states that
"Token Plan or Coding Plan dedicated API keys do not consume free quota".

## Terms review

The owner decided on 2026-10-02 to serve free quota output to users, and records
the review as its reviewer. The review is the record of that call.

### The clause it answers

Alibaba Cloud Model Studio service-specific terms, section III (Trial services),
last paragraph, read on 2026-10-02 from
https://help.aliyun.com/en/model-studio/bailian-service-notes (the page reports
its last change at 2026-09-28T06:57:57Z):

> Unless we state otherwise, you agree not to claim any intellectual property
> rights in the content generated during your trial interactions ("generated
> content"). The content you generate through model trials may only be used to
> evaluate the model's performance. It may not be used for any other purpose,
> including any commercial purpose. You are prohibited from providing it to any
> third party in any form or from using or distributing it on any third-party
> platform.

`help.aliyun.com` paths under `/en/` can serve mainland China content; the same
page on www.alibabacloud.com answered 404 on 2026-10-02, and QwenCloud's own
terms were not read. Whether the clause covers the API free quota is a legal
question the owner has answered; re-read it before every renewal.

### What each term asserts

All four must be `true`, and the review must be inside its dates, or no free
quota model serves.

| Term                          | Asserts                                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| `commercialUseAllowed`        | the free quota may be used in a commercial product                        |
| `thirdPartyServingAllowed`    | its output may be served to other people, not only the account owner      |
| `proxyingAllowed`             | the provider does not forbid proxying or reselling it through our service |
| `promptsExcludedFromTraining` | the provider does not train on the prompts we send                        |

### Shape

`inventory.termsReview` in `apps/web/config/free-pools.json`:

```json
"termsReview": {
  "terms": {
    "commercialUseAllowed": <true or false>,
    "thirdPartyServingAllowed": <true or false>,
    "proxyingAllowed": <true or false>,
    "promptsExcludedFromTraining": <true or false>
  },
  "evidenceUrl": "<URL of the terms that were read>",
  "reviewedBy": "<who made the call>",
  "verifiedAtMs": <epoch milliseconds the review was made>,
  "expiresAtMs": <epoch milliseconds it stops counting>,
  "approvedOfferingKeys": ["<offering key from inventory.entries>"]
}
```

`approvedOfferingKeys` must name distinct keys that appear in
`inventory.entries`; the schema refuses the file otherwise, and an offering not
named stays off. A `verifiedAtMs` after the server clock does not count yet.

### Recording it

Recording the review is a reviewed code change to
`apps/web/config/free-pools.json` plus a deploy. Nothing in the product records
or extends it, on purpose: it is a legal decision, not an operator setting. The
shipped-configuration test in `apps/web/lib/server/free-pools.test.ts` pins what
the file holds, so update it in the same change. After the deploy, the terms
review gate on `/operator#quota` reads valid until the new date.

### Renewing it

A reminder goes out three days before `expiresAtMs` and again when it passes
(see Reminders). Start the renewal when the first one arrives, since a merge and
a deploy take time:

1. Re-read the clause at the URL above. If it changed, stop and get the owner's
   call before renewing.
2. Set `verifiedAtMs` to the time of the review and `expiresAtMs` to the end of
   the window the owner chose (90 days for the launch review), and list the
   offerings it clears.
3. Get the change reviewed, merge it and deploy it before `expiresAtMs`.

## Console check

### What to verify in QwenCloud

The record names QwenCloud's Free Tier page, https://home.qwencloud.com/benefits
(console home, Special Offer, then My free tier). Source:
https://docs.qwencloud.com/resources/free-quota, read on 2026-10-02.

1. Sign in with the Alibaba Cloud International main account that owns the
   deployment's key. QwenCloud does not support RAM users.
2. Turn on Free quota only for every model the record will cover. The page:
   "Single model: Toggle on the Free quota only switch for the target model",
   "All models: Click Enable all models at the top-right of the table", or
   check models and "click Enable selected in the bottom action bar".
3. Reload the page and confirm each covered model shows the switch on. "The
   free quota displayed on the console is subject to a delay of several minutes
   and is not real-time data."
4. A model whose quota is exhausted or expired has no switch, or a greyed-out
   one, so it cannot be on. If any model shows that, record only the models you
   confirmed, never every model: a model left out stays off here, while a model
   recorded as on with its switch off bills the account once its quota is gone.

Why it matters: "Free quota only is disabled by default", and without it "Tokens
exceeding free quota are billed based on input/output costs in Model invocation
pricing. Charges are automatically deducted on a pay-as-you-go basis, which may
result in overdue payment." QwenCloud also states "Currently, there is no
notification mechanism" for a used-up quota, so our reminders are the only
warning.

### The same check in Alibaba Cloud Model Studio

If the key was issued in Model Studio instead, use the Singapore console's
Model usage page, Free Quota tab:
https://modelstudio.console.alibabacloud.com/ap-southeast-1/costing-balance/free-quota.
Source: https://www.alibabacloud.com/help/en/model-studio/new-free-quota (page
last updated Sep 22, 2026), read on 2026-10-02.

- One model: "enable the Free Quota Only switch in the Actions column".
- Several: "Click Free Quota Only Batch Operation and select Batch Enable", then
  select models and Batch Enable, or "click Enable for All Models"; confirm with
  Enable Free Quota Only.
- "Enabling or disabling the Free Quota Only feature does not take effect
  immediately. Wait a moment before making further invocations."
- Only Singapore-region models with the International deployment scope have a
  free quota.

Neither page says the two consoles flip one shared switch. Check the console
that issued the key.

### Recording it

On `/operator#quota`, under Record a console check, choose every model or the
models you confirmed, tick the confirmation and press Record console check. The
dialog names what the record asserts; confirm it.

- The server stamps the record with its own clock: the panel sends `"now"`,
  never the browser's time. An API caller may send `checkedAtMs` instead, within
  an hour of the check and never later than the server clock.
- The record is bound to the hash of the current `QWEN_API_KEY`. Rotating the
  key turns every free model off until a check is recorded for the new key.
- A record newer than an account billing signal clears that signal.
- Each record writes an `admin_policy_changed` audit event for
  `free_quota_attestation` under the admin who made it.

### Renewing it every 30 days

A check counts for 30 days (`quotaExperimentPolicy.attestationMaxAgeMs`).
Renewing is the same check again; the panel starts from the models the current
record covers. Record it before the countdown on the panel reaches zero.

## Reminders

`apps/web/app/api/cron/remind-free-quota-renewal/route.ts` runs hourly at :22,
with its logic in `apps/web/lib/server/free-quota-renewal.ts`. It tells platform
admins:

| Reason                                        | When                                                  | Severity |
| --------------------------------------------- | ----------------------------------------------------- | -------- |
| terms review runs out soon                    | inside `renewalReminderLeadMs` (3 days) of its expiry | warning  |
| terms review ran out                          | at `expiresAtMs`                                      | critical |
| console check runs out soon                   | inside 3 days of the end of its 30 days               | warning  |
| console check ran out                         | at the end of its 30 days                             | critical |
| the key changed after the console check       | the first run after the rotation                      | critical |
| the provider reported an account billing code | the first run after the signal                        | critical |

Each reason is sent once per deadline (or per billing signal), so a renewal
that moves a deadline gets its own reminders. It is emailed to the verified
address of each platform admin, or to `AGI_SUPPORT_FALLBACK_EMAIL` when none
resolves, which needs `RESEND_API_KEY` and `AGI_SUPPORT_FROM_EMAIL`, and it is
paged through `PAGER_WEBHOOK_URL` when that is set. A delivered reminder is
logged as `free_quota_renewal_reminder_sent`, at error level when free models
are off.

A reminder is held for 15 minutes while it is sent and kept only once it reaches
someone, so a failure never silences it: each reminder is sent on its own, and
one that reached nobody, failed, or was cut off with its run is sent again on
the next run. A run in which any reminder reached nobody answers HTTP 500, so it
shows in the Vercel cron log.

## What users see when a gate lapses

- The model picker marks every free quota model "Not available right now"
  (`apps/web/features/models/lib/free-quota-types.ts`).
- A message sent to one is refused before any provider request with HTTP 503,
  code `free_quota_unavailable`, and "{model} from {issuer} is not available
  right now. Choose {alternative} or another free model, then send your message
  again." (`apps/web/features/models/lib/free-quota-copy.ts`, applied in
  `apps/web/app/api/models/free-quota/completions/route.ts`).
- Nothing is charged: no request reaches the provider while a gate is lapsed.

Recording the missing gate brings every model back at once; the panel's
"Serving now" count shows it.
