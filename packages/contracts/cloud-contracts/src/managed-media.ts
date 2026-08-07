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

/**
 * What an image request is DOING to the source image.
 *
 * Every "edit" in the product was previously a fresh text-to-image call built
 * from a modified prompt — the original pixels were never sent anywhere. That
 * is why inpainting, outpainting, background removal, and variations were all
 * absent despite the UI implying them: there was no field on the wire capable
 * of carrying a source image, let alone a mask.
 *
 *  - `generate`     text -> image (the only mode that existed)
 *  - `edit`         whole-image edit guided by the prompt (image-to-image)
 *  - `inpaint`      edit ONLY inside the mask's opaque area
 *  - `outpaint`     extend beyond the source bounds; mask marks the new area
 *  - `variation`    re-roll the source without a prompt-driven change
 */
export const MANAGED_MEDIA_IMAGE_OPERATIONS = [
  'generate',
  'edit',
  'inpaint',
  'outpaint',
  'variation',
] as const;
export const ManagedMediaImageOperationSchema = z.enum(MANAGED_MEDIA_IMAGE_OPERATIONS);

/**
 * A source or mask image. `asset_id` is an owner-scoped `media_assets` row the
 * server re-reads under the caller's identity; `b64_json` is raw bytes for a
 * client-side selection that was never uploaded.
 *
 * Deliberately NOT a URL: accepting an arbitrary URL here would make this
 * endpoint fetch attacker-supplied hosts on the server's behalf (SSRF), and the
 * only legitimate remote images are ones this account already owns — which
 * `asset_id` addresses safely.
 */
export const ManagedMediaImageRefSchema = z.union([
  z.object({ asset_id: z.string().uuid() }).strict(),
  z.object({ b64_json: z.string().min(1).max(12_000_000) }).strict(),
]);

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
    operation: ManagedMediaImageOperationSchema.optional().default('generate'),
    /** Required for every operation except `generate`. */
    source_image: ManagedMediaImageRefSchema.optional(),
    /**
     * Opaque where the model may paint. Only meaningful for `inpaint` and
     * `outpaint`; sending it for another operation is rejected rather than
     * silently ignored, so a caller never believes a mask was applied.
     */
    mask_image: ManagedMediaImageRefSchema.optional(),
    /** Request a transparent background where the provider supports it. */
    transparent_background: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    const needsSource = value.operation !== undefined && value.operation !== 'generate';
    if (needsSource && !value.source_image) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['source_image'],
        message: `source_image is required for operation "${value.operation}"`,
      });
    }
    if (value.source_image && (value.operation ?? 'generate') === 'generate') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operation'],
        message: 'source_image was provided but operation is "generate"; pick an edit operation',
      });
    }
    const maskAllowed = value.operation === 'inpaint' || value.operation === 'outpaint';
    if (value.mask_image && !maskAllowed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mask_image'],
        message: 'mask_image is only valid for operation "inpaint" or "outpaint"',
      });
    }
    if (value.operation === 'inpaint' && !value.mask_image) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mask_image'],
        message: 'mask_image is required for operation "inpaint"',
      });
    }
  });

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

export type ManagedMediaImageOperation = z.infer<typeof ManagedMediaImageOperationSchema>;
export type ManagedMediaImageRef = z.infer<typeof ManagedMediaImageRefSchema>;
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
