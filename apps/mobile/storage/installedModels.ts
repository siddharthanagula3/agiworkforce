// AUDIT-FIX: storage layer half-shipped — InstalledModel CRUD stub.

import type { InstalledModel } from './types';

export async function listInstalledModels(): Promise<InstalledModel[]> {
  return [];
}

export async function getInstalledModel(_id: string): Promise<InstalledModel | null> {
  return null;
}

export async function recordInstalledModel(_model: InstalledModel): Promise<void> {
  /* no-op */
}

export async function removeInstalledModel(_id: string): Promise<void> {
  /* no-op */
}
