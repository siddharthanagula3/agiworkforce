#!/usr/bin/env node
// A privacy page may only state what the code does. Each claim below names the
// sentence a page publishes and the code path that makes it true, and fails
// when either side moves without the other.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const COOKIES_PAGE = 'apps/web/app/cookies/page.tsx';
export const CONSENT_SIGNALS = 'apps/web/lib/consent-signals.ts';
export const COOKIE_CONSENT = 'apps/web/shared/lib/cookie-consent.ts';
export const CONSENT_CENTRE = 'apps/web/app/privacy/requests/ConsentCentre.tsx';
export const DISCLOSURE = 'apps/web/lib/compliance/free-plan-training-disclosure.ts';
export const PRICING_PAGE = 'apps/web/app/pricing/page.tsx';
export const CHAT_NOTICE = 'apps/web/features/chat/components/FreePlanTrainingNotice.tsx';
export const STORAGE_TABLE_TEST = 'apps/web/app/cookies/device-storage-table.test.ts';

const DISCLOSURE_CONSTANT = 'FREE_PLAN_TRAINING_DATA_DISCLOSURE';

/**
 * Published copy, with JSX entities resolved and whitespace flattened, so a
 * sentence pinned here matches however the page happens to wrap it.
 */
export function publishedCopy(source) {
  return source
    .replace(/&middot;/g, '·')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\{'\s*'\}/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

/** The single-quoted value a module assigns to a `const NAME = '...'`. */
export function readStringConstant(source, name) {
  const match = new RegExp(`\\b${name}\\s*(?::\\s*string\\s*)?=\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(
    source,
  );
  return match ? match[1].replace(/\\'/g, "'") : null;
}

function read(root, relative, failures) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    failures.push(`${relative} does not exist`);
    return null;
  }
  return fs.readFileSync(target, 'utf8');
}

// The sentences the cookie policy publishes about the opt-out signal, each with
// what the code must contain for that sentence to be true.
const GPC_CLAIMS = [
  {
    sentence: 'We honour Global Privacy Control',
    backing: [
      { file: CONSENT_SIGNALS, needle: 'sec-gpc', why: 'the header name is read' },
      {
        file: CONSENT_SIGNALS,
        needle: 'globalPrivacyControl',
        why: 'the browser property is read',
      },
      {
        file: COOKIE_CONSENT,
        needle: 'readBrowserGlobalPrivacyControl',
        why: 'consent resolution consults the signal',
      },
    ],
  },
  {
    sentence: 'That refusal wins over an acceptance stored in this browser',
    backing: [
      {
        file: COOKIE_CONSENT,
        needle: 'isAnalyticsLockedByOptOutSignal()) return NECESSARY_ONLY_PREFERENCES',
        why: 'the stored record is overridden on read',
      },
    ],
  },
  {
    sentence: 'the analytics switch in cookie preferences is shown off and locked',
    backing: [
      {
        file: 'apps/web/shared/components/CookieConsent.tsx',
        needle: 'disabled={optedOutBySignal}',
        why: 'the switch is locked',
      },
    ],
  },
  {
    sentence: 'the product-update list in the consent centre',
    backing: [
      {
        file: CONSENT_CENTRE,
        needle: 'isNonEssentialConsentPurpose',
        why: 'the consent centre applies the signal to non-essential purposes',
      },
    ],
  },
  {
    sentence: 'it never touches the strictly necessary cookies in the table above',
    backing: [
      {
        file: CONSENT_SIGNALS,
        needle: 'necessaryForRequest',
        why: 'only purposes that are not necessary are refused',
      },
    ],
  },
  {
    sentence:
      'Do Not Track is a separate, older header with no agreed meaning and we still do not read it',
    absent: [{ file: CONSENT_SIGNALS, needle: 'dnt' }],
  },
  {
    sentence: 'A test now derives the list from the code',
    backing: [
      {
        file: STORAGE_TABLE_TEST,
        needle: 'names, or covers by prefix, every key the app writes',
        why: 'the device-storage table is derived from the keys the app writes',
      },
    ],
  },
];

export function runPrivacyClaimsCheck(root) {
  const failures = [];

  const cookies = read(root, COOKIES_PAGE, failures);
  if (cookies) {
    const copy = publishedCopy(cookies);
    for (const claim of GPC_CLAIMS) {
      if (!copy.includes(claim.sentence)) {
        failures.push(
          `${COOKIES_PAGE} no longer states "${claim.sentence}"; the page and the code path that backs it must move together`,
        );
        continue;
      }
      for (const { file, needle, why } of claim.backing ?? []) {
        const source = read(root, file, failures);
        if (source === null) continue;
        if (!source.includes(needle)) {
          failures.push(
            `${COOKIES_PAGE} states "${claim.sentence}" but ${file} no longer shows that ${why} ("${needle}")`,
          );
        }
      }
      for (const { file, needle } of claim.absent ?? []) {
        const source = read(root, file, failures);
        if (source === null) continue;
        if (new RegExp(`\\b${needle}\\b`, 'i').test(source)) {
          failures.push(
            `${COOKIES_PAGE} says the "${needle}" signal is not read, but ${file} reads it`,
          );
        }
      }
    }
  }

  const disclosure = read(root, DISCLOSURE, failures);
  const shared = disclosure ? readStringConstant(disclosure, DISCLOSURE_CONSTANT) : null;
  if (disclosure && !shared) {
    failures.push(`${DISCLOSURE} no longer exports a ${DISCLOSURE_CONSTANT} string`);
  }

  if (shared) {
    const pricing = read(root, PRICING_PAGE, failures);
    if (pricing) {
      const pricingValue = readStringConstant(pricing, DISCLOSURE_CONSTANT);
      const usesShared = pricing.includes(`from '@/lib/compliance/free-plan-training-disclosure'`);
      if (!usesShared && pricingValue === null) {
        failures.push(
          `${PRICING_PAGE} neither imports ${DISCLOSURE_CONSTANT} from ${DISCLOSURE} nor states it, so the plan comparison no longer discloses free-model training`,
        );
      } else if (!usesShared && pricingValue !== shared) {
        failures.push(
          `${PRICING_PAGE} states "${pricingValue}" where ${DISCLOSURE} states "${shared}"; one sentence changed without the other`,
        );
      }
    }

    const notice = read(root, CHAT_NOTICE, failures);
    if (notice && !notice.includes(DISCLOSURE_CONSTANT)) {
      failures.push(
        `${CHAT_NOTICE} no longer uses ${DISCLOSURE_CONSTANT}, so the notice a Free account sees can drift from the plan comparison`,
      );
    }
    if (
      notice &&
      new RegExp(`=\\s*'${shared.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(notice)
    ) {
      failures.push(`${CHAT_NOTICE} restates the disclosure instead of importing it`);
    }
  }

  return failures;
}

function main() {
  const flag = process.argv.indexOf('--root');
  const root = flag >= 0 ? path.resolve(process.argv[flag + 1]) : repoRoot;
  const failures = runPrivacyClaimsCheck(root);
  if (failures.length > 0) {
    console.error('Privacy copy and the code it describes have come apart:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} problem(s).`);
    process.exit(1);
  }
  console.log('check-privacy-claims: every pinned privacy sentence still matches the code.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
