'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, ChevronDown, ChevronUp } from 'lucide-react';
import { Header } from '../../components/layout/Header';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqs: FAQItem[] = [
  // General
  {
    category: 'General',
    question: 'What is AGI Workforce?',
    answer:
      'AGI Workforce is a desktop application that brings the power of AI agents directly to your computer. It enables you to automate complex workflows, interact with multiple AI models, and boost your productivity without requiring any coding knowledge.',
  },
  {
    category: 'General',
    question: 'How is AGI Workforce different from other AI tools?',
    answer:
      'Unlike browser-based AI tools, AGI Workforce runs natively on your desktop with access to your local files, terminal, and applications. It supports multiple AI providers (OpenAI, Anthropic, Google, and more), works offline with local models, and keeps your data private by processing locally when possible.',
  },
  {
    category: 'General',
    question: 'Do I need technical knowledge to use AGI Workforce?',
    answer:
      'No! AGI Workforce is designed to be accessible to everyone. You can interact with AI agents using natural language, and the intuitive interface guides you through automation workflows without requiring any programming skills.',
  },
  // Pricing
  {
    category: 'Pricing',
    question: 'Is there a free tier available?',
    answer:
      'Yes, we offer a free Hobby tier that includes essential features to get you started. You can explore the core functionality and upgrade to Pro or Max plans when you need more advanced features and higher usage limits.',
  },
  {
    category: 'Pricing',
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit cards (Visa, MasterCard, American Express, Discover) through our secure payment processor, Stripe. All transactions are encrypted and secure.',
  },
  {
    category: 'Pricing',
    question: 'Can I cancel my subscription anytime?',
    answer:
      'Absolutely. You can cancel your subscription at any time from your account settings. You will continue to have access to your plan features until the end of your current billing period.',
  },
  // Platform
  {
    category: 'Platform',
    question: 'Which operating systems are supported?',
    answer:
      'AGI Workforce is available for macOS, Windows, and Linux. We provide native builds optimized for each platform, ensuring the best performance and integration with your operating system.',
  },
  {
    category: 'Platform',
    question: 'Can I sync between multiple devices?',
    answer:
      'Yes! With a Pro or Max subscription, you can sync your workflows, settings, and history across multiple devices. Your data is securely synchronized through our cloud infrastructure.',
  },
  {
    category: 'Platform',
    question: 'Does AGI Workforce work offline?',
    answer:
      'Yes, AGI Workforce supports offline operation when using local AI models through Ollama. Cloud-based AI providers require an internet connection, but your local workflows and data remain accessible offline.',
  },
  // Security
  {
    category: 'Security',
    question: 'How is my data protected?',
    answer:
      'Security is our top priority. Your API keys are encrypted and stored locally on your device. When using cloud sync, all data is encrypted in transit and at rest. We never have access to your API keys or the content of your conversations.',
  },
  {
    category: 'Security',
    question: 'Do you store my conversations or data?',
    answer:
      'By default, all conversations and data are stored locally on your device. If you enable cloud sync, encrypted backups are stored securely for synchronization purposes only. You maintain full control over your data and can delete it at any time.',
  },
  {
    category: 'Security',
    question: 'Which AI providers are supported?',
    answer:
      'AGI Workforce supports OpenAI (GPT-4, GPT-4o), Anthropic (Claude), Google (Gemini), xAI (Grok), DeepSeek, Qwen, Moonshot, and local models via Ollama. You can use your own API keys or our managed cloud service.',
  },
  // Features
  {
    category: 'Features',
    question: 'What kind of tasks can I automate?',
    answer:
      'You can automate a wide range of tasks including file management, code generation and review, document processing, web browsing, terminal commands, scheduling, and multi-step workflows that combine multiple actions.',
  },
  {
    category: 'Features',
    question: 'Can I use multiple AI models together?',
    answer:
      'Yes! AGI Workforce supports intelligent task routing, allowing you to use different AI models for different types of tasks. For example, you could use Claude for coding tasks and GPT-4 for creative writing, all within the same workflow.',
  },
  {
    category: 'Features',
    question: 'Is there an API for developers?',
    answer:
      'Enterprise customers have access to our API for integrating AGI Workforce capabilities into their own applications and workflows. Contact us for more information about enterprise solutions.',
  },
];

const categories = ['General', 'Pricing', 'Platform', 'Security', 'Features'];

export default function FAQPage() {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string>('General');

  const toggleItem = (index: number) => {
    const newOpenItems = new Set(openItems);
    if (newOpenItems.has(index)) {
      newOpenItems.delete(index);
    } else {
      newOpenItems.add(index);
    }
    setOpenItems(newOpenItems);
  };

  const filteredFaqs = faqs.filter((faq) => faq.category === activeCategory);

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Header />

      <main className="flex-1 pt-24">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-16 md:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black" />
          <div className="container relative mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
              Frequently Asked Questions
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
              Find answers to common questions about AGI Workforce. Can&apos;t find what you&apos;re
              looking for? Contact our support team.
            </p>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 bg-zinc-950">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              {/* Category Tabs */}
              <div className="flex flex-wrap gap-2 mb-12 justify-center">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      activeCategory === category
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>

              {/* FAQ Items */}
              <div className="space-y-4">
                {filteredFaqs.map((faq) => {
                  const globalIndex = faqs.indexOf(faq);
                  const isOpen = openItems.has(globalIndex);

                  return (
                    <div
                      key={globalIndex}
                      className="rounded-xl border border-zinc-800 bg-black/50 overflow-hidden"
                    >
                      <button
                        onClick={() => toggleItem(globalIndex)}
                        className="w-full flex items-center justify-between p-6 text-left hover:bg-zinc-900/50 transition-colors"
                      >
                        <span className="font-medium pr-4">{faq.question}</span>
                        {isOpen ? (
                          <ChevronUp className="h-5 w-5 text-zinc-500 flex-shrink-0" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-zinc-500 flex-shrink-0" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="px-6 pb-6">
                          <p className="text-zinc-400 leading-relaxed">{faq.answer}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="py-16 bg-black">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl font-bold mb-4">Still Have Questions?</h2>
            <p className="text-zinc-400 mb-6">
              Our support team is here to help you with any questions you may have.
            </p>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Contact Support
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-black py-12">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 font-bold">
            <Bot className="h-5 w-5 text-zinc-500" />
            <span className="text-zinc-500">AGI Workforce</span>
          </div>
          <div className="text-sm text-zinc-600">
            &copy; {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
