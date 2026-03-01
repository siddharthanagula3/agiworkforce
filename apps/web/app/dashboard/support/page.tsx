'use client';

import { useState } from 'react';
import {
  HelpCircle,
  Mail,
  ExternalLink,
  BookOpen,
  CheckCircle,
  MessageSquare,
  Book,
  Users,
  Globe,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Textarea } from '@shared/ui/textarea';
import { Badge } from '@shared/ui/badge';
import { Label } from '@shared/ui/label';
import { toast } from 'sonner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@shared/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select';

const FAQ_ITEMS = [
  {
    question: 'How do I get started?',
    answer:
      'Download the desktop app, sign in with your account, and add an API key from any supported provider (OpenAI, Anthropic, Google, etc.) in Settings. You can start chatting with AI immediately after connecting a provider.',
  },
  {
    question: 'What AI models are available?',
    answer:
      'AGI Workforce supports models from OpenAI (GPT-4o, o1, o3), Anthropic (Claude 4 Opus, Sonnet), Google (Gemini 2.0 Pro, Flash), Mistral, Groq, DeepSeek, xAI Grok, and local models via Ollama. New models are added as they release.',
  },
  {
    question: 'How does billing work?',
    answer:
      'You bring your own API keys, so usage is billed directly by each provider. The AGI Workforce platform itself offers free and premium tiers. Check the Billing page in your dashboard for subscription details and usage tracking.',
  },
  {
    question: 'Can I use my own API keys?',
    answer:
      'Yes. AGI Workforce is model-agnostic by design. Go to Settings in the desktop app to add API keys for any supported provider. Keys are encrypted with Argon2id + AES-GCM and stored securely in your local keychain.',
  },
  {
    question: 'How do @mentions work in chat?',
    answer:
      'Type @ in the chat composer to browse available AI skills and integrations. Select a skill to route your message to a specialized AI agent (e.g., @code-reviewer for code analysis, @financial-advisor for finance questions). You can mention multiple skills in one message.',
  },
  {
    question: 'What is VIBE workspace?',
    answer:
      'VIBE is a combined chat and code editor workspace. Chat with an AI agent on the left panel while it writes, edits, and explains code in the integrated editor on the right. You can execute code directly and see results in real time.',
  },
  {
    question: 'How do I generate images and videos?',
    answer:
      'Use the media generation tools in the chat composer (click the + button). You can generate images with DALL-E, Stable Diffusion, or Google Imagen, and videos with supported providers. Results appear inline in the chat.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Yes. API keys are encrypted with Argon2id + AES-GCM and stored in your OS keychain. Chat data stays on your device by default. All tool executions are sandboxed by ToolGuard. We never store or log your API keys or conversation content on our servers.',
  },
  {
    question: 'How do I contact support?',
    answer:
      'Use the contact form below to submit a support ticket. You can also open an issue on our GitHub repository or join our community forum. We typically respond within 24 hours.',
  },
];

interface ContactFormState {
  name: string;
  email: string;
  subject: string;
  category: string;
  message: string;
}

export default function SupportPage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<ContactFormState>({
    name: '',
    email: '',
    subject: '',
    category: '',
    message: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error('Request failed');
      toast.success('Support request submitted. We will respond within 24 hours.');
      setSubmitted(true);
      setForm({ name: '', email: '', subject: '', category: '', message: '' });
    } catch {
      toast.error(
        'Could not submit your request. Please email us at support@agiworkforce.com or open a GitHub issue.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const quickLinks = [
    {
      title: 'Documentation',
      description: 'Guides, tutorials, and API reference',
      href: '/docs',
      icon: Book,
      external: false,
    },
    {
      title: 'API Reference',
      description: 'REST API endpoints and schemas',
      href: '/api-docs',
      icon: BookOpen,
      external: false,
    },
    {
      title: 'Status Page',
      description: 'Live system status and incidents',
      href: 'https://status.agiworkforce.com',
      icon: Globe,
      external: true,
    },
    {
      title: 'Community',
      description: 'Join discussions and get help',
      href: 'https://github.com/agiworkforce/agiworkforce/discussions',
      icon: Users,
      external: true,
    },
  ];

  return (
    <div className="animate-fade-in-up space-y-6 px-4 py-4 sm:space-y-8 sm:p-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Help & Support
          </h1>
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
      <Card className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <HelpCircle className="h-5 w-5 text-primary" />
            Frequently Asked Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {FAQ_ITEMS.map((item, index) => (
              <AccordionItem key={item.question} value={`faq-${index}`} className="border-border/50">
                <AccordionTrigger className="text-left text-foreground hover:no-underline hover:text-primary">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Contact Form */}
      <Card className="border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <MessageSquare className="h-5 w-5 text-primary" />
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <Label htmlFor="category" className="text-foreground">
                    Category
                  </Label>
                  <Select
                    value={form.category}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger className="border-border bg-background text-foreground">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bug">Bug Report</SelectItem>
                      <SelectItem value="feature">Feature Request</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
                  <Mail className="mr-2 h-4 w-4" />
                  {isSubmitting ? 'Sending...' : 'Submit'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Quick Links</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <a
                key={link.title}
                href={link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noopener noreferrer' : undefined}
                className="block"
              >
                <Card className="h-full cursor-pointer border-white/[0.06] bg-white/[0.03] backdrop-blur-xl transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.05]">
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
