import {
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';

export interface ManagedCloudOwnerRequestSnapshot {
  generation: number;
  owner: ManagedCloudOwner | null;
}

function sameNullableOwner(
  left: ManagedCloudOwner | null,
  right: ManagedCloudOwner | null,
): boolean {
  return (left === null && right === null) || sameManagedCloudOwner(left, right);
}

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
