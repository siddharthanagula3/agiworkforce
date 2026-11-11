import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

type LifecycleDb = Pick<DatabaseAdapter, 'query'>;
export type KnowledgeCleanupTargets = Readonly<Record<string, string>>;
interface ObjectClaim extends Record<string, unknown> {
  fingerprint: string;
  object_key: string;
  state: 'deleting';
  claim_token: string;
  targets: Record<string, string>;
  receipts: Record<string, string>;
}
export type KnowledgeCleanupResult =
  | { status: 'deleted'; confirmed: string[] }
  | {
      status: 'retained' | 'busy' | 'untracked' | 'unverified' | 'namespace-changed';
      confirmed: string[];
    };

export class KnowledgeCleanupLeaseLost extends Error {
  constructor() {
    super('The object cleanup lease is no longer current; its outcome must be reconciled.');
    this.name = 'KnowledgeCleanupLeaseLost';
  }
}

function validateTargets(targets: KnowledgeCleanupTargets): void {
  const entries = Object.entries(targets);
  if (
    entries.length === 0 ||
    entries.some(([name, location]) => !name || typeof location !== 'string' || !location)
  ) {
    throw new Error('Object cleanup requires explicit storage target identities.');
  }
}

export async function reconcileProjectKnowledgeObject(
  db: LifecycleDb,
  input: {
    fingerprint: string;
    targets: KnowledgeCleanupTargets;
    leaseSeconds: number;
    remove: (target: { name: string; location: string; objectKey: string }) => Promise<void>;
    signal?: AbortSignal;
  },
): Promise<KnowledgeCleanupResult> {
  validateTargets(input.targets);
  input.signal?.throwIfAborted();
  const [claim] = await db.query<ObjectClaim>(
    `select * from public.claim_project_knowledge_object_cleanup($1, $2::jsonb, $3)`,
    [input.fingerprint, JSON.stringify(input.targets), input.leaseSeconds],
  );
  if (!claim) {
    const [current] = await db.query<{
      state: string;
      targets: Record<string, string>;
      receipts: Record<string, string>;
    }>(
      `select state, targets, receipts
         from public.project_knowledge_objects where fingerprint = $1`,
      [input.fingerprint],
    );
    if (!current) return { status: 'untracked', confirmed: [] };
    const confirmed = Object.keys(current.receipts);
    if (current.state === 'deleted') return { status: 'deleted', confirmed };
    if (current.state === 'referenced') return { status: 'retained', confirmed };
    if (Object.keys(current.targets).length === 0) return { status: 'unverified', confirmed };
    if (
      Object.entries(current.targets).some(([name, location]) => input.targets[name] !== location)
    ) {
      return { status: 'namespace-changed', confirmed };
    }
    return { status: 'busy', confirmed };
  }
  const confirmed = Object.keys(claim.receipts);
  const remaining = Object.entries(claim.targets).sort(([first], [second]) =>
    first < second ? -1 : first > second ? 1 : 0,
  );
  for (const [name, location] of remaining) {
    if (Object.hasOwn(claim.receipts, name)) continue;
    input.signal?.throwIfAborted();
    const [renewed] = await db.query<{ current: boolean }>(
      `select public.renew_project_knowledge_object_cleanup($1, $2::uuid, $3) as current`,
      [input.fingerprint, claim.claim_token, input.leaseSeconds],
    );
    if (!renewed?.current) throw new KnowledgeCleanupLeaseLost();
    await input.remove({ name, location, objectKey: claim.object_key });
    const [receipt] = await db.query<{ current: boolean }>(
      `select public.record_project_knowledge_object_cleanup($1, $2::uuid, $3) as current`,
      [input.fingerprint, claim.claim_token, name],
    );
    if (!receipt?.current) throw new KnowledgeCleanupLeaseLost();
    confirmed.push(name);
  }
  return { status: 'deleted', confirmed };
}
