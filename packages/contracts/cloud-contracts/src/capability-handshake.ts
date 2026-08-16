
import { z } from 'zod';
import { CAPABILITY_LAYERS } from '@agiworkforce/types';

export const CapabilityLayerSchema = z.enum(CAPABILITY_LAYERS);

export const EffectiveCapabilityDocumentSchema = z.object({
  sessionId: z.string().min(1),
  version: z.string().min(1),
  computedAt: z.string().min(1),
  sources: z.object({
    model: z.string(),
    tier: z.string(),
    surface: z.string(),
    settings: z.string(),
  }),
  granted: z.array(z.string()),
  deniedBy: z.record(z.string(), z.array(CapabilityLayerSchema)),
});

export type EffectiveCapabilityDocumentWire = z.infer<typeof EffectiveCapabilityDocumentSchema>;

export function parseEffectiveCapabilityDocument(data: unknown): EffectiveCapabilityDocumentWire {
  return EffectiveCapabilityDocumentSchema.parse(data);
}
