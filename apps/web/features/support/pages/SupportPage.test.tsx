/**
 * SupportPage Component Tests
 *
 * Tests for the dashboard support page with tabbed layout: FAQs, Documentation, Contact.
 * The component loads FAQs dynamically from Supabase via supportService.
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
  CardDescription: ({ children, ...props }: Record<string, unknown>) => (
    <p {...props}>{children as React.ReactNode}</p>
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

// Mock Tabs — render all TabsContent so tests can query content in all tabs
vi.mock('@shared/ui/tabs', () => ({
  Tabs: ({ children, ...props }: Record<string, unknown>) => (
    <div data-testid="tabs" {...props}>
      {children as React.ReactNode}
    </div>
  ),
  TabsList: ({ children, ...props }: Record<string, unknown>) => (
    <div data-testid="tabs-list" {...props}>
      {children as React.ReactNode}
    </div>
  ),
  TabsTrigger: ({ children, ...props }: Record<string, unknown>) => (
    <button type="button" {...props}>
      {children as React.ReactNode}
    </button>
  ),
  TabsContent: ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  ),
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

// Mock lucide-react icons — use importOriginal to include all icons
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return { ...actual };
});

// Mock support service
const mockGetFAQs = vi.fn();
const mockSubmitTicket = vi.fn();
vi.mock('@features/support/services/support-service', () => ({
  supportService: {
    getFAQs: (...args: unknown[]) => mockGetFAQs(...args),
    submitTicket: (...args: unknown[]) => mockSubmitTicket(...args),
  },
}));

// Mock auth store
vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', email: 'test@example.com' },
  }),
}));

// Import the component from the support page
import SupportPage from '../../../app/support/page';

const MOCK_FAQS = [
  {
    id: '1',
    category: 'Getting Started',
    question: 'How do I get started?',
    answer: 'Sign up and start chatting.',
    is_published: true,
    sort_order: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
  {
    id: '2',
    category: 'Billing',
    question: 'How does billing work?',
    answer: 'We use Stripe for billing.',
    is_published: true,
    sort_order: 2,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  },
];

describe('SupportPage (Dashboard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFAQs.mockResolvedValue({ data: MOCK_FAQS, error: null });
    mockSubmitTicket.mockResolvedValue({ data: { id: 'ticket-1' }, error: null });
  });

  it('renders without crashing', () => {
    render(<SupportPage />);
    expect(screen.getByText('Help & Support')).toBeDefined();
  });

  it('shows the page subtitle', () => {
    render(<SupportPage />);
    expect(screen.getByText('Find answers and get the help you need')).toBeDefined();
  });

  it('shows the FAQ tab', () => {
    render(<SupportPage />);
    expect(screen.getByText('FAQs')).toBeDefined();
  });

  it('renders FAQ items after loading', async () => {
    render(<SupportPage />);

    await waitFor(() => {
      expect(screen.getByText('How do I get started?')).toBeDefined();
      expect(screen.getByText('How does billing work?')).toBeDefined();
    });
  });

  it('shows the contact form tab content', () => {
    render(<SupportPage />);
    expect(screen.getByText('Send us a message')).toBeDefined();
  });

  it('contact form has name, email, subject, and message fields', () => {
    render(<SupportPage />);

    expect(screen.getByPlaceholderText('Your name')).toBeDefined();
    expect(screen.getByPlaceholderText('your.email@example.com')).toBeDefined();
    expect(screen.getByPlaceholderText('How can we help?')).toBeDefined();
    expect(screen.getByPlaceholderText('Please describe your issue...')).toBeDefined();
  });

  it('submits the contact form successfully', async () => {
    render(<SupportPage />);

    fireEvent.change(screen.getByPlaceholderText('Your name'), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByPlaceholderText('your.email@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('How can we help?'), {
      target: { value: 'Test Subject' },
    });
    fireEvent.change(screen.getByPlaceholderText('Please describe your issue...'), {
      target: { value: 'Test message content' },
    });

    const submitButton = screen.getByRole('button', { name: /send message/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockSubmitTicket).toHaveBeenCalled();
    });
  });

  it('shows documentation section', () => {
    render(<SupportPage />);

    expect(screen.getByText('Quick Start Guide')).toBeDefined();
    expect(screen.getByText('API Documentation')).toBeDefined();
  });

  it('shows contact channel options', () => {
    render(<SupportPage />);

    expect(screen.getByText('Email Support')).toBeDefined();
    expect(screen.getByText('Live Chat')).toBeDefined();
    expect(screen.getByText('Community Forum')).toBeDefined();
  });
});
