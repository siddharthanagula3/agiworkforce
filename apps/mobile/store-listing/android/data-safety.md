# Google Play Data Safety — AGI Mobile Draft

Status: Current draft, not submission-locked
Last updated: 2026-06-05

Current Mobile posture: default Local Mode does not require an account and should not collect cloud account data. Cloud Managed features are invite/waitlist gated and become data-sharing paths only after access is enabled and the user explicitly enters that mode.

## Data Collection

| Data Type        | Default Local Mode                                  | Cloud Managed Invite/Account Path                                                  |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Name             | Not collected                                       | Optional for account management                                                    |
| Email address    | Not collected                                       | Collected for invite/waitlist, login, support, and account management              |
| User ID          | Not collected                                       | Generated for account/session management                                           |
| In-app messages  | Stored locally                                      | Synced only if Cloud Managed chat is enabled                                       |
| Photos/files     | Local attachment cache only                         | Sent only when the user explicitly attaches and sends through a cloud-enabled chat |
| Voice audio      | Transcribed locally where supported, then discarded | Cloud transcription must remain gated and disclosed if enabled                     |
| App interactions | Off by default                                      | Optional analytics only after explicit opt-in                                      |

## Data Sharing

- Local Mode should not share chat content with AGI Cloud or third-party AI providers.
- Cloud Managed chat may share prompt content, attachments, and tool context with AGI Cloud and its configured AI providers after user access and consent.
- AGI does not sell personal data, share with ad networks, or use cross-app tracking.

## Security Practices

| Question                               | Draft Answer                        |
| -------------------------------------- | ----------------------------------- |
| Data encrypted in transit              | Yes, for Cloud Managed paths        |
| Users can request deletion             | Yes, for Cloud Managed account data |
| Independent security review            | Pending                             |
| Encryption at rest for cloud-side data | Required before public cloud launch |

## Notes

- Reverify every Play Console answer against the shipped binary before submission.
- Do not describe unavailable direct provider-key flows in the store form.
