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
  const Root = React.forwardRef<HTMLDivElement, any>(({ children, ...props }, ref) => (
    <div ref={ref} role="radiogroup" {...props}>
      {children}
    </div>
  ));
  Root.displayName = 'RadioGroupRoot';

  const Item = React.forwardRef<HTMLButtonElement, any>(({ children, ...props }, ref) => (
    <button ref={ref} role="radio" {...props}>
      {children}
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
  const Tabs = ({ children, ...props }: any) => (
    <div data-testid="tabs" {...props}>
      {children}
    </div>
  );
  const TabsList = ({ children, ...props }: any) => (
    <div data-testid="tabs-list" role="tablist" {...props}>
      {children}
    </div>
  );
  const TabsTrigger = ({ children, value, ...props }: any) => (
    <button data-testid={`tab-${value}`} role="tab" {...props}>
      {children}
    </button>
  );
  const TabsContent = ({ children, value, ...props }: any) => (
    <div data-testid={`tab-content-${value}`} role="tabpanel" {...props}>
      {children}
    </div>
  );
  return { Tabs, TabsList, TabsTrigger, TabsContent };
});

vi.mock('@shared/ui/card', () => {
  const Card = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const CardHeader = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const CardTitle = ({ children, ...props }: any) => <h3 {...props}>{children}</h3>;
  const CardDescription = ({ children, ...props }: any) => <p {...props}>{children}</p>;
  const CardContent = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  return { Card, CardHeader, CardTitle, CardDescription, CardContent };
});

vi.mock('@shared/ui/button', () => {
  const Button = React.forwardRef(({ children, ...props }: any, ref: any) => (
    <button ref={ref} {...props}>
      {children}
    </button>
  ));
  Button.displayName = 'Button';
  return { Button };
});

vi.mock('@shared/ui/input', () => {
  const Input = React.forwardRef((props: any, ref: any) => <input ref={ref} {...props} />);
  Input.displayName = 'Input';
  return { Input };
});

vi.mock('@shared/ui/label', () => {
  const Label = React.forwardRef(({ children, ...props }: any, ref: any) => (
    <label ref={ref} {...props}>
      {children}
    </label>
  ));
  Label.displayName = 'Label';
  return { Label };
});

vi.mock('@shared/ui/switch', () => {
  const Switch = React.forwardRef((props: any, ref: any) => (
    <button ref={ref} role="switch" {...props} />
  ));
  Switch.displayName = 'Switch';
  return { Switch };
});

vi.mock('@shared/ui/textarea', () => {
  const Textarea = React.forwardRef((props: any, ref: any) => <textarea ref={ref} {...props} />);
  Textarea.displayName = 'Textarea';
  return { Textarea };
});

vi.mock('@shared/ui/slider', () => {
  const Slider = React.forwardRef((props: any, ref: any) => (
    <div ref={ref} role="slider" {...props} />
  ));
  Slider.displayName = 'Slider';
  return { Slider };
});

vi.mock('@shared/ui/avatar', () => {
  const Avatar = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const AvatarImage = (props: any) => <img {...props} />;
  const AvatarFallback = ({ children, ...props }: any) => <span {...props}>{children}</span>;
  return { Avatar, AvatarImage, AvatarFallback };
});

vi.mock('@shared/ui/select', () => {
  const Select = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const SelectContent = React.forwardRef(({ children, ...props }: any, ref: any) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  ));
  SelectContent.displayName = 'SelectContent';
  const SelectItem = React.forwardRef(({ children, ...props }: any, ref: any) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  ));
  SelectItem.displayName = 'SelectItem';
  const SelectTrigger = React.forwardRef(({ children, ...props }: any, ref: any) => (
    <button ref={ref} {...props}>
      {children}
    </button>
  ));
  SelectTrigger.displayName = 'SelectTrigger';
  const SelectValue = (props: any) => <span {...props} />;
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
});

vi.mock('@shared/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(' '),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const Icon = React.forwardRef(({ className, ...props }: any, ref: any) => (
    <span ref={ref} className={className} {...props} />
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
