import { z } from 'zod';

/**
 * The wire between a cloud turn that paused on a device step and the desktop
 * client that carries it out.
 *
 * The client posts back only what the step produced. It never says which tool
 * ran, which folder it touched, or whether it succeeded on its own terms: the
 * server already holds the paused call and matches the answer to it, so a
 * client cannot resume a call it was not handed.
 */

export const DEVICE_STEP_RESUME_PATH = '/api/llm/v1/chat/completions/resume-device';

export const MAX_DEVICE_STEP_OUTPUT_LENGTH = 24_000;

export const DeviceStepResultSchema = z.object({
  tool_call_id: z.string().min(1).max(128),
  content: z.string().max(MAX_DEVICE_STEP_OUTPUT_LENGTH),
  is_error: z.boolean(),
});
export type DeviceStepResultWire = z.infer<typeof DeviceStepResultSchema>;

export const DeviceStepResumeRequestSchema = z.object({
  run_id: z.string().uuid(),
  /**
   * Which device is answering. It must match the device the step was issued to,
   * so a second machine signed into the same account cannot answer a step it
   * never ran.
   */
  device_id: z.string().min(1).max(200),
  device_results: z.array(DeviceStepResultSchema).min(1).max(8),
});
export type DeviceStepResumeRequest = z.infer<typeof DeviceStepResumeRequestSchema>;

/**
 * What a surface that is NOT the device shows while a run waits: enough to name
 * the machine the user must go to, and nothing about what is on its disk.
 */
export const PendingDeviceStepSchema = z.object({
  requestedAt: z.string().min(1),
  deviceName: z.string().min(1).max(200),
  steps: z
    .array(
      z.object({
        toolCallId: z.string().min(1).max(128),
        summary: z.string().min(1).max(400),
      }),
    )
    .min(1)
    .max(8),
});
export type PendingDeviceStep = z.infer<typeof PendingDeviceStepSchema>;
