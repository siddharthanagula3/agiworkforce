import { describe, expect, it } from 'vitest';

import {
  effectiveAgentConfig,
  sameAgentConfig,
  toManagedCloudAgent,
  validateAgentModel,
} from '@/lib/services/custom-agent-service';
import { OWNER, TEAMMATE, agentConfig, agentRow } from './agent-fixtures';

describe('custom agent presentation', () => {
  it('shows the owner the working copy with an unpublished-changes flag', () => {
    const unpublished = toManagedCloudAgent(agentRow(), OWNER, null);
    expect(unpublished).toMatchObject({ isOwner: true, hasUnpublishedChanges: true });
    const published = toManagedCloudAgent(
      agentRow({ published_version: 1, published_config: agentConfig() }),
      OWNER,
      null,
    );
    expect(published?.hasUnpublishedChanges).toBe(false);
    const edited = toManagedCloudAgent(
      agentRow({ published_version: 1, published_config: agentConfig() }, { name: 'Renamed' }),
      OWNER,
      null,
    );
    expect(edited?.hasUnpublishedChanges).toBe(true);
  });

  it('shows a teammate only the published copy, with its owner, and nothing unpublished', () => {
    expect(toManagedCloudAgent(agentRow(), TEAMMATE, 'Ada')).toBeNull();
    const shared = toManagedCloudAgent(
      agentRow(
        { published_version: 2, published_config: agentConfig({ name: 'Published name' }) },
        { name: 'Draft name' },
      ),
      TEAMMATE,
      'Ada',
    );
    expect(shared).toMatchObject({
      name: 'Published name',
      isOwner: false,
      ownerName: 'Ada',
      hasUnpublishedChanges: false,
    });
    expect(effectiveAgentConfig(agentRow({ published_config: { name: '' } }), TEAMMATE)).toBeNull();
  });

  it('compares configurations without regard to allowlist order', () => {
    expect(
      sameAgentConfig(
        agentConfig({ connectorIds: ['b', 'a'] }),
        agentConfig({ connectorIds: ['a', 'b'] }),
      ),
    ).toBe(true);
    expect(sameAgentConfig(agentConfig({ connectorIds: [] }), agentConfig())).toBe(false);
  });

  it('accepts Auto and catalog models and refuses anything else', () => {
    expect(validateAgentModel(null)).toBeNull();
    expect(validateAgentModel('auto')).toBe('auto');
    expect(() => validateAgentModel('not-a-model')).toThrow('Pick a model from the list.');
  });
});
