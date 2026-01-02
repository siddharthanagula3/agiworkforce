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
        url: '/og-image.svg',
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
    images: ['/og-image.svg'],
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
        text: 'AGI Workforce is a desktop application that brings the power of AI agents directly to your computer. It enables you to automate complex workflows, interact with multiple AI models, and boost your productivity without requiring any coding knowledge.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is AGI Workforce different from other AI tools?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Unlike browser-based AI tools, AGI Workforce runs natively on your desktop with access to your local files, terminal, and applications. It supports multiple AI providers (OpenAI, Anthropic, Google, and more), works offline with local models, and keeps your data private by processing locally when possible.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need technical knowledge to use AGI Workforce?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No! AGI Workforce is designed to be accessible to everyone. You can interact with AI agents using natural language, and the intuitive interface guides you through automation workflows without requiring any programming skills.',
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
        text: 'Yes! With a Pro or Max subscription, you can sync your workflows, settings, and history across multiple devices. Your data is securely synchronized through our cloud infrastructure.',
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
        text: 'Security is our top priority. Your API keys are encrypted and stored locally on your device. When using cloud sync, all data is encrypted in transit and at rest. We never have access to your API keys or the content of your conversations.',
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
        text: 'AGI Workforce supports OpenAI (GPT-4, GPT-4o), Anthropic (Claude), Google (Gemini), xAI (Grok), DeepSeek, Qwen, Moonshot, and local models via Ollama. You can use your own API keys or our managed cloud service.',
      },
    },
    {
      '@type': 'Question',
      name: 'What kind of tasks can I automate?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You can automate a wide range of tasks including file management, code generation and review, document processing, web browsing, terminal commands, scheduling, and multi-step workflows that combine multiple actions.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I use multiple AI models together?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes! AGI Workforce supports intelligent task routing, allowing you to use different AI models for different types of tasks. For example, you could use Claude for coding tasks and GPT-4 for creative writing, all within the same workflow.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there an API for developers?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Enterprise customers have access to our API for integrating AGI Workforce capabilities into their own applications and workflows. Contact us for more information about enterprise solutions.',
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
