import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import MCPToolBrowser, { parseToolArguments } from '../MCPToolBrowser';
import type { McpToolInfo } from '../../../types/mcp';

const tool: McpToolInfo = {
  id: 'mcp__b64_Z2l0aHVi__b64_bGlzdA',
  name: 'list_issues',
  description: 'List the open issues of a repository',
  server: 'github',
  parameters: ['repo'],
};

async function openTool(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /list_issues/ }));
}

describe('parseToolArguments', () => {
  it('accepts a JSON object', () => {
    expect(parseToolArguments('{"repo":"a/b"}')).toEqual({ repo: 'a/b' });
  });

  it('refuses text that is not JSON', () => {
    expect(parseToolArguments('{repo')).toBe('Arguments must be valid JSON.');
  });

  it.each(['[]', 'null', '"text"', '3'])('refuses %s because it is not an object', (text) => {
    expect(parseToolArguments(text)).toMatch(/must be a JSON object/);
  });
});

describe('MCPToolBrowser test call', () => {
  it('says so when no tool is available', () => {
    render(<MCPToolBrowser tools={[]} callTool={vi.fn()} />);
    expect(screen.getByText('No tools available')).toBeInTheDocument();
  });

  it('expands a tool from the keyboard and prefills its parameters', async () => {
    const user = userEvent.setup();
    render(<MCPToolBrowser tools={[tool]} callTool={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: /list_issues/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger.focus();
    await user.keyboard('{Enter}');

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Arguments (JSON)')).toHaveValue('{\n  "repo": ""\n}');
  });

  it('runs the tool with the parsed arguments and shows the result', async () => {
    const user = userEvent.setup();
    const callTool = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'two issues' }] });
    render(<MCPToolBrowser tools={[tool]} callTool={callTool} />);
    await openTool(user);

    const input = screen.getByLabelText('Arguments (JSON)');
    await user.clear(input);
    await user.type(input, '{{"repo":"a/b"}');
    await user.click(screen.getByRole('button', { name: 'Run tool' }));

    await waitFor(() => expect(callTool).toHaveBeenCalledWith(tool.id, { repo: 'a/b' }));
    expect(await screen.findByText(/two issues/)).toBeInTheDocument();
  });

  it('does not call the tool when the arguments are not a JSON object', async () => {
    const user = userEvent.setup();
    const callTool = vi.fn();
    render(<MCPToolBrowser tools={[tool]} callTool={callTool} />);
    await openTool(user);

    const input = screen.getByLabelText('Arguments (JSON)');
    await user.clear(input);
    await user.type(input, 'repo');
    await user.click(screen.getByRole('button', { name: 'Run tool' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Arguments must be valid JSON.');
    expect(callTool).not.toHaveBeenCalled();
  });

  it('shows a declined or failed call as an error and no result', async () => {
    const user = userEvent.setup();
    const callTool = vi.fn().mockRejectedValue(new Error('Tool execution cancelled by user'));
    render(<MCPToolBrowser tools={[tool]} callTool={callTool} />);
    await openTool(user);

    await user.click(screen.getByRole('button', { name: 'Run tool' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tool execution cancelled by user');
    expect(screen.queryByText('Result')).not.toBeInTheDocument();
  });
});
