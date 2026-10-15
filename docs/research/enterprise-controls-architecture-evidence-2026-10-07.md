# Enterprise controls: architecture planning evidence

Status: Dated official-source evidence; product UI not observed
Owner: Product + enterprise/platform lead
Last updated: 2026-10-07

These sources were refreshed on October 7, 2026 for enterprise architecture
planning. Evidence is documented behavior, not direct observation of an authorized
competitor workspace. The Claude page displays September 1, 2026. The OpenAI
pages displayed relative updates of two and three days when read on October 7;
original publication and event dates were not established. The date above is
verification date. Plan/account/region and
feature eligibility must be rechecked before an integration or sales claim.

| Source                                                                                                                                | Documented scope and constraints                                                                                                                        | Implication for AGI Workforce                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [OpenAI Enterprise admin quickstart](https://help.openai.com/en/articles/20001264-chatgpt-enterprise-admin-quickstart)                | Eligible Enterprise administration: identity provisioning, groups/roles, surface access, connectors, security and spend controls                        | Qualify onboarding and organization authority before broad employee access; each surface consumes enforced scope      |
| [OpenAI data and inference residency](https://help.openai.com/en/articles/9903489-data-residency-and-inference-residency-for-chatgpt) | Distinguishes storage, GPU inference, other processing and external integrations; eligibility and unsupported features limit coverage                   | Build a per-store/per-route residency matrix; a regional model preference is not an end-to-end residency guarantee    |
| [Claude Enterprise plan](https://support.claude.com/en/articles/9797531-what-is-the-enterprise-plan)                                  | Documents Enterprise audit, SCIM, retention, compliance/analytics interfaces, customer-managed keys and spend controls under applicable plan conditions | Treat enterprise controls as separately qualified features; do not copy plan-specific billing into AGI's architecture |

The recommendations are engineering inferences from documented control
boundaries, combined with current AGI source inspection. No private vendor
stack, universal rollout, AGI compliance status, certification, capacity or
availability is established by these sources.
