import React from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Switch } from '@shared/ui/switch';
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
import { Save, Loader2, Key, Eye, EyeOff } from 'lucide-react';
import type {
  SecuritySettingsFormData,
  ChangePasswordFormData,
} from '@features/settings/schemas/settings-validation';

interface TwoFactorPanelProps {
  securityForm: UseFormReturn<SecuritySettingsFormData>;
  passwordForm: UseFormReturn<ChangePasswordFormData>;
  isSaving: boolean;
  isToggle2FAPending: boolean;
  isUpdateSettingsPending: boolean;
  isChangePasswordPending: boolean;
  showNewPassword: boolean;
  showConfirmPassword: boolean;
  onSaveSecurity: (data: SecuritySettingsFormData) => void;
  onPasswordChange: (data: ChangePasswordFormData) => void;
  onToggle2FA: (enabled: boolean) => void;
  onToggleShowNewPassword: () => void;
  onToggleShowConfirmPassword: () => void;
}

export const TwoFactorPanel: React.FC<TwoFactorPanelProps> = ({
  securityForm,
  passwordForm,
  isSaving,
  isToggle2FAPending,
  isUpdateSettingsPending,
  isChangePasswordPending,
  showNewPassword,
  showConfirmPassword,
  onSaveSecurity,
  onPasswordChange,
  onToggle2FA,
  onToggleShowNewPassword,
  onToggleShowConfirmPassword,
}) => (
  <Card className="border-border bg-card">
    <CardHeader>
      <CardTitle className="text-foreground">Security Settings</CardTitle>
      <CardDescription>Manage your account security and authentication</CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <Form {...securityForm}>
        <form onSubmit={securityForm.handleSubmit(onSaveSecurity)} className="space-y-6">
          <FormField
            control={securityForm.control}
            name="two_factor_enabled"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border border-border/50 p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-foreground">Two-Factor Authentication</FormLabel>
                  <FormDescription>Add an extra layer of security</FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                      onToggle2FA(checked);
                    }}
                    disabled={isToggle2FAPending}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={securityForm.control}
            name="session_timeout"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-foreground">Session Timeout</FormLabel>
                <Select
                  value={field.value.toString()}
                  onValueChange={(value) => field.onChange(parseInt(value))}
                >
                  <FormControl>
                    <SelectTrigger className="border-border bg-background text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="border-border bg-popover">
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="240">4 hours</SelectItem>
                    <SelectItem value="1440">Never</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isSaving || !securityForm.formState.isDirty}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isUpdateSettingsPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Security Settings
            </Button>
          </div>
        </form>
      </Form>

      <div className="border-t border-border pt-6">
        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(onPasswordChange)} className="space-y-4">
            <h4 className="font-medium text-foreground">Change Password</h4>

            <FormField
              control={passwordForm.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm text-muted-foreground">New Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showNewPassword ? 'text' : 'password'}
                        className="border-border bg-background pr-10 text-foreground"
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        onClick={onToggleShowNewPassword}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </FormControl>
                  <FormDescription className="text-xs">
                    Min 8 characters with uppercase, lowercase, number, and special character
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={passwordForm.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm text-muted-foreground">Confirm Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showConfirmPassword ? 'text' : 'password'}
                        className="border-border bg-background pr-10 text-foreground"
                        placeholder="Confirm new password"
                      />
                      <button
                        type="button"
                        onClick={onToggleShowConfirmPassword}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={
                isChangePasswordPending ||
                !passwordForm.formState.isValid ||
                !passwordForm.formState.isDirty
              }
              variant="outline"
              className="w-full border-border"
            >
              {isChangePasswordPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Key className="mr-2 h-4 w-4" />
              )}
              Change Password
            </Button>
          </form>
        </Form>
      </div>
    </CardContent>
  </Card>
);
