# `apps/mobile/secrets/`

Local-only directory for release credentials referenced by `eas.json`.
Nothing in here is committed (`.gitignore` allows only this README + `.gitkeep`).

## Expected files (founder fills in)

| File                               | Source                                                      | Used by                         |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| `asc-api-key.p8`                   | App Store Connect → Users and Access → Integrations → Keys  | `eas submit --platform ios`     |
| `google-play-service-account.json` | Google Cloud Console → IAM → Service Accounts → Keys (JSON) | `eas submit --platform android` |

For EAS environments, store secret copies with the current environment-variable command:

```bash
eas env:create preview --scope project --name ASC_API_KEY_P8 --type file --visibility secret --value ./secrets/asc-api-key.p8
eas env:create preview --scope project --name PLAY_SERVICE_ACCOUNT --type file --visibility secret --value ./secrets/google-play-service-account.json
```

The checked-in submit profiles currently reference these local files. Do not delete the local
copies until the profiles explicitly use the corresponding file-variable paths and that path has
been verified in a non-production submission.
See `apps/mobile/scripts/release/README.md` for the full founder action checklist.
