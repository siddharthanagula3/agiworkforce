import 'server-only';

import {
  STUDIO_LIBRARY_KINDS,
  type StudioLibraryItemCreateRequest,
  type StudioLibraryKind,
} from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export const MAX_LIBRARY_ITEMS_PER_KIND = 100;

export interface StudioLibraryItem {
  id: string;
  kind: StudioLibraryKind;
  name: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface ItemRow {
  id: string;
  kind: string;
  name: string;
  payload: unknown;
  created_at: string | Date;
}

export class StudioLibraryLimitError extends Error {
  constructor() {
    super(`You can keep at most ${MAX_LIBRARY_ITEMS_PER_KIND} of these.`);
    this.name = 'StudioLibraryLimitError';
  }
}

function toItem(row: ItemRow): StudioLibraryItem {
  const payload =
    typeof row.payload === 'string' ? (JSON.parse(row.payload) as unknown) : row.payload;
  return {
    id: row.id,
    kind: row.kind as StudioLibraryKind,
    name: row.name,
    payload: payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {},
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
  };
}

export async function listStudioLibraryItems(
  db: DatabaseAdapter,
  input: { userId: string; kind?: StudioLibraryKind },
): Promise<StudioLibraryItem[]> {
  const rows = await db.query<ItemRow>(
    `select id, kind, name, payload, created_at
       from public.studio_library_items
      where user_id = $1 and ($2::text is null or kind = $2)
      order by created_at desc
      limit $3`,
    [input.userId, input.kind ?? null, MAX_LIBRARY_ITEMS_PER_KIND * STUDIO_LIBRARY_KINDS.length],
  );
  return rows.map(toItem);
}

export async function createStudioLibraryItem(
  db: DatabaseAdapter,
  input: { userId: string } & StudioLibraryItemCreateRequest,
): Promise<StudioLibraryItem | null> {
  const [count] = await db.query<{ total: number | string }>(
    `select count(*) as total from public.studio_library_items where user_id = $1 and kind = $2`,
    [input.userId, input.kind],
  );
  if (Number(count?.total ?? 0) >= MAX_LIBRARY_ITEMS_PER_KIND) throw new StudioLibraryLimitError();
  const [row] = await db.query<ItemRow>(
    `insert into public.studio_library_items (user_id, kind, name, payload)
     values ($1, $2, $3, $4::jsonb)
     returning id, kind, name, payload, created_at`,
    [input.userId, input.kind, input.name, JSON.stringify(input.payload)],
  );
  return row ? toItem(row) : null;
}

export async function deleteStudioLibraryItem(
  db: DatabaseAdapter,
  input: { userId: string; itemId: string },
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `delete from public.studio_library_items where id = $1 and user_id = $2 returning id`,
    [input.itemId, input.userId],
  );
  return rows.length > 0;
}
