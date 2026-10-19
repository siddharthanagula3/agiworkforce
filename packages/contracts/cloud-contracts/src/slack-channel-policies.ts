import { z } from 'zod';

export const SLACK_CHANNEL_MODES = ['off', 'answer', 'task'] as const;

export const SlackChannelModeSchema = z.enum(SLACK_CHANNEL_MODES);
export type SlackChannelMode = z.infer<typeof SlackChannelModeSchema>;

export const SlackChannelIdSchema = z.string().regex(/^[A-Z0-9]{2,32}$/);

export const SlackChannelPolicySchema = z.object({
  channelId: SlackChannelIdSchema,
  mode: SlackChannelModeSchema.nullable(),
  seen: z.boolean(),
  updatedAt: z.string().nullable(),
});
export type SlackChannelPolicy = z.infer<typeof SlackChannelPolicySchema>;

export const SlackChannelPolicyListSchema = z.object({
  teamId: z.string(),
  channels: z.array(SlackChannelPolicySchema),
});
export type SlackChannelPolicyList = z.infer<typeof SlackChannelPolicyListSchema>;

export const SlackChannelPolicyUpdateSchema = z.object({
  channelId: SlackChannelIdSchema,
  mode: SlackChannelModeSchema.nullable(),
});
export type SlackChannelPolicyUpdate = z.infer<typeof SlackChannelPolicyUpdateSchema>;

export function slackChannelPoliciesPath(installationId: string): string {
  return `/api/slack/installations/${encodeURIComponent(installationId)}/channels`;
}
