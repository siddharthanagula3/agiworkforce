# Free quota models

Status: Current
Owner: Platform lead
Last updated: 2026-10-07

A free quota model is a QwenCloud model served from the promotional free quota
on the company's QwenCloud account. Free plan accounts reach one in two ways:

- **Free Auto.** The Free plan's default model. Which of the free quota lane and
  the OpenRouter free router answers a Free Auto turn first is a configuration
  value; see Free Auto: which route answers first.
- **Picked by name.** Every free quota chat model that is ready is listed in the
  model picker's Free section, and a turn sent to one goes to
  `apps/web/app/api/models/free-quota/completions/route.ts`.

Both end in `serveFreeQuotaTurn` in `apps/web/lib/server/free-quota-turn.ts`. A
free quota model serves only while two gates hold, and either one lapsing turns
every free quota model off at once:

1. **A terms review** recorded in code, in `apps/web/config/free-pools.json`.
2. **A console check**: a platform admin confirmed that Free quota only is on,
   in QwenCloud and, where the account can open it, in Alibaba Cloud Model
   Studio, and recorded it in the operator console within the last 30 days.

Both gates, what is serving and why the rest is not, are on `/operator#quota`.
The gate logic is `decideFreeQuotaOffering` in
`apps/web/lib/free-quota-authorization.ts`; the terms review standing is in
`apps/web/lib/server/free-pools.ts`.

## Before anything can serve

Every one of these has to hold in the deployment, or no free quota model serves
and every Free Auto turn is answered by the free router:

1. `QWEN_API_KEY` is set. It must be a general-purpose pay-as-you-go key: Model
   Studio states that "Token Plan or Coding Plan dedicated API keys do not
   consume free quota".
2. A shared state store, Upstash or Redis, is configured. A memory or local
   store counts as none outside development (`sharedFreeQuotaStore` in
   `apps/web/lib/server/free-quota-catalogue.ts`).
3. The inventory and a current terms review are in
   `apps/web/config/free-pools.json` (see Terms review).
4. A platform admin has recorded a console check for the current key within the
   last 30 days, and it names the models to serve (see Console check). Nothing
   records it automatically: a fresh deployment, a rotated key or a flushed
   store serves nothing until someone records one.

The panel names whichever is missing. Only a platform admin, a Clerk user id
listed in `AGI_PLATFORM_ADMIN_USER_IDS`, can open the panel or call
`apps/web/app/api/models/free-quota/attestation/route.ts`.

## Free Auto: which route answers first

The owner decided on 2026-10-07 that a Free Auto turn tries the free quota lane
first and the OpenRouter free router second, so the allocations that are about
to expire are spent before they lapse. Free quota chat has no cap per account:
each allocation's shared allowance is the limit.

### The setting

`inventory.freeAutoRoute` in `apps/web/config/free-pools.json`, beside
`freeAutoFallback`:

```json
"freeAutoRoute": {
  "order": "quota_first",
  "quotaFirstByteTimeoutMs": 15000
}
```

- `order` is `quota_first` or `router_first`. The schema in
  `apps/web/lib/server/free-pools.ts` refuses any other value, and a file
  without the block is read as `router_first`.
- `quotaFirstByteTimeoutMs` is how long the provider has, from the moment the
  request is sent to it, to return the first frame of its answer.

To go back to the free router first, change the one line to
`"order": "router_first"` and deploy. No code changes with it. Under
`router_first` the lane is tried only after the free router refuses a turn
because its shared pool is spent, on the first ready model of
`freeAutoFallback.offeringKeys`, and the reply carries the notice that another
model answered.

### Which turns the lane takes first

Only a turn that all of these describe; every other turn goes to the free router
exactly as under `router_first`:

- a Free plan account signed in to the web app, not an API key, the browser
  extension or the desktop app (`freeQuotaFallbackReplay`, and the
  `x_free_quota_fallback` flag only the web client sends);
- the model is Free Auto and the reply is streamed;
- plain chat: no web search or page fetch (switched on or asked for in the
  message), no code execution, research, AGI Work, skill, client tool, MCP
  context, memory command or research resume (`ReplayedFreeAutoTurnSchema` and
  `freeAutoTurn` in `apps/web/lib/services/free-lane/free-quota-fallback.ts`);
