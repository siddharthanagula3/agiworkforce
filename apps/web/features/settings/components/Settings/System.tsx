import React from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { Save, Loader2, Trash2, Bot } from 'lucide-react';
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
import { cn } from '@shared/lib/utils';
import { toast } from 'sonner';
import { useAgentMetricsStore } from '@shared/stores/agent-metrics-store';
import type { SystemSettingsFormData } from '@features/settings/schemas/settings-validation';

interface SystemPanelProps {
  systemForm: UseFormReturn<SystemSettingsFormData>;
  isSaving: boolean;
  isUpdatePending: boolean;
  onSaveSystem: (data: SystemSettingsFormData) => void;
}

export const SystemPanel: React.FC<SystemPanelProps> = ({
  systemForm,
  isSaving,
  isUpdatePending,
  onSaveSystem,
}) => {
  const metricsStore = useAgentMetricsStore();

  return (
    <Form {...systemForm}>
      <form onSubmit={systemForm.handleSubmit(onSaveSystem)} className="space-y-6">
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

              {(
                [
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
                ] as const
              ).map(({ key, label, desc }) => (
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
            <CardDescription>Manage background services and metrics tracking</CardDescription>
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
                <Badge variant={metricsStore.isBackgroundServiceRunning ? 'default' : 'outline'}>
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
                <p className="text-2xl font-bold text-blue-400">{metricsStore.activeAgents}</p>
              </div>
              <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3">
                <p className="text-xs text-muted-foreground">Completed Tasks</p>
                <p className="text-2xl font-bold text-green-400">{metricsStore.completedTasks}</p>
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
            {isUpdatePending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save System Settings
          </Button>
        </div>
      </form>
    </Form>
  );
};
