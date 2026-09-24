import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CHAT_NOTICE,
  CONSENT_CENTRE,
  CONSENT_SIGNALS,
  COOKIES_PAGE,
  COOKIE_CONSENT,
  DISCLOSURE,
  PRICING_PAGE,
  STORAGE_TABLE_TEST,
  publishedCopy,
  readStringConstant,
  runPrivacyClaimsCheck,
} from './check-privacy-claims.mjs';

const COOKIE_CONSENT_COMPONENT = 'apps/web/shared/components/CookieConsent.tsx';

const SENTENCES = [
  'We honour Global Privacy Control',
  'That refusal wins over an acceptance stored in this browser',
  'the analytics switch in cookie preferences is shown off and locked',
  'the product-update list in the consent centre',
  'it never touches the strictly necessary cookies in the table above',
  'Do Not Track is a separate, older header with no agreed meaning and we still do not read it',
  'A test now derives the list from the code',
];

function tree() {
  return {
    [COOKIES_PAGE]: `<Prose>
      <strong>${SENTENCES[0]}.</strong> ${SENTENCES[1]}, and ${SENTENCES[2]} with the
      reason beside it, covering analytics and ${SENTENCES[3]}.
    </Prose>
    <Prose size="sm">What it does not do: ${SENTENCES[4]}. ${SENTENCES[5]}.</Prose>
    <Prose size="sm">${SENTENCES[6]}, so the table cannot fall behind it.</Prose>
`,
    [CONSENT_SIGNALS]: `export const GLOBAL_PRIVACY_CONTROL_HEADER = 'sec-gpc';
export const NON_ESSENTIAL = PURPOSES.filter((p) => !p.necessaryForRequest);
export function readBrowserGlobalPrivacyControl() {
  return navigator.globalPrivacyControl === true;
}
`,
    [COOKIE_CONSENT]: `import { readBrowserGlobalPrivacyControl } from '@/lib/consent-signals';
export function readCookiePreferences() {
  if (isAnalyticsLockedByOptOutSignal()) return NECESSARY_ONLY_PREFERENCES;
  return null;
}
`,
    [COOKIE_CONSENT_COMPONENT]: `<Switch disabled={optedOutBySignal} />`,
    [CONSENT_CENTRE]: `import { isNonEssentialConsentPurpose } from '@/lib/consent-signals';`,
    [DISCLOSURE]: `export const FREE_PLAN_TRAINING_DATA_DISCLOSURE = 'Not by AGI. Free model providers may.';
`,
    [PRICING_PAGE]: `const FREE_PLAN_TRAINING_DATA_DISCLOSURE = 'Not by AGI. Free model providers may.';
`,
    [CHAT_NOTICE]: `import { FREE_PLAN_TRAINING_DATA_DISCLOSURE } from '@/lib/compliance/free-plan-training-disclosure';
`,
    [STORAGE_TABLE_TEST]: `it('names, or covers by prefix, every key the app writes', () => {});
`,
  };
}

