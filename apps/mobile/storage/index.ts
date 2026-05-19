// AUDIT-FIX: storage layer is half-shipped from the mobile reorg. This index
// only re-exports the modules that currently exist. The missing sibling
// modules (`./conversations`, `./messages`, `./providerKeys`,
// `./customInstructions`, `./settingsDb`, `./telemetry`) are tracked as a
// follow-up to the mobile-restructure work — once those land, restore the
// matching `export *` lines below.

export { getDb, closeDb, rekeyDb } from './db';
export type {
  Conversation,
  Message,
  MemoryFact,
  InstalledModel,
  ProviderKeyRecord,
  CustomInstruction,
  TelemetryEvent,
  ChatMode,
  MessageRole,
  ModelRuntime,
  ModelFormat,
} from './types';
export * from './memory';
export * from './installedModels';
export * from './docChunks';
