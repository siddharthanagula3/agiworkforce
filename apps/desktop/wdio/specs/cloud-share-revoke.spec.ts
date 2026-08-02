/**
 * DES-C07 — Share must work on a Cloud conversation reopened from history.
 *
 * The defect: `DesktopShellV3.handleShareConversation` sourced its payload from
 * the LEGACY desktop chat store (`src/stores/chat`). Nothing hydrates that
 * store's `messagesByConversation` for a Managed Cloud conversation opened from
 * the sidebar — `loadConversationMessages` has no production caller, and
 * `selectConversation` only reads the cache. The transcript the user is looking
 * at is loaded into the SHARED unified-chat store by `ChatInterface` via
 * `CloudRuntime.getMessages`. So Share was a dead control: it reported "Add a
 * message before sharing this conversation." and minted nothing.
 *
 * This spec drives the real Tauri binary and reproduces exactly that path:
 * refresh (so no transcript survives in memory), enter Cloud with a mocked
 * session, open a conversation that exists ONLY on the mocked server, and press
 * Share. The assertion is the outbound `POST /api/share` body — it must carry
 * the rendered transcript, which is only possible if the handler reads the
 * store that owns it.
 *
 * ── How the Cloud session is mocked ───────────────────────────────────────────
 * `browser.tauri.mock()` cannot be used here: it patches
 * `window.__TAURI__.core.invoke`, while this app imports `invoke` from
 * `@tauri-apps/api/core`, which calls `window.__TAURI_INTERNALS__.invoke`. So
 * the IPC seam is patched directly, and only for the four account commands the
 * device-authorization flow uses — every other command passes through to the
 * real backend, so no local database, settings, or keychain behaviour changes.
 *
 * `window.fetch` is patched in the same script rather than at the network layer,
 * which also sidesteps the packaged CSP for the absolute cloud origin.
 *
 * Both patches live on `window`, so a page load erases them. That is why the
 * `browser.refresh()` happens FIRST, while the app is still in Local mode (a
 * Local boot issues no cloud request), and the mocked Cloud session is entered
 * afterwards through the product's own sign-in affordance. Refreshing after the
 * patches were installed would silently un-mock the session mid-test.
 */

const CONVERSATION_ID = 'b6f1c2d4-7a83-4e15-9c60-2d8f4a1b3e77';
const CONVERSATION_TITLE = 'WDIO share round-trip';
const USER_TEXT = 'Summarise the quarterly review for the board.';
const ASSISTANT_TEXT = 'Revenue grew 12% quarter over quarter, driven by managed seats.';
const SHARE_URL = 'https://agiworkforce.com/share/wdio-share-token';
const ACCOUNT_ID = 'wdio-cloud-user';

interface ShareRequestRecord {
  title?: string;
  model_id?: string;
  provider?: string;
  messages?: Array<{ role: string; content: string; created_at: string }>;
}

/** Everything the in-page fake needs; `browser.execute` serializes it as JSON. */
const SEED = {
  conversationId: CONVERSATION_ID,
  conversationTitle: CONVERSATION_TITLE,
  userText: USER_TEXT,
  assistantText: ASSISTANT_TEXT,
  shareUrl: SHARE_URL,
  accountId: ACCOUNT_ID,
  accountEmail: 'wdio@agiworkforce.test',
  deviceCode: 'wdio-device-code',
  fallbackOrigin: 'https://agiworkforce.com',
};

