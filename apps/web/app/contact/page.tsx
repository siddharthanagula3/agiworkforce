'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      const name = String(data.get('name') ?? '').trim();
      const email = String(data.get('email') ?? '').trim();
      const subject = String(data.get('subject') ?? '').trim();
      const message = String(data.get('message') ?? '').trim();
      const body = `Name: ${name}\nEmail: ${email}\n\n${message}`;
      const mailto =
        `mailto:contact@agiworkforce.com` +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
      setSubmitted(true);
      form.reset();
    } catch {
      setError('Could not open mail client. Email contact@agiworkforce.com directly.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Contact.</h1>
          <p className="agi-page-lede">
            One human reads this inbox.{' '}
            <strong>
              For sales, see{' '}
              <Link href="/contact-sales" style={{ color: 'var(--agi-ink)' }}>
                contact sales
              </Link>
              . For everything else, the form below or email{' '}
              <a href="mailto:contact@agiworkforce.com" style={{ color: 'var(--agi-ink)' }}>
                contact@agiworkforce.com
              </a>
              .
            </strong>
          </p>
        </section>
        <section className="agi-section">
          {submitted ? (
            <div className="agi-callout">
              <h2 className="agi-callout-h">Sent.</h2>
              <p className="agi-callout-p">We&rsquo;ll respond within one business day.</p>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--agi-ink-quiet)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Name
                </span>
                <input
                  required
                  name="name"
                  type="text"
                  style={{
                    background: 'var(--agi-bg-2)',
                    border: '1px solid var(--agi-rule)',
                    color: 'var(--agi-ink)',
                    padding: '10px 14px',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--agi-ink-quiet)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Email
                </span>
                <input
                  required
                  name="email"
                  type="email"
                  style={{
                    background: 'var(--agi-bg-2)',
                    border: '1px solid var(--agi-rule)',
                    color: 'var(--agi-ink)',
                    padding: '10px 14px',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--agi-ink-quiet)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Subject
                </span>
                <input
                  required
                  name="subject"
                  type="text"
                  style={{
                    background: 'var(--agi-bg-2)',
                    border: '1px solid var(--agi-rule)',
                    color: 'var(--agi-ink)',
                    padding: '10px 14px',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--agi-ink-quiet)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Message
                </span>
                <textarea
                  required
                  name="message"
                  rows={6}
                  style={{
                    background: 'var(--agi-bg-2)',
                    border: '1px solid var(--agi-rule)',
                    color: 'var(--agi-ink)',
                    padding: '10px 14px',
                    borderRadius: 6,
                    fontSize: 14,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
              </label>
              {error && (
                <p style={{ color: 'var(--agi-error)', fontSize: 13, margin: 0 }}>{error}</p>
              )}
              <div className="agi-cta-row">
                <button
                  type="submit"
                  disabled={pending}
                  className="agi-cta-primary"
                  style={{ border: 'none', cursor: 'pointer' }}
                >
                  {pending ? 'Sending...' : 'Send'}
                </button>
                <a href="mailto:contact@agiworkforce.com" className="agi-cta-ghost">
                  Or just email →
                </a>
              </div>
            </form>
          )}
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
