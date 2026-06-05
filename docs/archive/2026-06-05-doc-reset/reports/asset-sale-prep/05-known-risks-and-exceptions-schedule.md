# Known Risks And Exceptions Schedule

Status: Draft
Owner: Founder
Created: 2026-05-31

## Purpose

This schedule lets the founder disclose known issues proactively. Buyers usually trust a clear risk schedule more than vague claims of completeness.

## Technical Exceptions

| ID | Severity | Area | Status | Disclosure |
| --- | --- | --- | --- | --- |
| TECH-01 | High | Mobile tests | Open | `pnpm test` currently fails in Mobile with 4 failed suites / 33 failed tests. |
| TECH-02 | Medium | Product completeness | Open | Current docs mark many parity areas partial/gated; do not claim full ChatGPT/Claude parity. |
| TECH-03 | Medium | Managed cloud | Gated | Managed cloud is waitlist/private beta until metering, billing, abuse, fraud, retention, deletion, and provider terms are proven. |
| TECH-04 | Medium | Launch state | Open | No confirmed public App Store / Play Store release evidence in current diligence package. |
| TECH-05 | Medium | Visual parity evidence | Open | Some visual verification docs may be historical and should be re-run before claiming current UI readiness. |

## Commercial Exceptions

| ID | Severity | Area | Status | Disclosure |
| --- | --- | --- | --- | --- |
| COMM-01 | High | Users | Open | Founder currently reports no users and no traction. |
| COMM-02 | High | Revenue | Open | No revenue or ARR evidence. |
| COMM-03 | Medium | Paid demand | Planned | Paid waitlist validation may be run; raw signups should not be represented as revenue or active users. |
| COMM-04 | Medium | Buyer dependency | Open | Strategic value depends on buyer fit and integration priorities. |

## Legal/IP Exceptions

| ID | Severity | Area | Status | Disclosure |
| --- | --- | --- | --- | --- |
| IP-01 | High | AI-assisted development | Open | Founder used LLM-assisted development; counsel should review assignment/provenance terms. |
| IP-02 | High | Reference archives | Open | Repo includes competitive reference/audit material that must be separated from owned sale assets. |
| IP-03 | Medium | Open-source adapted code | Disclosed | `THIRD_PARTY_LICENSES.md` lists OpenClaw/MIT adapted code; license scan should be refreshed. |
| IP-04 | Medium | Brand | Open | `AGI` / `AGI Workforce` trademark clearance and transferability need legal review. |
| IP-05 | Medium | Entity assignment | Open | Confirm founder/entity ownership and IP assignment before signing definitive docs. |

## Remediation Plan Before Outreach

1. Fix mobile test failures or document intentional de-scoping.
2. Re-run and save verification logs.
3. Create clean demo videos.
4. Create data-room copy with reference archives excluded.
5. Refresh third-party license disclosure.
6. Run paid demand validation only with qualified-signup metrics.
7. Have counsel review NDA/LOI/APA documents.

## Disclosure Principle

Do not hide known issues. State them with remediation status and buyer relevance. The current repo's honesty about partial/gated product status is a diligence strength if presented clearly.