describe('AGI Desktop Cloud conversation sharing', () => {
  it('mints a share link for a Cloud conversation reopened from the sidebar', async function () {
    this.timeout(240_000);

    // ── 1. Reach a Local shell, then reload it ────────────────────────────────
    // The reload is the point of the regression: it guarantees no transcript is
    // left in any in-memory store, so the only way Share can see messages is by
    // reading the store the runtime hydrates on reopen.
    await browser.waitUntil(
      async () =>
        (await $('textarea[aria-label="Chat message input"]').isExisting()) ||
        (await $('button=Use Local Mode').isExisting()) ||
        (await $('button[role="tab"]=Cloud').isExisting()),
      {
        timeout: 60_000,
        interval: 500,
        timeoutMsg: 'Desktop shell did not finish loading a Local or Cloud entry surface',
      },
    );

    const localReturn = await $('button=Use Local Mode');
    if (await localReturn.isExisting()) {
      await localReturn.click();
      await browser.pause(500);
    }

    await browser.refresh();
    await browser.pause(2_000);
    await browser.waitUntil(
      async () =>
        (await $('textarea[aria-label="Chat message input"]').isExisting()) ||
        (await $('button[role="tab"]=Cloud').isExisting()),
      {
        timeout: 60_000,
        interval: 500,
        timeoutMsg: 'Desktop shell did not come back after the reload',
      },
    );

    // ── 2. Install the in-page Cloud fakes ────────────────────────────────────
    const installed = await browser.execute((seed) => {
      const scope = window as unknown as Record<string, unknown>;
      scope['__agiWdioShareRequests'] = [];
      scope['__agiWdioCloudOrigin'] = seed.fallbackOrigin;

      // --- Tauri IPC: only the account/device-authorization commands. ---------
      const internals = scope['__TAURI_INTERNALS__'] as
        | { invoke?: (cmd: string, args?: unknown, options?: unknown) => Promise<unknown> }
        | undefined;
      if (!internals || typeof internals.invoke !== 'function') {
        return { ok: false, reason: 'window.__TAURI_INTERNALS__.invoke is not available' };
      }
      if (!scope['__agiWdioRealInvoke']) {
        scope['__agiWdioRealInvoke'] = internals.invoke.bind(internals);
      }
      const realInvoke = scope['__agiWdioRealInvoke'] as (
        cmd: string,
        args?: unknown,
        options?: unknown,
      ) => Promise<unknown>;

      const deviceResponse = (body: unknown) => ({ status: 200, body: JSON.stringify(body) });

      internals.invoke = (cmd: string, args?: unknown, options?: unknown): Promise<unknown> => {
        const record = (args ?? {}) as Record<string, unknown>;
        switch (cmd) {
          case 'account_store_api_base_url': {
            // The app hands us the configured cloud origin here, immediately
            // before requesting a device code. Capture it so the verification
            // URL we return passes the app's own trusted-origin check instead of
            // hardcoding an origin this build may not be configured for.
            if (typeof record['apiBaseUrl'] === 'string') {
              scope['__agiWdioCloudOrigin'] = record['apiBaseUrl'];
            }
            return Promise.resolve(null);
          }
          // Never let the test write to the real OS credential vault.
          case 'account_store_access_token':
          case 'account_store_refresh_token':
          case 'account_clear_tokens':
          case 'llm_ensure_managed_cloud':
            return Promise.resolve(null);
          case 'account_restore_access_token':
          case 'account_restore_refresh_token':
            return Promise.resolve(null);
          case 'fetch_user_profile':
            // `authOrchestrator` awaits this between projecting the credential
            // and writing the plan tier. Left to the real backend it would try
            // its own network call and stall the sign-in for the 30s
            // `accountApi.withTimeout` budget.
            return Promise.resolve({ id: seed.accountId, email: seed.accountEmail, credits: null });
          case 'account_start_device_authorization': {
            const origin = String(scope['__agiWdioCloudOrigin']);
            return Promise.resolve(
              deviceResponse({
                device_code: seed.deviceCode,
                user_code: 'WDIO-CODE',
                verification_uri: `${origin}/auth/device`,
                verification_uri_complete: `${origin}/auth/device?user_code=WDIO-CODE`,
                // Clamped to a 3s floor by `requestDeviceAuthorization`.
                interval: 1,
                expires_in: 600,
              }),
            );
          }
          case 'account_poll_device_authorization':
            return Promise.resolve(
              deviceResponse({
                access_token: `wdio.${seed.accountId}.access`,
                refresh_token: `wdio.${seed.accountId}.refresh`,
                token_type: 'Bearer',
                expires_in: 3600,
              }),
            );
          default:
            return realInvoke(cmd, args, options);
        }
      };

      // --- Managed Cloud HTTP surface ----------------------------------------
      const nowIso = new Date().toISOString();
      const conversationWire = {
        id: seed.conversationId,
        title: seed.conversationTitle,
        model: null,
        project_id: null,
        pinned: false,
        starred: false,
        archived: false,
        is_temporary: false,
        created_at: '2026-07-30T09:00:00.000Z',
        updated_at: '2026-07-30T09:05:00.000Z',
      };
      const messageWires = [
        {
          id: 'b1a0f6c2-1111-4c11-8111-aaaaaaaaaaaa',
          role: 'user',
          content: seed.userText,
          model: null,
          provider: null,
          input_tokens: 12,
          output_tokens: 0,
          created_at: '2026-07-30T09:00:00.000Z',
          metadata: null,
        },
        {
          id: 'b1a0f6c2-2222-4c22-8222-bbbbbbbbbbbb',
          role: 'assistant',
          content: seed.assistantText,
          model: 'wdio-cloud-model',
          provider: 'anthropic',
          input_tokens: 0,
          output_tokens: 24,
          created_at: '2026-07-30T09:00:04.000Z',
          metadata: null,
        },
      ];

      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });

      const originalFetch = window.fetch.bind(window);
      scope['__agiWdioRealFetch'] = originalFetch;

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const rawUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;
        let pathname: string;
        try {
          pathname = new URL(rawUrl, window.location.origin).pathname;
        } catch {
          return originalFetch(input as RequestInfo, init);
        }
        if (!pathname.startsWith('/api/')) return originalFetch(input as RequestInfo, init);

        const method = (
          init?.method ??
          (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')
        ).toUpperCase();

        if (pathname === '/api/me') {
          return json({
            id: seed.accountId,
            email: seed.accountEmail,
            name: 'WDIO Cloud User',
            avatar_url: null,
            created_at: null,
            updated_at: Math.floor(Date.now() / 1000),
            plan: {
              tier: 'max',
              display_name: 'Max',
              status: 'active',
              current_period_end: null,
            },
            feature_flags: {},
            routing_preferences: {},
          });
        }

        if (pathname === '/api/settings/sync') {
          return method === 'POST'
            ? json({ applied: true, cursor: '0' })
            : json({ settings: {}, cursor: '0', hasMore: false });
        }

        if (pathname === '/api/csrf') return json({ token: 'wdio-csrf' });

        if (pathname === '/api/projects') return json({ projects: [] });

        if (pathname === `/api/chat/conversations/${seed.conversationId}`) {
          if (method === 'GET') {
            return json({
              conversation: conversationWire,
              messages: messageWires,
              total: messageWires.length,
              hasMore: false,
            });
          }
          if (method === 'PUT' || method === 'PATCH')
            return json({ conversation: conversationWire });
          return json({ success: true });
        }

        if (pathname === '/api/chat/conversations') {
          if (method === 'POST') return json({ conversation: conversationWire });
          return json({ conversations: [conversationWire], hasMore: false, nextOffset: 0 });
        }

        if (pathname === '/api/share' && method === 'POST') {
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(String(init?.body ?? '{}'));
          } catch {
            parsed = { parseError: String(init?.body ?? '') };
          }
          (scope['__agiWdioShareRequests'] as unknown[]).push(parsed);
          return json({
            shareUrl: seed.shareUrl,
            token: 'wdio-share-token',
            expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
            messageCount: Array.isArray((parsed as { messages?: unknown[] })?.messages)
              ? (parsed as { messages: unknown[] }).messages.length
              : 0,
          });
        }

        // Everything else the Cloud shell touches (credits, usage, library,
        // runs) is not part of this assertion; answer it inertly so nothing
        // escapes to the network.
        return json({}, 200);
      };

      return { ok: true, reason: nowIso };
    }, SEED);

    expect(installed.ok).toBe(true);

    // ── 3. Enter Cloud through the product's own affordance ───────────────────
    const cloudTab = await $('button[role="tab"]=Cloud');
    await cloudTab.waitForDisplayed({ timeout: 20_000 });
    await cloudTab.click();

    const signInButton = await $('button=Sign in to AGI Cloud');
    await signInButton.waitForDisplayed({ timeout: 20_000 });
    await signInButton.click();

    // The device loop waits one clamped poll interval (3s floor) before its
    // first poll, and the owned sign-in window opens and closes around it.
    await browser.waitUntil(
      async () => (await $(`[data-conversation-id="${CONVERSATION_ID}"]`).isExisting()) === true,
      {
        timeout: 90_000,
        interval: 750,
        timeoutMsg:
          'The mocked Cloud session never produced the seeded conversation in the sidebar. ' +
          'Either device authorization did not complete or the conversation boundary failed.',
      },
    );

    // The boundary must not have failed behind the shell.
    const bodyText = await $('body').getText();
    expect(bodyText).not.toContain('Could not open Cloud Mode');

    // ── 4. Reopen the conversation from history ───────────────────────────────
    // `ConversationRow` puts the select handler on an inner button whose `title`
    // is the conversation title; the row div itself has no click handler.
    const conversationRow = await $(
      `[data-conversation-id="${CONVERSATION_ID}"] button[title="${CONVERSATION_TITLE}"]`,
    );
    await conversationRow.waitForDisplayed({ timeout: 20_000 });
    await conversationRow.click();

    // The transcript renders from the SHARED store — `ChatInterface` fills it
    // from `CloudRuntime.getMessages`. The legacy desktop store is never
    // populated on this path; that is the whole point of the regression.
    await browser.waitUntil(async () => (await $('body').getText()).includes(ASSISTANT_TEXT), {
      timeout: 30_000,
      interval: 500,
      timeoutMsg: 'The reopened Cloud conversation never rendered its transcript',
    });

    // ── 5. Share ──────────────────────────────────────────────────────────────
    const shareButton = await $('button[aria-label="Share conversation"]');
    await shareButton.waitForDisplayed({ timeout: 20_000 });
    await shareButton.click();

    await browser.waitUntil(
      async () => {
        const requests = await browser.execute(
          () =>
            ((window as unknown as Record<string, unknown>)['__agiWdioShareRequests'] as unknown[])
              .length,
        );
        return requests > 0;
      },
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg:
          'Share never issued POST /api/share. This is the DES-C07 failure: the handler read a ' +
          'store that is empty for a reopened Cloud conversation and bailed out early.',
      },
    );

    // ── 6. Assert the payload, then the user-visible result ───────────────────
    const shareRequests = (await browser.execute(
      () => (window as unknown as Record<string, unknown>)['__agiWdioShareRequests'],
    )) as ShareRequestRecord[];

    expect(shareRequests).toHaveLength(1);
    const payload = shareRequests[0] as ShareRequestRecord;
    expect(payload.title).toBe(CONVERSATION_TITLE);
    // `provider` is only reachable from the transcript rows — no conversation
    // field carries it — so this is direct proof the payload came from the
    // rendered messages.
    expect(payload.provider).toBe('anthropic');
    expect(typeof payload.model_id).toBe('string');
    expect(payload.messages).toHaveLength(2);
    expect(payload.messages?.[0]?.role).toBe('user');
    expect(payload.messages?.[0]?.content).toBe(USER_TEXT);
    expect(payload.messages?.[1]?.role).toBe('assistant');
    expect(payload.messages?.[1]?.content).toBe(ASSISTANT_TEXT);

    await browser.waitUntil(
      async () => (await $('body').getText()).includes('Share link created'),
      {
        timeout: 20_000,
        interval: 500,
        timeoutMsg: 'The share success toast never appeared',
      },
    );

    const afterShareText = await $('body').getText();
    expect(afterShareText).toContain(SHARE_URL);
    // The exact symptom DES-C07 describes: Share reporting there is nothing to
    // share on a conversation whose transcript is on screen.
    expect(afterShareText).not.toContain('Add a message before sharing this conversation.');

    await browser.saveScreenshot('/tmp/agi-desktop-cloud-share.png');

    // ── 7. Leave the shared wdio profile in Local mode ────────────────────────
    // Specs share one app-data directory; a persisted `cloud` mode boots the
    // next spec into the sign-in card (the sidebar-navigation -> smoke
    // poisoning recorded on this branch).
    await browser.execute(() => {
      const scope = window as unknown as Record<string, unknown>;
      const realFetch = scope['__agiWdioRealFetch'];
      if (typeof realFetch === 'function') {
        window.fetch = realFetch as typeof window.fetch;
      }
      const internals = scope['__TAURI_INTERNALS__'] as { invoke?: unknown } | undefined;
      const realInvoke = scope['__agiWdioRealInvoke'];
      if (internals && typeof realInvoke === 'function') {
        internals.invoke = realInvoke;
      }
    });

    const localTab = await $('button[role="tab"]=Local');
    if (await localTab.isExisting()) {
      await localTab.click();
    }
    await browser.waitUntil(
      async () => (await $('textarea[aria-label="Chat message input"]').isExisting()) === true,
      {
        timeout: 30_000,
        interval: 500,
        timeoutMsg: 'Desktop did not return to a usable Local shell after the share round-trip',
      },
    );
  });
});