- the composer reported no connector switched on for the chat
  (`connector_tools_enabled` is `false`), since the lane offers no tools;
- no earlier message carries an attachment, since the lane would replace it
  with a note; an image on the current message is taken only by an allocation
  that reads images.

The attempt runs inside `dispatchChatCompletions` in
`apps/web/app/api/llm/v1/chat/completions/route.ts`, after the sign-in, rate
limit, terms, concurrent-turn, managed compute kill-switch, workspace policy and
workspace budget checks, and before the free router's own request processing.
`serveFreeQuotaTurn` then applies the same gates as a model picked by name:
plan, conversation ownership, workspace privacy, model policy and retention,
moderation, the content safety preference, secret handling, the provider egress
gate, the once-only turn claim and the allowance reservation.

### Which allocation answers

Every chat allocation that `decideFreeQuotaOffering` reports ready is a
candidate, not only the ones `freeAutoFallback.offeringKeys` ranks. They are
used in this order (`freeQuotaChatUseOrder` in
`apps/web/lib/server/free-quota-catalogue.ts`):

1. the allocation whose free quota ends soonest, counting a model's retirement
   date when that comes first;
2. among those ending the same day, the ones `freeAutoFallback.offeringKeys`
   ranks, in that order;
3. then the ones it does not rank: models that answer without a required
   thinking pass first, then by offering key.

An allocation is used until its allowance is spent or the provider holds it,
then the next one starts. One turn tries one allocation.

On 2026-10-07 the inventory held 168 active token allocations of 1,000,000
tokens. 73 of them can answer chat: 90% of what is left of each is usable,
65,677,202 tokens in all. The other 95 cannot: 37 audio and 6 embedding
allocations and 45 chat allocations have no serving integration, 4 chat models
also have a paid route and so would spend the allowance unmetered, and 3 are
preview models the terms review leaves out. Of the 73:

| Free quota ends                         | Allocations | Usable tokens |
| --------------------------------------- | ----------- | ------------- |
| 2026-10-09 16:00 UTC (model retirement) | 30          | 26,996,067    |
| 2026-10-21 00:00 UTC                    | 33          | 29,684,004    |
| 2026-10-23 00:00 UTC                    | 2           | 1,800,000     |
| 2026-10-31 to 2026-12-13                | 8           | 7,197,131     |

An allocation stops serving at 00:00 UTC on the day its quota ends. From
2026-12-13 none is left and every Free Auto turn is the free router's.

### What ends the attempt

| Outcome                                                                                       | What happens                                                                  |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| The first frame of the answer arrives                                                         | The lane answers. A later failure follows the lane's own error handling.      |
| Platform moderation refuses the message                                                       | The refusal is returned. No provider is asked.                                |
| The lane already took a turn with the same message id and idempotency key                     | The duplicate refusal is returned. The turn is not answered twice.            |
| No allocation is ready, a gate refuses, or the provider refuses or fails before a first frame | The free router takes the turn, with its own checks, as under `router_first`. |

The allowance reserved for a turn the provider refused with an answer (an HTTP
error) is given back before the free router is tried. When the provider request
failed with no answer, timed out, or was cut off, how much it spent is unknown,
so the reservation stands and the meter errs toward stopping that allocation
early.

If the free router then refuses because its shared pool is spent, the refusal
is returned with a ready free quota model to switch to when there is one. The
turn is not sent to the lane a second time.

### What the reader sees

- The picker entry is the catalogue's name for Free Auto. A reply the lane
  answered is labelled with the model that answered and "via free pool", and
  carries no notice.
- A reply the free router answered after the lane handed the turn on is
  labelled as the free router's replies always are, with no notice: it is the
  model the reader picked.
- The notice that another model answered appears only when the free router
  refused and a free quota model then answered.

### Telling which route is answering

