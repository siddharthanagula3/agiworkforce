# Specification: H9 -- Device Fingerprint Enforcement

Generated: 2026-02-24T23:45:00Z

## Task Overview

The desktop app's device login flow has a security gap: devices registered before fingerprinting was implemented can be polled without any fingerprint check. This task closes that gap by:

1. Generating a stable, deterministic device fingerprint in Rust and including it in both `device_link_initiate` and `device_link_poll` HTTP calls.
2. Updating the web API poll route to backfill fingerprints for legacy sessions and enforce them going forward.
3. Making `device_fingerprint` required in the web validation schema for new link requests.

## Team Composition

- **Agent A (rust-tauri-engineer):** Modifies the Rust Tauri backend to generate and attach a device fingerprint to both device-link and device-poll requests.
- **Agent B (frontend-engineer):** Modifies the web API validation schema and poll route to require/backfill fingerprints.

---

## File Allocation

### Agent A -- rust-tauri-engineer

**Allowed Files (exclusive write access):**

- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src-tauri/src/sys/account/mod.rs`

**Current State of `mod.rs`:**

The file is 577 lines. Key structures and functions:

```rust
// Line 69-74
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceLinkRequest {
    pub device_id: String,
    pub device_name: Option<String>,
    pub device_type: Option<String>,
    // NO device_fingerprint field
}

// Line 85-88
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevicePollRequest {
    pub device_id: String,
    // NO device_fingerprint field
}

// Line 163-197 -- device_link_initiate command
// Serializes `request` directly to JSON body and sends POST to /api/device/link
// Does NOT compute or attach any fingerprint

// Line 199-235 -- device_link_poll command
// Serializes `request` directly to JSON body and sends POST to /api/device/poll
// Does NOT compute or attach any fingerprint
```

**Available crates (already in Cargo.toml, no additions needed):**

- `sha2 = "0.10"` (line 110)
- `hex = "0.4"` (line 116)

Both are already imported elsewhere in the project for key derivation and encoding.

**What Agent A must do:**

1. Add `pub device_fingerprint: Option<String>` to `DeviceLinkRequest` (after `device_type`).
2. Add `pub device_fingerprint: Option<String>` to `DevicePollRequest` (after `device_id`).
3. Add a private helper function:

```rust
/// Generate a stable device fingerprint by hashing the device_id together with
/// machine-stable environment signals.  The result is a lowercase hex SHA-256 digest
/// (64 characters) that is deterministic for the same machine + device_id combination.
fn generate_device_fingerprint(device_id: &str) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(device_id.as_bytes());
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown-host".to_string());
    let username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "unknown-user".to_string());
    hasher.update(hostname.as_bytes());
    hasher.update(username.as_bytes());
    hasher.update(b"agi-workforce-device-v1");
    hex::encode(hasher.finalize())
}
```

4. In `device_link_initiate` (line 163), after the function signature opens and before `let api_base`, add:

```rust
let mut request = request;
request.device_fingerprint = Some(generate_device_fingerprint(&request.device_id));
```

5. In `device_link_poll` (line 199), same pattern:

```rust
let mut request = request;
request.device_fingerprint = Some(generate_device_fingerprint(&request.device_id));
```

6. Run `cargo check -p agiworkforce-desktop` to verify compilation.

**Will Produce:**

- The serialized JSON body for `/api/device/link` will now include `"device_fingerprint": "<64-char lowercase hex>"`.
- The serialized JSON body for `/api/device/poll` will now include `"device_fingerprint": "<64-char lowercase hex>"`.
- The fingerprint is a 64-character lowercase hexadecimal string (SHA-256 output), which matches Agent B's regex `/^[a-f0-9]+$/`.

**DO NOT TOUCH:**

- Any TypeScript files
- Any other Rust files
- `Cargo.toml` (no new dependencies needed)
- Any web API files

---

### Agent B -- frontend-engineer

**Allowed Files (exclusive write access):**

- `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/validations/device.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/device/poll/route.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/lib/validations.test.ts`
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/device-link.test.ts`

**Current State of `device.ts` (52 lines):**

```typescript
// Line 38-43 -- DeviceLinkRequestSchema
export const DeviceLinkRequestSchema = z.object({
  device_id: DeviceIdSchema,
  device_name: DeviceNameSchema,
  device_type: DeviceTypeSchema.optional(),
  device_fingerprint: DeviceFingerprintSchema.optional(), // <-- CHANGE THIS
});

// Line 45-48 -- DevicePollRequestSchema
export const DevicePollRequestSchema = z.object({
  device_id: DeviceIdSchema,
  device_fingerprint: DeviceFingerprintSchema.optional(), // <-- KEEP THIS unchanged
});
```

**Task 1 -- `device.ts`:**

Change line 42 from:

