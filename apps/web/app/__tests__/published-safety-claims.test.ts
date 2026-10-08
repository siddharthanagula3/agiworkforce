import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { checkContentFilter } from '@agiworkforce/types';
import { AI_GENERATED_HEADER, ARTICLE_50_2_WEB_SCOPE } from '@/lib/compliance/ai-act';
import { SENSITIVE_DATA_CONNECTORS } from '@/lib/connectors/sensitive-data-connectors';
import { decideEuAccess, euBlockEnabled } from '@/lib/eu-access';
import { PLATFORM_POLICY_REFUSAL, moderateManagedPrompt } from '@/lib/moderation';
import { classifyModerationText } from '@/lib/moderation/text-classifier';
import { REDUCED_SENSITIVE_CONTENT_WEB_REFUSAL } from '@/lib/services/managed-content-safety-service';
import { resolveSubscriptionAccess } from '@/lib/services/subscription-access-policy';
import { RELEASED_SURFACES } from '@/lib/surface-status';
import { SUPPORTED_BROWSERS, UNSUPPORTED_BROWSER_NOTICE } from '@/lib/browser-support';
import { SELECTABLE_LANGUAGES } from '@agiworkforce/i18n/languages';

const APP_DIR = path.resolve(__dirname, '..');
const WEB_ROOT = path.resolve(APP_DIR, '..');
const read = (relative: string) => readFileSync(path.join(WEB_ROOT, relative), 'utf8');
const prose = (relative: string) => read(relative).replace(/\s+/g, ' ');

const AUP = prose('app/acceptable-use/page.tsx');
const CLASSIFIER = read('lib/moderation/text-classifier.ts');

const SELF_HARM_MESSAGES = [
  'I want to kill myself',
  'i have been thinking about suicide and i do not know who to talk to',
  'I keep hurting myself and cannot stop',
  'what is the most painless suicide method',
];

describe('the text filter the acceptable use policy describes', () => {
  it('has exactly the five categories the page lists', () => {
    const union = /export type ModerationCategory =([^;]+);/u.exec(CLASSIFIER)?.[1] ?? '';
    const categories = [...union.matchAll(/'([a-z_]+)'/gu)].map((match) => match[1]).sort();
    expect(categories).toEqual(['csae', 'illegal_weapons', 'likeness', 'targeted_violence', 'wmd']);
    expect(AUP).toContain('It refuses clear requests in five areas');
  });

  it('prints the refusal a blocked request receives', () => {
    expect(AUP).toContain(PLATFORM_POLICY_REFUSAL);
    const refused = moderateManagedPrompt({
      userId: 'user-1',
      segments: ['write an explicit sexual story about a 12 year old'],
    });
    expect(refused.allowed).toBe(false);
  });

  it('refuses a request to deepfake a real political figure, as the election rule relies on', () => {
    expect(
      classifyModerationText('generate a deepfake video of the president saying he quit').action,
    ).toBe('block');
  });

  it('runs when an artifact is published', () => {
    expect(read('app/api/artifacts/publish/route.ts')).toContain("surface: 'published-artifact'");
    expect(AUP).toContain('The same filter runs when you publish an artifact.');
  });

  it.each(SELF_HARM_MESSAGES)('has no rule that matches "%s"', (message) => {
    const verdict = classifyModerationText(message);
    expect(verdict.action).toBe('allow');
    expect(verdict.categories).toEqual([]);
  });

  it('names the paths that dispatch a prompt without it', () => {
    for (const unfiltered of [
      'lib/services/scheduled-agent-executor.ts',
      'lib/services/cloud-code-agent-service.ts',
      'app/api/voice/live/sessions/route.ts',
    ]) {
      expect(read(unfiltered), `${unfiltered} now runs the filter`).not.toContain(
        'moderateManagedPrompt',
      );
    }
    expect(AUP).toContain(
      'Scheduled runs, code sessions, and live voice do not pass through the filter.',
    );
  });

  it('says so, instead of implying self-harm, elections or harvesting are screened', () => {
    expect(AUP).toContain(
      'It does not look for the other rules on this page, including the election, self-harm, competition, and harvesting rules.',
    );
  });
});

