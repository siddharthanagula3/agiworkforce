import React from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Label } from '@shared/ui/label';
import { Textarea } from '@shared/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@shared/ui/avatar';
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
import { Camera, Save, Loader2 } from 'lucide-react';
import { InteractiveHoverCard } from '@shared/ui/interactive-hover-card';
import type { ProfileSettingsFormData } from '@features/settings/schemas/settings-validation';

interface ProfilePanelProps {
  profileForm: UseFormReturn<ProfileSettingsFormData>;
  userEmail: string;
  isSaving: boolean;
  isUploadPending: boolean;
  isUpdatePending: boolean;
  onSaveProfile: (data: ProfileSettingsFormData) => void;
  onAvatarUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  profile: unknown;
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({
  profileForm,
  userEmail,
  isSaving,
  isUploadPending,
  isUpdatePending,
  onSaveProfile,
  onAvatarUpload,
  profile,
}) => {
  if (!profile) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading profile...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">Profile Information</CardTitle>
        <CardDescription>Update your personal information and preferences</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...profileForm}>
          <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-6">
            <div className="flex items-center space-x-4">
              <InteractiveHoverCard>
                <Avatar className="h-20 w-20 ring-2 ring-primary/20 transition-all duration-300 hover:ring-primary/40">
                  {}
                  {}
                  <AvatarImage src={profileForm.watch('avatar_url')} />
                  <AvatarFallback className="bg-accent text-lg text-foreground">
                    {profileForm
                      .watch('name')
                      ?.split(' ')
                      .map((n) => n[0])
                      .join('') || 'U'}
                  </AvatarFallback>
                </Avatar>
              </InteractiveHoverCard>
              <div className="space-y-2">
                <input
                  type="file"
                  id="avatar-upload"
                  accept="image/*"
                  className="hidden"
                  onChange={onAvatarUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="border-border text-foreground transition-transform duration-200 hover:scale-105 hover:text-foreground"
                  onClick={() => document.getElementById('avatar-upload')?.click()}
                  disabled={isUploadPending}
                >
                  {isUploadPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="mr-2 h-4 w-4" />
                  )}
                  Change Photo
                </Button>
                <p className="text-xs text-muted-foreground">JPG, PNG up to 5MB</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <FormField
                control={profileForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Full Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="border-border bg-background text-foreground"
                        placeholder="Enter your full name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <Label className="text-foreground">Email Address</Label>
                <Input
                  type="email"
                  value={userEmail}
                  disabled
                  className="mt-2 cursor-not-allowed border-border bg-muted text-muted-foreground"
                />
                <p className="mt-1 text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              <FormField
                control={profileForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ''}
                        className="border-border bg-background text-foreground"
                        placeholder="+1 (555) 000-0000"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={profileForm.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Timezone</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="border-border bg-background text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="border-border bg-popover">
                        <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                        <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                        <SelectItem value="Europe/London">GMT</SelectItem>
                        <SelectItem value="Europe/Paris">CET</SelectItem>
                        <SelectItem value="Asia/Tokyo">JST</SelectItem>
                        <SelectItem value="Asia/Shanghai">CST</SelectItem>
                        <SelectItem value="Australia/Sydney">AEST</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={profileForm.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Language</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="border-border bg-background text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="border-border bg-popover">
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Espanol</SelectItem>
                        <SelectItem value="fr">Francais</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                        <SelectItem value="zh">Chinese</SelectItem>
                        <SelectItem value="ja">Japanese</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={profileForm.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Bio</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value || ''}
                      className="border-border bg-background text-foreground"
                      rows={3}
                      placeholder="Tell us about yourself..."
                    />
                  </FormControl>
                  <FormDescription>{field.value?.length || 0}/500 characters</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {profileForm.formState.isDirty && (
                  <span className="text-yellow-500">You have unsaved changes</span>
                )}
              </div>
              <Button
                type="submit"
                disabled={
                  isSaving || !profileForm.formState.isDirty || !profileForm.formState.isValid
                }
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isUpdatePending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Profile
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
