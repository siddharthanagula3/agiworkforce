import { describe, it, expect } from 'vitest';
import { toolStatusPhrase } from './tool-loop';

describe('toolStatusPhrase', () => {
  it('returns undefined for unknown tool names', () => {
    expect(toolStatusPhrase('some_random_tool')).toBeUndefined();
    expect(toolStatusPhrase('my_custom_action')).toBeUndefined();
  });

  it('matches web_search', () => {
    expect(toolStatusPhrase('web_search')).toBe('Searching the web');
    expect(toolStatusPhrase('search_web')).toBe('Searching the web');
    expect(toolStatusPhrase('perplexity_search')).toBe('Searching the web');
  });

  it('matches web_fetch', () => {
    expect(toolStatusPhrase('web_fetch')).toBe('Fetching page');
    expect(toolStatusPhrase('fetch_url')).toBe('Fetching page');
    expect(toolStatusPhrase('http_request')).toBe('Fetching page');
  });

  it('matches code execution tools', () => {
    expect(toolStatusPhrase('execute_code')).toBe('Running code');
    expect(toolStatusPhrase('code_execute')).toBe('Running code');
    expect(toolStatusPhrase('run_code')).toBe('Running code');
    expect(toolStatusPhrase('jupyter_execute')).toBe('Running code');
  });

  it('matches file read tools', () => {
    expect(toolStatusPhrase('file_read')).toBe('Reading file');
    expect(toolStatusPhrase('read_file')).toBe('Reading file');
  });

  it('matches file write tools', () => {
    expect(toolStatusPhrase('file_write')).toBe('Writing file');
    expect(toolStatusPhrase('write_file')).toBe('Writing file');
    expect(toolStatusPhrase('create_file')).toBe('Writing file');
  });

  it('matches bash/shell tools', () => {
    expect(toolStatusPhrase('bash')).toBe('Running command');
    expect(toolStatusPhrase('shell_command')).toBe('Running command');
    expect(toolStatusPhrase('terminal_execute')).toBe('Running command');
  });

  it('matches grep/codebase search', () => {
    expect(toolStatusPhrase('grep')).toBe('Searching codebase');
    expect(toolStatusPhrase('ripgrep')).toBe('Searching codebase');
    expect(toolStatusPhrase('search_codebase')).toBe('Searching codebase');
  });

  it('matches git tools', () => {
    expect(toolStatusPhrase('git_status')).toBe('Running git');
    expect(toolStatusPhrase('git_commit')).toBe('Running git');
  });

  it('matches database query tools', () => {
    expect(toolStatusPhrase('db_query')).toBe('Querying database');
    expect(toolStatusPhrase('sql_query')).toBe('Querying database');
    expect(toolStatusPhrase('database_query')).toBe('Querying database');
  });

  it('returns a string without em-dashes', () => {
    const allPhrases = [
      'web_search',
      'web_fetch',
      'execute_code',
      'file_read',
      'file_write',
      'bash',
      'grep',
      'git_status',
      'db_query',
    ].map((t) => toolStatusPhrase(t) ?? '');
    for (const p of allPhrases) {
      expect(p).not.toContain('—');
      expect(p).not.toContain('--');
    }
  });
});
