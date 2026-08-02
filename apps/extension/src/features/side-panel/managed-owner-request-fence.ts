import {
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';

export interface ManagedCloudOwnerRequestSnapshot {
  /** Monotonic side-panel epoch. A newer refresh or owner transition supersedes it. */
  generation: number;
  /** Exact account/session incarnation visible when the request started. */
  owner: ManagedCloudOwner | null;
}

function sameNullableOwner(
  left: ManagedCloudOwner | null,
  right: ManagedCloudOwner | null,
): boolean {
  return (left === null && right === null) || sameManagedCloudOwner(left, right);
}

/**
 * Fences async side-panel reads to the owner incarnation that admitted them.
 *
 * Starting a newer read supersedes an older read even for the same owner, and
 * `invalidate` retires every outstanding read during an account/session
 * transition. This keeps delayed extension-message callbacks from repainting
 * a new account's UI with the previous account's data.
 */
export class ManagedCloudOwnerRequestFence {
  private generation = 0;

  begin(owner: ManagedCloudOwner | null): ManagedCloudOwnerRequestSnapshot {
    this.generation += 1;
    return {
      generation: this.generation,
      owner: owner ? { ...owner } : null,
    };
  }

  invalidate(): void {
    this.generation += 1;
  }

  isCurrent(
    snapshot: ManagedCloudOwnerRequestSnapshot,
    currentOwner: ManagedCloudOwner | null,
  ): boolean {
    return (
      snapshot.generation === this.generation && sameNullableOwner(snapshot.owner, currentOwner)
    );
  }
}
