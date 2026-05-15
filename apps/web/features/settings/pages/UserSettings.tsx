/**
 * Settings Page - Real Functional Implementation with Supabase
 * NO MOCK DATA - All data comes from and saves to Supabase
 * Uses React Query for server state management
 * Form validation powered by react-hook-form + Zod with XSS sanitization
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';
import { ErrorBoundary } from '@shared/components/ErrorBoundary';
import { Button } from '@shared/ui/button';
import { Switch } from '@shared/ui/switch';
import { Badge } from '@shared/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@shared/ui/form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card';
import { Input } from '@shared/ui/input';
import {
  Settings,
  User,
  Bell,
  Shield,
  Save,
  Trash2,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Bot,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@shared/lib/utils';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useAgentMetricsStore } from '@shared/stores/agent-metrics-store';
import {
  useAllSettingsData,
  useUpdateProfile,
  useUpdateSettings,
  useUploadAvatar,
  useChangePassword,
  useCreateAPIKey,
  useDeleteAPIKey,
  useToggle2FA,
  type CreateAPIKeyResult,
} from '@features/settings/hooks/use-settings-queries';
import type {} from '@features/settings/services/user-preferences';
import { Particles } from '@shared/ui/particles';
import {
  profileSettingsSchema,
  changePasswordSchema,
  notificationPreferencesSchema,
  securitySettingsSchema,
  systemSettingsSchema,
  createApiKeySchema,
  type ProfileSettingsFormData,
  type ChangePasswordFormData,
  type NotificationPreferencesFormData,
  type SecuritySettingsFormData,
  type SystemSettingsFormData,
  type CreateApiKeyFormData,
} from '@features/settings/schemas/settings-validation';
import { getCsrfToken } from '@/lib/client/csrf';
import { ProfilePanel } from '@features/settings/components/Settings/Profile';
import { TwoFactorPanel } from '@features/settings/components/Settings/TwoFactor';
import { ApiKeysPanel } from '@features/settings/components/Settings/ApiKeys';
import { ExportDataPanel } from '@features/settings/components/Settings/ExportData';

const SettingsPageContent: React.FC = () => {
  const params = useParams();
  const section = params?.['section'] as string | undefined;
  const router = useRouter();
  const { user } = useAuthStore();
  const metricsStore = useAgentMetricsStore();

  const {
    profile: serverProfile,
    settings: serverSettings,
    apiKeys,
    isLoading,
    isError,
    refetch,
  } = useAllSettingsData();

  const updateProfileMutation = useUpdateProfile();
  const updateSettingsMutation = useUpdateSettings();
  const uploadAvatarMutation = useUploadAvatar();
  const changePasswordMutation = useChangePassword();
  const createAPIKeyMutation = useCreateAPIKey();
  const deleteAPIKeyMutation = useDeleteAPIKey();
  const toggle2FAMutation = useToggle2FA();

  // ============================================================================
  // FORM INSTANCES WITH ZOD VALIDATION
  // ============================================================================

  const profileForm = useForm<ProfileSettingsFormData>({
    resolver: zodResolver(profileSettingsSchema) as Resolver<ProfileSettingsFormData>,
    defaultValues: {
      name: '',
      phone: '',
      timezone: 'America/New_York',
      language: 'en',
      bio: '',
      avatar_url: undefined,
    },
    mode: 'onBlur',
  });

  const passwordForm = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onBlur',
  });

  const notificationForm = useForm<NotificationPreferencesFormData>({
    resolver: zodResolver(notificationPreferencesSchema),
    defaultValues: {
      email_notifications: true,
      push_notifications: true,
      workflow_alerts: true,
      employee_updates: true,
      system_maintenance: true,
      marketing_emails: false,
      weekly_reports: true,
      instant_alerts: true,
    },
  });

  const securityForm = useForm<SecuritySettingsFormData>({
    resolver: zodResolver(securitySettingsSchema),
    defaultValues: {
      two_factor_enabled: false,
      session_timeout: 60,
    },
  });

  const systemForm = useForm<SystemSettingsFormData>({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: {
      theme: 'dark',
      auto_save: true,
      debug_mode: false,
      analytics_enabled: true,
      cache_size: '1GB',
      backup_frequency: 'daily',
      retention_period: 30,
      max_concurrent_jobs: 10,
    },
  });

  const apiKeyForm = useForm<CreateApiKeyFormData>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: {
      name: '',
    },
  });

  useEffect(() => {
    if (serverProfile) {
      profileForm.reset({
        name: serverProfile.name || '',
        phone: serverProfile.phone || '',
        timezone:
          (serverProfile.timezone as ProfileSettingsFormData['timezone']) || 'America/New_York',
        language: (serverProfile.language as ProfileSettingsFormData['language']) || 'en',
        bio: serverProfile.bio || '',
        avatar_url: serverProfile.avatar_url || undefined,
      });
    }
  }, [serverProfile, profileForm]);

  useEffect(() => {
    if (serverSettings) {
      notificationForm.reset({
        email_notifications: serverSettings.email_notifications ?? true,
        push_notifications: serverSettings.push_notifications ?? true,
        workflow_alerts: serverSettings.workflow_alerts ?? true,
        employee_updates: serverSettings.employee_updates ?? true,
        system_maintenance: serverSettings.system_maintenance ?? true,
        marketing_emails: serverSettings.marketing_emails ?? false,
        weekly_reports: serverSettings.weekly_reports ?? true,
        instant_alerts: serverSettings.instant_alerts ?? true,
      });

      securityForm.reset({
        two_factor_enabled: serverSettings.two_factor_enabled ?? false,
        session_timeout: serverSettings.session_timeout ?? 60,
      });

      systemForm.reset({
        theme: (serverSettings.theme as SystemSettingsFormData['theme']) ?? 'dark',
        auto_save: serverSettings.auto_save ?? true,
        debug_mode: serverSettings.debug_mode ?? false,
        analytics_enabled: serverSettings.analytics_enabled ?? true,
        cache_size: (serverSettings.cache_size as SystemSettingsFormData['cache_size']) ?? '1GB',
        backup_frequency:
          (serverSettings.backup_frequency as SystemSettingsFormData['backup_frequency']) ??
          'daily',
        retention_period: serverSettings.retention_period ?? 30,
        max_concurrent_jobs: serverSettings.max_concurrent_jobs ?? 10,
      });
    }
  }, [serverSettings, notificationForm, securityForm, systemForm]);

  const profile = serverProfile;
  const settings = serverSettings;
  const isSaving =
    updateProfileMutation.isPending ||
    updateSettingsMutation.isPending ||
    uploadAvatarMutation.isPending ||
    changePasswordMutation.isPending ||
    createAPIKeyMutation.isPending ||
    deleteAPIKeyMutation.isPending ||
    toggle2FAMutation.isPending;

  const [activeSection, setActiveSection] = useState(section || 'profile');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showAPIKeyDialog, setShowAPIKeyDialog] = useState(false);
  const [generatedAPIKey, setGeneratedAPIKey] = useState('');
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const handleExportData = useCallback(async () => {
    setIsExporting(true);
    try {
      const res = await fetch('/api/user/export?download=true', {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Data exported successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export data');
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    setIsDeleting(true);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/user/data', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
      });
      if (!res.ok) throw new Error(`Deletion failed: ${res.statusText}`);
      toast.success('Account data deleted. You will be signed out.');
      setShowDeleteAccount(false);
      setDeleteConfirmText('');
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete account data');
    } finally {
      setIsDeleting(false);
    }
  }, []);

  useEffect(() => {
    if (section && section !== activeSection) {
      setActiveSection(section);
    }
  }, [section, activeSection]);

  // ============================================================================
  // FORM SUBMIT HANDLERS
  // ============================================================================

  const handleSaveProfile = useCallback(
    (data: ProfileSettingsFormData) => {
      updateProfileMutation.mutate({
        name: data.name,
        phone: data.phone,
        timezone: data.timezone,
        language: data.language,
        bio: data.bio,
        avatar_url: data.avatar_url,
      });
    },
    [updateProfileMutation],
  );

  const handleAvatarUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      uploadAvatarMutation.mutate(file, {
        onSuccess: (url) => {
          profileForm.setValue('avatar_url', url, { shouldDirty: true });
        },
      });
    },
    [uploadAvatarMutation, profileForm],
  );

  const handlePasswordChange = useCallback(
    (data: ChangePasswordFormData) => {
      changePasswordMutation.mutate(
        { newPassword: data.newPassword, confirmPassword: data.confirmPassword },
        {
          onSuccess: () => {
            passwordForm.reset();
          },
        },
      );
    },
    [changePasswordMutation, passwordForm],
  );

  const handleSaveNotifications = useCallback(
    (data: NotificationPreferencesFormData) => {
      updateSettingsMutation.mutate(data);
    },
    [updateSettingsMutation],
  );

  const handleSaveSecurity = useCallback(
    (data: SecuritySettingsFormData) => {
      updateSettingsMutation.mutate(data);
    },
    [updateSettingsMutation],
  );

  const handleSaveSystem = useCallback(
    (data: SystemSettingsFormData) => {
      updateSettingsMutation.mutate(data);
    },
    [updateSettingsMutation],
  );

  const handleGenerateAPIKey = useCallback(
    (data: CreateApiKeyFormData) => {
      createAPIKeyMutation.mutate(data.name, {
        onSuccess: (result: CreateAPIKeyResult) => {
          setGeneratedAPIKey(result.fullKey);
          apiKeyForm.reset();
        },
      });
    },
    [createAPIKeyMutation, apiKeyForm],
  );

  const handleDeleteAPIKey = useCallback(() => {
    if (!keyToDelete) return;
    deleteAPIKeyMutation.mutate(keyToDelete, {
      onSettled: () => {
        setKeyToDelete(null);
      },
    });
  }, [keyToDelete, deleteAPIKeyMutation]);

  const handleCopyAPIKey = useCallback((key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('API key copied to clipboard');
  }, []);

  const handleToggle2FA = useCallback(
    (enabled: boolean) => {
      toggle2FAMutation.mutate(enabled, {
        onSuccess: () => {
          securityForm.setValue('two_factor_enabled', enabled);
        },
      });
    },
    [toggle2FAMutation, securityForm],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span className="text-muted-foreground">Loading settings...</span>
        </div>
      </div>
    );
  }

  if (isError && !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-yellow-500" />
          <p className="mb-4 text-muted-foreground">Failed to load settings</p>
          <Button onClick={() => refetch()} variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen space-y-4 p-4 md:space-y-6 md:p-6">
      <Particles
        className="pointer-events-none absolute inset-0 opacity-20"
        quantity={30}
        ease={80}
        staticity={50}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Manage your account, preferences, and system configuration
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-green-500/50 text-green-400">
          <CheckCircle className="mr-1 h-3 w-3" />
          <span className="hidden sm:inline">Real Data</span>
          <span className="sm:hidden">Live</span>
        </Badge>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative"
      >
        <Tabs
          value={activeSection}
          onValueChange={(value) => {
            setActiveSection(value);
            router.replace(`/settings/${value}`);
          }}
          className="space-y-6"
        >
          <TabsList className="grid grid-cols-2 border border-border/50 bg-card/50 p-1 shadow-lg backdrop-blur-xl md:grid-cols-5">
            <TabsTrigger
              value="profile"
              className="text-xs transition-all duration-300 hover:bg-accent/40 data-[state=active]:bg-accent/80 data-[state=active]:backdrop-blur-sm md:text-sm"
            >
              <User className="h-4 w-4 md:mr-2" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="text-xs transition-all duration-300 hover:bg-accent/40 data-[state=active]:bg-accent/80 data-[state=active]:backdrop-blur-sm md:text-sm"
            >
              <Bell className="h-4 w-4 md:mr-2" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="text-xs transition-all duration-300 hover:bg-accent/40 data-[state=active]:bg-accent/80 data-[state=active]:backdrop-blur-sm md:text-sm"
            >
              <Shield className="h-4 w-4 md:mr-2" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
            <TabsTrigger
              value="system"
              className="text-xs transition-all duration-300 hover:bg-accent/40 data-[state=active]:bg-accent/80 data-[state=active]:backdrop-blur-sm md:text-sm"
            >
              <Settings className="h-4 w-4 md:mr-2" />
              <span className="hidden sm:inline">System</span>
            </TabsTrigger>
            <TabsTrigger
              value="account"
              className="text-xs transition-all duration-300 hover:bg-accent/40 data-[state=active]:bg-accent/80 data-[state=active]:backdrop-blur-sm md:text-sm"
            >
              <UserX className="h-4 w-4 md:mr-2" />
              <span className="hidden sm:inline">Account</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile Settings */}
          <TabsContent value="profile" className="space-y-6">
            <ProfilePanel
              profileForm={profileForm}
              userEmail={user?.email || ''}
              isSaving={isSaving}
              isUploadPending={uploadAvatarMutation.isPending}
              isUpdatePending={updateProfileMutation.isPending}
              onSaveProfile={handleSaveProfile}
              onAvatarUpload={handleAvatarUpload}
              profile={profile}
            />
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications" className="space-y-6">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Notification Preferences</CardTitle>
                <CardDescription>
                  Choose how and when you want to receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...notificationForm}>
                  <form
                    onSubmit={notificationForm.handleSubmit(handleSaveNotifications)}
                    className="space-y-6"
                  >
                    <div className="space-y-4">
                      {[
                        {
                          key: 'email_notifications' as const,
                          label: 'Email Notifications',
                          desc: 'Receive notifications via email',
                        },
                        {
                          key: 'push_notifications' as const,
                          label: 'Push Notifications',
                          desc: 'Browser push notifications',
                        },
                        {
                          key: 'workflow_alerts' as const,
                          label: 'Workflow Alerts',
                          desc: 'Alerts when workflows complete or fail',
                        },
                        {
                          key: 'employee_updates' as const,
                          label: 'Employee Updates',
                          desc: 'Updates about AI employee performance',
                        },
                        {
                          key: 'system_maintenance' as const,
                          label: 'System Maintenance',
                          desc: 'Scheduled maintenance notifications',
                        },
                        {
                          key: 'marketing_emails' as const,
                          label: 'Marketing Emails',
                          desc: 'Product updates and offers',
                        },
                        {
                          key: 'weekly_reports' as const,
                          label: 'Weekly Reports',
                          desc: 'Weekly performance summaries',
                        },
                        {
                          key: 'instant_alerts' as const,
                          label: 'Instant Alerts',
                          desc: 'Real-time critical alerts',
                        },
                      ].map(({ key, label, desc }) => (
                        <FormField
                          key={key}
                          control={notificationForm.control}
                          name={key}
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-foreground">{label}</FormLabel>
                                <FormDescription>{desc}</FormDescription>
                              </div>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        {notificationForm.formState.isDirty && (
                          <span className="text-yellow-500">You have unsaved changes</span>
                        )}
                      </div>
                      <Button
                        type="submit"
                        disabled={isSaving || !notificationForm.formState.isDirty}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {updateSettingsMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Save Preferences
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <TwoFactorPanel
                securityForm={securityForm}
                passwordForm={passwordForm}
                isSaving={isSaving}
                isToggle2FAPending={toggle2FAMutation.isPending}
                isUpdateSettingsPending={updateSettingsMutation.isPending}
                isChangePasswordPending={changePasswordMutation.isPending}
                showNewPassword={showNewPassword}
                showConfirmPassword={showConfirmPassword}
                onSaveSecurity={handleSaveSecurity}
                onPasswordChange={handlePasswordChange}
                onToggle2FA={handleToggle2FA}
                onToggleShowNewPassword={() => setShowNewPassword((p) => !p)}
                onToggleShowConfirmPassword={() => setShowConfirmPassword((p) => !p)}
              />

              <ApiKeysPanel
                apiKeys={apiKeys}
                apiKeyForm={apiKeyForm}
                showAPIKeyDialog={showAPIKeyDialog}
                generatedAPIKey={generatedAPIKey}
                keyToDelete={keyToDelete}
                isCreatePending={createAPIKeyMutation.isPending}
                onSetShowAPIKeyDialog={setShowAPIKeyDialog}
                onSetKeyToDelete={setKeyToDelete}
                onGenerateAPIKey={handleGenerateAPIKey}
                onDeleteAPIKey={handleDeleteAPIKey}
                onCopyAPIKey={handleCopyAPIKey}
                onDismissGeneratedKey={() => {
                  setShowAPIKeyDialog(false);
                  setGeneratedAPIKey('');
                  apiKeyForm.reset();
                }}
              />
            </div>
          </TabsContent>

          {/* System Settings */}
          <TabsContent value="system" className="space-y-6">
            <Form {...systemForm}>
              <form onSubmit={systemForm.handleSubmit(handleSaveSystem)} className="space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-foreground">General Settings</CardTitle>
                      <CardDescription>Configure system behavior and preferences</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <FormField
                        control={systemForm.control}
                        name="theme"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">Theme</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger className="border-border bg-background text-foreground">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="border-border bg-popover">
                                <SelectItem value="dark">Dark</SelectItem>
                                <SelectItem value="light">Light</SelectItem>
                                <SelectItem value="auto">Auto</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {[
                        {
                          key: 'auto_save' as const,
                          label: 'Auto Save',
                          desc: 'Automatically save changes',
                        },
                        {
                          key: 'debug_mode' as const,
                          label: 'Debug Mode',
                          desc: 'Show detailed error information',
                        },
                        {
                          key: 'analytics_enabled' as const,
                          label: 'Analytics',
                          desc: 'Enable usage analytics',
                        },
                      ].map(({ key, label, desc }) => (
                        <FormField
                          key={key}
                          control={systemForm.control}
                          name={key}
                          render={({ field }) => (
                            <FormItem className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-foreground">{label}</FormLabel>
                                <FormDescription>{desc}</FormDescription>
                              </div>
                              <FormControl>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-foreground">Advanced Settings</CardTitle>
                      <CardDescription>Advanced configuration options</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <FormField
                        control={systemForm.control}
                        name="cache_size"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">Cache Size</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger className="border-border bg-background text-foreground">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="border-border bg-popover">
                                <SelectItem value="256MB">256 MB</SelectItem>
                                <SelectItem value="512MB">512 MB</SelectItem>
                                <SelectItem value="1GB">1 GB</SelectItem>
                                <SelectItem value="2GB">2 GB</SelectItem>
                                <SelectItem value="4GB">4 GB</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={systemForm.control}
                        name="backup_frequency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">Backup Frequency</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger className="border-border bg-background text-foreground">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="border-border bg-popover">
                                <SelectItem value="hourly">Hourly</SelectItem>
                                <SelectItem value="daily">Daily</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={systemForm.control}
                        name="retention_period"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">Data Retention (days)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                                className="border-border bg-background text-foreground"
                                min={1}
                                max={365}
                              />
                            </FormControl>
                            <FormDescription>Between 1 and 365 days</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={systemForm.control}
                        name="max_concurrent_jobs"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">Max Concurrent Jobs</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 10)}
                                className="border-border bg-background text-foreground"
                                min={1}
                                max={100}
                              />
                            </FormControl>
                            <FormDescription>Between 1 and 100 jobs</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-foreground">
                      <Bot className="h-5 w-5 text-primary" />
                      Agent &amp; Metrics
                    </CardTitle>
                    <CardDescription>
                      Manage background services and metrics tracking
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="rounded-lg border border-border/50 bg-accent/20 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'h-2 w-2 rounded-full',
                              metricsStore.isBackgroundServiceRunning
                                ? 'animate-pulse bg-green-500'
                                : 'bg-gray-500',
                            )}
                          />
                          <span className="font-medium">Background Service</span>
                        </div>
                        <Badge
                          variant={metricsStore.isBackgroundServiceRunning ? 'default' : 'outline'}
                        >
                          {metricsStore.isBackgroundServiceRunning ? 'Running' : 'Stopped'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Enables agents to continue working when you navigate away
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                        <p className="text-xs text-muted-foreground">Active Agents</p>
                        <p className="text-2xl font-bold text-blue-400">
                          {metricsStore.activeAgents}
                        </p>
                      </div>
                      <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3">
                        <p className="text-xs text-muted-foreground">Completed Tasks</p>
                        <p className="text-2xl font-bold text-green-400">
                          {metricsStore.completedTasks}
                        </p>
                      </div>
                      <div className="rounded-lg border border-purple-500/20 bg-purple-500/10 p-3">
                        <p className="text-xs text-muted-foreground">Total Tokens</p>
                        <p className="text-2xl font-bold text-purple-400">
                          {metricsStore.totalTokensUsed.toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-3">
                        <p className="text-xs text-muted-foreground">Success Rate</p>
                        <p className="text-2xl font-bold text-orange-400">
                          {metricsStore.getSuccessRate().toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          metricsStore.reset();
                          toast.success('Metrics reset successfully');
                        }}
                        className="flex-1"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Reset Metrics
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {systemForm.formState.isDirty && (
                      <span className="text-yellow-500">You have unsaved changes</span>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={isSaving || !systemForm.formState.isDirty}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {updateSettingsMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save System Settings
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          {/* Account / GDPR Settings */}
          <TabsContent value="account" className="space-y-6">
            <ExportDataPanel
              isExporting={isExporting}
              showDeleteAccount={showDeleteAccount}
              isDeleting={isDeleting}
              deleteConfirmText={deleteConfirmText}
              onExportData={handleExportData}
              onSetShowDeleteAccount={setShowDeleteAccount}
              onSetDeleteConfirmText={setDeleteConfirmText}
              onDeleteAccount={handleDeleteAccount}
            />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
};

const SettingsPageWithErrorBoundary: React.FC = () => (
  <ErrorBoundary componentName="SettingsPage" showReportDialog>
    <SettingsPageContent />
  </ErrorBoundary>
);

export default SettingsPageWithErrorBoundary;
