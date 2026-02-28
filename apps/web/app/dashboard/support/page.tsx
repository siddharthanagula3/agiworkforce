'use client';

import { useState } from 'react';
import {
  HelpCircle,
  Mail,
  ExternalLink,
  BookOpen,
  Github,
  CheckCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Textarea } from '@shared/ui/textarea';
import { Badge } from '@shared/ui/badge';
import { Label } from '@shared/ui/label';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: 'What is AGI Workforce?',
    answer:
      'AGI Workforce is an open, model-agnostic AI desktop platform. You can connect any LLM (cloud or local), use MCP tools, manage AI agents, and run autonomous workflows. It supports OpenAI, Anthropic, Google, and 6+ other providers.',
  },
  {
    question: 'How do I connect my API keys?',
    answer:
      "Go to Settings > Security tab to manage your API keys. You can generate platform API keys there. To add provider-specific keys (OpenAI, Anthropic, etc.), use the desktop app's Settings panel which securely stores them via SecretManager.",
  },
  {
    question: 'What AI models are supported?',
    answer:
      'AGI Workforce supports models from OpenAI (GPT-4o, o1), Anthropic (Claude 3.5 Sonnet, Claude Opus 4), Google (Gemini 1.5 Pro, Gemini 2.0), Mistral, Groq, DeepSeek, Ollama (local), and more. New models are added regularly.',
  },
  {
    question: 'How does billing work?',
    answer:
      'Billing is usage-based and transparent. You pay only for what you use — API calls to your connected providers are billed directly by those providers using your own API keys. See the Billing page in your dashboard for subscription details.',
  },
  {
    question: 'How do I use the VIBE workspace?',
    answer:
      'VIBE is a combined chat and code editor workspace. Open a chat conversation on the left panel, and your AI agent can write, edit, and explain code in the integrated editor on the right. You can execute code directly and see results in real time.',
  },
  {
    question: 'Can I use my own models?',
    answer:
      'Yes. AGI Workforce is model-agnostic by design. You can connect to cloud providers using your own API keys, or run local models via Ollama. In the desktop app, go to Settings > Models to configure custom endpoints.',
  },
];

interface ContactFormState {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export default function SupportPage() {
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<ContactFormState>({
    name: '',
    email: '',
    subject: '',
    message: '',
  });

  // TODO: Wire to actual support ticket API (e.g., POST /api/support)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Support form submitted:', form);
    setSubmitted(true);
    setForm({ name: '', email: '', subject: '', message: '' });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const usefulLinks = [
    {
      title: 'Documentation',
      description: 'Full guides and API reference',
      href: '/docs',
      icon: BookOpen,
      external: false,
    },
    {
      title: 'API Reference',
      description: 'REST API endpoints and schemas',
      href: '/api-docs',
      icon: HelpCircle,
      external: false,
    },
    {
      title: 'Status Page',
      description: 'Live system status and incidents',
      href: 'https://status.agiworkforce.ai',
      icon: ExternalLink,
      external: true,
    },
    {
      title: 'GitHub',
      description: 'Open source code and issues',
      href: 'https://github.com/agiworkforce/agiworkforce',
      icon: Github,
      external: true,
    },
  ];

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Help & Support</h1>
          <Badge variant="outline" className="border-blue-500/50 text-blue-400">
            <HelpCircle className="mr-1 h-3 w-3" />
            Support Center
          </Badge>
        </div>
        <p className="mt-2 text-muted-foreground">
          Find answers to common questions, browse documentation, or contact our team.
        </p>
      </div>

      {/* FAQ Section */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <HelpCircle className="h-5 w-5 text-primary" />
            Frequently Asked Questions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {FAQ_ITEMS.map((item, index) => (
            <div
              key={index}
              className="overflow-hidden rounded-lg border border-border/50 bg-accent/10"
            >
              <button
                type="button"
                onClick={() => setOpenFAQ(openFAQ === index ? null : index)}
                className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-accent/20"
              >
                <span className="font-medium text-foreground">{item.question}</span>
                {openFAQ === index ? (
                  <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                )}
              </button>
              {openFAQ === index && (
                <div className="border-t border-border/50 px-4 pb-4 pt-3">
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Contact Form */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Mail className="h-5 w-5 text-primary" />
            Contact Support
          </CardTitle>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <h3 className="text-lg font-semibold text-foreground">Message Sent!</h3>
              <p className="text-sm text-muted-foreground">
                We&apos;ve received your message and will respond within 24 hours.
              </p>
              <Button variant="outline" onClick={() => setSubmitted(false)} className="mt-2">
                Send Another Message
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-foreground">
                    Name
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="Your full name"
                    required
                    className="border-border bg-background text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground">
                    Email
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    required
                    className="border-border bg-background text-foreground"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject" className="text-foreground">
                  Subject
                </Label>
                <Input
                  id="subject"
                  name="subject"
                  value={form.subject}
                  onChange={handleChange}
                  placeholder="What do you need help with?"
                  required
                  className="border-border bg-background text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message" className="text-foreground">
                  Message
                </Label>
                <Textarea
                  id="message"
                  name="message"
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Describe your issue or question in detail..."
                  required
                  rows={5}
                  className="border-border bg-background text-foreground"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" className="bg-primary hover:bg-primary/90">
                  <Mail className="mr-2 h-4 w-4" />
                  Send Message
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Useful Links */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Useful Links</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {usefulLinks.map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.title}
                href={link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noopener noreferrer' : undefined}
                className="block"
              >
                <Card className="h-full cursor-pointer border-border bg-card transition-colors hover:border-primary/50 hover:bg-accent/20">
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="font-medium text-foreground">{link.title}</span>
                      {link.external && (
                        <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{link.description}</p>
                  </CardContent>
                </Card>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
