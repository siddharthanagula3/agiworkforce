#!/usr/bin/env node
/* global chrome, document, btoa, window */
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { launchExtension, resolveExtensionDirectory } from '../e2e/extension-harness.mjs';
import { readPngSize } from '../store-assets/png-size.mjs';
import { SAMPLE_SITE_PATHS, renderSamplePage } from '../store-assets/src/sample-site.mjs';

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'store-assets', 'assets.json'), 'utf8'),
).assets;
const bundle = resolveExtensionDirectory(extensionRoot, undefined);
const manifest = JSON.parse(fs.readFileSync(path.join(bundle.directory, 'manifest.json'), 'utf8'));

const SITE_HOST = 'handbook.example.com';
const SITE_ORIGIN = `https://${SITE_HOST}`;
const APPROVED_SITE_ORIGINS = [
  SITE_ORIGIN,
  'https://intranet.example.com',
  'https://reports.example.com',
  'https://travel.example.com',
  'https://hr.example.com',
  'https://finance.example.com',
];
const GATEWAY_ORIGINS = new Set(['https://agiworkforce.com', 'https://api.agiworkforce.com']);
const FRAME = { width: 1280, height: 800 };
const PANEL_WIDTH = 400;
const PAGE_WIDTH = FRAME.width - PANEL_WIDTH;
const OWNER = { accountId: 'sample-account', authIncarnation: 'sample-session' };
const AUTH_TOKEN_MESSAGE = 'GET_CLOUD_AUTH_TOKEN';
const CONVERSATIONS_KEY = 'agi_browser_conversations_v2';
const CONVERSATION_OWNERS_SESSION_KEY = 'agi_browser_conversation_owners_v1';
const SITE_ALLOWLIST_KEY = 'agi_site_allowlist';
const BROWSER_CONTROL_CONSENT_KEY = 'agi_cu_browser_control_consent';
const ASK_BEFORE_ACTING_KEY = 'agi_cu_ask_before_acting';
const CAPTURED_TURN_KEY = '__agiCapturedTurn';
const TASK_REQUEST = 'Fill in the expense claim for my March customer visit';
const TASK_GOAL = 'Fill in the expense claim for the March customer visit';
const TASK_REPLY = 'I can fill in the claim on this page. I will ask before I start.';
const BROWSER_TASK_TOOL = 'browser_task';
const LOOPBACK_OR_PORT_TEXT =
  /\blocalhost\b|\b127\.0\.0\.1\b|\[::1\]|\b(?:[a-z0-9-]+\.)+[a-z]{2,}:\d{2,5}\b|:\d{4,5}\b/i;
const UNFINISHED_TEXT = /\bLoading\b|Try again|went wrong|could not|unavailable|Unable to|failed/i;
const SAMPLE_QUESTION = 'What do I need to know before booking a flight for a work trip?';

const sampleState = { approvalCount: 3 };
const failures = [];
const observed = { consoleErrors: [], pageErrors: [], failedRequests: [], blockedRequests: [] };

function buildSignInHosts() {
  return (manifest.host_permissions ?? [])
    .filter(
      (pattern) =>
        !/^https?:\/\/(localhost|127\.0\.0\.1|(api\.)?agiworkforce\.com)\//.test(pattern),
    )
    .map((pattern) => new URL(pattern.replace(/\*$/, '')).hostname);
}

