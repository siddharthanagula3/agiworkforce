import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRIVATE_INDEX_SEARCH_MODE,
  DEFAULT_SEARCH_RETRIEVAL_STRATEGY,
  SEARCH_MODES,
  SEARCH_MODE_DECLARATIONS,
  SEARCH_RETRIEVAL_STRATEGIES,
  isSearchMode,
  parseSearchRetrievalStrategy,
  searchModeDeclaration,
  searchModesByCorpus,
  strategyUsesLexical,
  strategyUsesSemantic,
} from '../search/types';

const DOCUMENTED_MODES = [
  'product',
  'private_knowledge',
  'project',
  'enterprise',
  'code',
  'connector',
  'web',
  'research',
] as const;

describe('search mode declarations', () => {
  it('declares every documented mode exactly once', () => {
    expect([...SEARCH_MODES].sort()).toEqual([...DOCUMENTED_MODES].sort());
    expect(Object.keys(SEARCH_MODE_DECLARATIONS).sort()).toEqual([...DOCUMENTED_MODES].sort());
  });

  it('gives each mode a freshness, citation, authority and latency contract', () => {
    for (const mode of SEARCH_MODES) {
      const declaration = searchModeDeclaration(mode);
      expect(declaration.id).toBe(mode);
      expect(declaration.label.length).toBeGreaterThan(0);
      expect(['live', 'indexed']).toContain(declaration.freshness);
      expect(['required', 'optional', 'none']).toContain(declaration.citations);
      expect(['session', 'workspace_member', 'connector_grant']).toContain(declaration.authority);
      expect(declaration.latencyBudgetMs).toBeGreaterThan(0);
      expect(['workspace_region', 'external_egress']).toContain(declaration.residency);
    }
  });

  it('separates product search, private retrieval, web search and research', () => {
    expect(searchModeDeclaration('product').corpus).toBe('workspace_rows');
    expect(searchModeDeclaration('private_knowledge').corpus).toBe('private_index');
    expect(searchModeDeclaration('web').corpus).toBe('public_web');
    expect(searchModeDeclaration('research').corpus).toBe('multi_step');
    expect(searchModeDeclaration('connector').corpus).toBe('connector_grant');
  });

  it('marks product search as read by a person and retrieval as read by a model', () => {
    expect(searchModeDeclaration('product').consumer).toBe('person');
    expect(searchModeDeclaration('product').citations).toBe('none');
    expect(searchModeDeclaration('private_knowledge').consumer).toBe('model');
    expect(searchModeDeclaration('private_knowledge').citations).toBe('required');
  });

  it('keeps every workspace corpus inside the workspace region and egress modes outside', () => {
    for (const mode of SEARCH_MODES) {
      const declaration = searchModeDeclaration(mode);
      const internal =
        declaration.corpus === 'workspace_rows' || declaration.corpus === 'private_index';
      expect(declaration.residency).toBe(internal ? 'workspace_region' : 'external_egress');
    }
  });

  it('lists the modes one corpus serves', () => {
    expect([...searchModesByCorpus('private_index')].sort()).toEqual([
      'code',
      'enterprise',
      'private_knowledge',
      'project',
    ]);
    expect(searchModesByCorpus('private_index')).toContain(DEFAULT_PRIVATE_INDEX_SEARCH_MODE);
  });

  it('recognises declared modes and nothing else', () => {
    expect(isSearchMode('research')).toBe(true);
    expect(isSearchMode('everything')).toBe(false);
    expect(isSearchMode(null)).toBe(false);
  });
});

describe('retrieval strategy', () => {
  it('parses the declared strategies and the legacy aliases the route already accepts', () => {
    expect(parseSearchRetrievalStrategy('lexical')).toBe('keyword');
    expect(parseSearchRetrievalStrategy('vector')).toBe('semantic');
    for (const strategy of SEARCH_RETRIEVAL_STRATEGIES) {
      expect(parseSearchRetrievalStrategy(strategy.toUpperCase())).toBe(strategy);
    }
  });

  it('answers null for anything unrecognised so the boundary picks the default', () => {
    expect(parseSearchRetrievalStrategy('fuzzy')).toBeNull();
    expect(parseSearchRetrievalStrategy(null)).toBeNull();
    expect(DEFAULT_SEARCH_RETRIEVAL_STRATEGY).toBe('hybrid');
  });

  it('says which halves of the hybrid each strategy runs', () => {
    expect(strategyUsesLexical('keyword')).toBe(true);
    expect(strategyUsesSemantic('keyword')).toBe(false);
    expect(strategyUsesLexical('semantic')).toBe(false);
    expect(strategyUsesSemantic('semantic')).toBe(true);
    expect(strategyUsesLexical('hybrid')).toBe(true);
    expect(strategyUsesSemantic('hybrid')).toBe(true);
  });
});
