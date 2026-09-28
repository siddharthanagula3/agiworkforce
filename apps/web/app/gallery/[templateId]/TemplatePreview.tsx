'use client';

import { ArtifactPreview } from '@/features/chat/components/artifacts/ArtifactPreview';
import type { InspirationCard } from '../inspiration';

export function TemplatePreview({ template }: { template: InspirationCard }) {
  return (
    <ArtifactPreview
      artifact={{
        id: template.id,
        type: template.type,
        language: template.language,
        title: template.title,
        content: template.content,
      }}
    />
  );
}