const ACCEPTED_CONSOLE_ERRORS = [
  {
    matches: (entry) => {
      try {
        return buildSignInHosts().includes(new URL(entry.url).hostname);
      } catch {
        return false;
      }
    },
    reason:
      "the build's own sign-in host (a placeholder that does not resolve); the capture blocks it on purpose and signs the panel in itself",
  },
];

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function installSampleAuth({ owner, messageType, capturedTurnKey }) {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.sendMessage) {
    console.error('store-assets: the extension runtime is missing, so sign-in was not installed');
    return;
  }
  const original = runtime.sendMessage.bind(runtime);
  const encode = (value) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  runtime.sendMessage = (...args) => {
    const message = args[0];
    if (message?.type === 'CHAT_MESSAGE') {
      globalThis[capturedTurnKey] = {
        id: message.id,
        clientInstanceId: message.clientInstanceId,
        owner: message.owner,
      };
      const callback = args.find((argument) => typeof argument === 'function');
      if (callback) {
        callback({ success: true });
        return undefined;
      }
      return Promise.resolve({ success: true });
    }
    if (message?.type !== messageType) return original(...args);
    const token = [
      encode({ alg: 'none', typ: 'JWT' }),
      encode({
        sub: owner.accountId,
        sid: owner.authIncarnation,
        azp: runtime.getURL('').replace(/\/$/, ''),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      'sample',
    ].join('.');
    return Promise.resolve({ success: true, token, owner });
  };
}

function sampleRun(index, { title, surface, state, minutes }) {
  const id = `00000000-0000-4000-8000-00000000000${index}`;
  const done = state === 'completed';
  return {
    id,
    userId: OWNER.accountId,
    requestId: `sample-request-${index}`,
    conversationId: `sample-conversation-${index}`,
    conversationTitle: title,
    conversationPreview: null,
    originSurface: surface,
    workMode: 'chat',
    state,
    provider: 'cloud',
    model: 'auto',
    lastEventSequence: 6,
    cancellationRequestedAt: null,
    completedAt: done ? minutesAgo(minutes) : null,
    createdAt: minutesAgo(minutes + 3),
    updatedAt: minutesAgo(minutes),
  };
}

const APPROVAL_SAMPLES = [
  ['click', 'approved', 6],
  ['type', 'approved', 7],
  ['navigate', 'rejected', 55],
];
const SETTINGS_SEEDS = [
  [3, 3],
  [3, 2],
  [2, 3],
  [2, 2],
];

function gatewayResponse(url) {
  switch (url.pathname) {
    case '/api/llm/v1/models':
      return {
        object: 'list',
        data: [{ id: 'auto' }],
        x_agi_workforce: { user_tier: 'pro', allowed_auto_modes: [] },
      };
    case '/api/usage':
      return {
        plan_tier: 'pro',
        usage_percentage: 12,
        usage_reset_at: minutesAgo(-600),
        has_usage_remaining: true,
        period_start: null,
        period_end: null,
        subscription_status: 'active',
        session_usage_percentage: 4,
        session_reset_at: minutesAgo(-180),
        weekly_usage_percentage: 12,
        weekly_reset_at: minutesAgo(-5000),
        flagship_weekly_usage_percentage: 0,
        flagship_weekly_reset_at: null,
      };
    case '/api/me':
      return {
        id: OWNER.accountId,
        email: 'sample.user@example.com',
        name: 'Sample User',
        profile: { display_name: 'Sample User', preferred_name: 'Sample', work_description: null },
        avatar_url: null,
        created_at: null,
        updated_at: 0,
        plan: {
          tier: 'pro',
          display_name: '',
          status: 'active',
          current_period_end: null,
          effective_tier: 'pro',
        },
        feature_flags: { advanced_model_access: true },
        routing_preferences: {},
      };
    case '/api/llm/v1/chat/completions/runs':
      return {
        runs: [
          sampleRun(1, {
            title: 'Fill in the vendor intake form',
            surface: 'chrome',
            state: 'running',
            minutes: 1,
          }),
          sampleRun(2, {
            title: 'Expense claim for the March trip',
            surface: 'web',
            state: 'completed',
            minutes: 42,
          }),
          sampleRun(3, {
            title: 'Summarize the planning notes',
            surface: 'desktop',
            state: 'completed',
            minutes: 190,
          }),
          sampleRun(4, {
            title: 'Draft the weekly team update',
            surface: 'mobile',
            state: 'completed',
            minutes: 1500,
          }),
        ],
        nextCursor: null,
      };
    case '/api/settings/preferences':
      return url.searchParams.has('namespace')
        ? { settings: {}, version: 'sample' }
        : {
            settings: { general: { preferredName: 'Sample' } },
            version: 'sample',
            organizationMemoryAllowed: true,
            autonomousToolApprovalsAllowed: true,
          };
    case '/api/settings/workspaces':
      return {
        accountId: OWNER.accountId,
        workspaces: [
          {
            id: 'personal',
            kind: 'personal',
            organizationId: null,
            name: 'Personal',
            slug: 'personal',
            isPrimary: true,
            role: null,
          },
        ],
        activeWorkspaceId: 'personal',
        activeOrganizationId: null,
        scope: 'personal',
      };
    case '/api/chat/conversations':
      return { conversations: [], hasMore: false, nextOffset: 0, nextCursor: null };
    case '/api/settings/approvals':
      return {
        approvals: APPROVAL_SAMPLES.slice(0, sampleState.approvalCount).map(
          ([toolName, decision, minutes], index) => ({
            id: `sample-approval-${index}`,
            toolName,
            decision,
            conversationId: null,
            createdAt: minutesAgo(minutes),
          }),
        ),
        hasMore: false,
        nextCursor: null,
      };
    default:
      return null;
  }
}

async function routeNetwork(route) {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin === SITE_ORIGIN) {
    const page = renderSamplePage(url.pathname);
    await route.fulfill(
      page === null
        ? { status: url.pathname === '/favicon.ico' ? 204 : 404 }
        : { status: 200, contentType: 'text/html; charset=utf-8', body: page },
    );
    return;
  }
  if (!GATEWAY_ORIGINS.has(url.origin)) {
    observed.blockedRequests.push(`${request.method()} ${request.url()}`);
    await route.abort();
    return;
  }
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  };
  if (request.method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers });
    return;
  }
  const body = request.method() === 'GET' ? gatewayResponse(url) : null;
  await route.fulfill({
    status: body ? 200 : 404,
    headers,
    contentType: 'application/json',
    body: JSON.stringify(body ?? { error: 'not available in the capture' }),
  });
}

