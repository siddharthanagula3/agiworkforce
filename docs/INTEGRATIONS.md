# Integrations Guide

This document covers how to connect email, calendar, and cloud storage integrations in AGI Workforce. All three are fully implemented — they require user authentication but are not stubs.

---

## Email Integration

Email is implemented via IMAP (receiving) and SMTP (sending) using real protocol clients in `apps/desktop/src-tauri/src/features/communications/`.

### Tauri Command: `email_connect`

**Signature (from `sys/commands/email.rs`):**

```typescript
invoke('email_connect', {
  provider: string, // "gmail" | "outlook" | "hotmail" | "yahoo" | or any custom
  email: string, // Full email address, e.g. "user@gmail.com"
  password: string, // App password or IMAP password
  displayName: string | null,
  customConfig: EmailProvider | null, // Override server settings (see below)
});
// Returns: EmailAccount
```

**Built-in providers** (auto-configured server settings):

| Provider key              | IMAP host             | IMAP port | SMTP host           | SMTP port |
| ------------------------- | --------------------- | --------- | ------------------- | --------- |
| `"gmail"`                 | imap.gmail.com        | 993 (TLS) | smtp.gmail.com      | 587 (TLS) |
| `"outlook"` / `"hotmail"` | outlook.office365.com | 993 (TLS) | smtp.office365.com  | 587 (TLS) |
| `"yahoo"`                 | imap.mail.yahoo.com   | 993 (TLS) | smtp.mail.yahoo.com | 587 (TLS) |

For any other provider, pass `customConfig` with these fields:

```typescript
{
  name: string,
  imap_host: string,
  imap_port: number,
  imap_use_tls: boolean,
  smtp_host: string,
  smtp_port: number,
  smtp_use_tls: boolean,
}
```

### What `email_connect` does

1. Looks up server settings for the named provider (or uses `customConfig`).
2. Opens a real IMAP connection, authenticates, lists folders, then logs out — this verifies the credentials work before saving anything.
3. Creates an SMTP client and verifies connectivity.
4. Persists the account to the local SQLite database (`email_accounts` table).
5. Stores the password securely:
   - **Primary**: OS keyring (macOS Keychain, Windows Credential Manager, Linux Secret Service via D-Bus).
   - **Fallback**: AES-256-GCM encryption derived from the machine key, stored in the `password_encrypted` column.
   - Existing accounts with legacy Base64 passwords are automatically migrated to the secure format on next access.

### Other email commands

| Command                | Parameters                       | Description                                          |
| ---------------------- | -------------------------------- | ---------------------------------------------------- |
| `email_list_accounts`  | —                                | List all connected accounts                          |
| `email_remove_account` | `account_id: number`             | Disconnect and delete account; removes keyring entry |
| `email_list_folders`   | `account_id: number`             | List IMAP folders for an account                     |
| `email_list_emails`    | `account_id`, `folder`, `filter` | Fetch email headers                                  |
| `email_get_email`      | `account_id`, `email_id`         | Fetch full email with body                           |
| `email_send`           | `account_id`, `SendEmailRequest` | Send via SMTP                                        |
| `email_search`         | `account_id`, `query`            | Full-text IMAP search                                |

### Gmail setup note

Gmail requires an **App Password**, not your regular Google account password, when 2-Factor Authentication is enabled. Generate one at: Google Account > Security > 2-Step Verification > App passwords. The `email_connect` IMAP authentication will reject your regular password if 2FA is active.

---

## Calendar Integration

Calendar is implemented via OAuth 2.0 with PKCE for Google Calendar and Microsoft Outlook Calendar. The implementation lives in `apps/desktop/src-tauri/src/features/calendar/`.

### Supported providers

- `"google"` — Google Calendar (OAuth 2.0 + PKCE via accounts.google.com)
- `"outlook"` — Microsoft Outlook Calendar (OAuth 2.0 via login.microsoftonline.com)

### OAuth flow: two-step

**Step 1 — Start OAuth:** `calendar_connect`

```typescript
invoke('calendar_connect', {
  config: {
    provider: 'google' | 'outlook',
    client_id: string, // Your OAuth app client ID
    client_secret: string, // Your OAuth app client secret
    redirect_uri: string, // Must match your OAuth app registration
  },
});
// Returns: { auth_url: string, state: string }
```

This generates an authorization URL with a PKCE challenge. Open `auth_url` in a browser. The backend emits a `calendar:auth_started` Tauri event.

**Step 2 — Complete OAuth:** `calendar_complete_oauth`

