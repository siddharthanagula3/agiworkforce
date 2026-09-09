#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { findRequestScopedPolicyResolvers } from './lib/policy-gate-scope.mjs';

const root = process.cwd();

const GATE_FILES = [
  'apps/web/lib/services/organization-policy-gate.ts',
  'apps/web/lib/mfa-policy-gate.ts',
  'apps/web/lib/ip-allow-list-gate.ts',
  'apps/web/lib/services/managed-usage-request-service.ts',
];

const findings = [];

for (const relative of GATE_FILES) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    findings.push({ file: relative, line: 0, detail: 'file is missing from the guarded set' });
    continue;
  }
  for (const hit of findRequestScopedPolicyResolvers(fs.readFileSync(absolute, 'utf8'))) {
    findings.push({ file: relative, ...hit });
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