function savedConversation(siteOrigin, { id, title, question, answer }) {
  const now = Date.now();
  return {
    id,
    owner: OWNER,
    title,
    savedAt: now,
    routing: { selectedModel: 'auto' },
    messages: [
      {
        role: 'user',
        content: question,
        timestamp: now - 90_000,
        runtime: 'managed-cloud',
        pages: [
          {
            url: `${siteOrigin}${SAMPLE_SITE_PATHS.policy}`,
            title: 'Travel and expense policy',
          },
        ],
      },
      {
        role: 'assistant',
        content: answer,
        timestamp: now - 80_000,
        runtime: 'managed-cloud',
        durationMs: 4200,
      },
    ],
  };
}

const chatAnswer = (siteOrigin) =>
  savedConversation(siteOrigin, {
    id: 'sample-chat-answer',
    title: 'Booking a flight for a work trip',
    question: SAMPLE_QUESTION,
    answer: [
      'Before you book a flight, the policy asks for three things:',
      '',
      '- **Book early.** Reserve through the travel portal at least 14 days before you leave.',
      '- **Pick the right cabin.** Fly economy on flights shorter than 6 hours; premium economy is allowed on longer ones.',
      '- **Check exceptions first.** If you need something outside these rules, ask your manager before you book.',
      '',
      'After the trip, submit your claim within 30 days and attach an itemised receipt for anything over $25.',
    ].join('\n'),
  });

const pageSummary = (siteOrigin) =>
  savedConversation(siteOrigin, {
    id: 'sample-page-summary',
    title: 'Travel and expense policy',
    question: 'Summarize this page',
    answer: [
      '**Travel and expense policy**',
      '',
      '- **Booking:** Use the travel portal at least 14 days ahead. Economy for flights under 6 hours, premium economy for longer ones.',
      '- **Hotels:** Up to $220 a night in major cities and $160 elsewhere.',
      '- **Meals:** Up to $70 a day while travelling. Alcohol is not reimbursed.',
      '- **Claims:** Submit within 30 days, with an itemised receipt for anything over $25. Claims under $500 are approved by your manager within 5 business days; larger claims also need finance approval.',
    ].join('\n'),
  });