Each attempt logs one line: `[free-lane] a free quota model answered a Free Auto
turn first`, or `[free-lane] the free quota lane did not answer a Free Auto
turn; the free router takes it` with a `cause`: `no_ready_offering`, a refusal
code such as `provider_rate_limited` or `free_quota_exhausted`,
`failed_before_first_frame`, `connector_tools_not_off` or `earlier_attachment`.
`no_ready_offering` on every turn means a gate under Before anything can serve
has lapsed; the panel names it. `connector_tools_not_off` on every turn means
the web composer is not reporting its connectors as loaded, so check
`/api/connectors`. A turn the lane never considers, such as one with web search
on, logs nothing.

## Terms review

The owner decided on 2026-10-02 to serve free quota output to users, and records
the review as its reviewer. The review is the record of that call, made on the
terms below.

### The terms it rests on

Our account is an Alibaba Cloud International account, its key calls the Model
Studio International endpoint, and the console the record names is QwenCloud's.
Two sets of terms govern it, with the same clauses under different names:
QwenCloud's Customer Agreement, whose Models Supplemental holds the model terms,
and Alibaba Cloud's Membership Agreement, with the model terms in the Product
Terms §4.48. All were read on 2026-10-02.

**Qwen Cloud Customer Agreement**, https://www.qwencloud.com/legal/agreement
("Updated: August 27, 2026"). Its general restrictions are quoted below, under
Clauses the launch review did not settle. Its Models Supplemental:

- §2(b): "you and your end users may provide input to Models (“Input”), and
  receive generated content from the AI models and applications based on the
  Input (“Output”)."
- §2(e): "Models does not claim ownership of any Intellectual Property Rights in
  the Output. You may use the Input and Output, provided your use complies with
  applicable laws, the Agreement, and our rules." It ends: "We will not use your
  Customer Content to develop or improve the models on Models, unless you
  separately provide your consent."
- §2(d)(v): you shall not "resell Models or AI models provided through Models,
  or use Models, AI models provided through Models (including any Output of
  such AI models) to train or develop products or services that compete with
  us and/or our affiliates’ products and services, unless expressly authorised
  by us."
- §2(g)(ii): access may be suspended for "circumventing controls, or abusing
  promotions which we may offer from time to time".

**Alibaba Cloud International Website Product Terms**, §4.48 Alibaba Cloud Model
Studio,
https://www.alibabacloud.com/help/en/legal/latest/alibaba-cloud-international-website-product-terms-of-service-v-3-8-0
("Last Updated: Aug 28, 2026"), and the **Alibaba Cloud International Website
Membership Agreement**,
https://www.alibabacloud.com/help/en/legal/latest/alibaba-cloud-international-website-membership-agreement
("Last Updated: Sep 10, 2026"), from which §4.48.1(b) takes its definition of
Member Content. The Model Studio related agreements page,
https://www.alibabacloud.com/help/en/model-studio/related-agreements ("Last
Updated: Sep 28, 2026"), lists both among "These agreements govern your use of
Model Studio". The Membership Agreement's general restrictions are quoted below,
under Clauses the launch review did not settle. Product Terms §4.48:

- §4.48.1(b): "you and your end users may provide input to Model Studio
  (“Input”), and receive generated content from the AI models and applications
  based on the Input (“Output”)."
- §4.48.1(e): "You may use the Input and Output, provided your use complies with
  applicable laws, the Agreement, and our rules." It ends: "Alibaba Cloud will
  not use your Member Content to develop or improve the models on Model Studio,
  unless you separately provide your consent."
- §4.48.1(d)(v): you shall not "resell Model Studio or AI models provided
  through Model Studio, or use Model Studio, AI models provided through Model
  Studio (including any Output of such AI models) to train or develop products
  or services that compete with Alibaba Cloud and/or its affiliates’ products
  and services, unless expressly authorised by us."
- §4.48.1(g)(ii): access may be suspended for "circumventing controls, or
  abusing promotions which Alibaba Cloud may offer from time to time".

Neither model text nor either general agreement has a trial or evaluation-only
clause. Models from other developers in the inventory can carry their own
licence or third-party terms (§2(f), §4.48.1(f)); the launch review did not read
those.

**Preview models stay out.** The Preview Product Terms,
https://www.alibabacloud.com/help/en/legal/latest/alibaba-cloud-international-website-beta-testing-terms
("Last Updated: Aug 20, 2026"), §1.1, license a Preview Product "solely for the
purposes of internal testing, research and evaluation". Whether a model whose id
says preview is a Preview Product is not verified, so the stricter reading wins:
a review never approves an offering whose model id contains "preview", and the
schema in `apps/web/lib/server/free-pools.ts` refuses a file that does.