```typescript
  device_fingerprint: DeviceFingerprintSchema.optional(),
```

to:

```typescript
  device_fingerprint: DeviceFingerprintSchema,
```

This makes `device_fingerprint` required on new link requests. The `DevicePollRequestSchema` stays unchanged (fingerprint optional for backward compatibility with legacy sessions).

**Current State of `poll/route.ts` (212 lines):**

The fingerprint check is at lines 75-88:

```typescript
// Line 75-88
// Device ownership verification: if a fingerprint was recorded, require a matching fingerprint.
if (data.device_fingerprint) {
  if (!device_fingerprint || data.device_fingerprint !== device_fingerprint) {
    logger.warn(
      {
        deviceId: device_id,
        expectedFingerprint: data.device_fingerprint,
        providedFingerprint: device_fingerprint,
      },
      'Device fingerprint mismatch - potential unauthorized access attempt',
    );
    throw createError.forbidden('Device fingerprint does not match');
  }
}
```

**Task 2 -- `poll/route.ts`:**

Replace lines 75-88 (the entire fingerprint check block) with:

```typescript
// Device ownership verification with backfill for legacy sessions.
if (data.device_fingerprint) {
  // Fingerprint was recorded on link -- enforce strict match on every poll.
  if (!device_fingerprint || data.device_fingerprint !== device_fingerprint) {
    logger.warn(
      { deviceId: device_id },
      'Device fingerprint mismatch - potential unauthorized access attempt',
    );
    throw createError.forbidden('Device fingerprint does not match');
  }
} else if (device_fingerprint) {
  // Legacy session (no fingerprint stored) but client IS sending one now -- backfill it.
  // This secures the session from this point forward without locking out existing users.
  await supabase
    .from('device_authorization_codes')
    .update({ device_fingerprint, updated_at: new Date().toISOString() })
    .eq('device_id', device_id);
  logger.info({ deviceId: device_id }, 'Device fingerprint backfilled for legacy session');
} else {
  // Legacy session with no fingerprint stored and none provided.
  // Allow through for backward compatibility but warn -- these sessions are being phased out.
  logger.warn(
    { deviceId: device_id },
    'Device poll without fingerprint (legacy session) -- consider re-authenticating',
  );
}
```

Note: The `supabase` client is already instantiated earlier in the function (line 48) and the `.update().eq()` chain pattern is already used in this file (line 69-70), so no new imports are needed. The `device_fingerprint` variable is already destructured from the validated body (line 42).

**IMPORTANT: The `supabase` mock in the existing test file (`device-poll.test.ts`) does NOT mock `.update().eq()` at the top-level mock. However, this backfill path is only triggered when `data.device_fingerprint` is null AND the client sends a fingerprint -- a scenario the existing tests do not exercise. The existing tests all use mock data with `device_fingerprint: 'abc123def456'`, so they always hit the first branch (strict match) and never reach the backfill or legacy-allow paths. No existing tests will break from this change.**

**Task 3 -- Fix tests that will break when `device_fingerprint` becomes required:**

When `DeviceFingerprintSchema` becomes required in `DeviceLinkRequestSchema`, two existing tests will fail because they send requests without `device_fingerprint`:

1. **`/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/lib/validations.test.ts`** -- Lines 60-66:

   ```typescript
   it('should accept optional fields', () => {
     const result = DeviceLinkRequestSchema.safeParse({
       device_id: 'test-device-123',
     });
     expect(result.success).toBe(true);
   });
   ```

   This test currently passes because `device_fingerprint` is optional. After the change, it must include a valid hex fingerprint. Update to:

   ```typescript
   it('should accept optional fields', () => {
     const result = DeviceLinkRequestSchema.safeParse({
       device_id: 'test-device-123',
       device_fingerprint: 'abcdef1234567890',
     });
     expect(result.success).toBe(true);
   });
   ```

   Note: `device_name` and `device_type` remain optional. Update the test name if desired (e.g., "should accept request with only required fields").

2. **`/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/device-link.test.ts`** -- Lines 90-99:
   ```typescript
   it('should accept request with only device_id', async () => {
     const request = new NextRequest('http://localhost/api/device/link', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ device_id: 'device-123' }),
     });
     const response = await POST(request);
     expect(response.status).toBe(200);
   });
   ```
   After the change, a request with only `device_id` will be rejected because `device_fingerprint` is now required. Update to:
   ```typescript
   it('should accept request with only required fields', async () => {
     const request = new NextRequest('http://localhost/api/device/link', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ device_id: 'device-123', device_fingerprint: 'abcdef1234567890' }),
     });
     const response = await POST(request);
     expect(response.status).toBe(200);
   });
   ```

**DO NOT TOUCH:**

