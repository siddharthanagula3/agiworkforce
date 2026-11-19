import { useEffect, useState } from 'react';
import {
  MANAGED_MEDIA_AVAILABILITY_PATH,
  ManagedMediaModelAvailabilityResponseSchema,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';

const NO_EDITING_MODELS: ReadonlySet<string> = new Set();

const admissionsByOwner = new Map<string, Promise<ReadonlySet<string>>>();

export async function fetchImageEditModelIds(): Promise<ReadonlySet<string>> {
  const parsed = ManagedMediaModelAvailabilityResponseSchema.safeParse(
    await api.get<unknown>(MANAGED_MEDIA_AVAILABILITY_PATH),
  );
  if (!parsed.success) {
    throw new Error('Media availability did not match the managed-media contract.');
  }
  return new Set(
    parsed.data.models
      .filter(
        (model) =>
          model.kind === 'image' && model.state === 'enabled' && model.supports_edit === true,
      )
      .map((model) => model.model_id),
  );
}

function imageEditModelIdsFor(ownerId: string): Promise<ReadonlySet<string>> {
  const cached = admissionsByOwner.get(ownerId);
  if (cached) return cached;
  const request = fetchImageEditModelIds();
  admissionsByOwner.set(ownerId, request);
  request.catch(() => {
    if (admissionsByOwner.get(ownerId) === request) admissionsByOwner.delete(ownerId);
  });
  return request;
}

export function useImageEditModelIds(ownerId: string | null): ReadonlySet<string> {
  const [loaded, setLoaded] = useState<{
    ownerId: string;
    modelIds: ReadonlySet<string>;
  } | null>(null);

  useEffect(() => {
    if (!ownerId) return;
    let current = true;
    imageEditModelIdsFor(ownerId).then(
      (modelIds) => {
        if (current) setLoaded({ ownerId, modelIds });
      },
      () => {
        if (current) setLoaded({ ownerId, modelIds: NO_EDITING_MODELS });
      },
    );
    return () => {
      current = false;
    };
  }, [ownerId]);

  return ownerId && loaded?.ownerId === ownerId ? loaded.modelIds : NO_EDITING_MODELS;
}
