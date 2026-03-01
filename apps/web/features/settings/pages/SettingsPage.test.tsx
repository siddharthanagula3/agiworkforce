/**
 * SettingsPage Component Tests
 *
 * Tests for the Settings page with tab navigation and sub-sections.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock shared/ui wrappers that depend on UNINSTALLED Radix packages.
// @radix-ui/react-radio-group is NOT installed, so we must mock the wrapper
// before vitest tries to load the actual file.
// ---------------------------------------------------------------------------
// Mock Radix UI primitives that the shared/ui components depend on
vi.mock('@radix-ui/react-radio-group', () => {
  const Root = React.forwardRef<HTMLDivElement, Record<string, unknown>>(({ children, ...props }, ref) => (
    <div ref={ref} role="radiogroup" {...props}>
      {children as React.ReactNode}
    </div>
  ));
  Root.displayName = 'RadioGroupRoot';

  const Item = React.forwardRef<HTMLButtonElement, Record<string, unknown>>(({ children, ...props }, ref) => (
    <button ref={ref} role="radio" aria-checked={false} {...props}>
      {children as React.ReactNode}
    </button>
  ));
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
  const Card = ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>;
  const CardHeader = ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>;
  const CardTitle = ({ children, ...props }: Record<string, unknown>) => <h3 {...props}>{children as React.ReactNode}</h3>;
  const CardDescription = ({ children, ...props }: Record<string, unknown>) => <p {...props}>{children as React.ReactNode}</p>;
  const CardContent = ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>;
  return { Card, CardHeader, CardTitle, CardDescription, CardContent };
});

vi.mock('@shared/ui/button', () => {
  const Button = React.forwardRef<HTMLButtonElement, Record<string, unknown>>(({ children, ...props }, ref) => (
    <button ref={ref} {...props}>
      {children as React.ReactNode}
    </button>
  ));
  Button.displayName = 'Button';
  return { Button };
});

vi.mock('@shared/ui/input', () => {
  const Input = React.forwardRef<HTMLInputElement, Record<string, unknown>>((props, ref) => <input ref={ref} {...props} />);
  Input.displayName = 'Input';
  return { Input };
});

vi.mock('@shared/ui/label', () => {
  const Label = React.forwardRef<HTMLLabelElement, Record<string, unknown>>(({ children, ...props }, ref) => (
    <label ref={ref} {...props}>
      {children as React.ReactNode}
    </label>
  ));
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
  const Textarea = React.forwardRef<HTMLTextAreaElement, Record<string, unknown>>((props, ref) => <textarea ref={ref} {...props} />);
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
  const Avatar = ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>;
  // eslint-disable-next-line @next/next/no-img-element
  const AvatarImage = ({ alt, ...props }: Record<string, unknown>) => <img alt={alt as string | undefined} {...props} />;
  const AvatarFallback = ({ children, ...props }: Record<string, unknown>) => <span {...props}>{children as React.ReactNode}</span>;
  return { Avatar, AvatarImage, AvatarFallback };
});

vi.mock('@shared/ui/select', () => {
  const Select = ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>;
  const SelectContent = React.forwardRef<HTMLDivElement, Record<string, unknown>>(({ children, ...props }, ref) => (
    <div ref={ref} {...props}>
      {children as React.ReactNode}
    </div>
  ));
  SelectContent.displayName = 'SelectContent';
  const SelectItem = React.forwardRef<HTMLDivElement, Record<string, unknown>>(({ children, ...props }, ref) => (
    <div ref={ref} {...props}>
      {children as React.ReactNode}
    </div>
  ));
  SelectItem.displayName = 'SelectItem';
  const SelectTrigger = React.forwardRef<HTMLButtonElement, Record<string, unknown>>(({ children, ...props }, ref) => (
    <button ref={ref} {...props}>
      {children as React.ReactNode}
    </button>
  ));
  SelectTrigger.displayName = 'SelectTrigger';
  const SelectValue = (props: Record<string, unknown>) => <span {...props} />;
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
});

vi.mock('@shared/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(' '),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const Icon = React.forwardRef<HTMLSpanElement, Record<string, unknown>>(({ className, ...props }, ref) => (
    <span ref={ref} className={className as string | undefined} {...props} />
  ));
  Icon.displayName = 'Icon';
  return {
    User: Icon,
    Brain: Icon,
    Key: Icon,
    Palette: Icon,
    Bell: Icon,
    Eye: Icon,
    EyeOff: Icon,
    Save: Icon,
    Shield: Icon,
    Upload: Icon,
    Check: Icon,
    ChevronDown: Icon,
    ChevronUp: Icon,
    ChevronRight: Icon,
    Circle: Icon,
    X: Icon,
  };
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
      screen.getByText('Manage your account, AI configuration, and preferences'),
    ).toBeDefined();
  });

  it('shows all tab navigation items', () => {
    render(<SettingsPage />);

    expect(screen.getByTestId('tab-profile')).toBeDefined();
    expect(screen.getByTestId('tab-ai')).toBeDefined();
    expect(screen.getByTestId('tab-keys')).toBeDefined();
    expect(screen.getByTestId('tab-appearance')).toBeDefined();
    expect(screen.getByTestId('tab-notifications')).toBeDefined();
  });

  it('renders profile tab content', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Profile Information')).toBeDefined();
  });

  it('renders AI Configuration tab content', () => {
    render(<SettingsPage />);
    expect(screen.getByText('AI Configuration')).toBeDefined();
  });

  it('renders API Keys tab content', () => {
    render(<SettingsPage />);
    // "API Keys" appears in tab trigger and in card title
    const matches = screen.getAllByText('API Keys');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('renders Appearance tab content', () => {
    render(<SettingsPage />);
    // "Appearance" appears in tab trigger and in card title
    const matches = screen.getAllByText('Appearance');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('renders Notifications tab content', () => {
    render(<SettingsPage />);
    // "Notifications" appears in tab trigger and in card title
    const matches = screen.getAllByText('Notifications');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
