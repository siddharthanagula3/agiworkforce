import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEVELOPER_APPROVAL_DECISIONS,
  DEVELOPER_RUNTIME_CAPABILITIES,
  DEVELOPER_SESSION_COMMANDS,
  DEVELOPER_TURN_LIMITS,
  developerApprovalAllows,
  developerReviewDecision,
  developerRuntimeCapabilities,
  isDeveloperApprovalDecision,
  type DeveloperApprovalAnswer,
  type DeveloperThreadDeleteRequest,
  type DeveloperThreadForkRequest,
  type DeveloperThreadCompactRequest,
  type DeveloperTurnRequest,
  type DeveloperTurnSteer,
  type DeveloperSessionEvent,
  type DeveloperUserInputAnswer,
} from '../developer-sessions';

const host = readFileSync(
  fileURLToPath(
    new URL('../../../../../apps/cli/src/app_server/developer_host.rs', import.meta.url),
  ),
  'utf8',
);

function hostConstant(name: string): number {
  const match = host.match(new RegExp(`const ${name}: usize = ([\\d_]+);`, 'u'));
  expect(match, `${name} is declared by the CLI host`).not.toBeNull();
  return Number(match![1]!.replaceAll('_', ''));
}

const ANSWER: Omit<DeveloperApprovalAnswer, 'decision'> = {
  rootId: 'root-1',
  threadId: 'thread-1',
  turnId: 'turn-1',
  requestId: 'request-1',
};

describe('developer turn input', () => {
  it('mirrors the bounds the CLI host enforces', () => {
    expect(DEVELOPER_TURN_LIMITS.images).toBe(hostConstant('MAX_IMAGE_INPUTS_PER_TURN'));
    expect(DEVELOPER_TURN_LIMITS.imageBytes).toBe(hostConstant('MAX_IMAGE_INPUT_BYTES'));
    expect(DEVELOPER_TURN_LIMITS.contextFiles).toBe(hostConstant('MAX_CONTEXT_FILES_PER_TURN'));
  });

  it('carries every turn option through a JSON round trip', () => {
    const request: DeveloperTurnRequest = {
      rootId: 'root-1',
      threadId: 'thread-1',
      text: 'Fix the failing test',
      model: 'local-model',
      agentMode: 'plan',
      reasoningEffort: 'high',
      contextFiles: ['src/app.ts'],
      images: ['data:image/png;base64,AAAA'],
    };
    expect(JSON.parse(JSON.stringify(request))).toEqual(request);

    const steer: DeveloperTurnSteer = {
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      text: 'Use the other file',
      images: ['data:image/png;base64,AAAA'],
    };
    expect(JSON.parse(JSON.stringify(steer))).toEqual(steer);
  });

  it('exposes steering as a developer command', () => {
    expect(DEVELOPER_SESSION_COMMANDS).toContain('developer_turn_steer');
  });
});

describe('agent questions', () => {
  it('carries a question and its answer or cancel through a JSON round trip', () => {
    const asked: DeveloperSessionEvent = {
      type: 'user-input-requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'q-1',
      question: 'Which branch?',
    };
    const answered: DeveloperUserInputAnswer = {
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'q-1',
      answer: 'main',
    };
    const cancelled: DeveloperUserInputAnswer = { ...answered, answer: null };

    for (const value of [asked, answered, cancelled]) {
      expect(JSON.parse(JSON.stringify(value))).toEqual(value);
    }
    expect(DEVELOPER_SESSION_COMMANDS).toContain('developer_user_input_answer');
  });

  it('names the wire methods the Rust contract declares', () => {
    const contract = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../crates/agiworkforce-protocol/src/developer_session.rs',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    expect(contract).toContain('pub const USER_INPUT_REQUESTED: &str = "userInput/requested";');
    expect(contract).toContain('pub const USER_INPUT_RESPOND: &str = "userInput/respond";');
  });
});

