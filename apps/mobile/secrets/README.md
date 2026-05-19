# `apps/mobile/secrets/`

Local-only directory for release credentials referenced by `eas.json`.
Nothing in here is committed (`.gitignore` allows only this README + `.gitkeep`).

## Expected files (founder fills in)

| File                               | Source                                                      | Used by                         |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| `asc-api-key.p8`                   | App Store Connect → Users and Access → Integrations → Keys  | `eas submit --platform ios`     |
| `google-play-service-account.json` | Google Cloud Console → IAM → Service Accounts → Keys (JSON) | `eas submit --platform android` |

For CI/server-side use, prefer storing these as EAS secrets:

```bash
eas secret:create --scope project --name ASC_API_KEY_P8       --type file --value ./secrets/asc-api-key.p8
eas secret:create --scope project --name PLAY_SERVICE_ACCOUNT --type file --value ./secrets/google-play-service-account.json
```

When EAS secrets are configured, the `*KeyPath` entries in `eas.json` can be replaced with EAS-secret refs.
See `apps/mobile/scripts/release/README.md` for the full founder action checklist.