- Any Rust files
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/app/api/device/link/route.ts` -- The link route already destructures `device_fingerprint` from validated data (line 38) and passes it to the upsert (line 75). No changes needed there.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/__tests__/api/device-poll.test.ts` -- The poll tests already include `device_fingerprint` in all requests. No changes needed.
- `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/api/accountApi.ts` -- The frontend caller passes no fingerprint because the Rust command generates it server-side. No changes needed.
- `/Users/siddhartha/Desktop/agiworkforce/apps/web/public/openapi.json` -- This is auto-generated or manually maintained documentation. Not in scope for this task.

---

## Interface Contracts

### Agent A (Rust) --> Agent B (Web API)

The only shared interface is the JSON request body sent over HTTP. There is NO shared TypeScript type or Rust type between the two layers. They are connected solely by the JSON wire format.

**`POST /api/device/link` request body:**

```json
{
  "device_id": "some-device-id",
  "device_name": "My Desktop",
  "device_type": "desktop",
  "device_fingerprint": "a1b2c3d4e5f6...64 hex chars total"
}
```

- `device_fingerprint` is a 64-character lowercase hex string (SHA-256 digest).
- Agent B's `DeviceFingerprintSchema` validates it as `/^[a-f0-9]+$/` with min length 1 and max 255. A 64-char hex string passes this regex.

**`POST /api/device/poll` request body:**

```json
{
  "device_id": "some-device-id",
  "device_fingerprint": "a1b2c3d4e5f6...64 hex chars total"
}
```

- Same format. Agent B's `DevicePollRequestSchema` keeps `device_fingerprint` optional, so older clients without fingerprint still work.

**Compatibility guarantee:** Agent A produces lowercase hex (`hex::encode` always outputs lowercase). Agent B's regex `^[a-f0-9]+$` accepts only lowercase hex. These are compatible.

---

## Database Schema (Read-Only Context)

The `device_authorization_codes` table already has a `device_fingerprint text` column (added in migration `20260108000001_fix_device_authorization_flow.sql`). No schema changes are needed.

The link route (`/api/device/link/route.ts`) already stores `device_fingerprint` in the upsert (line 75: `device_fingerprint: device_fingerprint || null`). No changes needed there.

---

## DO NOT TOUCH Sections

These files are relevant to device auth but must NOT be modified by either agent:

| File                                         | Reason                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `apps/desktop/src-tauri/Cargo.toml`          | No new dependencies needed; `sha2` and `hex` already present            |
| `apps/desktop/src/api/accountApi.ts`         | Frontend caller -- fingerprint is generated in Rust, not passed from TS |
| `apps/web/app/api/device/link/route.ts`      | Already handles `device_fingerprint` correctly from validated data      |
| `apps/web/__tests__/api/device-poll.test.ts` | Already includes `device_fingerprint` in all test requests              |
| `apps/web/public/openapi.json`               | Documentation; out of scope                                             |
| `apps/web/supabase/migrations/*`             | DB schema already has the column                                        |
| `apps/desktop/src-tauri/src/lib.rs`          | Core entry point -- no command registration changes needed              |

---

## Verification Checklist

After both agents complete, the integration reviewer should verify:

- [ ] `cargo check -p agiworkforce-desktop` passes (Agent A)
- [ ] `pnpm typecheck` passes across the monorepo
- [ ] `pnpm test` passes (all 820+ tests, including the updated validation and device-link tests)
- [ ] The fingerprint value generated by Rust (`hex::encode(sha256_digest)`) is a 64-char lowercase hex string
- [ ] Agent B's `DeviceFingerprintSchema` regex `/^[a-f0-9]+$/` accepts 64-char lowercase hex strings
- [ ] No file was modified by both agents (zero overlap)
- [ ] The link route (`device/link/route.ts`) was NOT modified -- it already handles fingerprint correctly
- [ ] `accountApi.ts` was NOT modified -- fingerprint generation is Rust-side only
- [ ] The backfill logic in `poll/route.ts` uses the already-instantiated `supabase` client and the existing `.update().eq()` pattern

---

## Risk Notes

1. **Fingerprint stability across OS updates:** The fingerprint uses `HOSTNAME`/`COMPUTERNAME` and `USER`/`USERNAME` env vars. If a user changes their hostname or username, the fingerprint will change. This is acceptable because it only affects the 15-minute device-link session window, not long-lived auth tokens.

2. **CI environment:** In CI, `HOSTNAME` and `USER` may differ across runs. This does not affect tests because the Rust code is not unit-tested in this file (it uses integration-level IPC). The web-side tests mock fingerprints as static strings.

3. **Backward compatibility:** Old desktop clients (pre-fingerprint) will send requests without `device_fingerprint`. The poll route handles this via the `else` branch (legacy allow-through with warning). The link route will reject them (fingerprint now required), which is the desired behavior -- old clients should update.