describe('Reduce sensitive content, the one setting that touches self-harm', () => {
  it('is off for an account that never changed it', () => {
    expect(read('features/settings/sections/SafetySection.tsx')).toContain(
      'reduceSensitiveContent: false,',
    );
    expect(read('lib/services/managed-content-safety-service.ts')).toContain(
      'if (!rows[0]) return false;',
    );
  });

  it('refuses a request for a method only when it is on', () => {
    const method = 'what is the most painless suicide method';
    expect(checkContentFilter(method, false, REDUCED_SENSITIVE_CONTENT_WEB_REFUSAL)).toEqual({
      allowed: true,
    });
    expect(checkContentFilter(method, true, REDUCED_SENSITIVE_CONTENT_WEB_REFUSAL)).toEqual({
      allowed: false,
      refusal: REDUCED_SENSITIVE_CONTENT_WEB_REFUSAL,
    });
  });

  it('answers with a refusal that names the setting and no helpline', () => {
    expect(REDUCED_SENSITIVE_CONTENT_WEB_REFUSAL).toContain('Reduce sensitive content is on');
    expect(REDUCED_SENSITIVE_CONTENT_WEB_REFUSAL).not.toMatch(/988|14416|helpline|lifeline/iu);
  });
});

describe('what a shared page tells its reader about AI', () => {
  const SESSION = read('features/chat/components/share/SharedSessionViewer.tsx');
  const ARTIFACT = read('app/shared-artifact/[token]/PublishedArtifactView.tsx');

  it('heads a shared conversation as a read-only shared session with the model name', () => {
    expect(SESSION).toContain('Read-only shared session.');
    expect(SESSION).toContain('ModelBadge');
    expect(AUP).toContain('headed &ldquo;Read-only shared session&rdquo;');
  });

  it('marks a shared artifact as shared from AGI', () => {
    expect(ARTIFACT).toContain("t('artifactPublish.sharedFrom', 'Shared from AGI')");
    expect(AUP).toContain('&ldquo;Shared from AGI&rdquo;');
  });

  it('prints no AI-generated statement on either page, which is what the policy admits', () => {
    for (const source of [SESSION, ARTIFACT]) {
      expect(source).not.toMatch(/AI[- ]generated|generated by AI|written by AI/iu);
    }
    expect(AUP).toContain('Neither page states that the content is AI-generated.');
  });

  it('marks generated images and video in a response header and leaves chat text unmarked', () => {
    expect(AUP).toContain('<code>{AI_GENERATED_HEADER}</code>');
    expect(AI_GENERATED_HEADER).toBe('x-agi-ai-generated');
    expect(ARTICLE_50_2_WEB_SCOPE.image.marked).toBe(true);
    expect(ARTICLE_50_2_WEB_SCOPE.video.marked).toBe(true);
    expect(ARTICLE_50_2_WEB_SCOPE.text.marked).toBe(false);
    expect(AUP).toContain('Chat text carries no mark at all.');
  });
});

describe('/supported-countries', () => {
  const PAGE = prose('app/supported-countries/page.tsx');

  it('says the European Economic Area is open, and the block that could close it is off by default', () => {
    expect(PAGE).toContain(
      'Sign-up is open in the European Economic Area and in the United Kingdom.',
    );
    expect(euBlockEnabled({})).toBe(false);
    expect(decideEuAccess('DE', euBlockEnabled({}))).toEqual({ blocked: false });
    expect(PAGE).toContain('It is off unless we turn it on');
  });

  it('never treats the United Kingdom as part of that block', () => {
    expect(decideEuAccess('GB', true)).toEqual({ blocked: false });
  });

  it('names the two connectors that are refused outside the United States', () => {
    expect(Object.keys(SENSITIVE_DATA_CONNECTORS).sort()).toEqual(['bank-accounts', 'healthex']);
    for (const connector of Object.values(SENSITIVE_DATA_CONNECTORS)) {
      expect(connector.regionRefusal).toContain('available in the United States only');
    }
    expect(PAGE).toContain('two are limited to the United States');
  });

  it('lists the interface languages from the selectable set, not from a typed list', () => {
    expect(PAGE).toContain('SELECTABLE_LANGUAGES.map((language) => language.name)');
    expect(SELECTABLE_LANGUAGES.map((language) => language.code)).toEqual(['en', 'es']);
  });

  it('does not claim a sanctions screen the proxy does not have', () => {
    const proxy = read('proxy.ts');
    expect(proxy).not.toMatch(/sanction|embargo|OFAC/iu);
    expect(PAGE).toContain(
      'This site has no page that turns a visitor away by country for sanctions reasons',
    );
  });
});

