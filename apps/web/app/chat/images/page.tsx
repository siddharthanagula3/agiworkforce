'use client';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { ImageStudio } from '@features/images/components/ImageStudio';

export default function ImagesPage() {
  return (
    <WebAppShell>
      <section
        data-design="agi"
        className="min-h-full bg-background px-gutter-compact py-8 text-foreground sm:px-gutter-regular sm:py-12 lg:px-gutter-wide"
      >
        <ImageStudio />
      </section>
    </WebAppShell>
  );
}
