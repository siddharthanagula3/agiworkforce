# Free quota models

Status: Current
Owner: Platform lead
Last updated: 2026-10-02

Free users chat with Qwen models paid for by the provider's free quota. A free
quota model serves only while two gates hold, and either one lapsing turns every
free quota model off at once:

1. **A terms review** recorded in code, in `apps/web/config/free-pools.json`.
2. **A console check**: a platform admin confirmed that Free quota only is on,
   in QwenCloud and, where the account can open it, in Alibaba Cloud Model
   Studio, and recorded it in the operator console within the last 30 days.

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
the review as its reviewer. The review is the record of that call, made on the
terms below.

### The terms it rests on

Our account is an Alibaba Cloud International account, its key calls the Model
Studio International endpoint, and the console the record names is QwenCloud's.
Two documents govern it, with the same model clauses under different names. Both
were read on 2026-10-02.

**Qwen Cloud Customer Agreement**, Models Supplemental,
https://www.qwencloud.com/legal/agreement ("Updated: August 27, 2026"):

- §2(b): "you and your end users may provide input to Models (“Input”), and
  receive generated content from the AI models and applications based on the
  Input (“Output”)."
- §2(e): "Models does not claim ownership of any Intellectual Property Rights in
  the Output. You may use the Input and Output, provided your use complies with
  applicable laws, the Agreement, and our rules." It ends: "We will not use your
  Customer Content to develop or improve the models on Models, unless you
  separately provide your consent."
- §2(d)(v): you shall not "resell Models or AI models provided through Models".
- §2(g)(ii): access may be suspended for "circumventing controls, or abusing
  promotions which we may offer from time to time".

**Alibaba Cloud International Website Product Terms**, §4.48 Alibaba Cloud Model
Studio,
https://www.alibabacloud.com/help/en/legal/latest/alibaba-cloud-international-website-product-terms-of-service-v-3-8-0
("Last Updated: Aug 28, 2026"), which the Model Studio related agreements page,
https://www.alibabacloud.com/help/en/model-studio/related-agreements ("Last
Updated: Sep 28, 2026"), lists among "These agreements govern your use of Model
Studio":

- §4.48.1(b): "you and your end users may provide input to Model Studio
  (“Input”), and receive generated content from the AI models and applications
  based on the Input (“Output”)."
- §4.48.1(e): "You may use the Input and Output, provided your use complies with
  applicable laws, the Agreement, and our rules." It ends: "Alibaba Cloud will
  not use your Member Content to develop or improve the models on Model Studio,
  unless you separately provide your consent."
- §4.48.1(d)(v): you shall not "resell Model Studio or AI models provided
  through Model Studio".
- §4.48.1(g)(ii): access may be suspended for "circumventing controls, or
  abusing promotions which Alibaba Cloud may offer from time to time".

Neither document has a trial or evaluation-only clause. Models from other
developers in the inventory can carry their own licence or third-party terms
(§2(f), §4.48.1(f)); the launch review did not read those.

**Preview models stay out.** The Preview Product Terms,
https://www.alibabacloud.com/help/en/legal/latest/alibaba-cloud-international-website-beta-testing-terms
("Last Updated: Aug 20, 2026"), §1.1, license a Preview Product "solely for the
purposes of internal testing, research and evaluation". Whether a model whose id
says preview is a Preview Product is not verified, so the stricter reading wins:
a review never approves an offering whose model id contains "preview", and the
schema in `apps/web/lib/server/free-pools.ts` refuses a file that does.

### The mainland clause that was considered

The 2026-09-01 research (`docs/research/provider-free-value-matrix-2026-09-01.md`)
flagged an evaluation-only clause. It is in the mainland China (Bailian)
service-specific terms, section III (Trial services), last paragraph, read on
2026-10-02 from https://help.aliyun.com/en/model-studio/bailian-service-notes
(the page reports its last change at 2026-09-28T06:57:57Z):

