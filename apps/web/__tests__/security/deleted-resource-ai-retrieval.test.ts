import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  RESOURCE_LIFECYCLE_SEMANTICS,
  isAiRetrievableLifecycleState,
  isSearchableLifecycleState,
  visibilityGrantsView,
  type ResourceLifecycleState,
} from '@agiworkforce/types';
import {
  lifecycleScopeClauses,
  lifecycleScopeSql,
  lifecycleStatesExcludedFromAiRetrieval,
} from '@/lib/resources/lifecycle-sql';

/**
 * What a user deleted or archived must not come back to them through the
 * model. Search scoping is covered elsewhere; this file is about the retrieval
 * path that assembles context for a turn, which reads its own SQL and would
 * not be caught by a search test.
 */
const RETRIEVAL_SERVICES = [
  'lib/services/project-context-service.ts',
  'lib/services/past-chat-context-service.ts',
  'lib/services/reflect-service.ts',
];

function source(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

function selectStatements(text: string): string[] {
  return [...text.matchAll(/select[\s\S]*?(?=`)/giu)].map((match) => match[0].toLowerCase());
}

describe('deleted and archived resources are excluded from AI retrieval', () => {
  it('the lifecycle contract marks deleted and archived as not retrievable', () => {
    const excluded = lifecycleStatesExcludedFromAiRetrieval();

    expect(excluded).toEqual(expect.arrayContaining(['archived', 'soft_deleted', 'purged']));
    expect(isAiRetrievableLifecycleState('active')).toBe(true);
    expect(isAiRetrievableLifecycleState('soft_deleted')).toBe(false);
    expect(isAiRetrievableLifecycleState('archived')).toBe(false);
    expect(isAiRetrievableLifecycleState('purged')).toBe(false);
  });

  it('no lifecycle state is retrievable by the model while hidden from search', () => {
    for (const state of Object.keys(RESOURCE_LIFECYCLE_SEMANTICS) as ResourceLifecycleState[]) {
      if (isAiRetrievableLifecycleState(state)) {
        expect(isSearchableLifecycleState(state), state).toBe(true);
      }
    }
  });

  it('the scope helper always excludes soft-deleted rows, even when archived are asked for', () => {
    const withArchived = lifecycleScopeClauses('web_conversations', { includeArchived: true });
    const withoutArchived = lifecycleScopeClauses('web_conversations');

    expect(withArchived.some((clause) => clause.includes('deleted_at is null'))).toBe(true);
    expect(withoutArchived.length).toBeGreaterThan(withArchived.length);
    expect(lifecycleScopeSql('web_conversations', { alias: 'c' })).toContain(
      'c.deleted_at is null',
    );
  });

  it.each(RETRIEVAL_SERVICES)('%s reads no row it must not retrieve', (relative) => {
    const statements = selectStatements(source(relative));

    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) {
      if (!statement.includes('deleted_at')) continue;
      expect(statement, `${relative}: a deleted row can reach the model`).toMatch(
        /deleted_at\s+is\s+null/u,
      );
      expect(statement).not.toMatch(/deleted_at\s+is\s+not\s+null/u);
    }
  });

  it('the project context read excludes archived projects as well as deleted ones', () => {
    const text = source('lib/services/project-context-service.ts').toLowerCase();

    expect(text).toMatch(/is_archived\s*=\s*false/u);
    expect(text).toMatch(/coalesce\(c\.archived,\s*false\)\s*=\s*false/u);
  });

  it('a private resource is not readable on visibility alone, whoever asks', () => {
    const member = { userId: 'user-1', organizationId: 'org-1' };

    expect(visibilityGrantsView('private', member, 'org-1')).toBe(false);
    expect(visibilityGrantsView('organization', member, 'org-1')).toBe(true);
    expect(visibilityGrantsView('organization', member, 'org-2')).toBe(false);
    expect(
      visibilityGrantsView('organization', { userId: null, organizationId: null }, 'org-1'),
    ).toBe(false);
  });
});