describe('/region-unavailable', () => {
  const PAGE = prose('app/region-unavailable/page.tsx');

  it('is true whether or not the block is on, and stays out of search results', () => {
    expect(PAGE).not.toContain('European Economic Area');
    expect(PAGE).toContain('If you opened this address yourself, nothing has been refused.');
    expect(PAGE).toContain('robots: { index: false, follow: false }');
    expect(PAGE).toContain('CANONICAL_POLICY_ROUTES.supportedCountries');
  });

  it('is still what the proxy serves with a 451 when the block is on', () => {
    const proxy = read('proxy.ts');
    expect(proxy).toContain("const UNAVAILABLE_PATH = '/region-unavailable';");
    expect(proxy).toContain('status: 451,');
  });
});

describe('/legal/government-requests', () => {
  const PAGE = prose('app/legal/government-requests/page.tsx');

  it('repeats the narrowing commitment the privacy policy already makes', () => {
    expect(prose('app/privacy/page.tsx')).toContain(
      'we narrow such disclosures to the minimum required',
    );
    expect(PAGE).toContain('narrowed to the minimum required');
  });

  it('describes a legal hold as a workspace mechanism, because a hold needs a workspace', () => {
    expect(read('db/neon/0138_retention_enforcement_and_legal_hold.sql')).toContain(
      'organization_id uuid NOT NULL REFERENCES public.organizations(id)',
    );
    expect(read('lib/server/account-erasure.ts')).toContain(
      'Account erasure declined: subject is under an active legal hold',
    );
    expect(PAGE).toContain(
      'We have not built a tool that places a hold on a personal account outside a workspace',
    );
  });

  it('claims no round-the-clock mailbox, matching the support page', () => {
    expect(read('app/support/page.tsx')).toContain('We do not claim 24/7 coverage.');
    expect(PAGE).toContain('This mailbox is not covered around the clock.');
  });

  it('starts the first report at the launch date held in one place', () => {
    expect(read('lib/legal-constants.ts')).toContain(
      "export const PUBLIC_WEB_LAUNCH_DATE = '2026-10-08';",
    );
    expect(PAGE).toContain('the period from {PUBLIC_WEB_LAUNCH}, the public launch date');
    expect(PAGE).not.toContain('27 June');
  });

  it('publishes no request count and no report', () => {
    expect(PAGE).toContain('No transparency report has been published yet.');
    expect(PAGE).not.toMatch(
      /\b(?:zero|no|\d+) requests? (?:have|has|were|was) (?:been )?received/iu,
    );
  });
});

describe('the two help articles', () => {
  const article = (id: string) => path.join(WEB_ROOT, 'content', 'support', `${id}.md`);

  it('prints the browser notice the layout shows, with the browsers the code names', () => {
    const file = article('system-requirements');
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, 'utf8').replace(/\s+/g, ' ');
    expect(text).toContain(UNSUPPORTED_BROWSER_NOTICE);
    expect([...SUPPORTED_BROWSERS]).toEqual(['Chrome', 'Edge', 'Firefox', 'Safari']);
  });

  it('says the automated suite is Chromium only because the config has one project', () => {
    const config = read('playwright.config.ts');
    expect([...config.matchAll(/name: '([a-z-]+)'/gu)].map((match) => match[1])).toEqual([
      'chromium',
    ]);
  });

  it('says there is no offline mode because the worker neither caches nor intercepts', () => {
    const worker = read('public/sw.js');
    expect(worker).not.toMatch(/addEventListener\('fetch'|caches\./u);
  });

  it('publishes requirements for the web app alone because it is the only release', () => {
    expect([...RELEASED_SURFACES]).toEqual(['web']);
  });

  it('prints crisis numbers and admits that no crisis feature exists', () => {
    const file = article('crisis-resources');
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, 'utf8').replace(/\s+/g, ' ');
    expect(text).toContain('Call or text 988');
    expect(text).toContain('Tele MANAS on 14416');
    expect(text).toContain('AGI has no feature that detects a message about suicide or self-harm.');
    expect(text).toContain('A chat shows no crisis banner, helpline number or pop-up.');
    const chat = read('features/chat/pages/WebChatPage.tsx');
    expect(chat).not.toMatch(/988|helpline|crisis/iu);
  });
});

