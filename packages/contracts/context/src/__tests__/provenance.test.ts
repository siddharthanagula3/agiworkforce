import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PROVENANCE_FIELDS,
  PROVENANCE_OBJECT_KINDS,
  PROVENANCE_SCHEMA_VERSION,
  isProvenanceObjectKind,
  provenanceKindPolicies,
  provenanceKindPolicy,
  provenanceKindsAwaitingProducer,
  provenanceRecord,
  type ProvenanceField,
  type ProvenanceInput,
  type ProvenanceObjectKind,
} from '../provenance';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../..');

const COMPLETE: ProvenanceInput = {
  creatorAccountId: 'user-1',
  agentId: 'schedule-task-1',
  parentObject: { kind: 'assistant_response', id: 'message-1' },
  sourceConversationId: 'conversation-1',
  sourceTurnId: 'message-1',
  sourceFileIds: ['file-1'],
  sourceConnectorItemIds: ['connector-item-1'],
  model: 'a-model-key',
  providerRoute: 'a-route-id',
  promptVersion: 'chat.system@3',
  toolInvocations: [{ name: 'web_search', callId: 'call-1' }],
  createdAt: '2026-09-20T00:00:00.000Z',
  schemaVersion: PROVENANCE_SCHEMA_VERSION,
  trustMode: 'managed',
};

const FIELD_TO_EMPTY: { readonly [K in ProvenanceField]: Partial<ProvenanceInput> } = {
  creatorAccountId: { creatorAccountId: '  ' },
  agentId: { agentId: null },
  parentObject: { parentObject: null },
  sourceConversationId: { sourceConversationId: null },
  sourceTurnId: { sourceTurnId: null },
  sourceFileIds: { sourceFileIds: [] },
  sourceConnectorItemIds: { sourceConnectorItemIds: [] },
  model: { model: null },
  providerRoute: { providerRoute: null },
  promptVersion: { promptVersion: null },
  toolInvocations: { toolInvocations: [] },
  createdAt: { createdAt: '' },
  schemaVersion: { schemaVersion: '' },
  trustMode: { trustMode: ' ' },
};

describe('the canonical provenance model', () => {
  it('names every object kind exactly once and answers for it', () => {
    expect(new Set(PROVENANCE_OBJECT_KINDS).size).toBe(PROVENANCE_OBJECT_KINDS.length);
    for (const objectKind of PROVENANCE_OBJECT_KINDS) {
      expect(provenanceKindPolicy(objectKind).objectKind).toBe(objectKind);
      expect(isProvenanceObjectKind(objectKind)).toBe(true);
    }
    expect(isProvenanceObjectKind('memo')).toBe(false);
    expect(provenanceKindPolicies()).toHaveLength(PROVENANCE_OBJECT_KINDS.length);
  });

  it('carries every declared field on every record it builds', () => {
    for (const objectKind of PROVENANCE_OBJECT_KINDS) {
      const record = provenanceRecord(objectKind, COMPLETE);
      for (const field of PROVENANCE_FIELDS) {
        expect(
          Object.prototype.hasOwnProperty.call(record, field),
          `${objectKind} has no ${field}`,
        ).toBe(true);
      }
      expect(record.objectKind).toBe(objectKind);
    }
  });

  it('requires an account, a time, a schema version and a trust mode of every kind', () => {
    for (const objectKind of PROVENANCE_OBJECT_KINDS) {
      for (const field of [
        'creatorAccountId',
        'createdAt',
        'schemaVersion',
        'trustMode',
      ] as const) {
        expect(provenanceKindPolicy(objectKind).required, objectKind).toContain(field);
      }
    }
  });

  it('refuses to stamp a kind that is missing any field it declares required', () => {
    for (const objectKind of PROVENANCE_OBJECT_KINDS) {
      for (const field of provenanceKindPolicy(objectKind).required) {
        expect(
          () => provenanceRecord(objectKind, { ...COMPLETE, ...FIELD_TO_EMPTY[field] }),
          `${objectKind} accepted a missing ${field}`,
        ).toThrow(new RegExp(`missing .*${field}`));
      }
    }
  });

  it('leaves an optional field empty without refusing the record', () => {
    for (const objectKind of PROVENANCE_OBJECT_KINDS) {
      const optional = PROVENANCE_FIELDS.filter(
        (field) => !provenanceKindPolicy(objectKind).required.includes(field),
      );
      const input = optional.reduce<ProvenanceInput>(
        (accumulated, field) => ({ ...accumulated, ...FIELD_TO_EMPTY[field] }),
        COMPLETE,
      );
      expect(() => provenanceRecord(objectKind, input), objectKind).not.toThrow();
    }
  });

  it('requires the model, the route and the prompt version of everything a model wrote', () => {
    const modelAuthored: readonly ProvenanceObjectKind[] = PROVENANCE_OBJECT_KINDS.filter(
      (objectKind) => objectKind !== 'memory' && objectKind !== 'automated_external_action',
    );
    for (const objectKind of modelAuthored) {
      const { required } = provenanceKindPolicy(objectKind);
      expect(required, objectKind).toContain('model');
      expect(required, objectKind).toContain('providerRoute');
      expect(required, objectKind).toContain('promptVersion');
    }
  });

  it('ties every conversational kind back to the conversation it came from', () => {
    for (const objectKind of PROVENANCE_OBJECT_KINDS) {
      if (objectKind === 'code_patch') continue;
      expect(provenanceKindPolicy(objectKind).required, objectKind).toContain(
        'sourceConversationId',
      );
    }
  });

  it('accounts for every kind: stamped by a named builder, or awaiting one', () => {
    const awaiting = new Set(provenanceKindsAwaitingProducer());
    for (const policy of provenanceKindPolicies()) {
      if (awaiting.has(policy.objectKind)) {
        expect(policy.producedBy).toEqual([]);
        continue;
      }
      for (const producer of policy.producedBy) {
        const modulePath = path.join(REPO_ROOT, producer.module);
        expect(existsSync(modulePath), `${producer.module} is missing`).toBe(true);
        expect(
          new RegExp(`export (?:async )?function ${producer.builder}\\b`).test(
            readFileSync(modulePath, 'utf8'),
          ),
          `${producer.module} does not export ${producer.builder}`,
        ).toBe(true);
      }
    }
    expect(awaiting.has('memory')).toBe(false);
  });
});