#### Clauses the launch review did not settle

The launch review rested on the model terms above. It weighed only the resale
half of §2(d)(v) and §4.48.1(d)(v), and none of the general restrictions below.
Both general agreements carry them word for word under the same numbers: the
Qwen Cloud Customer Agreement, https://www.qwencloud.com/legal/agreement, and
the Membership Agreement,
https://www.alibabacloud.com/help/en/legal/latest/alibaba-cloud-international-website-membership-agreement,
both read on 2026-10-02. §3.2 reads "You shall not (whether through your End
Users or otherwise):" and lists, among others:

- j) "access or use the Services in a way intended to avoid the relevant fees
  or charges;"
- k) "resell or sublicense any Services;"

§2.9 reads "You agree that you will not:" and lists, among others:

- a) "copy, reproduce, download, re-publish, sell, distribute, resell or
  commercially exploit any information, text, images, graphics, video clips,
  sound, directories, files, databases, listings, or other content made
  available via using the Services (“Materials”);"
- e) "use any Materials for a purpose not expressly permitted by the Terms."

These are questions for the owner or a lawyer, not settled points:

1. §3.2(j): whether serving the public from a promotional free quota, with Free
   quota only on so that a spent quota stops instead of billing, is a use
   "intended to avoid the relevant fees or charges".
2. §3.2(k): whether serving our users through our product sublicenses the
   Services.
3. §2.9: whether model output is "Materials", and if so whether "You may use the
   Input and Output" (§2(e), §4.48.1(e)) is the express permission §2.9(e)
   asks for.
4. §2(d)(v) and §4.48.1(d)(v): whether serving the models in our product uses
   them "to train or develop products or services that compete with" Alibaba
   Cloud's or its affiliates' products and services.

Record each answer here, with who gave it and when.

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

| Term                          | Asserts                                                                | Answered by                                               |
| ----------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| `commercialUseAllowed`        | the free quota may be used in a commercial product                     | §2(e), §4.48.1(e), and no evaluation-only limit           |
| `thirdPartyServingAllowed`    | its output may be served to our users, not only to the account owner   | §2(b), §4.48.1(b): "you and your end users"               |
| `proxyingAllowed`             | our use, a product built on the models, is permitted; resale stays out | §2(d)(v), §4.48.1(d)(v) bar resale and competing products |
| `promptsExcludedFromTraining` | the provider does not train on the prompts we send                     | the last sentence of §2(e) and §4.48.1(e)                 |

Each answer is subject to the questions under Clauses the launch review did not
settle: §2.9 bears on `commercialUseAllowed`, §3.2(k) on
`thirdPartyServingAllowed` and `proxyingAllowed`, and §3.2(j) and the
competing-products bar on `proxyingAllowed`.

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

A reminder goes out fourteen days before `expiresAtMs`
(`quotaExperimentPolicy.termsReviewReminderLeadMs`) and again when it passes
(see Reminders). Start the renewal when the first one arrives, since re-reading
the terms, a review, a merge and a deploy take time:

1. Re-read the governing documents first, at the URLs above: the Qwen Cloud
   Customer Agreement (§2.9, §3.2 and the Models Supplemental §2), the
   Membership Agreement (§2.9 and §3.2) and the Product Terms §4.48. If a quoted
   clause changed, or a document gained a trial, evaluation-only or end-user
   limit, stop and get the owner's call before renewing.
2. Put the questions under Clauses the launch review did not settle to the
   owner, or a lawyer, and record the answers in that section.
3. Re-read the Preview Product Terms §1.1 and the mainland clause, and check
   that the clause has not appeared on www.alibabacloud.com.
4. Set `verifiedAtMs` to the time of the review and `expiresAtMs` to the end of
   the window the owner chose (90 days for the launch review), and list the
   offerings it clears. Leave out every offering whose model id contains
   "preview".
5. Point `evidenceUrl` at the governing document the review relied on, and
   update the quotes and dates in this section.
