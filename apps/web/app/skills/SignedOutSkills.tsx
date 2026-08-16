'use client';

import Link from 'next/link';

/**
 * /skills is in the sitemap at priority 0.8 and is the CTA target of two
 * marketing pages, but it is a signed-in surface. It used to render `null` and
 * bounce anonymous visitors to /login, so a person arriving from a "Browse
 * Skills" button — and every crawler — got a blank frame and a redirect with no
 * statement of what the page is or why they were moved.
 *
 * This says both, and offers the sign-in rather than performing it.
 */
export function SignedOutSkills() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Skills
        </p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground">
          Skills live in your workspace
        </h1>
        <p className="max-w-prose text-[15px] leading-relaxed text-muted-foreground">
          A skill is a reusable instruction set the assistant loads on demand — a house style, a
          review checklist, a domain glossary. They are scoped to your account, so browsing and
          installing them needs you signed in.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/login?redirectTo=%2Fskills"
          className="inline-flex h-10 items-center rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Sign in to browse skills
        </Link>
        <Link
          href="/features/plugins"
          className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          What skills can do
        </Link>
      </div>
    </main>
  );
}
