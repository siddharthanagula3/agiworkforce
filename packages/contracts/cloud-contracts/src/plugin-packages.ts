import { z } from 'zod';

import type { PluginScanFindingSummary } from './plugin-marketplaces';

export const ORGANIZATION_PLUGINS_ADMIN_PATH = '/api/settings/organization/plugins';
export const MEMBER_ORGANIZATION_PLUGINS_PATH = '/api/plugins/organization';
export const PLUGIN_SUBMISSIONS_PATH = '/api/plugins/submissions';
export const ADMIN_PLUGIN_SUBMISSIONS_PATH = '/api/admin/plugin-submissions';
export const COMMUNITY_PLUGINS_PATH = '/api/plugins/community';

export const ORGANIZATION_PLUGIN_STATUSES = ['published', 'retired'] as const;
export type OrganizationPluginStatus = (typeof ORGANIZATION_PLUGIN_STATUSES)[number];

export const ORGANIZATION_PLUGIN_INSTALL_PREFERENCES = [
  'required',
  'installed_by_default',
  'available',
  'not_available',
] as const;
export type OrganizationPluginInstallPreference =
  (typeof ORGANIZATION_PLUGIN_INSTALL_PREFERENCES)[number];

export type PublishedPluginScanVerdict = 'pass' | 'review';

export interface OrganizationPluginGroupSetting {
  groupId: string;
  installPreference: OrganizationPluginInstallPreference;
}

export interface OrganizationPluginGroup {
  id: string;
  name: string;
}

export interface OrganizationPluginSummary {
  id: string;
  pluginKey: string;
  name: string;
  description: string;
  version: string;
  skills: string[];
  scanVerdict: PublishedPluginScanVerdict;
  scanFindings: PluginScanFindingSummary[];
  status: OrganizationPluginStatus;
  installPreference: OrganizationPluginInstallPreference;
  groupSettings: OrganizationPluginGroupSetting[];
  publishedAt: string;
  updatedAt: string;
}

export interface OrganizationPluginsAdminResponse {
  organizationId: string;
  canManage: boolean;
  plugins: OrganizationPluginSummary[];
  groups: OrganizationPluginGroup[];
}

export interface OrganizationPluginsPublishResponse {
  plugins: OrganizationPluginSummary[];
  omittedFiles?: string[];
}

const InstallPreferenceSchema = z.enum(ORGANIZATION_PLUGIN_INSTALL_PREFERENCES);

export const OrganizationPluginPatchSchema = z
  .object({
    pluginId: z.string().uuid(),
    status: z.enum(ORGANIZATION_PLUGIN_STATUSES).optional(),
    installPreference: InstallPreferenceSchema.optional(),
    groupSettings: z
      .array(
        z
          .object({ groupId: z.string().uuid(), installPreference: InstallPreferenceSchema })
          .strict(),
      )
      .max(200)
      .optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.status !== undefined ||
      body.installPreference !== undefined ||
      body.groupSettings !== undefined,
    { message: 'Say what to change: status, installPreference or groupSettings.' },
  );

export type OrganizationPluginPatch = z.infer<typeof OrganizationPluginPatchSchema>;

export type MemberOrganizationPluginPreference = Exclude<
  OrganizationPluginInstallPreference,
  'not_available'
>;

export interface MemberOrganizationPlugin {
  id: string;
  pluginKey: string;
  name: string;
  description: string;
  version: string;
  skills: string[];
  updatedAt: string;
  installPreference: MemberOrganizationPluginPreference;
  installed: boolean;
  enabled: boolean;
  enabledSkills: string[] | null;
}

export interface MemberOrganizationPluginsResponse {
  organizationId: string | null;
  organizationName: string | null;
  plugins: MemberOrganizationPlugin[];
}

const EnabledSkillsSchema = z.array(z.string().trim().min(1).max(200)).max(200).nullable();

export const MemberOrganizationPluginPatchSchema = z
  .object({
    installed: z.boolean().optional(),
    enabled: z.boolean().optional(),
    enabledSkills: EnabledSkillsSchema.optional(),
  })
  .strict();

export type MemberOrganizationPluginPatch = z.infer<typeof MemberOrganizationPluginPatchSchema>;

export const PLUGIN_SUBMISSION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'withdrawn',
  'suspended',
] as const;
export type PluginSubmissionStatus = (typeof PLUGIN_SUBMISSION_STATUSES)[number];

export interface PluginSubmissionSummary {
  id: string;
  entryId: string | null;
  pluginKey: string;
  name: string;
  description: string;
  version: string;
  category: string | null;
  publisherName: string;
  skills: string[];
  status: PluginSubmissionStatus;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  scanVerdict: PublishedPluginScanVerdict;
  scanFindings: PluginScanFindingSummary[];
}

export interface PluginSubmissionsResponse {
  submissions: PluginSubmissionSummary[];
}

export const PluginSubmissionCreateSchema = z
  .object({
    entryId: z.string().uuid(),
    category: z.string().trim().min(1).max(100).optional(),
    publisherName: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export interface PluginSubmissionResponse {
  submission: PluginSubmissionSummary;
}

export interface PluginSubmissionFile {
  path: string;
  content: string;
}

export interface PluginSubmissionReview extends PluginSubmissionSummary {
  submitterId: string;
  files: PluginSubmissionFile[];
}

export const PLUGIN_SUBMISSION_REVIEW_STATUS_PARAM = 'status';

export interface PluginSubmissionReviewListResponse {
  submissions: Array<PluginSubmissionSummary & { submitterId: string }>;
}

export interface PluginSubmissionReviewResponse {
  submission: PluginSubmissionReview;
}

export const PluginSubmissionDecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }).strict(),
  z.object({ action: z.literal('reject'), note: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal('suspend'), note: z.string().trim().min(1).max(2000) }).strict(),
]);

export type PluginSubmissionDecision = z.infer<typeof PluginSubmissionDecisionSchema>;

export interface CommunityPlugin {
  id: string;
  pluginKey: string;
  name: string;
  description: string;
  version: string;
  category: string | null;
  publisherName: string;
  skills: string[];
  approvedAt: string | null;
  scanVerdict: PublishedPluginScanVerdict;
  scanFindings: PluginScanFindingSummary[];
  installed: boolean;
  enabled: boolean;
  enabledSkills: string[] | null;
}

export interface CommunityPluginsResponse {
  plugins: CommunityPlugin[];
}

export const CommunityPluginPatchSchema = z
  .object({
    installed: z.boolean().optional(),
    enabled: z.boolean().optional(),
    enabledSkills: EnabledSkillsSchema.optional(),
  })
  .strict();

export type CommunityPluginPatch = z.infer<typeof CommunityPluginPatchSchema>;