> Unless we state otherwise, you agree not to claim any intellectual property
> rights in the content generated during your trial interactions ("generated
> content"). The content you generate through model trials may only be used to
> evaluate the model's performance. It may not be used for any other purpose,
> including any commercial purpose. You are prohibited from providing it to any
> third party in any form or from using or distributing it on any third-party
> platform.

It does not govern our account: the international related agreements page lists
no such document, and the same page on www.alibabacloud.com answered 404 on
2026-10-02. It is kept here so every renewal sees it was weighed, and checks
that it has not reached the international site.

### What each term asserts

All four must be `true`, and the review must be inside its dates, or no free
quota model serves. The questions are the ones `isFreeEligibilityValid` in
`packages/ai/routing/src/runtime-state.ts` asks of every free pool, as
`docs/research/free-inference-tos-workbook-2026-09-01.md` defines them.

| Term                          | Asserts                                                                | Answered by                                     |
| ----------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| `commercialUseAllowed`        | the free quota may be used in a commercial product                     | §2(e), §4.48.1(e), and no evaluation-only limit |
| `thirdPartyServingAllowed`    | its output may be served to our users, not only to the account owner   | §2(b), §4.48.1(b): "you and your end users"     |
| `proxyingAllowed`             | our use, a product built on the models, is permitted; resale stays out | §2(d)(v), §4.48.1(d)(v) forbid only resale      |
| `promptsExcludedFromTraining` | the provider does not train on the prompts we send                     | the last sentence of §2(e) and §4.48.1(e)       |

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
  "evidenceUrl": "<URL of the governing terms that were read>",
  "reviewedBy": "<who made the call>",
  "verifiedAtMs": <epoch milliseconds the review was made>,
  "expiresAtMs": <epoch milliseconds it stops counting>,
  "approvedOfferingKeys": ["<offering key from inventory.entries>"]
}
```

`approvedOfferingKeys` must name distinct keys that appear in
`inventory.entries`, none of them a preview model; the schema refuses the file
otherwise, and an offering not named stays off. A `verifiedAtMs` after the server
clock does not count yet.

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

1. Re-read the governing documents first: the Qwen Cloud Customer Agreement,
   Models Supplemental §2, and the Product Terms §4.48, at the URLs above. If a
   quoted clause changed, or either document gained a trial, evaluation-only or
   end-user limit, stop and get the owner's call before renewing.
2. Re-read the Preview Product Terms §1.1 and the mainland clause, and check
   that the clause has not appeared on www.alibabacloud.com.
3. Set `verifiedAtMs` to the time of the review and `expiresAtMs` to the end of
   the window the owner chose (90 days for the launch review), and list the
   offerings it clears. Leave out every offering whose model id contains
   "preview".
4. Point `evidenceUrl` at the governing document the review relied on, and
   update the quotes and dates in this section.
5. Get the change reviewed, merge it and deploy it before `expiresAtMs`.

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
result in overdue payment."

Who warns about a spent quota: QwenCloud states "Currently, there is no
notification mechanism" for a used-up quota, while Model Studio's free quota
page (cited below) states "When your remaining quota drops to 20% or is fully
exhausted, the system sends notifications through internal messages and email."
Our reminders (see
Reminders) cover only our own records, the terms review and the console check,
and a billing code the provider returns; they say nothing about how much free
quota is left. The quota each model has left, and the date it ends, are on the
consoles' free quota pages.

### Then the same switch in Alibaba Cloud Model Studio

This deployment sends its requests to the Model Studio International endpoint
(`QWEN_DEFAULT_BASE_URL` in `packages/ai/providers/qwen/src/base-url.ts`), and
neither console's documentation says the QwenCloud switch and the Model Studio
switch are one setting. So whenever the account can open Model Studio, turn the
switch on there as well, for the same models, on the Singapore console's Model
usage page, Free Quota tab:
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

Whether QwenCloud's free quota is drawn through the endpoint we call is not
verified. If it is not, our requests draw on Model Studio's quota, and only the
Model Studio switch turns a spent quota into a refusal instead of a charge. If
the account cannot open Model Studio, record the QwenCloud check and tell the
owner, so the gap is known.

### Recording it

On `/operator#quota`, under Record a console check, choose every model listed
or the models you confirmed, tick the confirmation and press Record console
check. The dialog names what the record asserts; confirm it.

