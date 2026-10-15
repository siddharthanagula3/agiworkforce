import { describe, expect, it } from 'vitest';

import { EXECUTE_CODE_TOOL } from '@/lib/e2b/execution-tools';
import { URL_FETCH_TOOL } from '@/lib/url-fetch/url-fetch-tool';
import { WEB_SEARCH_TOOL } from '@/lib/web-search/web-search-tool';

import type { ChatCompletionRequest } from './request-processor';
import {
  applyTurnToolProhibition,
  mergeTurnToolProhibitions,
  prohibitedToolResultMessage,
  resolveTurnToolProhibition,
  turnProhibitsTool,
} from './turn-tool-prohibition';

const WEB = { surface: 'web' as const, searchRequested: false };

const R10_FIXTURE =
  'AUDIT ROUND10: synthetic renderer fidelity test. Do not use tools, web search, connected services, files, images, video, or artifacts. Reply with exactly the following Markdown, preserving the fenced bodies byte-for-byte.\n\n```latex\n$$x+y$$\n```';
const R11_FIXTURE =
  'AUDIT ROUND11 cancellation test R11-STOP-31. Write a long ordinary fictional story. Keep writing directly in the chat, without a file, artifact, code, tools, skills, web search, external services, or real personal information.';
const R13_FIXTURE =
  'SYNTHETIC UI AUDIT R13. Draft an email, but do not send it or open an email service. Keep it under 100 words. Do not browse, run code, or use external tools.';
const R8_FIXTURE =
  'Can you find and continue our earlier picnic discussion? Use the earlier conversations, not the runbook, saved memory, or web search. If you cannot search those chats, say so.';

describe('resolveTurnToolProhibition', () => {
  it.each([
    ['R10-Q01', R10_FIXTURE],
    ['TOOLS-01', R11_FIXTURE],
    ['R13-02', R13_FIXTURE],
    ['plain', 'No tools at all, just answer.'],
  ])('rules out every tool for %s', (_id, text) => {
    expect(resolveTurnToolProhibition(text, WEB)).toEqual({
      allTools: true,
      codeExecution: true,
      webSearch: true,
    });
  });

  it('rules out public search, not code, when the user limits the turn to their own chats', () => {
    expect(resolveTurnToolProhibition(R8_FIXTURE, WEB)).toEqual({
      allTools: false,
      codeExecution: false,
      webSearch: true,
    });
    expect(
      resolveTurnToolProhibition('Search only my private history for the agreed colour.', WEB),
    ).toEqual({ allTools: false, codeExecution: false, webSearch: true });
  });

  it('rules out code alone when only code is refused', () => {
    expect(resolveTurnToolProhibition('Explain the bug. Do not run code.', WEB)).toEqual({
      allTools: false,
      codeExecution: true,
      webSearch: false,
    });
    expect(resolveTurnToolProhibition('Answer in prose, no python.', WEB)).toEqual({
      allTools: false,
      codeExecution: true,
      webSearch: false,
    });
  });

  it('keeps Search mode ahead of a typed refusal of search, but not of code', () => {
    expect(
      resolveTurnToolProhibition(R10_FIXTURE, { surface: 'web', searchRequested: true }),
    ).toEqual({ allTools: false, codeExecution: true, webSearch: false });
  });

  it.each([
    'Run this Python and show me the output.',
    'Search the web for the current Reuters top story.',
    "Don't hesitate to use tools.",
    'Write a script without any tools like pandas.',
    'Do not use tools unless you need to.',
    "Don't hesitate to run code.",
    '',
  ])('finds no prohibition in %j', (text) => {
    expect(resolveTurnToolProhibition(text, WEB)).toBeNull();
  });

  it('leaves developer and coding-agent surfaces to their own tool contracts', () => {
    for (const surface of ['api', 'cli', 'vscode'] as const) {
      expect(
        resolveTurnToolProhibition(R10_FIXTURE, { surface, searchRequested: false }),
      ).toBeNull();
    }
  });
});

describe('applyTurnToolProhibition', () => {
  it('switches off every flag the refusal covers, whoever set it', () => {
    const request = {
      web_search: true,
      web_fetch: true,
      code_execution: true,
      office_creation: true,
    } as ChatCompletionRequest;
    applyTurnToolProhibition(request, resolveTurnToolProhibition(R13_FIXTURE, WEB));
    expect(request).toMatchObject({
      web_search: false,
      web_fetch: false,
      code_execution: false,
      office_creation: false,
      connector_tools_enabled: false,
    });
  });

  it('leaves the request alone without a prohibition', () => {
    const request = { web_search: true, code_execution: true } as ChatCompletionRequest;
    applyTurnToolProhibition(request, null);
    expect(request).toEqual({ web_search: true, code_execution: true });
  });
});

describe('mergeTurnToolProhibitions (PC-F04)', () => {
  const codeOnly = { allTools: false, codeExecution: true, webSearch: false };
  const webOnly = { allTools: false, codeExecution: false, webSearch: true };

  it('keeps the refusal a resumed turn began with when its last message refuses nothing', () => {
    expect(mergeTurnToolProhibitions(null, codeOnly)).toEqual(codeOnly);
  });

  it('adds what the new message refuses to what the turn already refused', () => {
    expect(mergeTurnToolProhibitions(webOnly, codeOnly)).toEqual({
      allTools: false,
      codeExecution: true,
      webSearch: true,
    });
  });

  it('is the new refusal alone when nothing was recorded', () => {
    expect(mergeTurnToolProhibitions(webOnly, null)).toEqual(webOnly);
    expect(mergeTurnToolProhibitions(null, undefined)).toBeNull();
  });
});

describe('turnProhibitsTool', () => {
  it('matches each tool against the class the user refused', () => {
    const codeOnly = { allTools: false, codeExecution: true, webSearch: false };
    expect(turnProhibitsTool(codeOnly, EXECUTE_CODE_TOOL)).toBe(true);
    expect(turnProhibitsTool(codeOnly, WEB_SEARCH_TOOL)).toBe(false);
    expect(turnProhibitsTool(codeOnly, 'memory_save')).toBe(false);

    const webOnly = { allTools: false, codeExecution: false, webSearch: true };
    expect(turnProhibitsTool(webOnly, WEB_SEARCH_TOOL)).toBe(true);
    expect(turnProhibitsTool(webOnly, URL_FETCH_TOOL)).toBe(true);
    expect(turnProhibitsTool(webOnly, EXECUTE_CODE_TOOL)).toBe(false);

    const all = { allTools: true, codeExecution: true, webSearch: true };
    expect(turnProhibitsTool(all, 'mcp__gmail__send_email')).toBe(true);
    expect(turnProhibitsTool(undefined, EXECUTE_CODE_TOOL)).toBe(false);
  });

  it('tells the model the call did not run and not to work around it', () => {
    expect(prohibitedToolResultMessage(EXECUTE_CODE_TOOL)).toContain('was not run');
    expect(prohibitedToolResultMessage(EXECUTE_CODE_TOOL)).toContain('Do not retry');
  });
});
