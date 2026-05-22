# EAS iOS Production Signing Runbook

`eas.json` production profile uses `credentialsSource: "remote"` — EAS manages the signing
artifacts. Follow these four steps once per machine / certificate rotation.

## Prerequisites

- Active Apple Developer Program membership (Bundle ID: `com.agiworkforce.app`)
- `eas-cli` installed: `npm install -g eas-cli`
- Logged in: `eas login`

## Steps

### 1. Open credentials manager

```bash
eas credentials
```

Select **iOS** when prompted for platform.

### 2. Select the production profile

Choose **production** from the profile list. EAS will display any existing certificates and
provisioning profiles stored remotely.

### 3. Upload certificate and provisioning profile

Two paths:

**a) Let EAS generate / auto-provision (recommended for new setups)**

Select "Set up a new distribution certificate" and follow the prompts. EAS logs into your Apple
Developer account (via App Store Connect API key or interactive login) and creates a Distribution
Certificate + App Store provisioning profile automatically.

**b) Upload an existing certificate (BYO)**

Select "Use an existing distribution certificate", then provide:

- `.p12` certificate file path
- Certificate password

Then select "Use an existing provisioning profile" and provide the `.mobileprovision` file.

### 4. Verify a production build succeeds

```bash
eas build --platform ios --profile production
```

Watch for `BUILD SUCCESSFUL` and confirm the archive is signed with the Distribution certificate
(visible in the EAS dashboard build log under "Signing").

## Rotation

Certificates expire after 12 months. Repeat steps 1–4 before expiry. EAS sends an email warning
30 days in advance when managing credentials remotely.

## TODO for remaining surfaces

All other screens in `apps/mobile/` still use hard-coded dark-mode Tailwind classes
(`bg-surface-base`, `text-white`, etc.). The `useThemeColors()` hook in
`hooks/useTheme.ts` is the migration target — import it and replace hard-coded color tokens.
Screens not yet migrated (non-exhaustive):

- `app/(app)/chat/[id].tsx`
- `app/(app)/profile.tsx`
- `app/(app)/usage.tsx`
- `app/(app)/settings/notifications.tsx`
- `app/(app)/settings/capabilities.tsx`
- `app/(auth)/login.tsx`
- `app/(public)/onboarding.tsx`
