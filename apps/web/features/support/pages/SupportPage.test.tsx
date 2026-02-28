/**
 * SupportPage Component Tests
 *
 * Tests for the dashboard support page with FAQ section and contact form.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock shared UI components
vi.mock('@shared/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h3 {...props}>{children}</h3>,
}));

vi.mock('@shared/ui/button', () => ({
  Button: ({ children, type, ...props }: any) => (
    <button type={type || 'button'} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@shared/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@shared/ui/textarea', () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

vi.mock('@shared/ui/badge', () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock('@shared/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock('@shared/ui/accordion', () => ({
  Accordion: ({ children, ...props }: any) => (
    <div data-testid="accordion" {...props}>
      {children}
    </div>
  ),
  AccordionItem: ({ children, value, ...props }: any) => (
    <div data-testid={`accordion-item-${value}`} {...props}>
      {children}
    </div>
  ),
  AccordionTrigger: ({ children, ...props }: any) => (
    <button data-testid="accordion-trigger" type="button" {...props}>
      {children}
    </button>
  ),
  AccordionContent: ({ children, ...props }: any) => (
    <div data-testid="accordion-content" {...props}>
      {children}
    </div>
  ),
}));

vi.mock('@shared/ui/select', () => ({
  Select: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SelectContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SelectItem: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SelectTrigger: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  SelectValue: (props: any) => <span {...props} />,
}));

vi.mock('@shared/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(' '),
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

// Import the component from the dashboard support page
// The dashboard support page contains the full SupportPage with FAQ + form
import SupportPage from '../../../app/dashboard/support/page';

describe('SupportPage (Dashboard)', () => {
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

  it('shows success message after form submission', () => {
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

    // Should show success message
    expect(screen.getByText('Message Sent!')).toBeDefined();
  });

  it('shows quick links section', () => {
    render(<SupportPage />);

    expect(screen.getByText('Quick Links')).toBeDefined();
    expect(screen.getByText('Documentation')).toBeDefined();
    expect(screen.getByText('API Reference')).toBeDefined();
    expect(screen.getByText('Status Page')).toBeDefined();
    expect(screen.getByText('Community')).toBeDefined();
  });

  it('allows sending another message after submission', () => {
    render(<SupportPage />);

    // Fill and submit
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Sub' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Msg' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    // Click "Send Another Message"
    const sendAnother = screen.getByRole('button', { name: /send another/i });
    fireEvent.click(sendAnother);

    // Form should be visible again
    expect(screen.getByLabelText('Name')).toBeDefined();
  });
});