6. Get the change reviewed, merge it and deploy it before `expiresAtMs`.

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
Our reminders (see Reminders) cover only our own records, the terms review and
the console check, and a billing code the provider returns; they say nothing
about how much free quota is left. The quota each model has left, and the date
it ends, are on the consoles' free quota pages.

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

On `/operator#quota`, under Record a console check, the panel lists every model
a record can name, with its model id, category and the date its free quota
ends. Compare it with the consoles, then choose Every model listed here, which
ticks them all, or Only the models I select. Choosing a selection after every
model starts from all of them ticked, so leaving one out is one untick. Tick the
confirmation and press Record console check. The dialog names what the record
asserts; confirm it.

A record names the models it covers, never "every model from now on". Every
model listed here sends the keys of the models the panel lists, an API caller's
`"all"` is stored as the models the inventory can serve at that moment, and a
key sent more than once is stored once. A model added to the inventory later is
therefore off until a check names it: after any change that adds models to
`apps/web/config/free-pools.json`, turn their switch on and record a new console
check. The panel's Models covered line counts the listed models the current
record leaves out.

- The server stamps the record with its own clock: the panel sends `"now"`,
  never the browser's time. An API caller may send `checkedAtMs` instead, within
  an hour of the check and never later than the server clock.
- The panel holds the record to the same hour: the confirmation tick lapses an
  hour after it was ticked, by the server's clock. A lapsed tick unticks itself
  and says why, and a dialog confirmed after the hour records nothing. Look at
  the consoles again and tick it anew.
- The record is bound to the hash of the current `QWEN_API_KEY`. Rotating the
  key turns every free model off until a check is recorded for the new key.
- A record newer than an account billing signal clears that signal, unless the
  signal's record cannot be read (see Billing signal).
- Each record writes `admin_policy_changed` audit events for
  `free_quota_attestation` under the admin who made it, one for every 25
  offering keys, the most list entries an audit event keeps
  (`AUDIT_DETAIL_ARRAY_LIMIT` in `apps/web/lib/audit-detail-limits.ts`). Each
  event carries the check time as its resource id, the total as `count` and its
  share of the keys as `scopes`, so the audit log still names every model a
  record covered after the next check replaces it in the shared store.

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

| Reason                                                   | When                                                                  | Severity |
| -------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| terms review runs out soon                               | inside `termsReviewReminderLeadMs` (14 days) of its expiry            | warning  |
| terms review ran out                                     | at `expiresAtMs`                                                      | critical |
| console check runs out soon                              | inside `attestationReminderLeadMs` (3 days) of the end of its 30 days | warning  |
| console check ran out                                    | at the end of its 30 days                                             | critical |
| no console check is recorded while the review is current | once a day until a check is recorded                                  | critical |
| the key changed after the console check                  | the first run after the rotation                                      | critical |
| the provider reported an account billing code            | the first run after the signal                                        | critical |
| a billing signal record cannot be read                   | once a day until the record is removed                                | critical |

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

A production run that finds the inventory in place but the shared store or
`QWEN_API_KEY` missing cannot read the gates, so it sends no reminder. Every free
quota model is off then, so it logs `free_quota_renewal_unconfigured` at error
level and answers HTTP 500, every hour until both are back. A deployment without
the inventory has free quota models off on purpose, and a preview or local
deployment may lack them, so those answer 200.

## What users see when a gate lapses

- A Free Auto turn is answered by the free router. Nothing tells the reader the
  lane was skipped.
- The model picker marks every free quota model "Not available right now"
  (`apps/web/features/models/lib/free-quota-types.ts`).
- A message sent to one picked by name is refused before any provider request
  with HTTP 503,
  code `free_quota_unavailable`, and "{model} from {issuer} is not available
  right now. Choose {alternative} or another free model, then send your message
  again." (`apps/web/features/models/lib/free-quota-copy.ts`, applied in
  `apps/web/app/api/models/free-quota/completions/route.ts`).
- Nothing is charged: no request reaches the provider while a gate is lapsed.

Recording the missing gate brings every model back at once; the panel's
"Serving now" count shows it.

## Limited free image and video offer

