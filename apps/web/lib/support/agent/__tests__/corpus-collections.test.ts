import { describe, expect, it } from 'vitest';
import { getSupportCorpus } from '../corpus';
import { retrieveSupportChunks } from '../retrieval/retrieve';

/**
 * One row per collection a reader is expected to find by searching, in the
 * words they would type. A collection that exists only as a file is not a help
 * centre; it has to come back from the same retrieval the help page runs.
 */
const COLLECTION_QUERIES: readonly { query: string; docId: string }[] = [
  { query: 'how do I sign up for a new account', docId: 'signing-up' },
  { query: 'start a new chat and edit a message', docId: 'chat-basics' },
  { query: 'temporary chat not saved to history', docId: 'temporary-chats' },
  { query: 'share a conversation with a public link', docId: 'sharing-conversations' },
  { query: 'attach a pdf file to a chat', docId: 'files-and-attachments' },
  { query: 'find my uploaded files in the library', docId: 'library' },
  { query: 'project knowledge files and instructions', docId: 'projects' },
  { query: 'search the web and search past chats', docId: 'search' },
  { query: 'run a multi step task with agi work', docId: 'agi-work' },
  { query: 'schedule a recurring task with a trigger', docId: 'schedules-and-triggers' },
  { query: 'voice mode and dictation microphone', docId: 'voice' },
  { query: 'what does agi remember across conversations', docId: 'memory' },
  { query: 'publish an artifact and unpublish it', docId: 'artifacts' },
  { query: 'pick a model and extended thinking effort', docId: 'models-and-reasoning' },
  { query: 'approve a tool before it runs always allow', docId: 'tool-approvals' },
  { query: 'connect a custom mcp server url', docId: 'mcp-connections' },
  { query: 'cancel my subscription and see invoices', docId: 'billing-and-plans' },
  { query: 'usage limit credits top up', docId: 'usage-and-credits' },
  { query: 'passkey two factor authenticator backup codes', docId: 'account-security' },
  { query: 'export my conversations as json', docId: 'export-your-data' },
  { query: 'delete my account permanently', docId: 'delete-your-account' },
  { query: 'privacy controls and crash reports', docId: 'privacy-controls' },
  { query: 'install the cli agi login terminal', docId: 'install-the-cli' },
  { query: 'download the desktop installer for macos', docId: 'install-desktop-and-mobile' },
  { query: 'vs code extension explain selection', docId: 'vscode-extension' },
  { query: 'chrome browser extension side panel', docId: 'chrome-extension' },
  { query: 'workspace console members and seats', docId: 'workspace-administration' },
  {
    query: 'workspace roles permissions and directory groups',
    docId: 'workspace-roles-and-groups',
  },
  { query: 'workspace policy feature controls exceptions', docId: 'workspace-policy' },
  { query: 'keyboard shortcuts toggle sidebar', docId: 'keyboard-shortcuts' },
  { query: 'enterprise security review questionnaire', docId: 'enterprise-security' },
  { query: 'troubleshooting a message that will not send', docId: 'troubleshooting' },
];

describe('help centre collections', () => {
  it('has a document for every collection the queries name', () => {
    const corpus = getSupportCorpus();
    if (!corpus.available) throw new Error('corpus unavailable');
    const docIds = new Set(corpus.chunks.map((chunk) => chunk.docId));
    for (const { docId } of COLLECTION_QUERIES) {
      expect(docIds.has(docId), `no corpus document "${docId}"`).toBe(true);
    }
  });

  it.each(COLLECTION_QUERIES)('"$query" retrieves $docId', ({ query, docId }) => {
    const result = retrieveSupportChunks(query);
    expect(result.passedFloor, `floor: ${result.floorReason}`).toBe(true);
    expect(result.chunks.map((item) => item.chunk.docId)).toContain(docId);
  });

  it('gives every collection document a citable public path and tags', () => {
    const corpus = getSupportCorpus();
    if (!corpus.available) throw new Error('corpus unavailable');
    const wanted = new Set(COLLECTION_QUERIES.map((row) => row.docId));
    for (const chunk of corpus.chunks) {
      if (!wanted.has(chunk.docId)) continue;
      expect(chunk.path.startsWith('/')).toBe(true);
      expect(chunk.tags.length).toBeGreaterThan(0);
      expect(chunk.category.length).toBeGreaterThan(0);
    }
  });
});