A record names the models it covers, never "every model from now on". Every
model listed sends the keys the panel shows, and an API caller's `"all"` is
stored as the models the inventory can serve at that moment. A model added to
the inventory later is therefore off until a check names it: after any change
that adds models to `apps/web/config/free-pools.json`, turn their switch on and
record a new console check. The panel's Models covered line counts the listed
models the current record leaves out.

- The server stamps the record with its own clock: the panel sends `"now"`,
  never the browser's time. An API caller may send `checkedAtMs` instead, within
  an hour of the check and never later than the server clock.
- The record is bound to the hash of the current `QWEN_API_KEY`. Rotating the
  key turns every free model off until a check is recorded for the new key.
- A record newer than an account billing signal clears that signal, unless the
  signal's record cannot be read (see Billing signal).
- Each record writes an `admin_policy_changed` audit event for
  `free_quota_attestation` under the admin who made it.

### Renewing it every 30 days

A check counts for 30 days (`quotaExperimentPolicy.attestationMaxAgeMs`).
Renewing is the same check again; the panel starts from the models the current
record covers. Record it before the countdown on the panel reaches zero.

## Billing signal

When the provider refuses a free model with an error code that means the account
carries charges or arrears (`classifyFreeQuotaRefusal` in
`apps/web/lib/free-quota-authorization.ts`), the completions route records a
billing signal for the current key, and every free quota model is withdrawn. A
console check recorded after the signal clears it: check the account's billing
and that Free quota only is on, then record a new check.

### When its record cannot be read

A billing signal record that no longer parses counts as a signal at an unknown
time. No console check can be newer, so none clears it. The panel shows
"Recorded, but its record cannot be read", and a critical reminder repeats daily
until the record is gone:

1. Check the account's billing in the provider console: no overdue bill, no
   pay-as-you-go charges for free models, and Free quota only on.
2. Work out the record's key, `agi-fquota:suspended:<scope>`, where `<scope>` is
   the first 16 hexadecimal characters of the SHA-256 of the deployment's
   `QWEN_API_KEY`. With the key in your shell's environment, this prints the
   scope, never the key:

   ```sh
   printf %s "$QWEN_API_KEY" | shasum -a 256 | cut -c1-16
   ```

3. Delete that one key from the production shared store, for example in the
   Data Browser of the production database in the Upstash console.
4. Record a new console check.

## Reminders

`apps/web/app/api/cron/remind-free-quota-renewal/route.ts` runs hourly at :22,
with its logic in `apps/web/lib/server/free-quota-renewal.ts`. It tells platform
admins:

| Reason                                                   | When                                                  | Severity |
| -------------------------------------------------------- | ----------------------------------------------------- | -------- |
| terms review runs out soon                               | inside `renewalReminderLeadMs` (3 days) of its expiry | warning  |
| terms review ran out                                     | at `expiresAtMs`                                      | critical |
| console check runs out soon                              | inside 3 days of the end of its 30 days               | warning  |
| console check ran out                                    | at the end of its 30 days                             | critical |
| no console check is recorded while the review is current | once a day until a check is recorded                  | critical |
| the key changed after the console check                  | the first run after the rotation                      | critical |
| the provider reported an account billing code            | the first run after the signal                        | critical |
| a billing signal record cannot be read                   | once a day until the record is removed                | critical |

A missing console check covers both the launch, before the first check is
recorded, and a recorded check that was lost or no longer parses, for example
after the shared store was flushed. Either way every free model is off, so it
repeats daily, as does an unreadable billing signal. Every other reason is sent
once per deadline (or per billing signal), so a renewal that moves a deadline
gets its own reminders.

A reminder is emailed to the verified address of each platform admin, or to
`AGI_SUPPORT_FALLBACK_EMAIL` when none resolves, which needs `RESEND_API_KEY`
and `AGI_SUPPORT_FROM_EMAIL`, and it is paged through `PAGER_WEBHOOK_URL` when
that is set. A delivered reminder is logged as
`free_quota_renewal_reminder_sent`, at error level when free models are off.

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
