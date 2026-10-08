import { describe, expect, it } from 'vitest';

import {
  connectorDisplayName,
  connectorStepSentence,
  parseQualifiedConnectorTool,
  type ConnectorStepPhase,
} from '../connector-step-sentence';

const GMAIL_SUMMARY = 'Using Gmail connector';
const SENTENCE_PHASES: ConnectorStepPhase[] = ['running', 'finished', 'failed', 'stopped'];

function sentences(toolName: string, summary = GMAIL_SUMMARY): Array<string | undefined> {
  return SENTENCE_PHASES.map((phase) =>
    connectorStepSentence({ name: `mcp__gmail__${toolName}`, summary, phase }),
  );
}

function lowerFirst(value: string): string {
  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

describe('connectorStepSentence', () => {
  it.each([
    ['search_threads', 'Searching Gmail', 'Searched Gmail', 'Could not search Gmail'],
    ['query_crm_data', 'Querying Gmail', 'Queried Gmail', 'Could not query Gmail'],
    ['get_thread', 'Reading from Gmail', 'Read from Gmail', 'Could not read from Gmail'],
    ['read_mail', 'Reading from Gmail', 'Read from Gmail', 'Could not read from Gmail'],
    ['fetch', 'Reading from Gmail', 'Read from Gmail', 'Could not read from Gmail'],
    [
      'download_file_content',
      'Downloading from Gmail',
      'Downloaded from Gmail',
      'Could not download from Gmail',
    ],
    [
      'list_labels',
      'Listing items in Gmail',
      'Listed items in Gmail',
      'Could not list items in Gmail',
    ],
    [
      'create_draft',
      'Creating an item in Gmail',
      'Created an item in Gmail',
      'Could not create an item in Gmail',
    ],
    [
      'generate_invoice_qr_code',
      'Creating an item in Gmail',
      'Created an item in Gmail',
      'Could not create an item in Gmail',
    ],
    ['add_comment', 'Adding to Gmail', 'Added to Gmail', 'Could not add to Gmail'],
    ['upload_file', 'Uploading to Gmail', 'Uploaded to Gmail', 'Could not upload to Gmail'],
    ['write_confluence', 'Writing to Gmail', 'Wrote to Gmail', 'Could not write to Gmail'],
    ['post_issue_comment', 'Posting to Gmail', 'Posted to Gmail', 'Could not post to Gmail'],
    ['send_mail', 'Sending with Gmail', 'Sent with Gmail', 'Could not send with Gmail'],
    ['reply_to_thread', 'Replying in Gmail', 'Replied in Gmail', 'Could not reply in Gmail'],
    [
      'update_event',
      'Updating an item in Gmail',
      'Updated an item in Gmail',
      'Could not update an item in Gmail',
    ],
    [
      'edit_design',
      'Updating an item in Gmail',
      'Updated an item in Gmail',
      'Could not update an item in Gmail',
    ],
    [
      'set_file_metadata',
      'Updating an item in Gmail',
      'Updated an item in Gmail',
      'Could not update an item in Gmail',
    ],
    [
      'label_message',
      'Updating an item in Gmail',
      'Updated an item in Gmail',
      'Could not update an item in Gmail',
    ],
    [
      'unlabel_thread',
      'Updating an item in Gmail',
      'Updated an item in Gmail',
      'Could not update an item in Gmail',
    ],
    ['copy_file', 'Copying in Gmail', 'Copied in Gmail', 'Could not copy in Gmail'],
    ['move_folder', 'Moving in Gmail', 'Moved in Gmail', 'Could not move in Gmail'],
    ['delete_event', 'Deleting from Gmail', 'Deleted from Gmail', 'Could not delete from Gmail'],
    [
      'cancel_subscription',
      'Cancelling in Gmail',
      'Cancelled in Gmail',
      'Could not cancel in Gmail',
    ],
  ])('%s reads as a sentence in every phase', (toolName, running, finished, failed) => {
    expect(sentences(toolName)).toEqual([
      running,
      finished,
      failed,
      `Stopped ${lowerFirst(running)}`,
    ]);
  });

  it('names the connector and the tool for a verb it has no sentence for', () => {
    expect(sentences('archive_thread')).toEqual([
      'Using Gmail: Archive Thread',
      'Used Gmail: Archive Thread',
      'Could not use Gmail: Archive Thread',
      'Stopped using Gmail: Archive Thread',
    ]);
  });

  it('never prints the raw tool id', () => {
    for (const toolName of ['archive_thread', 'getWorkflowInstancesList', 'notion-ai-search']) {
      for (const text of sentences(toolName)) {
        expect(text).not.toContain(toolName);
        expect(text).not.toMatch(/_|mcp/);
      }
    }
  });

  it('has no sentence for an approval prompt, a declined call, or a tool that is not a connector', () => {
    const base = { name: 'mcp__gmail__send_draft', summary: 'Review Gmail action' };
    expect(connectorStepSentence({ ...base, phase: 'waiting' })).toBeUndefined();
    expect(connectorStepSentence({ ...base, phase: 'declined' })).toBeUndefined();
    expect(
      connectorStepSentence({ name: 'web_search', summary: 'Searching', phase: 'running' }),
    ).toBeUndefined();
  });

  it('reads a row stored before the sentence existed, whatever its summary said', () => {
    expect(
      connectorStepSentence({
        name: 'mcp__gmail__get_thread',
        summary: GMAIL_SUMMARY,
        phase: 'finished',
      }),
    ).toBe('Read from Gmail');
    expect(
      connectorStepSentence({
        name: 'mcp__google-drive__read_file_content',
        summary: 'Reading file',
        phase: 'finished',
      }),
    ).toBe('Read from Google Drive');
  });

  it('reads camelCase names by their leading verb', () => {
    expect(
      connectorStepSentence({
        name: 'mcp__jira__searchJiraIssuesUsingJql',
        summary: 'Using Jira connector',
        phase: 'finished',
      }),
    ).toBe('Searched Jira');
  });

  it('drops a leading token that only repeats the server id', () => {
    expect(
      connectorStepSentence({
        name: 'mcp__notion__notion-search',
        summary: 'Using Notion connector',
        phase: 'running',
      }),
    ).toBe('Searching Notion');
    expect(
      connectorStepSentence({
        name: 'mcp__stripe__stripe_api_search',
        summary: 'Using Stripe connector',
        phase: 'finished',
      }),
    ).toBe('Used Stripe: Api Search');
  });

  it('does not let the first verb speak for a name that chains two actions', () => {
    expect(sentences('get_and_archive')[1]).toBe('Used Gmail: Get And Archive');
  });

  it('treats built-in property names as ordinary unknown verbs', () => {
    for (const toolName of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(() => sentences(toolName)).not.toThrow();
    }
    expect(sentences('constructor')[1]).toBe('Used Gmail: Constructor');
  });

  it('bounds a tool name supplied by a remote server', () => {
    const text = sentences('frobnicate_'.repeat(40))[1] ?? '';
    expect(text.length).toBeLessThanOrEqual('Used Gmail: '.length + 49);
    expect(text.endsWith('…')).toBe(true);
  });
});

describe('connectorDisplayName', () => {
  it('takes a custom connector name from the summary that carries it', () => {
    const name = 'mcp__custom-a1b2c3d4e5__search_orders';
    expect(connectorDisplayName(name, 'Using Acme Logistics connector')).toBe('Acme Logistics');
    expect(connectorDisplayName(name, 'Review Acme Logistics action')).toBe('Acme Logistics');
    expect(
      connectorStepSentence({ name, summary: 'Using Acme Logistics connector', phase: 'finished' }),
    ).toBe('Searched Acme Logistics');
  });

  it('prefers a name from a verified reconnect request over the summary', () => {
    expect(
      connectorStepSentence({
        name: 'mcp__custom-a1b2c3d4e5__search_orders',
        summary: 'The tool failed',
        phase: 'failed',
        verifiedConnectorName: 'Acme Logistics',
      }),
    ).toBe('Could not search Acme Logistics');
  });

  it('never shows an opaque custom server id when no name is known', () => {
    const name = 'mcp__custom-a1b2c3d4e5__do_thing';
    expect(connectorDisplayName(name, 'Using connector')).toBeUndefined();
    expect(connectorDisplayName(name, 'Using MCP tool')).toBeUndefined();
    const text = connectorStepSentence({ name, summary: 'The tool failed', phase: 'failed' });
    expect(text).toBe('Could not use the connector: Do Thing');
    expect(text).not.toMatch(/custom-|a1b2c3d4e5/);
  });

  it('humanizes a named server id when the summary does not carry a name', () => {
    expect(connectorDisplayName('mcp__acme-crm__list_records', 'Listing files')).toBe('Acme Crm');
  });
});

describe('parseQualifiedConnectorTool', () => {
  it('splits a qualified name into its server and tool', () => {
    expect(parseQualifiedConnectorTool('mcp__gmail__search_threads')).toEqual({
      serverId: 'gmail',
      toolName: 'search_threads',
    });
    expect(parseQualifiedConnectorTool('mcp__google-drive__get_file_metadata')).toEqual({
      serverId: 'google-drive',
      toolName: 'get_file_metadata',
    });
  });

  it('rejects a name that is not qualified', () => {
    expect(parseQualifiedConnectorTool('web_search')).toBeNull();
    expect(parseQualifiedConnectorTool('mcp__gmail')).toBeNull();
  });
});
