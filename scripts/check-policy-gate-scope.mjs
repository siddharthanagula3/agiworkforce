#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  ACCOUNT_LEVEL_RESOLVERS,
  declaredAccountLevelResolvers,
  findRequestScopedPolicyResolvers,
} from './lib/policy-gate-scope.mjs';

const root = process.cwd();

const GATE_FILES = [
  'apps/web/lib/services/organization-policy-gate.ts',
  'apps/web/lib/mfa-policy-gate.ts',
  'apps/web/lib/ip-allow-list-gate.ts',
  'apps/web/lib/services/managed-usage-request-service.ts',
];

const findings = [];
const declared = new Set();

for (const relative of GATE_FILES) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    findings.push({ file: relative, line: 0, detail: 'file is missing from the guarded set' });
    continue;
  }
  const source = fs.readFileSync(absolute, 'utf8');
  for (const resolver of declaredAccountLevelResolvers(source)) declared.add(resolver);
  for (const hit of findRequestScopedPolicyResolvers(source)) {
    findings.push({ file: relative, ...hit });
  }
}

for (const resolver of ACCOUNT_LEVEL_RESOLVERS) {
  if (!declared.has(resolver)) {
    findings.push({
      file: GATE_FILES.join(', '),
      line: 0,
      detail: `${resolver} is not declared as \`export async function ${resolver}(...):\` in any gate file, so it went unchecked`,
    });
  }
}

if (findings.length > 0) {
  console.error(
    '\n❌ [check-policy-gate-scope] a security gate resolves its scope from the request\n',
  );
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}  ${finding.detail}`);
  }
  console.error(
    '\nAn account-level control must not let the caller choose the scope it is evaluated' +
      '\nagainst. `x-agi-organization-id: personal` resolves to no organization, which these' +
      '\ngates read as ungoverned. Resolve from membership instead:' +
      '\n  resolveGoverningOrganizationIds  (apps/web/lib/services/governing-organizations.ts)' +
      '\n  resolveEnterpriseFundingOrganizationId  (billing scope)\n',
  );
  process.exit(1);
}

console.log(
  `✅ [check-policy-gate-scope] ${GATE_FILES.length} gate files resolve scope from membership`,
);
