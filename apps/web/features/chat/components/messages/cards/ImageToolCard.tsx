'use client';

import { ManagedMediaImageAspectRatioSchema } from '@agiworkforce/cloud-contracts';
import type { ImageCardBody } from '@agiworkforce/types';
import { ImageGenerationCard } from '../../ImageGenerationCard';

export function ImageToolCard({ body }: { body: ImageCardBody }) {
  const aspectRatio = ManagedMediaImageAspectRatioSchema.safeParse(body.aspectRatio).data;
  return (
    <div className="my-2 flex flex-col gap-3">
      {body.images.map((image) => (
        <ImageGenerationCard
          key={image.assetId}
          imageUrl={image.url}
          isGenerating={false}
          prompt={body.prompt}
          {...(aspectRatio ? { aspectRatio } : {})}
          {...(body.model ? { modelId: body.model } : {})}
        />
      ))}
    </div>
  );
}
