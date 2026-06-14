'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--agi-ink-quiet)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const FIELD_INPUT_STYLE: React.CSSProperties = {
  background: 'var(--agi-bg-2)',
  border: '1px solid var(--agi-rule)',
  color: 'var(--agi-ink)',
  padding: '10px 14px',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'inherit',
};

export default function ContactPage() {
  const [draftOpened, setDraftOpened] = useState(false);
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
      setDraftOpened(true);
      form.reset();
    } catch {
      setError('Could not open your mail app. Email contact@agiworkforce.com directly.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-contact-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Contact</p>
          <h1 id="agi-contact-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">One inbox,</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">one human.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Everything below is plain email. No hosted form, no ticket system. For sales
            conversations, head to <Link href="/contact-sales">contact sales</Link>. For everything
            else, contact@agiworkforce.com reaches a person who reads it.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <div className="agi-fl-cta-row">
              <a href="mailto:contact@agiworkforce.com" className="agi-fl-cta agi-fl-cta--primary">
                Email contact@agiworkforce.com
              </a>
              <Link href="/contact-sales" className="agi-fl-cta agi-fl-cta--ghost">
                Contact Sales
              </Link>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-contact-composer-title">
          <p className="agi-fl-eyebrow">Email composer</p>
          <h2 id="agi-contact-composer-title" className="agi-fl-h2">
            Draft it here, send it from your mail app.
          </h2>
          <p className="agi-fl-section-lede">
            This composer is a convenience, not a form: the button opens a pre-filled draft in your
            own email app, addressed to contact@agiworkforce.com. Nothing you type here is sent or
            stored by this site.
          </p>

          {draftOpened ? (
            <div className="agi-callout" role="status" aria-live="polite" style={{ marginTop: 40 }}>
              <h3 className="agi-callout-h">Email draft opened.</h3>
              <p className="agi-callout-p">
                The message sends from your mail app, not from this page. If no draft appeared,
                email contact@agiworkforce.com directly.
              </p>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              style={{
                marginTop: 40,
                maxWidth: 560,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={FIELD_LABEL_STYLE}>Name</span>
                <input
                  required
                  name="name"
                  type="text"
                  autoComplete="name"
                  style={FIELD_INPUT_STYLE}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={FIELD_LABEL_STYLE}>Email</span>
                <input
                  required
                  name="email"
                  type="email"
                  autoComplete="email"
                  style={FIELD_INPUT_STYLE}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={FIELD_LABEL_STYLE}>Subject</span>
                <input
                  required
                  name="subject"
                  type="text"
                  autoComplete="off"
                  style={FIELD_INPUT_STYLE}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={FIELD_LABEL_STYLE}>Message</span>
                <textarea
                  required
                  name="message"
                  autoComplete="off"
                  rows={6}
                  style={{ ...FIELD_INPUT_STYLE, resize: 'vertical' }}
                />
              </label>
              {error && (
                <p role="alert" style={{ color: 'var(--agi-error)', fontSize: 13, margin: 0 }}>
                  {error}
                </p>
              )}
              <div className="agi-fl-cta-row" style={{ marginTop: 8 }}>
                <button type="submit" disabled={pending} className="agi-fl-cta agi-fl-cta--primary">
                  {pending ? 'Opening…' : 'Open Email Draft'}
                </button>
                <a href="mailto:contact@agiworkforce.com" className="agi-fl-cta agi-fl-cta--ghost">
                  Or Just Email Us
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
