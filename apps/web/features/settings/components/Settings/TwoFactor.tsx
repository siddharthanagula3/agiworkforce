import React from 'react';
import { type UseFormReturn } from 'react-hook-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Spinner,
} from '@agiworkforce/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@agiworkforce/ui';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@shared/ui/Form';
import { Save, Key, Eye, EyeOff } from 'lucide-react';
import type {
  SecuritySettingsFormData,
  ChangePasswordFormData,
} from '@features/settings/schemas/settings-validation';

interface TwoFactorPanelProps {
  securityForm: UseFormReturn<SecuritySettingsFormData>;
  isSaving: boolean;
  isUpdateSettingsPending: boolean;
  onSaveSecurity: (data: SecuritySettingsFormData) => void;
  passwordPanel: React.ReactNode;
}

export const TwoFactorPanel: React.FC<TwoFactorPanelProps> = ({
  securityForm,
  isSaving,
  isUpdateSettingsPending,
  onSaveSecurity,
  passwordPanel,
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
                    <SelectItem value="1440">24 hours</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={isSaving || !securityForm.formState.isDirty}>
              {isUpdateSettingsPending ? (
                <Spinner size="sm" className="me-2" aria-hidden="true" />
              ) : (
                <Save className="me-2 h-4 w-4" />
              )}
              Save Security Settings
            </Button>
          </div>
        </form>
      </Form>

      {passwordPanel}
    </CardContent>
  </Card>
);

interface PasswordPanelProps {
  passwordForm: UseFormReturn<ChangePasswordFormData>;
  isChangePasswordPending: boolean;
  blocked: boolean;
  hasPassword: boolean;
  showNewPassword: boolean;
  showConfirmPassword: boolean;
  error: string | null;
  notice: string | null;
  onPasswordSubmit: React.FormEventHandler<HTMLFormElement>;
  onReset: () => void;
  onAcknowledge: () => void;
  onToggleShowNewPassword: () => void;
  onToggleShowConfirmPassword: () => void;
}

export function PasswordPanel({
  passwordForm,
  isChangePasswordPending,
  blocked,
  hasPassword,
  showNewPassword,
  showConfirmPassword,
  error,
  notice,
  onPasswordSubmit,
  onReset,
  onAcknowledge,
  onToggleShowNewPassword,
  onToggleShowConfirmPassword,
}: PasswordPanelProps) {
  const { isValid, isDirty } = passwordForm.formState;

  return (
    <div className="border-t border-border pt-6">
      <Form {...passwordForm}>
        <form onSubmit={onPasswordSubmit} className="space-y-4">
          <h4 className="font-medium text-foreground">
            {hasPassword ? 'Change Password' : 'Set a password'}
          </h4>

          {hasPassword ? (
            <FormField
              control={passwordForm.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm text-muted-foreground">Current Password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={isChangePasswordPending || blocked}
                      type="password"
                      autoComplete="current-password"
                      className="border-border bg-background text-foreground"
                      placeholder="Enter current password"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              Your account signs in without a password. You confirm it is you before one is set.
            </p>
          )}

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
                      disabled={isChangePasswordPending || blocked}
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="border-border bg-background pe-10 text-foreground"
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      disabled={isChangePasswordPending || blocked}
                      onClick={onToggleShowNewPassword}
                      aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                      aria-pressed={showNewPassword}
                      className="absolute end-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground pointer-coarse:end-0 pointer-coarse:h-11 pointer-coarse:w-11"
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
                      disabled={isChangePasswordPending || blocked}
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="border-border bg-background pe-10 text-foreground"
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      disabled={isChangePasswordPending || blocked}
                      onClick={onToggleShowConfirmPassword}
                      aria-label={
                        showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'
                      }
                      aria-pressed={showConfirmPassword}
                      className="absolute end-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground pointer-coarse:end-0 pointer-coarse:h-11 pointer-coarse:w-11"
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

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={blocked || isChangePasswordPending || !isValid || !isDirty}
            variant="outline"
            className="w-full border-border"
          >
            {isChangePasswordPending ? (
              <Spinner size="sm" className="me-2" aria-hidden="true" />
            ) : (
              <Key className="me-2 h-4 w-4" />
            )}
            {hasPassword ? 'Change Password' : 'Set password'}
          </Button>
          {blocked ? (
            <Button type="button" variant="outline" onClick={onAcknowledge}>
              I checked my sign-in and sessions
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onReset}>
            {isChangePasswordPending ? 'Cancel waiting' : 'Clear password form'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
