# AI plan storage and usage limits

Status: Current
Owner: Product + Billing
Checked: 2026-11-07

This is a review of official documentation, not a hands-on product test. A limit
not published in the inspected pages is unknown, not unlimited. App subscriptions,
API quotas, file storage, transfer volumes and model context are distinct products
and measurements.

| Product | Observed documentation                                                                                                                                                                                                                                                                                        | Scope and limits of the comparison                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT | Library storage is up to 500 MB on Free, 4 GB on Go, 20 GB on Plus/Business and 100 GB on Pro. The upload guide separately documents file-size, upload-rate and shared upload-storage caps.                                                                                                                   | Library storage is separate from attachment/chat limits. Do not substitute an upload-storage figure for the Library allowance. No aggregate monthly download-volume entitlement was specified in the inspected Library page. [Library](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt), [uploads](https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt). |
| Claude  | The upload guide lists 500 MB per chat file and up to 20 files per chat. Project files have a 30 MB per-file limit, with file count constrained by available context rather than a published aggregate GB allowance. A separate file-creation guide states a 30 MB upload/download limit for that workflow.   | These are different workflows. An unlimited project file count is not unlimited storage or unlimited AI usage. No aggregate monthly download-volume entitlement was specified in these pages. [Uploads](https://support.claude.com/en/articles/8241126-upload-files-to-claude), [file creation](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude).                                         |
| Grok    | The consumer-app FAQ describes one paid weekly usage pool shared across Grok products. It lists a 150 MB limit for most uploaded files, with platform/subscription variation, and explains how to delete assets to free storage.                                                                              | The inspected FAQ does not quantify a universal per-plan storage allowance or aggregate monthly download-volume entitlement. The separate Grok Bot documentation describes a different product and is not used as the consumer chat allowance. [Consumer FAQ](https://docs.x.ai/grok/faq).                                                                                                                                  |
| Gemini  | The file guide allows up to 10 files per prompt, generally up to 100 MB per supported non-video file, with separate video limits. It explicitly separates Gemini Apps activity storage from Drive/Workspace storage. Google One describes 20 TB or 30 TB bundled storage depending on the Ultra subscription. | Bundled Google One storage is not the Gemini Apps activity-storage allowance. The inspected upload guide does not publish a universal numeric app-storage or aggregate monthly download-volume entitlement. [Gemini files](https://support.google.com/gemini/answer/14903178?hl=en), [Ultra benefits](https://support.google.com/googleone/answer/16286513?hl=en).                                                          |

The evidence supports keeping clearly stated storage and file constraints separate
from AI usage allowances. It does not support claiming that any of these products
has unlimited monthly downloads merely because a transfer quota is not listed.
Grok's documented weekly pool is a relevant example of a shared usage budget,
not evidence that all operational or file constraints disappear.

## Founder decisions for the local AGI implementation

### Pricing-card language

The current [ChatGPT](https://chatgpt.com/pricing/) page uses short qualitative
access levels, [Claude](https://claude.com/pricing) combines relative usage wording
with limit footnotes, [Google AI plans](https://one.google.com/about/google-ai-plans/)
uses graded access levels, and [Perplexity's plan guide](https://www.perplexity.ai/help-center/en/articles/11187416-which-perplexity-subscription-plan-is-right-for-you)
distinguishes average, advanced, extended and highest usage categories.
These pages mix descriptive wording with numbers; their entitlements are not
interchangeable with AGI's.

The founder selected descriptive quota wording for AGI's cards, with prices and
billing controls retained. Exact capacity values remain in the comparison table;
Premium-seat usage details remain outside the cards. The summary presentation is
separate from detailed billing copy, so this copy edit changes no enforced quota.

The approved display ladder is Free, Basic, Premium, Max and Ultra. Stored billing
identifiers, price mappings and prices remain unchanged. Individual and business
views have their own plan cards and comparison columns.

Ultra keeps its existing weekly and monthly AI allowances and removes only its
five-hour plan ceiling. Its feature statements carry an asterisk explaining that
other allowances and feature-specific limits remain. No broader claim of unlimited
usage is made.

Approved enforced changes are Max knowledge storage of 50 GB, Ultra knowledge storage
of 100 GB, individual paid-tier concurrency of 1/3/5/10 and monthly downloads of
1/3/15/30 GB for Basic/Premium/Max/Ultra respectively. Team standard-seat concurrency
follows Premium. The implementation uses the repository's existing byte-unit
convention; the numeric owners are the billing catalog, not this dated record.

Other caps were not removed without a specific replacement policy. No files were
deleted, no live subscriptions were changed and no production deployment was made
as part of this local work. Live provider-hosted checkout/invoice branding has not
been inspected or changed. The local verification record is in
`audit/baselines/seo-content-2026-11-07.json`.
