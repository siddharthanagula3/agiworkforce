/**
 * Canonical managed-cloud request contracts for image and video generation.
 *
 * Web owns the HTTP routes, while Desktop and future non-browser clients build
 * these snake_case payloads at their privileged network boundary. Presentation
 * ids (for example Desktop's `google_imagen`, `large`, or `premium`) are not
 * wire values and must be normalized before validation/serialization.
 */

import { z } from 'zod';

export const MANAGED_MEDIA_IMAGE_PROVIDERS = ['google', 'openai', 'stability'] as const;
export const MANAGED_MEDIA_VIDEO_PROVIDERS = ['runway', 'google'] as const;
export const MANAGED_MEDIA_IMAGE_SIZES = [
  '1024x1024',
  '1792x1024',
  '1024x1792',
  '512x512',
  '256x256',
  '768x768',
  '1536x1536',
] as const;
export const MANAGED_MEDIA_VIDEO_RESOLUTIONS = ['720p', '1080p', '4k'] as const;

export const ManagedMediaImageProviderSchema = z.enum(MANAGED_MEDIA_IMAGE_PROVIDERS);
export const ManagedMediaVideoProviderSchema = z.enum(MANAGED_MEDIA_VIDEO_PROVIDERS);
export const ManagedMediaImageSizeSchema = z.enum(MANAGED_MEDIA_IMAGE_SIZES);
export const ManagedMediaVideoResolutionSchema = z.enum(MANAGED_MEDIA_VIDEO_RESOLUTIONS);

export const ManagedMediaImageGenerationRequestSchema = z
  .object({
    prompt: z.string().min(1).max(4000),
    provider: ManagedMediaImageProviderSchema.optional(),
    /** Canonical model-catalog id. Provider API ids are resolved server-side. */
    model: z.string().trim().min(1).max(200).optional(),
    size: ManagedMediaImageSizeSchema.optional().default('1024x1024'),
    /** Free-form visual direction; provider adapters may map supported presets. */
    style: z.string().trim().min(1).max(200).optional(),
    n: z.number().int().min(1).max(4).optional().default(1),
    quality: z.enum(['standard', 'hd']).optional().default('standard'),
    negative_prompt: z.string().max(2000).optional(),
  })
  .strict();

export const ManagedMediaVideoGenerationRequestSchema = z
  .object({
    prompt: z.string().min(1).max(2000),
    duration_secs: z.number().int().min(2).max(10).optional().default(5),
    resolution: ManagedMediaVideoResolutionSchema.optional().default('720p'),
    provider: ManagedMediaVideoProviderSchema.optional(),
    /** Canonical model-catalog id. Provider API ids are resolved server-side. */
    model: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type ManagedMediaImageProvider = z.infer<typeof ManagedMediaImageProviderSchema>;
export type ManagedMediaVideoProvider = z.infer<typeof ManagedMediaVideoProviderSchema>;
export type ManagedMediaImageSize = z.infer<typeof ManagedMediaImageSizeSchema>;
export type ManagedMediaVideoResolution = z.infer<typeof ManagedMediaVideoResolutionSchema>;
export type ManagedMediaImageGenerationRequest = z.input<
  typeof ManagedMediaImageGenerationRequestSchema
>;
export type ManagedMediaVideoGenerationRequest = z.input<
  typeof ManagedMediaVideoGenerationRequestSchema
>;
export type ValidatedManagedMediaImageGenerationRequest = z.output<
  typeof ManagedMediaImageGenerationRequestSchema
>;
export type ValidatedManagedMediaVideoGenerationRequest = z.output<
  typeof ManagedMediaVideoGenerationRequestSchema
>;
