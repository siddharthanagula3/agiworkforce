import type { MemoryCitationEntry } from './MemoryCitationEntry';

export type MemoryCitation = { entries: Array<MemoryCitationEntry>; rolloutIds: Array<string> };