The owner decided on 2026-10-04 to let accounts whose plan has no paid image or
video generation use the free quota image and video offerings for as long as
that free capacity lasts. The offer widens who may use those offerings and
changes nothing about what may serve: the terms review, the console check, each
offering's allowance and expiry, the billing signal and the provider holds apply
to these requests exactly as to any other. An account admitted by the offer is
only ever sent to a free quota offering, never to the paid image or video
routes.

### What turns it on and off

The `limitedMediaOffer` block in `apps/web/config/free-pools.json`, beside the
inventory, holds one daily cap per account for each kind:
`dailyCapPerUser.image` and `dailyCapPerUser.video`, 10 and 5 since 2026-10-07.

- A cap above zero turns the offer on for that kind. A cap of 0 turns that kind
  off, and removing the block turns both off. Each is a change to the file and a
  deploy; `LimitedMediaOfferSchema` in `apps/web/lib/server/free-pools.ts`
  refuses a negative, fractional, missing or misnamed cap at load.
- With it off every plan is back on the plan rule: free quota images for plans
  that include image generation, free quota video for plans that include video
  generation. `freeQuotaPlanAdmission` in
  `apps/web/lib/server/free-quota-catalogue.ts` is the one place that decides
  it, for the picker and for the request.
- Only managed cloud plans are admitted: Free, and paid plans that lack the
  capability, so no paid plan has less than Free. Local-only and BYOK accounts
  are not admitted, and free quota chat stays with the Free plan.
- No switch stops this offer alone without a deploy. The stop that needs no
  deploy is a console check recorded with Only the models I select and the
  image or video models unticked (see Recording it): a model the record leaves
  out is off at once for every plan, and plans that include the capability keep
  their paid image and video generation. Whatever stops every free quota model
  stops the offer too. The operator switches for paid image and video
  generation (`canUseImages`, `canUseVideoGeneration`) do not reach free quota
  requests.

### The daily cap

- It is counted per account, per kind and per UTC day in the shared state store,
  under `agi-fquota:daily:<kind>:<account hash>:<date>`, and the count expires
  on its own once the day has passed.
- One request counts as one, whichever model serves it: one image or one video,
  never its seconds. A video still takes its clip length in seconds (the
  offering's `quotaVideoSeconds` in the model catalogue: 5, or 3 for the
  HappyHorse offerings) from that offering's allowance, or the seconds the
  provider reports when its answer states them, rounded up. A report above the
  clip length is settled as reported and logged as a warning that names the
  offering and both figures, since it means the catalogue entry is too short.
- An image offering takes one image from its allowance whether the provider
  answers at once or through a task that is polled.
- An offering whose allowance has less than one request left, one image or one
  clip, counts as spent and is refused before any provider request.
- `serveFreeQuotaTurn` in `apps/web/lib/server/free-quota-turn.ts` takes the
  count after every gate has passed and before the provider request.
- The count is given back when no provider request starts; when the provider
  answers that the offering itself is spent, withdrawn or refused, an answer
  that places a hold while the account is offered another model; and when the
  provider answers that it is too busy to start, the refusal that tells the
  user to wait a moment and send again.
- The count is kept when the provider was asked and failed for that turn only,
  or when the outcome is unknown (a timeout or an interrupted status check), so
  a failing prompt cannot be repeated without limit, and each such failure
  uses one of that account's free requests for the day.
- A media task the provider accepted is never settled as failed because a status
  poll was refused (429, 5xx or an error body): polling continues to its limit
  and the turn ends as interrupted with the reservation kept.
- That limit is `quotaExperimentPolicy.maxPolls` waits of `pollIntervalMs`.
  Together with the submit timeout (`requestTimeoutMs`) it has to stay under
  the time the completions route is allowed (`maxDuration` in
  `apps/web/app/api/models/free-quota/completions/route.ts`), with time left to
  download, check and store the result: a request the platform cuts off settles
  nothing, so the reservation and the day's count stand and the user gets no
  answer.
- At the cap the request is refused before any provider request with HTTP 429
  and code `free_quota_daily_limit`. The message states the cap, the reset at
  the next UTC midnight and that plans with the capability are not held to it;
  the card offers the first plan that includes the capability.
