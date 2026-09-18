import { describe, expect, it } from 'vitest';

import { getSupportCorpus } from '@/lib/support/agent/corpus';
import { retrieveSupportChunks } from '@/lib/support/agent/retrieval/retrieve';
import {
  HELP_CONTEXTS,
  helpContextForPath,
  helpEntryPoint,
  helpEntryPoints,
  helpHref,
  helpHrefForPath,
} from '@/lib/support/help-entry-points';

describe('contextual help entry points', () => {
  it('points every context at a document the help centre actually has', () => {
    const corpus = getSupportCorpus();
    if (!corpus.available) throw new Error('corpus unavailable');
    const docIds = new Set(corpus.chunks.map((chunk) => chunk.docId));
    for (const entry of helpEntryPoints()) {
      expect(docIds.has(entry.docId), `${entry.context} points at ${entry.docId}`).toBe(true);
    }
  });

  it('retrieves the document it promises for every context', () => {
    for (const entry of helpEntryPoints()) {
      const result = retrieveSupportChunks(entry.query, { limit: 8 });
      const found = result.chunks.some((chunk) => chunk.chunk.docId === entry.docId);
      expect(found, `${entry.context}: "${entry.query}" does not retrieve ${entry.docId}`).toBe(
        true,
      );
    }
  });

  it('links into the help centre with the query already spelled', () => {
    for (const context of HELP_CONTEXTS) {
      const href = helpHref(context);
      expect(href.startsWith('/help?q=')).toBe(true);
      expect(decodeURIComponent(href.slice('/help?q='.length))).toBe(helpEntryPoint(context).query);
    }
  });

  it('picks the context from the route the reader is on', () => {
    expect(helpContextForPath('/billing')).toBe('billing');
    expect(helpContextForPath('/billing/invoices')).toBe('billing');
    expect(helpContextForPath('/agi-work')).toBe('work');
    expect(helpContextForPath('/connectors/mcp-directory')).toBe('connectors');
    expect(helpContextForPath('/workspace/policy')).toBe('workspace-admin');
    expect(helpContextForPath('/operator')).toBe('operator');
    expect(helpContextForPath('/chat')).toBeNull();
    expect(helpContextForPath(null)).toBeNull();
  });

  it('falls back to the help centre when the route has no context', () => {
    expect(helpHrefForPath('/chat')).toBe('/help');
    expect(helpHrefForPath('/billing')).toBe(helpHref('billing'));
  });

  it('never matches a route that merely starts with the same letters', () => {
    expect(helpContextForPath('/administration-theory')).toBeNull();
    expect(helpContextForPath('/workspaces-are-not-workspace')).toBeNull();
  });

  it('labels every context for a person, not for a route', () => {
    for (const entry of helpEntryPoints()) {
      expect(entry.label.length).toBeGreaterThan(3);
      expect(entry.label).not.toMatch(/^\//u);
    }
  });
});
