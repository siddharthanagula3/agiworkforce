import Link from 'next/link';
import { Bot } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy | AGI Workforce',
};

export default function PrivacyPage() {
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
          <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
          <div className="prose prose-invert prose-lg text-zinc-400">
            <p className="lead text-xl text-zinc-300 mb-8">
              Last updated:{' '}
              {new Date().toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>

            <h3>1. Introduction</h3>
            <p>
              AGI Workforce (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to
              protecting your privacy. This Privacy Policy explains how we collect, use, and
              safeguard your information when you use our desktop application and website.
            </p>

            <h3>2. Data Collection</h3>
            <p>We collect minimal data necessary to provide our services:</p>
            <ul>
              <li>
                <strong>Account Information:</strong> Email address and authentication details
                provided via Supabase/OAuth.
              </li>
              <li>
                <strong>Usage Data:</strong> Basic telemetry regarding application performance and
                error rates (if opted in).
              </li>
              <li>
                <strong>Billing Information:</strong> Processed securely by Stripe; we do not store
                credit card details.
              </li>
            </ul>

            <h3>3. Local Execution</h3>
            <p>
              AGI Workforce is designed as a local-first application. Your chat history, task data,
              and local files remain on your device unless you explicitly choose to sync them using
              our optional cloud features.
            </p>

            <h3>4. AI Model Privacy</h3>
            <p>
              AGI Workforce uses a managed proxy model for LLM access. When using local LLMs (e.g.,
              Ollama), no data leaves your machine. When using cloud models (GPT-5, Claude 4.5,
              Gemini 3, etc.), your requests are routed through our secure proxy. We do not store,
              log, or use your conversations to train any models. You pay AGI Workforce directly -
              we handle billing with AI providers on your behalf.
            </p>

            <h3>5. Undo System and Action History</h3>
            <p>
              To enable our undo-based safety system, AGI Workforce stores action history locally on
              your device. This allows you to reverse any AI action. This data is never transmitted
              to our servers and can be cleared at any time from the application.
            </p>

            <h3>6. Contact Us</h3>
            <p>
              If you have any questions about this Privacy Policy, please contact us at
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