async function seedStorage(serviceWorker, items, removedKeys = []) {
  await serviceWorker.evaluate(
    async ({ items, removedKeys, ownersKey }) => {
      await chrome.storage.session.remove(ownersKey);
      await chrome.storage.local.remove(removedKeys);
      await chrome.storage.local.set({
        agi_onboarding_completed: true,
        agi_side_panel_tour_done: true,
        agi_pin_prompt_dismissed: true,
        ...items,
      });
    },
    { items, removedKeys, ownersKey: CONVERSATION_OWNERS_SESSION_KEY },
  );
}

function conversationStore(conversation) {
  return {
    version: 2,
    activeConversationId: conversation.id,
    activeOwner: OWNER,
    conversations: [conversation],
  };
}

let windowEnlarged = false;

async function ensureRoomyWindow(page) {
  if (windowEnlarged) return;
  const session = await page.context().newCDPSession(page);
  try {
    const { windowId } = await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { width: 1600, height: 1200 },
    });
    windowEnlarged = true;
  } catch (error) {
    console.log(
      `[store-assets] could not enlarge the browser window: ${error instanceof Error ? error.message : error}`,
    );
  } finally {
    await session.detach().catch(() => undefined);
  }
}

async function assertViewport(label, page, size) {
  const metrics = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    outerHeight: window.outerHeight,
  }));
  console.log(`[store-assets] viewport ${label}: ${JSON.stringify(metrics)}`);
  if (metrics.width !== size.width || metrics.height !== size.height) {
    throw new Error(
      `${label} viewport is ${metrics.width}x${metrics.height}, expected ${size.width}x${size.height}`,
    );
  }
}

function watchPage(page, label) {
  page.on('console', (message) => {
    if (message.type() === 'error')
      observed.consoleErrors.push({
        page: label,
        text: message.text(),
        url: message.location().url ?? '',
      });
  });
  page.on('pageerror', (error) => observed.pageErrors.push({ page: label, text: error.message }));
  page.on('requestfailed', (request) =>
    observed.failedRequests.push({
      page: label,
      url: request.url(),
      failure: request.failure()?.errorText ?? '',
    }),
  );
}

async function newExtensionPage(context, size, label) {
  const page = await context.newPage();
  await ensureRoomyWindow(page);
  await page.setViewportSize(size);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  watchPage(page, label);
  await page.addInitScript(installSampleAuth, {
    owner: OWNER,
    messageType: AUTH_TOKEN_MESSAGE,
    capturedTurnKey: CAPTURED_TURN_KEY,
  });
  return page;
}

async function assertFrameText(label, page, { unfinished = true } = {}) {
  const text = await page.evaluate(() => document.body.innerText);
  const address = LOOPBACK_OR_PORT_TEXT.exec(text);
  if (address) throw new Error(`${label} shows a loopback address or port: "${address[0]}"`);
  const pending = unfinished ? UNFINISHED_TEXT.exec(text) : null;
  if (pending) {
    const around = text.slice(Math.max(0, pending.index - 40), pending.index + 60);
    throw new Error(`${label} shows unfinished or error text: "${around.replace(/\s+/g, ' ')}"`);
  }
}

async function waitForPanelReady(panel) {
  await panel.waitForFunction(
    () => {
      const gate = document.getElementById('sp-cloud-gate');
      const input = document.getElementById('sp-input');
      return Boolean(gate && !gate.classList.contains('visible') && input && !input.disabled);
    },
    undefined,
    { timeout: 30_000 },
  );
}

async function waitForText(page, text) {
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), text, {
    timeout: 30_000,
  });
}