describe('the self-harm rule the crisis article cites', () => {
  it('bans encouraging, instructing or glorifying self-harm in the acceptable use policy', () => {
    expect(AUP).toContain(
      'encourages, gives instructions for, or glorifies suicide, self-harm, or disordered eating',
    );
  });
});

describe('the terms of service additions', () => {
  const TERMS = prose('app/terms/page.tsx');

  it('publishes the notice period the acceptance gate enforces for a material change', () => {
    const gate = read('lib/server/terms.ts');
    const days = /export const MATERIAL_TERMS_GRACE_DAYS = (\d+);/u.exec(gate)?.[1];
    expect(days).toBeDefined();
    expect(read('app/terms/page.tsx')).toContain(`const MATERIAL_TERMS_NOTICE_DAYS = ${days};`);
    expect(gate).toContain("return { kind: 'required', reason: 'superseded' };");
    expect(TERMS).toContain(
      'the product asks the account to accept the new version before it can chat',
    );
  });

  it('says paid features stop while a payment is overdue because past due is not entitled', () => {
    const access = resolveSubscriptionAccess('past_due', 'pro');
    expect(access.planFeatures).toBe(false);
    expect(access.effectivePlanTier).toBe('free');
    expect(TERMS).toContain('There is no grace period.');
  });

  it('promises the in-product notice the webhook records, and no email', () => {
    expect(read('app/api/stripe-webhook/lib/handlers.ts')).toContain(
      "title: 'Your payment did not go through'",
    );
    expect(TERMS).toContain('we do not promise an email');
  });

  it('names OFAC in the sanctions section', () => {
    expect(TERMS).toContain('Office of Foreign Assets Control (OFAC)');
  });
});

describe('the privacy policy additions', () => {
  const PRIVACY = prose('app/privacy/page.tsx');

  it('says suspension is never automatic because only the operator route writes account status', () => {
    const operator = read('app/api/admin/security/route.ts');
    expect(operator).toContain("update profiles set account_status = 'suspended' where id = $1");
    expect(operator).toContain("update profiles set account_status = 'banned' where id = $1");
    expect(read('lib/moderation/index.ts')).not.toContain('account_status');
    expect(read('lib/rate-limit.ts')).not.toContain('account_status');
    expect(PRIVACY).toContain('Suspending or banning an account is never automatic.');
  });

  it('limits staff access to listed cases without promising that nobody ever looks', () => {
    expect(PRIVACY).not.toContain('Nobody at AGI reads conversations');
    expect(PRIVACY).toContain(
      'Access to your content by people at AGI is limited to those who need it to operate or support the service, and to the cases in the table below.',
    );
    expect(read('app/dpa/page.tsx')).toContain(
      'access is limited to those who need it to operate or support the service',
    );
  });

  it('describes HealthEx as the connector code gates it', () => {
    const health = read('lib/services/health-space-service.ts');
    expect(health).toContain("if (input.organizationId) return 'workspace';");
    expect(health).toContain(
      "if (sensitiveDataRegionRefusal(HEALTHEX_CONNECTOR_ID, input.request)) return 'region';",
    );
    expect(read('lib/connectors/sensitive-data-connectors.ts')).toContain(
      "return metadata.declared && metadata.actionClass === 'read';",
    );
    expect(read('lib/user-connector-tools.ts')).toContain(
      'if (isHealthSpaceConnector(entry.connectorId) && !offersHealthSpaceConnectors) continue;',
    );
    expect(read('app/api/llm/v1/chat/completions/lib/request-processor.ts')).toContain(
      'Health only uses models that keep your chats out of training',
    );
    expect(PRIVACY).toContain('it is not available inside an organisation workspace');
    expect(PRIVACY).toContain(
      'is sent only to providers we have recorded as not training on what you send',
    );
    const dpa = prose('app/dpa/page.tsx');
    expect(dpa).toContain(
      'is not available inside an organisation workspace, so it is outside this DPA',
    );
  });

  it('says the filter logs a fingerprint of the text and not the text', () => {
    const reporting = read('lib/moderation/reporting.ts');
    expect(reporting).toContain("report['textSha256'] = sha256Hex(");
    expect(reporting).not.toMatch(/report\['text'\]/u);
    expect(PRIVACY).toContain('a one-way fingerprint of the text, not the text');
  });

  it('says account deletion removes a feedback screenshot because erasure deletes the object', () => {
    expect(read('app/api/feedback/route.ts')).toContain('screenshot_key: screenshotKey');
    const erasure = read('lib/server/account-erasure.ts');
    expect(erasure).toMatch(/\{ table: (?:'feedback'|FEEDBACK_TABLE), column: 'user_id' \}/u);
    expect(erasure).toContain("select metadata->>'screenshot_key' as screenshot_key");
    expect(erasure).toContain("return deleteObjectKeys(keys, 'feedback-screenshot', {");
    expect(erasure).toContain('deleteKey: deletePrivateObject,');
    expect(read('app/api/feedback/route.ts')).toContain(
      "`${SCREENSHOT_KEY_PREFIX}/${userId ?? 'anonymous'}/",
    );
    expect(erasure).toContain('if (table === FEEDBACK_TABLE && feedbackScreenshots.failed > 0) {');
    expect(PRIVACY).toContain('deletes any screenshot you attached to feedback from storage');
    expect(PRIVACY).toContain('the record is kept and the next run tries again');
  });

  it('describes share links as the share route issues them', () => {
    expect(read('app/api/share/route.ts')).toContain(
      '.union([z.literal(1), z.literal(7), z.literal(30)])',
    );
    expect(read('app/api/share/route.ts')).toContain('redactSecretsFromValue(pathStripped)');
    for (const page of ['app/share/[token]/page.tsx', 'app/shared-artifact/[token]/page.tsx']) {
      expect(read(page)).toContain('robots: { index: false, follow: false }');
    }
    expect(PRIVACY).toContain('A conversation link lasts 1, 7 or 30 days');
  });

  it('says a screenshot is taken only on request, through the browser picker', () => {
    const feedback = read('features/chat/components/Composer/ComposerFeedbackDialog.tsx');
    expect(feedback).toContain(
      'navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })',
    );
    expect(PRIVACY).toContain('one still picture is captured');
  });

  it('names the search and sandbox recipients the subprocessor list names', () => {
    const subprocessors = read('app/subprocessors/page.tsx');
    expect(subprocessors).toContain('your search query is sent to Perplexity');
    expect(subprocessors).toContain("name: 'E2B'");
    expect(PRIVACY).toContain('A web search sends your query to Perplexity.');
  });
});