```typescript
invoke('calendar_complete_oauth', {
  request: {
    state: string, // The `state` value returned by calendar_connect
    code: string, // The authorization code from the OAuth redirect
  },
});
// Returns: { account_id: string }
```

This exchanges the code + PKCE verifier for tokens, fetches the primary calendar to populate display name and email, saves the account to SQLite, and emits a `calendar:connected` Tauri event.

### What gets stored

The account is persisted in the local SQLite database with the access token and refresh token encrypted using `machine_key::derive_key(KeyPurpose::CalendarTokens)` (HKDF-SHA256 from machine ID). Token refresh is handled automatically by the calendar client on each API call.

### Other calendar commands

| Command                  | Parameters                                     | Description                  |
| ------------------------ | ---------------------------------------------- | ---------------------------- |
| `calendar_disconnect`    | `account_id: string`                           | Remove account and tokens    |
| `calendar_list_accounts` | —                                              | List all connected accounts  |
| `calendar_list_events`   | `account_id`, `ListEventsRequest`              | Fetch events in a date range |
| `calendar_create_event`  | `account_id`, `CreateEventRequest`             | Create a new event           |
| `calendar_update_event`  | `account_id`, `event_id`, `UpdateEventRequest` | Update an existing event     |
| `calendar_delete_event`  | `account_id`, `event_id`                       | Delete an event              |

### Setting up OAuth credentials

**Google Calendar:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/) > APIs & Services > Credentials.
2. Create an OAuth 2.0 Client ID (Desktop app type).
3. Enable the Google Calendar API for your project.
4. Use `client_id` and `client_secret` from the downloaded JSON.
5. Set `redirect_uri` to `http://localhost` or a custom URI scheme registered in your app.

**Outlook Calendar:**

1. Go to [Azure Portal](https://portal.azure.com/) > App registrations > New registration.
2. Add a redirect URI under "Mobile and desktop applications".
3. Under "API permissions", add `Calendars.ReadWrite` (Microsoft Graph).
4. Use the Application (client) ID as `client_id` and generate a client secret.

---

## Cloud Storage Integration

Cloud storage is fully implemented in `apps/desktop/src-tauri/src/integrations/cloud/` with real OAuth clients for three providers.

### Supported providers

| Provider key     | Service            | Client file       |
| ---------------- | ------------------ | ----------------- |
| `"google_drive"` | Google Drive       | `google_drive.rs` |
| `"dropbox"`      | Dropbox            | `dropbox.rs`      |
| `"one_drive"`    | Microsoft OneDrive | `one_drive.rs`    |

### OAuth flow: two-step (same pattern as Calendar)

**Step 1:** `cloud_connect`

```typescript
invoke('cloud_connect', {
  config: {
    provider: 'google_drive' | 'dropbox' | 'one_drive',
    client_id: string,
    client_secret: string | null, // Required for Google Drive, Dropbox, OneDrive
    redirect_uri: string,
  },
});
// Returns: { auth_url: string, state: string }
```

**Step 2:** `cloud_complete_oauth`

```typescript
invoke('cloud_complete_oauth', {
  request: {
    state: string,
    code: string,
  },
});
// Returns: { account_id: string }
```

### End-to-end encryption on uploads

All file uploads are encrypted before leaving the machine. The `cloud_upload` command:

1. Derives an encryption key via `machine_key::derive_key(KeyPurpose::CloudEncryption)`.
2. Encrypts the file to a temporary path (AES-256-GCM).
3. Uploads the encrypted file to the cloud provider.
4. Deletes the temporary file after upload (even on failure).

Downloads are the reverse: the file is downloaded to a temp path, decrypted in place, then moved to the destination.

### Other cloud commands

| Command               | Parameters                                | Description              |
| --------------------- | ----------------------------------------- | ------------------------ |
| `cloud_disconnect`    | `account_id: string`                      | Remove account           |
| `cloud_list_accounts` | —                                         | List connected accounts  |
| `cloud_list`          | `CloudListRequest`                        | List files/folders       |
| `cloud_upload`        | `account_id`, `local_path`, `remote_path` | Upload with E2EE         |
| `cloud_download`      | `account_id`, `remote_path`, `local_path` | Download with decryption |
| `cloud_delete`        | `account_id`, `remote_path`               | Delete a remote file     |
| `cloud_share`         | `account_id`, `remote_path`, `allow_edit` | Generate a share link    |

### Important: cloud files are opaque

Because files are encrypted with a machine-specific key before upload, files uploaded by AGI Workforce cannot be read by native cloud apps (Google Drive web, Dropbox app, etc.) — they will appear as binary `.enc` artifacts. This is by design for privacy. Only AGI Workforce on the same machine (with the same machine key) can decrypt them.