async function openSamplePage(context, pathname, size) {
  const site = await context.newPage();
  await ensureRoomyWindow(site);
  await site.setViewportSize(size);
  await site.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  watchPage(site, 'site');
  await site.goto(`${SITE_ORIGIN}${pathname}`, { waitUntil: 'load' });
  return site;
}

async function composeFrame(context, pageShot, panelShot, outputPath) {
  const frame = await context.newPage();
  await frame.setViewportSize(FRAME);
  const encode = (shot) => `data:image/png;base64,${shot.toString('base64')}`;
  await frame.setContent(
    `<!doctype html><html><body style="margin:0;display:flex;width:${FRAME.width}px;height:${FRAME.height}px;background:#ffffff">` +
      `<img src="${encode(pageShot)}" width="${PAGE_WIDTH}" height="${FRAME.height}" style="display:block">` +
      `<img src="${encode(panelShot)}" width="${PANEL_WIDTH}" height="${FRAME.height}" style="display:block">` +
      '</body></html>',
  );
  await frame.screenshot({ path: outputPath, type: 'png' });
  await frame.close();
}

async function withSidePanelBesidePage(session, { sitePath, setup, removed, drive, outputPath }) {
  const { context, serviceWorker, extensionId } = session;
  await seedStorage(serviceWorker, setup, removed);
  const panel = await newExtensionPage(
    context,
    { width: PANEL_WIDTH, height: FRAME.height },
    'panel',
  );
  let site;
  try {
    await panel.goto(`chrome-extension://${extensionId}/src/side_panel.html`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForPanelReady(panel);
    site = await openSamplePage(context, sitePath, { width: PAGE_WIDTH, height: FRAME.height });
    await serviceWorker.evaluate(async (host) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url?.includes(host));
      if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { active: true });
    }, SITE_HOST);
    await panel.waitForTimeout(1500);
    await drive({ panel, site, serviceWorker });
    await panel.evaluate(() => document.activeElement?.blur());
    await panel.waitForTimeout(400);
    await assertFrameText('side panel', panel);
    await assertFrameText('page', site, { unfinished: false });
    await assertViewport('side panel', panel, { width: PANEL_WIDTH, height: FRAME.height });
    await assertViewport('page', site, { width: PAGE_WIDTH, height: FRAME.height });
    const pageShot = await site.screenshot({ type: 'png', animations: 'disabled' });
    const panelShot = await panel.screenshot({
      type: 'png',
      animations: 'disabled',
      caret: 'hide',
    });
    await composeFrame(context, pageShot, panelShot, outputPath);
  } catch (error) {
    const diagnostics = await panel
      .evaluate(() => document.body.innerText.slice(0, 400))
      .catch(() => '');
    throw new Error(
      `${error instanceof Error ? error.message : error}\npanel text: ${diagnostics}`,
    );
  } finally {
    await site?.close();
    await panel.close();
  }
}

async function captureChatAnswer(session, outputPath) {
  await withSidePanelBesidePage(session, {
    sitePath: `${SAMPLE_SITE_PATHS.policy}#booking`,
    setup: { [CONVERSATIONS_KEY]: conversationStore(chatAnswer(SITE_ORIGIN)) },
    removed: [SITE_ALLOWLIST_KEY, BROWSER_CONTROL_CONSENT_KEY, ASK_BEFORE_ACTING_KEY],
    drive: async ({ panel }) => waitForText(panel, 'Book early.'),
    outputPath,
  });
}

async function capturePageSummary(session, outputPath) {
  await withSidePanelBesidePage(session, {
    sitePath: SAMPLE_SITE_PATHS.policy,
    setup: { [CONVERSATIONS_KEY]: conversationStore(pageSummary(SITE_ORIGIN)) },
    removed: [SITE_ALLOWLIST_KEY, BROWSER_CONTROL_CONSENT_KEY, ASK_BEFORE_ACTING_KEY],
    drive: async ({ panel }) => waitForText(panel, 'Claims:'),
    outputPath,
  });
}

