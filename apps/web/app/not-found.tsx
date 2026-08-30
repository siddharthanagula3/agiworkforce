'use client';

import Link from 'next/link';
import { Bot, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-4 text-center">
          <div className="mb-8">
            <Bot className="h-24 w-24 text-muted-foreground mx-auto mb-6" />
            {/* muted-foreground clears 4.5:1 on its own; the /30 blend dropped this
                to 1.48:1, so the only thing naming the error was invisible. */}
            <h1 className="mb-4 text-8xl font-bold text-muted-foreground">404</h1>
            <h2 className="text-2xl font-semibold mb-4">Page Not Found</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-8">
              Oops! The page you&apos;re looking for doesn&apos;t exist or has been moved.
              Let&apos;s get you back on track.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Link>
            <button
              onClick={() => typeof window !== 'undefined' && window.history.back()}
              className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-card px-8 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </button>
          </div>

          <div className="mt-16 pt-8 border-t border-border">
            <p className="text-muted-foreground text-sm">
              Need help?{' '}
              <Link href="/contact" className="text-primary hover:text-primary/80 underline">
                Contact our support team
              </Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-background py-8">
        <div className="container mx-auto px-4 text-center">
          <div className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} AGI Automation LLC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
