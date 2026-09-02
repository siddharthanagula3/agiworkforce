'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { logger } from '@shared/lib/logger';
import { Button, ButtonRow, Prose, Section, Stack } from '@/features/marketing/components/system';

export default function FeaturesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Features page error boundary caught', {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <div data-design="agi" className="agi-ds-page">
      <Section id="features-error" size="lg">
        <Stack gap="loose">
          <h1 className="agi-ds-h2">Unable to load this page.</h1>
          <Prose>An unexpected error occurred while loading this page. Try again.</Prose>
          {error.digest ? <Prose size="sm">Error ID: {error.digest}</Prose> : null}
          <ButtonRow>
            <button type="button" onClick={reset} className="agi-ds-btn" data-variant="primary">
              Try again
            </button>
            <Button href="/" variant="secondary">
              Go home
            </Button>
          </ButtonRow>
          <Prose size="sm">
            If this problem persists,{' '}
            <Link href="/contact" className="agi-ds-link">
              contact support
            </Link>
            .
          </Prose>
        </Stack>
      </Section>
    </div>
  );
}
