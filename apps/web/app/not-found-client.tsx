'use client';

import { Button, ButtonRow } from '@/features/marketing/components/system';
import { useHomeHref } from '@/features/desktop-host/hooks/use-home-href';

export function NotFoundActions() {
  const homeHref = useHomeHref();

  return (
    <ButtonRow>
      <Button href={homeHref}>Go to the home page</Button>
      <Button href="/contact" variant="secondary">
        Contact us
      </Button>
    </ButtonRow>
  );
}
