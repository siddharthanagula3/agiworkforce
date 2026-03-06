import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions | AGI Workforce',
  description:
    'Find answers to common questions about AGI Workforce. Learn about features, pricing, platform support, security, and how to get started with AI automation.',
  keywords: [
    'AGI Workforce FAQ',
    'AI automation questions',
    'AGI Workforce pricing',
    'AI agents help',
    'workflow automation FAQ',
  ],
  alternates: {
    canonical: 'https://agiworkforce.com/faq',
  },
  openGraph: {
    title: 'FAQ | AGI Workforce',
    description:
      'Find answers to common questions about AGI Workforce features, pricing, and security.',
    url: 'https://agiworkforce.com/faq',
    siteName: 'AGI Workforce',
    type: 'website',
    images: [
      {
        url: '/app-preview.png',
        width: 1200,
        height: 630,
        alt: 'AGI Workforce FAQ',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FAQ | AGI Workforce',
    description: 'Find answers to common questions about AGI Workforce.',
    images: ['/app-preview.png'],
    creator: '@agiworkforce',
  },
};

// FAQPage schema for rich snippets in search results
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': 'https://agiworkforce.com/faq',
  url: 'https://agiworkforce.com/faq',
  name: 'AGI Workforce FAQ',
  description: 'Frequently asked questions about AGI Workforce',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is AGI Workforce?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'AGI Workforce is a desktop app where you simply tell the AI what you want done, and it autonomously completes the task. No setup wizards, no configuration screens - just open the app and start chatting. Everything the AI does is reversible, so you can always undo if something goes wrong.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is AGI Workforce different from other AI tools?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'AGI Workforce is designed for non-technical users who want results, not configuration. You describe your goal in plain English, and the AI figures out the steps. Unlike tools that require you to build workflows or approve every action, our AI works autonomously with a unique undo-based safety model - everything is reversible, so you can experiment freely.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need technical knowledge to use AGI Workforce?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Absolutely not. AGI Workforce is built specifically for non-technical users. There are no settings screens to configure, no technical jargon to learn. Just describe what you want in your own words and the AI handles everything. Error messages are in plain English, and you can always say "undo" if something goes wrong.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a free tier available?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, we offer a free Hobby tier that includes essential features to get you started. You can explore the core functionality and upgrade to Pro or Max plans when you need more advanced features and higher usage limits.',
      },
    },
    {
      '@type': 'Question',
      name: 'What payment methods do you accept?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'We accept all major credit cards (Visa, MasterCard, American Express, Discover) through our secure payment processor, Stripe. All transactions are encrypted and secure.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I cancel my subscription anytime?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Absolutely. You can cancel your subscription at any time from your account settings. You will continue to have access to your plan features until the end of your current billing period.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which operating systems are supported?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'AGI Workforce is available for macOS, Windows, and Linux. We provide native builds optimized for each platform, ensuring the best performance and integration with your operating system.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I sync between multiple devices?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes! With a Pro or Max subscription, you can sync your chat history and preferences across multiple devices. The desktop app is the primary experience, while the web platform handles billing and device management.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does AGI Workforce work offline?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, AGI Workforce supports offline operation when using local AI models through Ollama. Cloud-based AI providers require an internet connection, but your local workflows and data remain accessible offline.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is my data protected?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Your data stays on your device by default. All credentials are encrypted using AES-256-GCM and stored in your system keychain. We use a managed proxy model for LLM calls, so you pay AGI Workforce directly - no need to manage your own API keys from OpenAI or Anthropic.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do you store my conversations or data?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'By default, all conversations and data are stored locally on your device. If you enable cloud sync, encrypted backups are stored securely for synchronization purposes only. You maintain full control over your data and can delete it at any time.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which AI providers are supported?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'AGI Workforce supports models from OpenAI, Anthropic, Google, xAI, DeepSeek, Alibaba, and local models via Ollama. You pay AGI Workforce directly - we handle the billing complexity so you never need to manage multiple API subscriptions.',
      },
    },
    {
      '@type': 'Question',
      name: 'What kind of tasks can I automate?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Just tell the AI what you need: "book me a flight to NYC", "organize my downloads folder", "fill out this form", "research competitors and create a report". The AI figures out the steps and handles web automation, file management, data processing, and more.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does the undo system work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Every action the AI takes is reversible. If something goes wrong, just say "undo" or "revert that" and the AI will restore the previous state. This is how we provide full autonomy without risk - you can let the AI work freely knowing you can always roll back.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need to build workflows or configure anything?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No! Unlike traditional automation tools with drag-and-drop builders, AGI Workforce uses a chat-first approach. You describe your goal in plain English and the AI determines the steps. No visual workflow builders, no configuration screens, no technical setup.',
      },
    },
  ],
};

export default function FAQLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