describe('approval decisions', () => {
  it('maps each decision onto the wire value the CLI reads', () => {
    expect(developerReviewDecision({ ...ANSWER, decision: 'approve_once' })).toBe('approved');
    expect(developerReviewDecision({ ...ANSWER, decision: 'approve_for_session' })).toBe(
      'approved_for_session',
    );
    expect(
      developerReviewDecision({
        ...ANSWER,
        decision: 'always_allow_command',
        commandPrefix: ['cargo', 'test'],
      }),
    ).toEqual({
      approved_execpolicy_amendment: { proposed_execpolicy_amendment: ['cargo', 'test'] },
    });
    expect(developerReviewDecision({ ...ANSWER, decision: 'deny' })).toBe('denied');
    expect(developerReviewDecision({ ...ANSWER, decision: 'deny_and_stop' })).toBe('abort');
  });

  it('refuses a command rule that names no command', () => {
    expect(() => developerReviewDecision({ ...ANSWER, decision: 'always_allow_command' })).toThrow(
      'A command rule needs the command it allows.',
    );
    expect(() =>
      developerReviewDecision({ ...ANSWER, decision: 'always_allow_command', commandPrefix: [''] }),
    ).toThrow();
  });

  it('says which decisions let the call run', () => {
    expect(DEVELOPER_APPROVAL_DECISIONS.filter(developerApprovalAllows)).toEqual([
      'approve_once',
      'approve_for_session',
      'always_allow_command',
    ]);
  });

  it('refuses an answer that carries no decision rather than sending nothing', () => {
    expect(() =>
      developerReviewDecision({ ...ANSWER, approved: true } as unknown as DeveloperApprovalAnswer),
    ).toThrow('That is not an approval decision.');
  });

  it('accepts only the decisions it names', () => {
    for (const decision of DEVELOPER_APPROVAL_DECISIONS) {
      expect(isDeveloperApprovalDecision(decision)).toBe(true);
    }
    expect(isDeveloperApprovalDecision(true)).toBe(false);
    expect(isDeveloperApprovalDecision('approved')).toBe(false);
  });
});

describe('runtime capabilities', () => {
  it('reads none from a shell that predates the list', () => {
    expect(developerRuntimeCapabilities({}).size).toBe(0);
  });

  it('keeps only the features the page knows, whatever else a shell reports', () => {
    expect([
      ...developerRuntimeCapabilities({ capabilities: ['steer', 'teleport', 'worktrees'] }),
    ]).toEqual(['worktrees', 'steer']);
    expect(
      developerRuntimeCapabilities({ capabilities: [...DEVELOPER_RUNTIME_CAPABILITIES] }).size,
    ).toBe(DEVELOPER_RUNTIME_CAPABILITIES.length);
  });
});

describe('deleting a session', () => {
  it('is a developer command the page offers only when the shell reports it', () => {
    expect(DEVELOPER_SESSION_COMMANDS).toContain('developer_thread_delete');
    expect(DEVELOPER_RUNTIME_CAPABILITIES).toContain('thread_delete');
    expect(developerRuntimeCapabilities({ capabilities: ['worktrees'] }).has('thread_delete')).toBe(
      false,
    );
  });

  it('sends the field name the Rust params declare', () => {
    const contract = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../crates/agiworkforce-protocol/src/developer_session.rs',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    const request: DeveloperThreadDeleteRequest = {
      rootId: 'root-1',
      threadId: 'thread-1',
      discardWorktreeArchives: true,
    };

    expect(contract).toContain('pub const THREAD_DELETE: &str = "thread/delete";');
    expect(contract).toContain('pub discard_worktree_archives: bool,');
    expect(JSON.parse(JSON.stringify(request))).toEqual(request);
  });
});

describe('summarizing a session', () => {
  it('is offered only when the shell reports a CLI that serves thread/compact', () => {
    expect(DEVELOPER_SESSION_COMMANDS).toContain('developer_thread_compact');
    expect(DEVELOPER_RUNTIME_CAPABILITIES).toContain('thread_compact');
    expect(
      developerRuntimeCapabilities({ capabilities: ['thread_fork'] }).has('thread_compact'),
    ).toBe(false);
  });

  it('names the turn the way the Rust params declare it', () => {
    const contract = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../crates/agiworkforce-protocol/src/developer_session.rs',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    const request: DeveloperThreadCompactRequest = {
      rootId: 'root-1',
      threadId: 'thread-1',
      fromTurnId: 'turn-1',
    };

    expect(contract).toContain('pub const THREAD_COMPACT: &str = "thread/compact";');
    expect(contract).toContain('pub from_turn_id: Option<String>,');
    expect(Object.keys(request)).toContain('fromTurnId');
  });
});

describe('branching a session from a turn', () => {
  it('is offered only when the shell reports a CLI that cuts the copy at a turn', () => {
    expect(DEVELOPER_SESSION_COMMANDS).toContain('developer_thread_fork');
    expect(DEVELOPER_RUNTIME_CAPABILITIES).toContain('thread_fork');
    expect(developerRuntimeCapabilities({ capabilities: ['worktrees'] }).has('thread_fork')).toBe(
      false,
    );
  });

  it('names the turn the way the Rust params declare it', () => {
    const contract = readFileSync(
      fileURLToPath(
        new URL(
          '../../../../../crates/agiworkforce-protocol/src/developer_session.rs',
          import.meta.url,
        ),
      ),
      'utf8',
    );
    const request: DeveloperThreadForkRequest = {
      rootId: 'root-1',
      threadId: 'thread-1',
      throughTurnId: 'turn-1',
    };

    expect(contract).toContain('pub through_turn_id: Option<String>,');
    expect(contract).toContain('pub fork_through_turn: bool,');
    expect(Object.keys(request)).toContain('throughTurnId');
  });
});