async function captureApproval(session, outputPath) {
  await withSidePanelBesidePage(session, {
    sitePath: SAMPLE_SITE_PATHS.claim,
    setup: { [ASK_BEFORE_ACTING_KEY]: true },
    removed: [CONVERSATIONS_KEY, SITE_ALLOWLIST_KEY, BROWSER_CONTROL_CONSENT_KEY],
    drive: async ({ panel, serviceWorker }) => {
      await panel.fill('#sp-input', TASK_REQUEST);
      await panel.click('#sp-send-btn');
      await panel.waitForFunction((key) => Boolean(globalThis[key]), CAPTURED_TURN_KEY, {
        timeout: 20_000,
      });
      const turn = await panel.evaluate((key) => globalThis[key], CAPTURED_TURN_KEY);
      await serviceWorker.evaluate(
        (message) => chrome.runtime.sendMessage({ type: 'CHAT_CHUNK', done: false, ...message }),
        { ...turn, text: TASK_REPLY },
      );
      await waitForText(panel, 'I will ask before I start.');
      await serviceWorker.evaluate(
        (message) => chrome.runtime.sendMessage({ type: 'CHAT_TOOL_HANDOFF', ...message }),
        {
          ...turn,
          handoffId: 'sample-handoff',
          calls: [
            {
              id: 'sample-call',
              function: { name: BROWSER_TASK_TOOL, arguments: JSON.stringify({ goal: TASK_GOAL }) },
            },
          ],
        },
      );
      await panel.waitForSelector('.sp-browser-grant', { timeout: 20_000 });
      await panel.waitForTimeout(600);
    },
    outputPath,
  });
}

async function measureSettingsFrame(options) {
  return options.evaluate((viewportHeight) => {
    const scroller = document.scrollingElement;
    const absolute = (element) => {
      const rect = element.getBoundingClientRect();
      return { top: scroller.scrollTop + rect.top, bottom: scroller.scrollTop + rect.bottom };
    };
    const section = document.getElementById('opt-permissions');
    const rows = [...section.children]
      .filter((row) => !row.hidden && row.getBoundingClientRect().height > 0)
      .map((row) => Math.round(absolute(row).top));
    const sectionBottom = Math.round(absolute(section).bottom);
    const maxScroll = scroller.scrollHeight - viewportHeight;
    const leaves = [...section.querySelectorAll('*'), ...document.querySelectorAll('.opt-version')]
      .filter(
        (element) => element.children.length === 0 || /^(BUTTON|INPUT|LI)$/.test(element.tagName),
      )
      .map(absolute)
      .filter((box) => box.bottom - box.top > 0);
    const cutBy = (edge) => leaves.some((box) => box.top < edge - 1 && box.bottom > edge + 1);
    const fitting = rows.filter(
      (top) =>
        top <= maxScroll &&
        sectionBottom - top <= viewportHeight - 1 &&
        !cutBy(top) &&
        !cutBy(top + viewportHeight),
    );
    return {
      rows,
      sectionBottom,
      maxScroll,
      start: fitting.length > 0 ? Math.min(...fitting) : null,
    };
  }, FRAME.height);
}

