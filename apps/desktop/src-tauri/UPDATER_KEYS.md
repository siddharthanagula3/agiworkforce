# Tauri Updater Signing Keys

This document describes how to generate and manage the signing keys for the Tauri auto-updater.

## Overview

The Tauri updater uses Ed25519 signatures to verify update integrity. This requires:
- A **public key** embedded in the application (in `tauri.conf.json`)
- A **private key** stored securely and used during the build/release process

## Key Generation

### Generate a New Key Pair

Run the following command to generate a new key pair:

```bash
# Install tauri-cli if not already installed
cargo install tauri-cli

# Generate new signing keys
cargo tauri signer generate -w ~/.tauri/myapp.key
```

This will:
1. Create a private key at `~/.tauri/myapp.key`
2. Create a public key at `~/.tauri/myapp.key.pub`
3. Display the public key in base64 format

### Alternatively Using npx

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/myapp.key
```

## Key Storage

### Public Key

The public key is stored in `tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "RWQahuITpry6oPekJf8JP5xSoAxMiUVUohL85U3V/vq1wVfLYzejJZCM"
    }
  }
}
```

This key is embedded in the application binary and is public.

### Private Key (CRITICAL - Keep Secret!)

The private key must be kept secure and should **NEVER** be:
- Committed to version control
- Shared in plain text
- Stored on developer machines in production

#### Recommended Storage: GitHub Secrets

1. Go to your GitHub repository
2. Navigate to Settings > Secrets and variables > Actions
3. Create a new repository secret named `TAURI_SIGNING_PRIVATE_KEY`
4. Paste the contents of your private key file

#### Optional: Key Password

If you generated the key with a password, also add:
- Secret name: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Value: Your key password

## CI/CD Configuration

### GitHub Actions Example

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ${{ matrix.platform }}
    strategy:
      matrix:
        platform: [macos-latest, windows-latest, ubuntu-20.04]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Setup Rust
        uses: dtolnay/rust-action@stable

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Install dependencies
        run: pnpm install

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'AGI Workforce v__VERSION__'
          releaseBody: 'See the changelog for what changed in this release.'
          releaseDraft: true
          prerelease: false
```

## Update Endpoint Configuration

The updater checks for updates at the configured endpoint. The current configuration:

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://agiworkforce.com/api/releases/{{target}}/{{arch}}/{{current_version}}"
      ]
    }
  }
}
```

### Endpoint Response Format

The endpoint must return JSON in the following format:

```json
{
  "version": "1.2.0",
  "notes": "Bug fixes and improvements",
  "pub_date": "2024-01-15T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "Content of .sig file",
      "url": "https://example.com/AGI.Workforce_1.2.0_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "Content of .sig file",
      "url": "https://example.com/AGI.Workforce_1.2.0_x64.app.tar.gz"
    },
    "linux-x86_64": {
      "signature": "Content of .sig file",
      "url": "https://example.com/AGI.Workforce_1.2.0_amd64.AppImage.tar.gz"
    },
    "windows-x86_64": {
      "signature": "Content of .sig file",
      "url": "https://example.com/AGI.Workforce_1.2.0_x64-setup.nsis.zip"
    }
  }
}
```

### Target/Arch Values

| Platform | Target | Arch |
|----------|--------|------|
| macOS (Intel) | darwin | x86_64 |
| macOS (Apple Silicon) | darwin | aarch64 |
| Windows | windows | x86_64 |
| Linux | linux | x86_64 |

## Signing Release Artifacts

During the build process, Tauri automatically:
1. Creates the update artifact (`.tar.gz` for macOS/Linux, `.zip` for Windows)
2. Signs it using the private key
3. Creates a `.sig` file with the signature

The `.sig` file contents should be included in the update manifest response.

## Rotating Keys

If you need to rotate keys (e.g., if the private key is compromised):

1. Generate a new key pair
2. Update `tauri.conf.json` with the new public key
3. Update GitHub Secrets with the new private key
4. Release a new version with the new public key
5. Users on old versions will need to manually download the new version

**Note:** Key rotation requires users to manually update once, as the old public key cannot verify signatures from the new private key.

## Troubleshooting

### Signature Verification Failed

- Ensure the private key matches the public key in `tauri.conf.json`
- Check that the `.sig` file content in the manifest is correct
- Verify the update artifact was not modified after signing

### Update Check Returns 404

- Verify the endpoint URL is correct
- Check that the target/arch/version in the URL template match your server

### Permission Denied During Install

- On macOS: Ensure the app is code-signed with a valid Developer ID
- On Windows: Ensure the installer is code-signed (optional but recommended)

## Security Best Practices

1. **Never expose the private key** - treat it like a password
2. **Use environment variables** in CI/CD, not hardcoded values
3. **Audit access** to GitHub Secrets regularly
4. **Monitor releases** for unauthorized updates
5. **Consider key rotation** periodically (annually recommended)

## Current Key Information

- **Public Key:** `RWQahuITpry6oPekJf8JP5xSoAxMiUVUohL85U3V/vq1wVfLYzejJZCM`
- **Algorithm:** Ed25519
- **Key Location:** GitHub Secrets (`TAURI_SIGNING_PRIVATE_KEY`)
