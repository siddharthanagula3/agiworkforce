import { describe, expect, it } from 'vitest';
import {
  GUARD_CONFIRM_INDEX,
  quitPrompt,
  revokeComputerUsePrompt,
  stopAgentsPrompt,
  withdrawFolderPrompt,
  type LiveWork,
} from '../quitGuard';

const idle: LiveWork = {
  shellRuns: 0,
  agentTurns: 0,
  remoteControl: { status: 'idle', phoneName: null },
};

describe('quit guard', () => {
  it('asks nothing when no work would stop', () => {
    expect(quitPrompt(idle)).toBeNull();
    expect(quitPrompt({ ...idle, remoteControl: { status: 'error', phoneName: null } })).toBeNull();
  });

  it('names each kind of work and its count, with Cancel as the default', () => {
    const prompt = quitPrompt({
      shellRuns: 2,
      agentTurns: 1,
      remoteControl: { status: 'connected', phoneName: 'Pixel' },
    });

    expect(prompt).not.toBeNull();
    expect(prompt?.detail).toContain('1 coding agent turn still running');
    expect(prompt?.detail).toContain('2 local commands still running');
    expect(prompt?.detail).toContain('Remote Control with Pixel');
    expect(prompt?.buttons[prompt.defaultId]).toBe('Cancel');
    expect(prompt?.cancelId).toBe(0);
    expect(prompt?.buttons[GUARD_CONFIRM_INDEX]).toBe('Quit and Stop All');
  });

  it('counts a Remote Control session still waiting for a phone', () => {
    expect(
      quitPrompt({ ...idle, remoteControl: { status: 'waiting', phoneName: null } })?.detail,
    ).toContain('waiting for a phone');
  });
});

describe('stop all agents', () => {
  it('asks only about agent turns, and only when one is running', () => {
    expect(
      stopAgentsPrompt({
        ...idle,
        shellRuns: 3,
        remoteControl: { status: 'connected', phoneName: 'Pixel' },
      }),
    ).toBeNull();

    const prompt = stopAgentsPrompt({ ...idle, agentTurns: 2 });
    expect(prompt?.detail).toContain('2 coding agent turns still running');
    expect(prompt?.detail).not.toContain('Remote Control');
    expect(prompt?.buttons[prompt.defaultId]).toBe('Cancel');
  });
});

describe('revoking computer use', () => {
  it('names the consequence and defaults to Cancel', () => {
    const prompt = revokeComputerUsePrompt();

    expect(prompt.message).toBe('Agents lose control of this screen until you allow it again.');
    expect(prompt.buttons[prompt.defaultId]).toBe('Cancel');
    expect(prompt.buttons[GUARD_CONFIRM_INDEX]).toBe('Stop and Revoke');
  });
});

describe('withdrawing a folder or the agent grant on it', () => {
  it('asks nothing when nothing is running there', () => {
    expect(withdrawFolderPrompt('ledger', { shellRuns: 0, agentTurns: 0 })).toBeNull();
  });

  it('names the folder and the work that stops, with Cancel as the default', () => {
    const prompt = withdrawFolderPrompt('ledger', { shellRuns: 1, agentTurns: 2 });

    expect(prompt?.message).toBe('Withdrawing this stops what is running in ledger.');
    expect(prompt?.detail).toContain('2 coding agent turns still running');
    expect(prompt?.detail).toContain('1 local command still running');
    expect(prompt?.detail).toContain('asks for permission first');
    expect(prompt?.detail).not.toContain('Remote Control');
    expect(prompt?.buttons[prompt.defaultId]).toBe('Cancel');
    expect(prompt?.buttons[GUARD_CONFIRM_INDEX]).toBe('Withdraw and Stop');
  });
});