async function captureSitePermissions(session, outputPath) {
  const { context, serviceWorker, extensionId } = session;
  const site = await openSamplePage(context, SAMPLE_SITE_PATHS.policy, FRAME);
  const options = await newExtensionPage(context, FRAME, 'options');
  const tried = [];
  try {
    let start = null;
    for (const [siteCount, approvalCount] of SETTINGS_SEEDS) {
      sampleState.approvalCount = approvalCount;
      const approved = APPROVED_SITE_ORIGINS.slice(0, siteCount);
      await seedStorage(
        serviceWorker,
        {
          [CONVERSATIONS_KEY]: conversationStore(chatAnswer(SITE_ORIGIN)),
          [SITE_ALLOWLIST_KEY]: approved,
          [BROWSER_CONTROL_CONSENT_KEY]: approved.slice(0, 2),
        },
        [ASK_BEFORE_ACTING_KEY],
      );
      if (tried.length === 0) {
        await options.goto(`chrome-extension://${extensionId}/src/options.html#opt-permissions`, {
          waitUntil: 'domcontentloaded',
        });
      } else {
        await options.reload({ waitUntil: 'domcontentloaded' });
      }
      await options.waitForFunction(
        ([sites, approvals]) =>
          document.querySelectorAll('.opt-allowlist-item').length === sites &&
          document.querySelectorAll('.opt-approval-history-item').length === approvals,
        [siteCount, approvalCount],
        { timeout: 30_000 },
      );
      await options.waitForTimeout(800);
      const layout = await measureSettingsFrame(options);
      tried.push(`${siteCount} sites, ${approvalCount} approvals: ${JSON.stringify(layout)}`);
      console.log(`[store-assets] settings layout ${tried[tried.length - 1]}`);
      start = layout.start;
      if (start !== null) break;
    }
    if (start === null) {
      throw new Error(`no settings row lets everything below it fit in ${FRAME.height}px`);
    }
    await options.evaluate((top) => document.scrollingElement.scrollTo(0, top), start);
    await options.waitForTimeout(600);
    const scrolled = await options.evaluate(() => Math.round(document.scrollingElement.scrollTop));
    if (Math.abs(scrolled - start) > 1) {
      throw new Error(`settings page stopped at ${scrolled}px, expected ${start}px`);
    }
    await assertFrameText('settings page', options);
    await assertViewport('settings page', options, FRAME);
    await options.screenshot({
      path: outputPath,
      type: 'png',
      animations: 'disabled',
      caret: 'hide',
    });
  } finally {
    sampleState.approvalCount = 3;
    await options.close();
    await site.close();
  }
}

async function captureTasks(session, outputPath) {
  await withSidePanelBesidePage(session, {
    sitePath: SAMPLE_SITE_PATHS.policy,
    setup: { [CONVERSATIONS_KEY]: conversationStore(pageSummary(SITE_ORIGIN)) },
    removed: [SITE_ALLOWLIST_KEY, BROWSER_CONTROL_CONSENT_KEY, ASK_BEFORE_ACTING_KEY],
    drive: async ({ panel }) => {
      await panel.click('#sp-menu-btn');
      await panel.getByRole('menuitem', { name: 'Tasks', exact: true }).click();
      await panel.waitForSelector('#sp-tasks:not([hidden])');
      await waitForText(panel, 'Expense claim for the March trip');
    },
    outputPath,
  });
}

async function renderPromoTile(session, kind, outputPath) {
  const entry = assets.find((asset) => asset.path === path.relative(extensionRoot, outputPath));
  const tile = await session.context.newPage();
  try {
    await tile.setViewportSize({ width: entry.width, height: entry.height });
    await tile.emulateMedia({ colorScheme: 'light' });
    await tile.goto(
      pathToFileURL(path.join(extensionRoot, 'store-assets', 'src', `promo-${kind}.html`)).href,
      { waitUntil: 'load' },
    );
    await tile.evaluate((name) => {
      document.querySelector('[data-product-name]').textContent = name;
    }, manifest.name);
    await assertFrameText('promotional tile', tile);
    await tile.screenshot({ path: outputPath, type: 'png' });
  } finally {
    await tile.close();
  }
}

const CAPTURES = {
  'store-assets/screenshot-1-chat-answer.png': captureChatAnswer,
  'store-assets/screenshot-2-page-summary.png': capturePageSummary,
  'store-assets/screenshot-3-approval.png': captureApproval,
  'store-assets/screenshot-4-site-permissions.png': captureSitePermissions,
  'store-assets/screenshot-5-tasks.png': captureTasks,
  'store-assets/promo-small-440x280.png': (session, outputPath) =>
    renderPromoTile(session, 'small', outputPath),
  'store-assets/promo-marquee-1400x560.png': (session, outputPath) =>
    renderPromoTile(session, 'marquee', outputPath),
};

