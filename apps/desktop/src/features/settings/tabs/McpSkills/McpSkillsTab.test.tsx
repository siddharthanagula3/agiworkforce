import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { McpSkillsTab } from '.';

vi.mock('../../MCPToolsSettings', () => ({
  MCPToolsSettings: () => <div>MCP tools section</div>,
}));

vi.mock('../../SkillsPluginsSettings', () => ({
  SkillsPluginsSettings: () => <div>Skills plugins section</div>,
}));

vi.mock('../../MCPServerSettings', () => ({
  MCPServerSettings: () => <div>MCP server section</div>,
}));

vi.mock('../../ResearchSettings', () => ({
  ResearchSettings: () => <div>Research settings section</div>,
}));

vi.mock('@/features/skill-marketplace/SkillMarketplace', () => ({
  SkillMarketplace: () => <div>Skill marketplace section</div>,
}));

vi.mock('@/features/tools/ToolsPanel', () => ({
  ToolsPanel: () => <div>Tools panel section</div>,
}));

describe('McpSkillsTab', () => {
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes top cards actionable instead of disabled-looking placeholders', async () => {
    const openConnectors = vi.fn();
    render(<McpSkillsTab isBusy={false} onOpenConnectors={openConnectors} />);

    const skillsButton = screen.getByText('Skills & Plugins').closest('button');
    const toolsButton = screen.getByText('MCP Tools').closest('button');
    const researchButton = screen.getByText('Research Defaults').closest('button');
    const integrationsButton = screen.getByText('Integrations').closest('button');

    expect(skillsButton).not.toBeDisabled();
    expect(toolsButton).not.toBeDisabled();
    expect(researchButton).not.toBeDisabled();
    expect(integrationsButton).not.toBeDisabled();

    fireEvent.click(toolsButton!);
    fireEvent.click(skillsButton!);
    fireEvent.click(researchButton!);
    fireEvent.click(integrationsButton!);

    expect(scrollIntoView).toHaveBeenCalledTimes(3);
    expect(openConnectors).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('MCP tools section')).toBeInTheDocument();
    expect(await screen.findByText('Skills plugins section')).toBeInTheDocument();
    expect(await screen.findByText('Research settings section')).toBeInTheDocument();
  });
});
