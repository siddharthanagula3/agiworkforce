'use client';

import Link from 'next/link';
import { Bot, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <main className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-4 text-center">
          <div className="mb-8">
            <Bot className="h-24 w-24 text-zinc-700 mx-auto mb-6" />
            <h1 className="text-8xl font-bold text-zinc-800 mb-4">404</h1>
            <h2 className="text-2xl font-semibold mb-4">Page Not Found</h2>
            <p className="text-zinc-400 max-w-md mx-auto mb-8">
              Oops! The page you&apos;re looking for doesn&apos;t exist or has been moved.
              Let&apos;s get you back on track.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Link>
            <button
              onClick={() => typeof window !== 'undefined' && window.history.back()}
              className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 px-8 text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </button>
          </div>

          <div className="mt-16 pt-8 border-t border-zinc-800">
            <p className="text-zinc-500 text-sm">
              Need help?{' '}
              <Link href="/contact" className="text-blue-400 hover:text-blue-300">
                Contact our support team
              </Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-black py-8">
        <div className="container mx-auto px-4 text-center">
          <div className="text-sm text-zinc-600">
            &copy; {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
