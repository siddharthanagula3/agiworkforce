import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us | AGI Workforce',
  description:
    'Get in touch with AGI Automation LLC. Have questions about AGI Workforce? Our support team in Austin, TX is ready to help you with any inquiries.',
  keywords: [
    'contact AGI Workforce',
    'AGI Automation support',
    'AI automation help',
    'customer support',
    'Austin TX',
  ],
  alternates: {
    canonical: 'https://agiworkforce.com/contact',
  },
  openGraph: {
    title: 'Contact Us | AGI Workforce',
    description:
      'Have questions about AGI Workforce? Our support team is ready to help. Contact us today.',
    url: 'https://agiworkforce.com/contact',
    siteName: 'AGI Workforce',
    type: 'website',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'Contact AGI Workforce',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact Us | AGI Workforce',
    description: 'Have questions about AGI Workforce? Get in touch with our team.',
    images: ['/og-image.svg'],
    creator: '@agiworkforce',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  '@id': 'https://agiworkforce.com/contact',
  url: 'https://agiworkforce.com/contact',
  name: 'Contact AGI Workforce',
  description: 'Get in touch with AGI Automation LLC support team.',
  mainEntity: {
    '@type': 'Organization',
    name: 'AGI Automation LLC',
    email: 'contact@agiagentautomation.com',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Austin',
      addressRegion: 'TX',
      addressCountry: 'US',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'contact@agiagentautomation.com',
      availableLanguage: 'English',
    },
    sameAs: [
      'https://www.linkedin.com/company/agi-automation-llc',
      'https://www.instagram.com/agiworkforce',
    ],
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
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
