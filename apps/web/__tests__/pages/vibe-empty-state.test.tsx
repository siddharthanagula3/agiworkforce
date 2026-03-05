/**
 * Tests for VibeEmptyState component
 *
 * A presentational component that displays template starter cards
 * and calls onPromptSelect when a template is clicked.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@shared/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  User: () => <svg data-testid="icon-user" />,
  ShoppingCart: () => <svg data-testid="icon-shopping-cart" />,
  LayoutDashboard: () => <svg data-testid="icon-layout-dashboard" />,
  Rocket: () => <svg data-testid="icon-rocket" />,
  Server: () => <svg data-testid="icon-server" />,
  Smartphone: () => <svg data-testid="icon-smartphone" />,
  ArrowRight: () => <svg data-testid="icon-arrow-right" />,
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { VibeEmptyState } from '@features/vibe/components/redesign/VibeEmptyState';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('VibeEmptyState', () => {
  it('renders the main heading "What do you want to build?"', () => {
    render(<VibeEmptyState onPromptSelect={vi.fn()} />);
    // The heading splits "build" into a gradient span, so check for both parts
    expect(screen.getByText(/What do you want to/)).toBeInTheDocument();
    expect(screen.getByText('build')).toBeInTheDocument();
  });

  it('renders the subtitle text', () => {
    render(<VibeEmptyState onPromptSelect={vi.fn()} />);
    expect(
      screen.getByText(
        'Pick a template to get started, or describe your idea in the prompt below.',
      ),
    ).toBeInTheDocument();
  });

  it('renders all 6 template cards with correct titles', () => {
    render(<VibeEmptyState onPromptSelect={vi.fn()} />);

    const expectedTitles = [
      'Portfolio Website',
      'E-Commerce Store',
      'Dashboard App',
      'Landing Page',
      'API Backend',
      'Mobile App',
    ];

    for (const title of expectedTitles) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('renders descriptions for each template card', () => {
    render(<VibeEmptyState onPromptSelect={vi.fn()} />);

    const expectedDescriptions = [
      'Showcase your work with a stunning personal site',
      'Product listings, cart, and checkout flow',
      'Analytics and data visualization interface',
      'High-converting page with hero, features, and CTA',
      'REST API with authentication and database',
      'Cross-platform mobile app with native feel',
    ];

    for (const description of expectedDescriptions) {
      expect(screen.getByText(description)).toBeInTheDocument();
    }
  });

  it('calls onPromptSelect with the portfolio prompt when Portfolio card is clicked', () => {
    const onPromptSelect = vi.fn();
    render(<VibeEmptyState onPromptSelect={onPromptSelect} />);

    fireEvent.click(screen.getByText('Portfolio Website'));
    expect(onPromptSelect).toHaveBeenCalledTimes(1);
    expect(onPromptSelect).toHaveBeenCalledWith(
      'Build a modern portfolio website with dark theme, responsive design, project gallery, about section, and contact form using React and Tailwind CSS',
    );
  });

  it('calls onPromptSelect with the e-commerce prompt when E-Commerce card is clicked', () => {
    const onPromptSelect = vi.fn();
    render(<VibeEmptyState onPromptSelect={onPromptSelect} />);

    fireEvent.click(screen.getByText('E-Commerce Store'));
    expect(onPromptSelect).toHaveBeenCalledTimes(1);
    expect(onPromptSelect).toHaveBeenCalledWith(expect.stringContaining('e-commerce store'));
  });

  it('calls onPromptSelect with the dashboard prompt when Dashboard card is clicked', () => {
    const onPromptSelect = vi.fn();
    render(<VibeEmptyState onPromptSelect={onPromptSelect} />);

    fireEvent.click(screen.getByText('Dashboard App'));
    expect(onPromptSelect).toHaveBeenCalledTimes(1);
    expect(onPromptSelect).toHaveBeenCalledWith(expect.stringContaining('analytics dashboard'));
  });

  it('calls onPromptSelect with the landing page prompt when Landing Page card is clicked', () => {
    const onPromptSelect = vi.fn();
    render(<VibeEmptyState onPromptSelect={onPromptSelect} />);

    fireEvent.click(screen.getByText('Landing Page'));
    expect(onPromptSelect).toHaveBeenCalledTimes(1);
    expect(onPromptSelect).toHaveBeenCalledWith(expect.stringContaining('landing page'));
  });

  it('calls onPromptSelect with the API backend prompt when API Backend card is clicked', () => {
    const onPromptSelect = vi.fn();
    render(<VibeEmptyState onPromptSelect={onPromptSelect} />);

    fireEvent.click(screen.getByText('API Backend'));
    expect(onPromptSelect).toHaveBeenCalledTimes(1);
    expect(onPromptSelect).toHaveBeenCalledWith(expect.stringContaining('REST API backend'));
  });

  it('calls onPromptSelect with the mobile app prompt when Mobile App card is clicked', () => {
    const onPromptSelect = vi.fn();
    render(<VibeEmptyState onPromptSelect={onPromptSelect} />);

    fireEvent.click(screen.getByText('Mobile App'));
    expect(onPromptSelect).toHaveBeenCalledTimes(1);
    expect(onPromptSelect).toHaveBeenCalledWith(
      expect.stringContaining('cross-platform mobile app'),
    );
  });

  it('renders exactly 6 template buttons', () => {
    render(<VibeEmptyState onPromptSelect={vi.fn()} />);

    // Each template is a <button> element
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(6);
  });

  it('renders an icon for each template card', () => {
    render(<VibeEmptyState onPromptSelect={vi.fn()} />);

    expect(screen.getByTestId('icon-user')).toBeInTheDocument();
    expect(screen.getByTestId('icon-shopping-cart')).toBeInTheDocument();
    expect(screen.getByTestId('icon-layout-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('icon-rocket')).toBeInTheDocument();
    expect(screen.getByTestId('icon-server')).toBeInTheDocument();
    expect(screen.getByTestId('icon-smartphone')).toBeInTheDocument();
  });

  it('renders "Use template" hover text for each card', () => {
    render(<VibeEmptyState onPromptSelect={vi.fn()} />);

    const useTemplateTexts = screen.getAllByText('Use template');
    expect(useTemplateTexts).toHaveLength(6);
  });

  it('does not call onPromptSelect on initial render', () => {
    const onPromptSelect = vi.fn();
    render(<VibeEmptyState onPromptSelect={onPromptSelect} />);

    expect(onPromptSelect).not.toHaveBeenCalled();
  });
});
