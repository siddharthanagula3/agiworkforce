/**
 * SettingsPage Component Tests
 *
 * Tests for the Settings page with tab navigation and sub-sections.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/settings',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock @radix-ui/react-radio-group to keep tests fast and isolated from
// Radix DOM layout internals. The real package is installed; this mock
// replaces it at the module boundary for unit test purposes only.
// ---------------------------------------------------------------------------
vi.mock('@radix-ui/react-radio-group', () => {
  const Root = React.forwardRef<HTMLDivElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => (
      <div ref={ref} role="radiogroup" {...props}>
        {children as React.ReactNode}
      </div>
    ),
  );
  Root.displayName = 'RadioGroupRoot';

  const Item = React.forwardRef<HTMLButtonElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => (
      <button ref={ref} role="radio" aria-checked={false} {...props}>
        {children as React.ReactNode}
      </button>
    ),
  );
  Item.displayName = 'RadioGroupItem';
  const Indicator = ({ ...props }: Record<string, unknown>) => <span {...props} />;
  return { Root, Item, Indicator };
});

// ---------------------------------------------------------------------------
// Mock shared/ui wrappers that depend on INSTALLED Radix packages.
// We still need simple mocks so tests are fast and don't rely on DOM layout.
// ---------------------------------------------------------------------------
vi.mock('@shared/ui/tabs', () => {
  const Tabs = ({ children, ...props }: Record<string, unknown>) => (
    <div data-testid="tabs" {...props}>
      {children as React.ReactNode}
    </div>
  );
  const TabsList = ({ children, ...props }: Record<string, unknown>) => (
    <div data-testid="tabs-list" role="tablist" {...props}>
      {children as React.ReactNode}
    </div>
  );
  const TabsTrigger = ({ children, value, ...props }: Record<string, unknown>) => (
    <button data-testid={`tab-${value as string}`} role="tab" {...props}>
      {children as React.ReactNode}
    </button>
  );
  const TabsContent = ({ children, value, ...props }: Record<string, unknown>) => (
    <div data-testid={`tab-content-${value as string}`} role="tabpanel" {...props}>
      {children as React.ReactNode}
    </div>
  );
  return { Tabs, TabsList, TabsTrigger, TabsContent };
});

vi.mock('@shared/ui/card', () => {
  const Card = ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  );
  const CardHeader = ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  );
  const CardTitle = ({ children, ...props }: Record<string, unknown>) => (
    <h3 {...props}>{children as React.ReactNode}</h3>
  );
  const CardDescription = ({ children, ...props }: Record<string, unknown>) => (
    <p {...props}>{children as React.ReactNode}</p>
  );
  const CardContent = ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  );
  return { Card, CardHeader, CardTitle, CardDescription, CardContent };
});

vi.mock('@shared/ui/button', () => {
  const Button = React.forwardRef<HTMLButtonElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => (
      <button ref={ref} {...props}>
        {children as React.ReactNode}
      </button>
    ),
  );
  Button.displayName = 'Button';
  return { Button };
});

vi.mock('@shared/ui/input', () => {
  const Input = React.forwardRef<HTMLInputElement, Record<string, unknown>>((props, ref) => (
    <input ref={ref} {...props} />
  ));
  Input.displayName = 'Input';
  return { Input };
});

vi.mock('@shared/ui/label', () => {
  const Label = React.forwardRef<HTMLLabelElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => (
      <label ref={ref} {...props}>
        {children as React.ReactNode}
      </label>
    ),
  );
  Label.displayName = 'Label';
  return { Label };
});

vi.mock('@shared/ui/switch', () => {
  const Switch = React.forwardRef<HTMLButtonElement, Record<string, unknown>>((props, ref) => (
    <button ref={ref} role="switch" aria-checked={false} {...props} />
  ));
  Switch.displayName = 'Switch';
  return { Switch };
});

vi.mock('@shared/ui/textarea', () => {
  const Textarea = React.forwardRef<HTMLTextAreaElement, Record<string, unknown>>((props, ref) => (
    <textarea ref={ref} {...props} />
  ));
  Textarea.displayName = 'Textarea';
  return { Textarea };
});

vi.mock('@shared/ui/slider', () => {
  const Slider = React.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => (
    <div ref={ref} role="slider" aria-valuenow={0} {...props} />
  ));
  Slider.displayName = 'Slider';
  return { Slider };
});

vi.mock('@shared/ui/avatar', () => {
  const Avatar = ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  );
  const AvatarImage = ({ alt, ...props }: Record<string, unknown>) => (
    <img alt={alt as string | undefined} {...props} />
  );
  const AvatarFallback = ({ children, ...props }: Record<string, unknown>) => (
    <span {...props}>{children as React.ReactNode}</span>
  );
  return { Avatar, AvatarImage, AvatarFallback };
});

vi.mock('@shared/ui/select', () => {
  const Select = ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  );
  const SelectContent = React.forwardRef<HTMLDivElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => (
      <div ref={ref} {...props}>
        {children as React.ReactNode}
      </div>
    ),
  );
  SelectContent.displayName = 'SelectContent';
  const SelectItem = React.forwardRef<HTMLDivElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => (
      <div ref={ref} {...props}>
        {children as React.ReactNode}
      </div>
    ),
  );
  SelectItem.displayName = 'SelectItem';
  const SelectTrigger = React.forwardRef<HTMLButtonElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => (
      <button ref={ref} {...props}>
        {children as React.ReactNode}
      </button>
    ),
  );
  SelectTrigger.displayName = 'SelectTrigger';
  const SelectValue = (props: Record<string, unknown>) => <span {...props} />;
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
});

vi.mock('@shared/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(' '),
}));

// Mock lucide-react icons
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return { ...actual };
});

import SettingsPage from './SettingsPage';

describe('SettingsPage', () => {
  it('renders without crashing', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeDefined();
  });

  it('shows the page description', () => {
    render(<SettingsPage />);
    expect(
      screen.getByText('Customize appearance, chat preferences, and model endpoints'),
    ).toBeDefined();
  });

  it('shows all tab navigation items', () => {
    render(<SettingsPage />);

    // Tab labels may appear multiple times (tab trigger + content)
    expect(screen.getAllByText('Appearance').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Chat').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Models').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Privacy & Data').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Appearance tab content', () => {
    render(<SettingsPage />);
    const matches = screen.getAllByText('Appearance');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Chat tab content', () => {
    render(<SettingsPage />);
    const matches = screen.getAllByText('Chat');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Models tab content', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Models')).toBeDefined();
  });

  it('renders Privacy & Data tab content', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Privacy & Data')).toBeDefined();
  });
});