function write(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-claims-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

function failuresFor(mutate) {
  const files = tree();
  mutate(files);
  return runPrivacyClaimsCheck(write(files));
}

test('a tree where copy and code agree passes', () => {
  assert.deepEqual(
    failuresFor(() => {}),
    [],
  );
});

test('published copy is read through its JSX entities', () => {
  assert.match(publishedCopy('<strong>We honour&nbsp;GPC.</strong>'), /We honour GPC\./);
});

test('a string constant is read off its declaration', () => {
  assert.equal(readStringConstant("const A: string = 'b';", 'A'), 'b');
  assert.equal(readStringConstant("const A = 'b';", 'B'), null);
});

test('removing the sentence from the page fails', () => {
  const failures = failuresFor((files) => {
    files[COOKIES_PAGE] = files[COOKIES_PAGE].replace(SENTENCES[0], 'We read no such signal');
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no longer states "We honour Global Privacy Control"/);
});

test('removing the code that honours the signal fails', () => {
  const failures = failuresFor((files) => {
    files[COOKIE_CONSENT] = files[COOKIE_CONSENT].replace(
      /readBrowserGlobalPrivacyControl/g,
      'alwaysFalse',
    );
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /consent resolution consults the signal/);
});

test('letting a stored acceptance win again fails', () => {
  const failures = failuresFor((files) => {
    files[COOKIE_CONSENT] = files[COOKIE_CONSENT].replace(
      'if (isAnalyticsLockedByOptOutSignal()) return NECESSARY_ONLY_PREFERENCES;',
      '',
    );
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /the stored record is overridden on read/);
});

test('unlocking the analytics switch while the page says it is locked fails', () => {
  const failures = failuresFor((files) => {
    files[COOKIE_CONSENT_COMPONENT] = '<Switch />';
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /the switch is locked/);
});

test('dropping the signal from the consent centre fails', () => {
  const failures = failuresFor((files) => {
    files[CONSENT_CENTRE] = 'import nothing;';
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /non-essential purposes/);
});

test('refusing a purpose the request needs, against what the page promises, fails', () => {
  const failures = failuresFor((files) => {
    files[CONSENT_SIGNALS] = files[CONSENT_SIGNALS].replace(/necessaryForRequest/g, 'anything');
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /only purposes that are not necessary are refused/);
});

test('starting to read Do Not Track while the page says it is not read fails', () => {
  const failures = failuresFor((files) => {
    files[CONSENT_SIGNALS] += `export const DNT = 'dnt';\n`;
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /says the "dnt" signal is not read/);
});

test('the pricing sentence drifting from the shared constant fails', () => {
  const failures = failuresFor((files) => {
    files[PRICING_PAGE] = `const FREE_PLAN_TRAINING_DATA_DISCLOSURE = 'No.';\n`;
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /states "No\." where .* states "Not by AGI/);
});

test('the shared constant drifting from the pricing sentence fails', () => {
  const failures = failuresFor((files) => {
    files[DISCLOSURE] =
      `export const FREE_PLAN_TRAINING_DATA_DISCLOSURE = 'Nobody trains on anything.';\n`;
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /one sentence changed without the other/);
});

test('an import of the shared constant satisfies the pricing page', () => {
  const failures = failuresFor((files) => {
    files[PRICING_PAGE] =
      `import { FREE_PLAN_TRAINING_DATA_DISCLOSURE } from '@/lib/compliance/free-plan-training-disclosure';\n`;
  });
  assert.deepEqual(failures, []);
});

test('dropping the disclosure from the pricing page entirely fails', () => {
  const failures = failuresFor((files) => {
    files[PRICING_PAGE] = 'const PLANS = [];\n';
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no longer discloses free-model training/);
});

test('the chat notice restating the sentence rather than importing it fails', () => {
  const failures = failuresFor((files) => {
    files[CHAT_NOTICE] =
      `const FREE_PLAN_TRAINING_DATA_DISCLOSURE = 'Not by AGI. Free model providers may.';\n`;
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /restates the disclosure instead of importing it/);
});

test('the chat notice dropping the disclosure fails', () => {
  const failures = failuresFor((files) => {
    files[CHAT_NOTICE] = 'export function FreePlanTrainingNotice() { return null; }\n';
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /can drift from the plan comparison/);
});

test('a missing file is reported rather than silently passing', () => {
  const files = tree();
  delete files[CONSENT_SIGNALS];
  const failures = runPrivacyClaimsCheck(write(files));
  assert.ok(failures.some((failure) => failure.includes('does not exist')));
});

test('claiming a derived storage table with no such test fails', () => {
  const failures = failuresFor((files) => {
    files[STORAGE_TABLE_TEST] = "it('something else entirely', () => {});\n";
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /the device-storage table is derived from the keys the app writes/);
});
