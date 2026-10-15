import { describe, expect, it } from 'vitest';
import type { ManagedUsageSummaryResponse } from '@agiworkforce/types';
import {
  CHAT_SLASH_COMMANDS,
  CHAT_SLASH_DONE,
  availableChatSlashCommands,
  chatStatusLines,
} from '../chat-slash-commands';

describe('availableChatSlashCommands', () => {
  it('offers nothing without actions', () => {
    expect(availableChatSlashCommands(undefined)).toEqual([]);
    expect(availableChatSlashCommands({})).toEqual([]);
  });

  it('offers only the commands whose action exists, in registry order', () => {
    const run = () => CHAT_SLASH_DONE;
    const ids = availableChatSlashCommands({ status: { run }, new: { run } }).map(
      (command) => command.id,
    );
    expect(ids).toEqual(['new', 'status']);
  });

  it('defines each command once', () => {
    const ids = CHAT_SLASH_COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('chatStatusLines', () => {
  const usage = {
    plan_tier: 'pro',
    usage_percentage: 10,
    session_usage_percentage: 40,
    weekly_usage_percentage: 25,
    flagship_weekly_usage_percentage: 0,
  } as unknown as ManagedUsageSummaryResponse;

  it('says nothing about a plan it does not know yet', () => {
    expect(chatStatusLines({ modelName: 'Model A', planTier: null, usage })).toEqual([
      { label: 'Model', value: 'Model A' },
    ]);
  });

  it('shows the session and weekly allowance on a paid plan', () => {
    const lines = chatStatusLines({ modelName: 'Model A', planTier: 'pro', usage });
    expect(lines.map((line) => line.label)).toEqual([
      'Model',
      'Plan',
      'Current session',
      'This week',
    ]);
    expect(lines[2]?.value).toBe('60% left');
    expect(lines[3]?.value).toBe('75% left');
  });

  it('shows no usage meter on the Free plan', () => {
    const lines = chatStatusLines({ modelName: 'Model A', planTier: 'free', usage });
    expect(lines.map((line) => line.label)).toEqual(['Model', 'Plan']);
  });

  it('says usage has not loaded rather than inventing a figure', () => {
    const lines = chatStatusLines({ modelName: null, planTier: 'pro', usage: null });
    expect(lines.at(-1)).toEqual({ label: 'Usage', value: 'Not loaded yet' });
  });
});