function assertClerkConfiguredBuild() {
  if (buildSignInHosts().length === 0) {
    throw new Error(
      'dist/ was built without CLERK_PUBLISHABLE_KEY, CLERK_FRONTEND_API and CLERK_SYNC_HOST, so the side panel can never be signed in. Build with those set (a non-routable placeholder origin is enough) and run again.',
    );
  }
}

function describeObserved() {
  const entries = [
    ...observed.pageErrors.map((entry) => ({ ...entry, kind: 'page error', url: '' })),
    ...observed.consoleErrors.map((entry) => ({ ...entry, kind: 'console error' })),
    ...observed.failedRequests.map((entry) => ({
      page: entry.page,
      kind: 'failed request',
      text: entry.failure,
      url: entry.url,
    })),
  ];
  const unexplained = [];
  const unique = new Set();
  for (const entry of entries) {
    const line = `${entry.page}: ${entry.kind}: ${entry.text.slice(0, 160)}${entry.url ? ` (${entry.url})` : ''}`;
    if (unique.has(line)) continue;
    unique.add(line);
    const accepted = ACCEPTED_CONSOLE_ERRORS.find((candidate) => candidate.matches(entry));
    if (accepted) console.log(`[store-assets] accepted: ${line}\n    reason: ${accepted.reason}`);
    else unexplained.push(line);
  }
  for (const request of new Set(observed.blockedRequests)) {
    console.log(`[store-assets] blocked request: ${request}`);
  }
  return unexplained;
}

async function completeOnboarding(session) {
  const welcome = await newExtensionPage(session.context, FRAME, 'welcome');
  try {
    await welcome.goto(`chrome-extension://${session.extensionId}/src/welcome.html`, {
      waitUntil: 'domcontentloaded',
    });
    await welcome.locator('.wl-actions .wl-btn-primary').last().click();
    await welcome.waitForFunction(
      async () =>
        Boolean(
          (await chrome.storage.local.get('agi_onboarding_disclosures'))[
            'agi_onboarding_disclosures'
          ],
        ),
      undefined,
      { timeout: 15_000 },
    );
  } finally {
    await welcome.close();
  }
}

async function main() {
  assertClerkConfiguredBuild();
  const hostResolverRules = ['EXCLUDE 127.0.0.1', 'EXCLUDE localhost', 'MAP * ~NOTFOUND'].join(
    ', ',
  );
  let launched;
  try {
    launched = await launchExtension({ directory: bundle.directory, hostResolverRules });
    await launched.context.route(
      (url) => url.protocol === 'https:' || url.protocol === 'http:',
      routeNetwork,
    );
    await completeOnboarding(launched);
    for (const asset of assets) {
      const capture = CAPTURES[asset.path];
      if (!capture) continue;
      const outputPath = path.join(extensionRoot, asset.path);
      try {
        await capture(launched, outputPath);
        const size = readPngSize(fs.readFileSync(outputPath));
        if (size?.width !== asset.width || size?.height !== asset.height) {
          throw new Error(
            `wrote ${size ? `${size.width}x${size.height}` : 'an unreadable file'}, expected ${asset.width}x${asset.height}`,
          );
        }
        console.log(`[store-assets] ${asset.path} ${asset.width}x${asset.height}`);
      } catch (error) {
        failures.push(`${asset.path}: ${error instanceof Error ? error.message : error}`);
      }
    }
  } finally {
    await launched?.context.close();
    bundle.cleanup?.();
  }
  for (const line of describeObserved()) failures.push(line);
  if (failures.length > 0) {
    console.error(
      `store-assets FAILED:\n${failures.map((failure) => `  - ${failure}`).join('\n')}`,
    );
    process.exitCode = 1;
  }
}

fs.mkdirSync(path.join(extensionRoot, 'store-assets'), { recursive: true });
await main();
