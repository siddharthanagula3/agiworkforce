import { Sandbox } from '@e2b/code-interpreter';

const TIMEOUT_MS = 60_000;

function ok(label) {
  console.log(`  ✓ ${label}`);
}
function fail(label, err) {
  console.error(`  ✗ ${label}: ${err?.message ?? err}`);
}

async function main() {
  if (!process.env.E2B_API_KEY) {
    console.error('E2B_API_KEY is not set. Set it in the environment (never in chat / git).');
    process.exit(2);
  }
  console.log('Verifying the E2B binding against a live sandbox...');

  let sandbox;
  try {
    sandbox = await Sandbox.create({ timeoutMs: TIMEOUT_MS });
    ok('Sandbox.create');
  } catch (err) {
    fail('Sandbox.create', err);
    process.exit(1);
  }

  let failures = 0;
  try {
    const execution = await sandbox.runCode('print("e2b ok")', { language: 'python' });
    const stdout = (execution.logs?.stdout ?? []).join('');
    if (execution.error) throw new Error(`${execution.error.name}: ${execution.error.value}`);
    if (!stdout.includes('e2b ok')) throw new Error(`unexpected stdout: ${JSON.stringify(stdout)}`);
    ok(`runCode(python) -> ${JSON.stringify(stdout.trim())}`);
  } catch (err) {
    fail('runCode(python)', err);
    failures += 1;
  }

  try {
    await sandbox.files.write('/tmp/agi-verify.txt', 'hello from agi');
    ok('files.write');
  } catch (err) {
    fail('files.write', err);
    failures += 1;
  }

  try {
    await sandbox.files.makeDir('/tmp/agi-verify-dir');
    ok('files.makeDir');
  } catch (err) {
    fail('files.makeDir', err);
    failures += 1;
  }

  try {
    const entries = await sandbox.files.list('/tmp');
    ok(`files.list -> ${entries.length} entries`);
  } catch (err) {
    fail('files.list', err);
    failures += 1;
  }

  try {
    await sandbox.kill();
    ok('kill');
  } catch (err) {
    fail('kill', err);
    failures += 1;
  }

  if (failures > 0) {
    console.error(`\nE2B verification FAILED (${failures} op(s)). The binding may need a fix.`);
    process.exit(1);
  }
  console.log('\nE2B verification PASSED — the live binding works end to end.');
}

main().catch((err) => {
  console.error('Unexpected error:', err?.message ?? err);
  process.exit(1);
});