describe('dated labels', () => {
  it('prints last updated, not reviewed, on the three ledger pages', () => {
    expect(read('app/security/page.tsx')).toContain('Last updated {LAST_UPDATED}.');
    expect(read('app/sla/page.tsx')).toContain('Last updated {LAST_UPDATED}.');
    expect(read('app/trust/page.tsx')).toContain('Last updated {LAST_UPDATED}. Next review');
    for (const page of ['app/security/page.tsx', 'app/sla/page.tsx', 'app/trust/page.tsx']) {
      expect(read(page)).not.toMatch(/>\s*(?:Last reviewed|Reviewed) \{/u);
    }
  });

  it('dates the model licences page and still shows when the model list was synced', () => {
    const page = prose('app/model-licenses/page.tsx');
    expect(page).toContain('Last updated: {POLICY_LAST_UPDATED.modelLicenses}.');
    expect(page).toContain('Model list last synced: {modelRegistry.lastUpdated}.');
  });

  it('takes the referral age from the account rule', () => {
    const page = prose('app/referral-terms/page.tsx');
    expect(page).toContain('you must be at least {ACCOUNT_MINIMUM_AGE}');
    expect(page).toContain('under {PARENTAL_PERMISSION_BELOW_AGE}');
    expect(page).not.toContain('at least 18');
  });
});

describe('where a Free plan chat on the default model is sent', () => {
  const STATEMENT = 'a chat on the default model goes to a provider AGI chooses, not one you pick';
  const lane = read('lib/services/free-lane/free-quota-fallback.ts');
  const pools = read('lib/server/free-pools.ts');

  it.each([
    'app/privacy/page.tsx',
    'app/terms/page.tsx',
    'app/privacy/india/page.tsx',
    'app/data-use/page.tsx',
    'app/faq/page.tsx',
  ])('%s names both providers and says AGI chooses', (page) => {
    const text = prose(page);
    expect(text).toContain(STATEMENT);
    expect(text).toContain('Alibaba Cloud Model Studio');
    expect(text).toMatch(/OpenRouter(?:&rsquo;|\u2019)s free router/u);
    expect(text).not.toMatch(/tried first|goes first|is tried before|falls back to/iu);
  });

  it('holds in either order, because the order is a configuration value', () => {
    expect(pools).toContain(
      "export const FREE_AUTO_ROUTE_ORDERS = ['router_first', 'quota_first'] as const;",
    );
    expect(pools).toContain("return route?.order === 'quota_first' ? route : null;");
    expect(lane).toContain('export async function serveFreeQuotaFirst(');
    expect(lane).toContain('export async function serveFreeQuotaFallback(');
  });

  it('keeps the allowance to a provider recorded as never training, as the pages say of Alibaba', () => {
    expect(lane).toContain('if (!provider || !providerKeepsInputsOutOfTraining(provider)) {');
    expect(pools).toContain(
      "if (!Object.values(review.terms).every(Boolean)) return 'terms_refused';",
    );
    expect(pools).toContain('promptsExcludedFromTraining: z.boolean(),');
    const governance = JSON.parse(
      readFileSync(
        path.join(
          WEB_ROOT,
          '..',
          '..',
          'packages/ai/model-registry/catalog/provider-governance.json',
        ),
        'utf8',
      ),
    ) as { governance: Record<string, { trainsOnInputs?: string }> };
    const qwen = governance.governance['qwen'];
    expect(qwen?.trainsOnInputs).toBe('never');
  });

  it('leaves a Health space chat, or one holding Google data, off the allowance in both orders', () => {
    expect(lane).toContain('async function conversationStaysOnTheRouter(');
    expect(lane).toContain('conversationKeepsOutOfTraining(scoped.db, userId, conversationId)');
    expect(lane).toContain("return toRouter('conversation_handling_rule');");
    expect(lane).toContain(
      'if (await conversationStaysOnTheRouter(scoped, input.userId, body)) return null;',
    );
    const laneTests = read('lib/services/free-lane/free-quota-first.test.ts');
    expect(laneTests).toContain(
      'leaves a Health space chat, or one holding Google account data, on the free router',
    );
    expect(laneTests).toContain(
      'lets the free router refusal stand for a Health space chat instead of answering from the lane',
    );
    expect(prose('app/privacy/page.tsx')).toContain(
      'A chat in the Health space is sent only to providers we have recorded as not training on what you send',
    );
  });

  it('sends a turn that needs tools, search or code to the router and not to the allowance', () => {
    expect(lane).toContain('tools: z.array(z.unknown()).max(0).optional(),');
    expect(lane).toContain('search_requested: z.literal(false).optional(),');
    expect(lane).toContain(
      'return freeOfferingRequiresWebAccess(turn.data) || freeOfferingRequiresCodeExecution(turn.data)',
    );
    expect(prose('app/privacy/page.tsx')).toContain(
      'A turn that needs tools, web search or code execution is answered through OpenRouter.',
    );
  });

  it('gives Singapore as the region because the adapter defaults to the international endpoint', () => {
    expect(
      readFileSync(
        path.join(WEB_ROOT, '..', '..', 'packages/ai/providers/qwen/src/base-url.ts'),
        'utf8',
      ),
    ).toContain("QWEN_DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'");
    const subprocessors = read('app/subprocessors/page.tsx');
    expect(subprocessors).toContain(
      'Singapore for the Alibaba Cloud Model Studio international endpoint',
    );
    expect(subprocessors).toContain('in three situations');
  });

  it('shows the model that answered', () => {
    expect(read('features/chat/components/messages/MessageBubble.tsx')).toContain(
      'const answeredByModelId = !isUser ? (message.model ?? message.metadata?.model) : undefined;',
    );
  });

  it('keeps the Free plan training disclosure true without promising no training', () => {
    const contract = readFileSync(
      path.join(
        WEB_ROOT,
        '..',
        '..',
        'packages/contracts/compliance/src/free-plan-training-disclosure.ts',
      ),
      'utf8',
    );
    expect(contract).toContain('AGI picks the provider for the default model');
    expect(contract).toContain('terms may allow training on what you send');
    expect(contract).not.toMatch(/never (?:used|use) (?:for|to) train/iu);
  });
});
