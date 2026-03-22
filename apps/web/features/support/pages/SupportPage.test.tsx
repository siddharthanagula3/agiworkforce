/**
 * SupportPage Component Tests
 *
 * Tests for the dashboard support page with FAQ section and contact form.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock shared UI components
vi.mock('@shared/ui/card', () => ({
  Card: ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  ),
  CardContent: ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  ),
  CardHeader: ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  ),
  CardTitle: ({ children, ...props }: Record<string, unknown>) => (
    <h3 {...props}>{children as React.ReactNode}</h3>
  ),
}));

vi.mock('@shared/ui/button', () => ({
  Button: ({ children, type, ...props }: Record<string, unknown>) => (
    <button type={(type as 'submit' | 'reset' | 'button') || 'button'} {...props}>
      {children as React.ReactNode}
    </button>
  ),
}));

vi.mock('@shared/ui/input', () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock('@shared/ui/textarea', () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

vi.mock('@shared/ui/badge', () => ({
  Badge: ({ children, ...props }: Record<string, unknown>) => (
    <span {...props}>{children as React.ReactNode}</span>
  ),
}));

vi.mock('@shared/ui/label', () => ({
  Label: ({ children, ...props }: Record<string, unknown>) => (
    <label {...props}>{children as React.ReactNode}</label>
  ),
}));

vi.mock('@shared/ui/accordion', () => ({
  Accordion: ({ children, ...props }: Record<string, unknown>) => (
    <div data-testid="accordion" {...props}>
      {children as React.ReactNode}
    </div>
  ),
  AccordionItem: ({ children, value, ...props }: Record<string, unknown>) => (
    <div data-testid={`accordion-item-${value as string}`} {...props}>
      {children as React.ReactNode}
    </div>
  ),
  AccordionTrigger: ({ children, ...props }: Record<string, unknown>) => (
    <button data-testid="accordion-trigger" type="button" {...props}>
      {children as React.ReactNode}
    </button>
  ),
  AccordionContent: ({ children, ...props }: Record<string, unknown>) => (
    <div data-testid="accordion-content" {...props}>
      {children as React.ReactNode}
    </div>
  ),
}));

vi.mock('@shared/ui/select', () => ({
  Select: ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  ),
  SelectContent: ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  ),
  SelectItem: ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  ),
  SelectTrigger: ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  ),
  SelectValue: (props: Record<string, unknown>) => <span {...props} />,
}));

vi.mock('@shared/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const Icon = ({ className }: { className?: string }) => <span className={className} />;
  return {
    HelpCircle: Icon,
    Mail: Icon,
    ExternalLink: Icon,
    BookOpen: Icon,
    Github: Icon,
    CheckCircle: Icon,
    MessageSquare: Icon,
    Book: Icon,
    Users: Icon,
    Globe: Icon,
  };
});

// Import the component from the support page
import SupportPage from '../../../app/support/page';

describe('SupportPage (Dashboard)', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  it('renders without crashing', () => {
    render(<SupportPage />);
    expect(screen.getByText('Help & Support')).toBeDefined();
  });

  it('shows the support center badge', () => {
    render(<SupportPage />);
    expect(screen.getByText('Support Center')).toBeDefined();
  });

  it('shows the FAQ section', () => {
    render(<SupportPage />);
    expect(screen.getByText('Frequently Asked Questions')).toBeDefined();
  });

  it('renders all FAQ items', () => {
    render(<SupportPage />);

    expect(screen.getByText('How do I get started?')).toBeDefined();
    expect(screen.getByText('What AI models are available?')).toBeDefined();
    expect(screen.getByText('How does billing work?')).toBeDefined();
    expect(screen.getByText('Can I use my own API keys?')).toBeDefined();
    expect(screen.getByText('How do @mentions work in chat?')).toBeDefined();
    expect(screen.getByText('What is VIBE workspace?')).toBeDefined();
    expect(screen.getByText('How do I generate images and videos?')).toBeDefined();
    expect(screen.getByText('Is my data secure?')).toBeDefined();
    expect(screen.getByText('How do I contact support?')).toBeDefined();
  });

  it('shows the contact form', () => {
    render(<SupportPage />);

    expect(screen.getByText('Contact Support')).toBeDefined();
    expect(screen.getByLabelText('Name')).toBeDefined();
    expect(screen.getByLabelText('Email')).toBeDefined();
    expect(screen.getByLabelText('Subject')).toBeDefined();
    expect(screen.getByLabelText('Message')).toBeDefined();
  });

  it('contact form has required fields', () => {
    render(<SupportPage />);

    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
    const subjectInput = screen.getByLabelText('Subject') as HTMLInputElement;
    const messageInput = screen.getByLabelText('Message') as HTMLTextAreaElement;

    expect(nameInput.required).toBe(true);
    expect(emailInput.required).toBe(true);
    expect(subjectInput.required).toBe(true);
    expect(messageInput.required).toBe(true);
  });

  it('shows success message after form submission', async () => {
    render(<SupportPage />);

    // Fill required fields
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test User' } });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: 'Test Subject' },
    });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Test message content' },
    });

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitButton);

    // Should show success message (async because handleSubmit is async)
    await waitFor(() => {
      expect(screen.getByText('Message Sent!')).toBeDefined();
    });
  });

  it('shows quick links section', () => {
    render(<SupportPage />);

    expect(screen.getByText('Quick Links')).toBeDefined();
    expect(screen.getByText('Documentation')).toBeDefined();
    expect(screen.getByText('API Reference')).toBeDefined();
    expect(screen.getByText('Status Page')).toBeDefined();
    expect(screen.getByText('Community')).toBeDefined();
  });

  it('allows sending another message after submission', async () => {
    render(<SupportPage />);

    // Fill and submit
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Sub' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Msg' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    // Wait for the success state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /send another/i })).toBeDefined();
    });

    // Click "Send Another Message"
    fireEvent.click(screen.getByRole('button', { name: /send another/i }));

    // Form should be visible again
    expect(screen.getByLabelText('Name')).toBeDefined();
  });
});
