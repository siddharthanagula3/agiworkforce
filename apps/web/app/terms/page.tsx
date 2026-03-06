import Link from 'next/link';
import { Bot } from 'lucide-react';

export const metadata = {
  title: 'Terms of Service',
  description: 'Terms of service for AGI Workforce - the AI agent desktop platform.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <header className="fixed top-0 w-full border-b border-white/10 bg-black/50 backdrop-blur-xl z-50">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tighter">
            <Bot className="h-6 w-6 text-blue-500" />
            <span>AGI Workforce</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </header>

      <main className="flex-1 pt-24 pb-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
          <div className="prose prose-invert prose-lg text-zinc-400">
            <p className="lead text-xl text-zinc-300 mb-8">
              Last updated:{' '}
              {new Date().toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>

            <h3>1. Acceptance of Terms</h3>
            <p>
              By accessing or using AGI Workforce, you agree to be bound by these Terms of Service.
              If you disagree with any part of the terms, you may not access the service.
            </p>

            <h3>2. License</h3>
            <p>
              Subject to your compliance with these Terms, we grant you a limited, non-exclusive,
              non-transferable, non-sublicensable license to download and use a copy of the AGI
              Workforce application on a device that you own or control.
            </p>

            <h3>3. User Responsibilities</h3>
            <p>You are responsible for:</p>
            <ul>
              <li>Maintaining the confidentiality of your account credentials.</li>
              <li>All activities that occur under your account.</li>
              <li>
                Ensuring your use of the application complies with applicable laws and regulations.
              </li>
            </ul>

            <h3>4. Termination</h3>
            <p>
              We may terminate or suspend your access immediately, without prior notice or
              liability, for any reason whatsoever, including without limitation if you breach the
              Terms.
            </p>

            <h3>5. Limitation of Liability</h3>
            <p>
              In no event shall AGI Workforce, nor its directors, employees, partners, agents,
              suppliers, or affiliates, be liable for any indirect, incidental, special,
              consequential or punitive damages, including without limitation, loss of profits,
              data, use, goodwill, or other intangible losses.
            </p>

            <h3>6. Changes</h3>
            <p>
              We reserve the right, at our sole discretion, to modify or replace these Terms at any
              time. We will try to provide at least 30 days&apos; notice prior to any new terms
              taking effect.
            </p>

            <h3>7. Contact Us</h3>
            <p>
              If you have any questions about these Terms, please contact us at
              contact@agiagentautomation.com.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-black py-12">
        <div className="container mx-auto px-4 text-center">
          <div className="text-sm text-zinc-600">
            © {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
