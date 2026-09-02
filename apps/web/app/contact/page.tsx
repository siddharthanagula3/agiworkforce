'use client';

import { useState } from 'react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { Prose, Section, Stack } from '@/features/marketing/components/system';

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
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-contact-title"
          eyebrow="Contact"
          title="One inbox, one human."
          lede={
            <>
              Everything below is plain email. No hosted form, no ticket system. For sales
              conversations, head to contact sales. For everything else, contact@agiworkforce.com
              reaches a person who reads it.
            </>
          }
          ctas={[
            {
              href: 'mailto:contact@agiworkforce.com',
              label: 'Email contact@agiworkforce.com',
              variant: 'primary',
            },
            { href: '/contact-sales', label: 'Contact sales', variant: 'secondary' },
          ]}
        />

        <Section id="composer" labelledBy="agi-contact-composer-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-contact-composer-title">
                Draft it here, send it from your mail app.
              </h2>
              <Prose>
                This composer is a convenience, not a form: the button opens a pre-filled draft in
                your own email app, addressed to contact@agiworkforce.com. Nothing you type here is
                sent or stored by this site.
              </Prose>
            </div>

            {draftOpened ? (
              <div className="agi-ds-card p-6" role="status" aria-live="polite">
                <Stack gap="tight">
                  <h3 className="agi-ds-h3">Email draft opened.</h3>
                  <Prose size="sm">
                    The message sends from your mail app, not from this page. If no draft appeared,
                    email contact@agiworkforce.com directly.
                  </Prose>
                </Stack>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="agi-ds-form">
                <div className="agi-ds-field">
                  <label htmlFor="contact-name" className="agi-ds-field-label">
                    Name
                  </label>
                  <input
                    required
                    id="contact-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    className="agi-ds-input"
                  />
                </div>
                <div className="agi-ds-field">
                  <label htmlFor="contact-email" className="agi-ds-field-label">
                    Email
                  </label>
                  <input
                    required
                    id="contact-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    className="agi-ds-input"
                  />
                </div>
                <div className="agi-ds-field">
                  <label htmlFor="contact-subject" className="agi-ds-field-label">
                    Subject
                  </label>
                  <input
                    required
                    id="contact-subject"
                    name="subject"
                    type="text"
                    autoComplete="off"
                    className="agi-ds-input"
                  />
                </div>
                <div className="agi-ds-field">
                  <label htmlFor="contact-message" className="agi-ds-field-label">
                    Message
                  </label>
                  <textarea
                    required
                    id="contact-message"
                    name="message"
                    autoComplete="off"
                    rows={6}
                    className="agi-ds-input"
                  />
                </div>
                {error && (
                  <p role="alert" className="agi-ds-form-error">
                    {error}
                  </p>
                )}
                <div className="agi-ds-btn-row">
                  <button
                    type="submit"
                    disabled={pending}
                    className="agi-ds-btn"
                    data-variant="primary"
                  >
                    {pending ? 'Opening…' : 'Open email draft'}
                  </button>
                  <a
                    href="mailto:contact@agiworkforce.com"
                    className="agi-ds-btn"
                    data-variant="secondary"
                  >
                    Or just email us
                  </a>
                </div>
              </form>
            )}
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
