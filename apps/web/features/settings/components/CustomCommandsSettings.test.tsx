import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { CustomCommandsSettings } from './CustomCommandsSettings';

function getStore() {
  return useSettingsStore.getState();
}

beforeEach(() => {
  useSettingsStore.setState({ customCommands: [] });
});

describe('customCommands store', () => {
  it('adds a command with a generated id', () => {
    act(() => {
      getStore().addCustomCommand({
        name: 'summarize',
        description: 'Summarize',
        template: '{input}',
      });
    });
    const cmd = getStore().customCommands[0];
    expect(cmd!.name).toBe('summarize');
    expect(cmd!.id).toMatch(/^custom-/);
  });

  it('updates a command by id', () => {
    act(() => {
      getStore().addCustomCommand({ name: 'old', description: '', template: 'old' });
    });
    const id = getStore().customCommands[0]!.id;
    act(() => {
      getStore().updateCustomCommand(id, { name: 'new' });
    });
    expect(getStore().customCommands[0]!.name).toBe('new');
  });

  it('deletes a command by id', () => {
    act(() => {
      getStore().addCustomCommand({ name: 'del', description: '', template: 'x' });
    });
    const id = getStore().customCommands[0]!.id;
    act(() => {
      getStore().deleteCustomCommand(id);
    });
    expect(getStore().customCommands).toHaveLength(0);
  });
});

describe('customCommands name uniqueness', () => {
  function seedAlphaBeta() {
    act(() => {
      getStore().addCustomCommand({ name: 'alpha', description: '', template: 'First template' });
      getStore().addCustomCommand({ name: 'beta', description: '', template: 'Second template' });
    });
    const [alpha, beta] = getStore().customCommands;
    return { alpha: alpha!, beta: beta! };
  }

  it('refuses to add a command whose name is taken', () => {
    seedAlphaBeta();
    act(() => {
      getStore().addCustomCommand({ name: 'alpha', description: '', template: 'Third' });
    });
    expect(getStore().customCommands.map((c) => c.name)).toEqual(['alpha', 'beta']);
  });

  it('refuses to rename a command onto another command name', () => {
    const { beta } = seedAlphaBeta();
    act(() => {
      getStore().updateCustomCommand(beta.id, { name: 'alpha' });
    });
    expect(getStore().customCommands.find((c) => c.id === beta.id)?.name).toBe('beta');
  });

  it('keeps a same-name update and a rename to a free name', () => {
    const { alpha, beta } = seedAlphaBeta();
    act(() => {
      getStore().updateCustomCommand(alpha.id, { name: 'alpha', template: 'Changed' });
      getStore().updateCustomCommand(beta.id, { name: 'gamma' });
    });
    expect(getStore().customCommands.map((c) => [c.name, c.template])).toEqual([
      ['alpha', 'Changed'],
      ['gamma', 'Second template'],
    ]);
  });
});

describe('CustomCommandsSettings edit form', () => {
  function openEdit(name: string) {
    fireEvent.click(screen.getAllByRole('button', { name: `Edit /${name}` })[0]!);
  }

  beforeEach(() => {
    act(() => {
      getStore().addCustomCommand({ name: 'alpha', description: '', template: 'First template' });
      getStore().addCustomCommand({ name: 'beta', description: '', template: 'Second template' });
    });
  });

  it('reports a collision when a rename takes another command name', () => {
    render(<CustomCommandsSettings />);
    openEdit('beta');
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('A command with this name already exists.')).toBeTruthy();
    expect(getStore().customCommands.map((c) => c.name)).toEqual(['alpha', 'beta']);
  });

  it('saves a command that keeps its own name', () => {
    render(<CustomCommandsSettings />);
    openEdit('alpha');
    fireEvent.change(screen.getByLabelText(/^Template/), { target: { value: 'Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(getStore().customCommands[0]?.template).toBe('Edited');
  });

  it('saves a rename to a free name', () => {
    render(<CustomCommandsSettings />);
    openEdit('beta');
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'gamma' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(getStore().customCommands.map((c) => c.name)).toEqual(['alpha', 'gamma']);
  });

  it('flags commands that already share a name and blocks saving it unchanged', () => {
    act(() => {
      useSettingsStore.setState({
        customCommands: [
          { id: 'a', name: 'alpha', description: '', template: 'First template' },
          { id: 'b', name: 'alpha', description: '', template: 'Second template' },
        ],
      });
    });
    render(<CustomCommandsSettings />);
    expect(screen.getAllByText(/Another command uses this name/)).toHaveLength(2);
    openEdit('alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('A command with this name already exists.')).toBeTruthy();
  });
});

const NAME_RE = /^[a-z0-9-]{2,32}$/;

describe('command name validation rule', () => {
  it('accepts valid slugs', () => {
    expect(NAME_RE.test('summarize')).toBe(true);
    expect(NAME_RE.test('my-cmd')).toBe(true);
  });

  it('rejects spaces, uppercase, underscore, and short/long names', () => {
    expect(NAME_RE.test('My Cmd')).toBe(false);
    expect(NAME_RE.test('a')).toBe(false);
    expect(NAME_RE.test('a'.repeat(33))).toBe(false);
    expect(NAME_RE.test('my_cmd')).toBe(false);
  });
});

describe('template expansion', () => {
  function expand(template: string, input: string) {
    return template.replace(/\{input\}/g, input);
  }

  it('substitutes {input}', () => {
    expect(expand('Do: {input}', 'hello')).toBe('Do: hello');
  });

  it('handles no placeholder', () => {
    expect(expand('Fixed prompt', 'ignored')).toBe('Fixed prompt');
  });
});
