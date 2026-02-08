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
      'AGI Workforce is a desktop app where you simply tell the AI what you want done, and it autonomously completes the task. No setup wizards, no configuration screens - just open the app and start chatting. Everything the AI does is reversible, so you can always undo if something goes wrong.',
  },
  {
    category: 'General',
    question: 'How is AGI Workforce different from other AI tools?',
    answer:
      'AGI Workforce is designed for non-technical users who want results, not configuration. You describe your goal in plain English, and the AI figures out the steps. Unlike tools that require you to build workflows or approve every action, our AI works autonomously with a unique undo-based safety model - everything is reversible, so you can experiment freely.',
  },
  {
    category: 'General',
    question: 'Do I need technical knowledge to use AGI Workforce?',
    answer:
      'Absolutely not. AGI Workforce is built specifically for non-technical users. There are no settings screens to configure, no technical jargon to learn. Just describe what you want in your own words and the AI handles everything. Error messages are in plain English, and you can always say "undo" if something goes wrong.',
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
      'Yes! With a Pro or Max subscription, you can sync your chat history and preferences across multiple devices. The desktop app is the primary experience, while the web platform handles billing and device management.',
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
      'Your data stays on your device by default. All credentials are encrypted using AES-256-GCM and stored in your system keychain. We use a managed proxy model for LLM calls, so you pay AGI Workforce directly - no need to manage your own API keys from OpenAI or Anthropic.',
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
      'AGI Workforce supports GPT-5, Claude 4.5, Gemini 3, Grok 4, DeepSeek Chat, Qwen 3, and local models via Ollama. You pay AGI Workforce directly - we handle the billing complexity so you never need to manage multiple API subscriptions.',
  },
  // Features
  {
    category: 'Features',
    question: 'What kind of tasks can I automate?',
    answer:
      'Just tell the AI what you need: "book me a flight to NYC", "organize my downloads folder", "fill out this form", "research competitors and create a report". The AI figures out the steps and handles web automation, file management, data processing, and more.',
  },
  {
    category: 'Features',
    question: 'How does the undo system work?',
    answer:
      'Every action the AI takes is reversible. If something goes wrong, just say "undo" or "revert that" and the AI will restore the previous state. This is how we provide full autonomy without risk - you can let the AI work freely knowing you can always roll back.',
  },
  {
    category: 'Features',
    question: 'Can I use multiple AI models?',
    answer:
      'Yes! AGI Workforce supports GPT-5, Claude 4.5, Gemini 3, DeepSeek Chat, Qwen 3, and local models via Ollama. The AI automatically picks the best model for each task, or you can specify your preference.',
  },
  {
    category: 'Features',
    question: 'Do I need to build workflows or configure anything?',
    answer:
      'No! Unlike traditional automation tools with drag-and-drop builders, AGI Workforce uses a chat-first approach. You describe your goal in plain English and the AI determines the steps. No visual workflow builders, no configuration screens, no technical setup.',
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
