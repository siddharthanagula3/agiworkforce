import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CHECKOUT_TARGET_PREFIX = 'agi-protocol-types-target-';
const CHECKOUT_TARGET_NAME = /^agi-protocol-types-target-[0-9a-f]{12}$/;
const CHECKOUT_MARKER = 'agi-protocol-types-checkout';

export function removeOrphanedCheckoutTargets(tmpdir) {
  const removed = [];
  for (const entry of fs.readdirSync(tmpdir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !CHECKOUT_TARGET_NAME.test(entry.name)) continue;
    const targetDir = path.join(tmpdir, entry.name);
    let checkout;
    try {
      checkout = fs.readFileSync(path.join(targetDir, CHECKOUT_MARKER), 'utf8');
    } catch {
      continue;
    }
    if (fs.existsSync(checkout)) continue;
    fs.rmSync(targetDir, { recursive: true, force: true });
    removed.push(targetDir);
  }
  return removed;
}

export function prepareProtocolTypesTarget({ repoRoot, env, tmpdir }) {
  removeOrphanedCheckoutTargets(tmpdir);
  if (env.CARGO_TARGET_DIR) {
    return path.join(env.CARGO_TARGET_DIR, 'protocol-types');
  }
  const digest = createHash('sha256').update(repoRoot).digest('hex').slice(0, 12);
  const targetDir = path.join(tmpdir, `${CHECKOUT_TARGET_PREFIX}${digest}`);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, CHECKOUT_MARKER), repoRoot);
  return targetDir;
}
