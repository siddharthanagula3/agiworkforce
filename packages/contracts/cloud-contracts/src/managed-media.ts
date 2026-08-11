/**
 * Canonical managed-cloud request contracts for image and video generation.
 *
 * Web owns the HTTP routes, while Desktop and future non-browser clients build
 * these snake_case payloads at their privileged network boundary. Presentation
 * ids (for example a surface-specific adapter, `large`, or `premium`) are not
 * wire values and must be normalized before validation/serialization.
 */

import { z } from 'zod';

export const MANAGED_MEDIA_IMAGE_PROVIDERS = ['google', 'openai', 'stability'] as const;
export const MANAGED_MEDIA_VIDEO_PROVIDERS = ['runway', 'google', 'openrouter'] as const;
export const MANAGED_MEDIA_IMAGE_SIZES = [
  '1024x1024',
  '1792x1024',
  '1024x1792',
  '512x512',
  '256x256',
  '768x768',
  '1536x1536',
] as const;
/**
 * Exact provider-native image aspect ratios accepted on the managed-media
 * wire. Provider/model adapters support subsets of this union and must reject
 * unsupported explicit tuples before reserving usage or contacting a provider.
 *
 * `size` remains on the contract for legacy Mobile/Desktop callers. New Web
 * callers use `aspect_ratio` so ratios such as 3:4 and 4:3 are never collapsed
 * into an approximately shaped legacy pixel size.
 */
export const MANAGED_MEDIA_IMAGE_ASPECT_RATIOS = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
  '9:21',
] as const;
export const MANAGED_MEDIA_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p', '4k'] as const;
export const MANAGED_MEDIA_VIDEO_ASPECT_RATIOS = [
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  '21:9',
] as const;

export const ManagedMediaImageProviderSchema = z.enum(MANAGED_MEDIA_IMAGE_PROVIDERS);
export const ManagedMediaVideoProviderSchema = z.enum(MANAGED_MEDIA_VIDEO_PROVIDERS);
export const ManagedMediaImageSizeSchema = z.enum(MANAGED_MEDIA_IMAGE_SIZES);
export const ManagedMediaImageAspectRatioSchema = z.enum(MANAGED_MEDIA_IMAGE_ASPECT_RATIOS);
export const ManagedMediaVideoResolutionSchema = z.enum(MANAGED_MEDIA_VIDEO_RESOLUTIONS);
export const ManagedMediaVideoAspectRatioSchema = z.enum(MANAGED_MEDIA_VIDEO_ASPECT_RATIOS);

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
    /** Optional Web chat owner for Library provenance; server verifies ownership. */
    conversation_id: z.string().uuid().optional(),
    provider: ManagedMediaImageProviderSchema.optional(),
    /** Canonical model-catalog id. Provider API ids are resolved server-side. */
    model: z.string().trim().min(1).max(200).optional(),
    /** Exact provider-native output shape. Omit for legacy `size` compatibility. */
    aspect_ratio: ManagedMediaImageAspectRatioSchema.optional(),
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
    /**
     * Four seconds is the cheapest duration accepted by the default Google
     * video route. Keep the broad 2–30 wire range because providers have
     * different provider-native contracts; the executing route must reject an
     * unsupported provider/model/resolution tuple before reservation rather
     * than silently rounding or charging for a longer video.
     */
    duration_secs: z.number().int().min(2).max(30).optional().default(4),
    resolution: ManagedMediaVideoResolutionSchema.optional().default('720p'),
    /** Exact provider-native output shape; the route validates it against the selected model. */
    aspect_ratio: ManagedMediaVideoAspectRatioSchema.optional(),
    /** Audio is admitted only when the selected catalog model publishes support. */
    generate_audio: z.boolean().optional(),
    provider: ManagedMediaVideoProviderSchema.optional(),
    /** Canonical model-catalog id. Provider API ids are resolved server-side. */
    model: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

/**
 * Server-authoritative admission state for one catalog media model.
 *
 * `enabled` means the deployment has the adapter, credential, durable storage,
 * and database schema required to accept a request. It deliberately does not
 * claim that a third-party provider is healthy; the rendered acceptance test
 * and the generation route still own live provider success/failure.
 */
export const ManagedMediaModelAdmissionStateSchema = z.enum([
  'enabled',
  'provider_not_configured',
  'storage_not_configured',
  'schema_not_configured',
  'adapter_not_supported',
]);

export const ManagedMediaModelAdmissionSchema = z
  .object({
    model_id: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(200),
    kind: z.enum(['image', 'video']),
    provider: z.string().trim().min(1).max(80),
    state: ManagedMediaModelAdmissionStateSchema,
  })
  .strict();

export const ManagedMediaModelAvailabilityResponseSchema = z
  .object({
    catalog_version: z.string().trim().min(1).max(80),
    image_storage_configured: z.boolean(),
    video_storage_configured: z.boolean(),
    image_schema_configured: z.boolean(),
    video_schema_configured: z.boolean(),
    checked_at: z.string().datetime(),
    models: z.array(ManagedMediaModelAdmissionSchema),
  })
  .strict();

export type ManagedMediaImageOperation = z.infer<typeof ManagedMediaImageOperationSchema>;
export type ManagedMediaImageRef = z.infer<typeof ManagedMediaImageRefSchema>;
export type ManagedMediaImageProvider = z.infer<typeof ManagedMediaImageProviderSchema>;
export type ManagedMediaVideoProvider = z.infer<typeof ManagedMediaVideoProviderSchema>;
export type ManagedMediaImageSize = z.infer<typeof ManagedMediaImageSizeSchema>;
export type ManagedMediaImageAspectRatio = z.infer<typeof ManagedMediaImageAspectRatioSchema>;
export type ManagedMediaVideoResolution = z.infer<typeof ManagedMediaVideoResolutionSchema>;
export type ManagedMediaVideoAspectRatio = z.infer<typeof ManagedMediaVideoAspectRatioSchema>;
export type ManagedMediaModelAdmissionState = z.infer<typeof ManagedMediaModelAdmissionStateSchema>;
export type ManagedMediaModelAdmission = z.infer<typeof ManagedMediaModelAdmissionSchema>;
export type ManagedMediaModelAvailabilityResponse = z.infer<
  typeof ManagedMediaModelAvailabilityResponseSchema
>;
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