- Plans that include the capability are neither counted nor capped.
- The cap is per account, so many new accounts can still drain a pool together.
  The ceiling on spend is each offering's shared allowance
  (`quotaExperimentPolicy.allowanceUsablePercent`): reaching it ends the offer
  early and costs nothing.

### What users see

- In the chat composer's plus menu, Create image and Create video say Limited
  with a clock where they said Upgrade, with one line under the row: "Free while
  our free capacity lasts, until {day} (UTC) at the latest." Once today's share
  is used the line says so, with the time to the reset.
- The day in that line is the last UTC day on which an offering of that kind is
  still served in full: the day before the latest end date among the ready
  offerings, because `decideFreeQuotaOffering` refuses an offering from 00:00
  UTC on its end date. `readyFreeMediaOffer` in
  `apps/web/features/models/lib/free-media-offer.ts` is the one place that
  derives it and `freeMediaLastDayLabel` the one place that prints it, with the
  zone named, for the composer, the picker and the pricing page. An offering
  the provider retires partway through a day (`retiresAt`) is served into that
  day, so when such an offering is the latest to end, the line understates by
  less than a day and names the day before even on that last partial day. It
  never overstates.
- Choosing either, or typing a request for an image, uses the ready offering
  whose allowance ends soonest, the one with most allowance left on a tie
  (`freeQuotaMediaUseOrder`), so capacity that is about to expire goes first.
- A typed image request reads the account's catalogue before it is sent
  (`apps/web/features/chat/lib/free-media-choice.ts`). If that read fails, or
  the chat on screen changed while it ran, the text is handed back to the
  message box with a notice and nothing is sent; only an answer that the
  account is offered no free image leads to the plan's own answer.
- The free image and video models are listed in the model picker's Free section
  with the same mark.
- The pricing page says "Limited preview" in the image and video columns for
  plans without the capability, with one line under its heading and one on the
  Free plan card. It reads
  `apps/web/app/api/models/free-quota/media-offer/route.ts`, which is public,
  cached for a minute and answers only which kind is running and that last day.
- The home page hero pill reads "Limited" and "Free image and video" (or the one
  kind that is ready) and links to the pricing page while a kind is ready. It
  reads the same catalogue entry as the pricing endpoint through
  `apps/web/lib/server/free-media-offer-reader.ts`, waits at most half a second
  for it, and shows the usual pill when the offer is over or cannot be read.

### What ends it

A spent pool ends the offer by itself. Once no free quota offering of a kind is
ready, because its allowances are used, its offers have expired, a gate has
lapsed or a billing signal stands, the catalogue stops listing the offer within
about a minute and the pricing page goes back to Yes and No within about two,
with no change to the configuration: the catalogue is decided once a minute and
the public answer is cached for another.

A provider hold or a billing signal does not wait for that minute. The request
that records one expires the cached catalogue (`expireFreeQuotaCatalogue` in
`apps/web/lib/server/free-quota-catalogue-cache.ts`), so the next read of the
picker no longer lists the model as ready. When the provider's answer arrives
inside a chat reply that is already streaming, the expiry runs once that
response has closed and the turn has settled, which also covers a reader who
disconnects before the hold is written. An allowance used up by the meter
alone, with no provider answer, still takes up to the minute.

The two holds that no console check lifts, a spent allowance and a billing
refusal of one model, are placed only on what the provider states in a code
field or an HTTP status: its free tier code (`AllocationQuota.FreeTierOnly`),
`Throttling.AllocationQuota` or `insufficient_quota` together with the exact
sentence it documents for a spent free allocation, a hard billing limit code,
or HTTP 402. The account billing signal is placed on an account billing code
only. Wording alone places none of them, since an error message can quote the
request: a 429 that only mentions quota or billing is answered as busy, and no
answer that only mentions them takes the model off offer
(`classifyFreeQuotaRefusal` in `apps/web/lib/free-quota-authorization.ts`, over
`classifyModelStudioError` in `packages/ai/provider-runtime/src/errors.ts`).

A composer already on screen keeps the label it last read. It reads the
catalogue again when the plus menu or the model picker is opened, not on a
timer, so a Limited label can outlast the offer until then. What holds in that
window is the refusal at send time: a spent or expired allowance refuses the
request with the reason before it reaches the provider, so nothing is charged.
