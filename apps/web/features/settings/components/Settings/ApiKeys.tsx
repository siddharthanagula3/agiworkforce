import React from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@shared/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@shared/ui/form';
import { Plus, Key, Copy, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import type { CreateApiKeyFormData } from '@features/settings/schemas/settings-validation';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at?: string | null;
}

interface ApiKeysPanelProps {
  apiKeys: ApiKey[];
  apiKeyForm: UseFormReturn<CreateApiKeyFormData>;
  showAPIKeyDialog: boolean;
  generatedAPIKey: string;
  keyToDelete: string | null;
  isCreatePending: boolean;
  onSetShowAPIKeyDialog: (open: boolean) => void;
  onSetKeyToDelete: (id: string | null) => void;
  onGenerateAPIKey: (data: CreateApiKeyFormData) => void;
  onDeleteAPIKey: () => void;
  onCopyAPIKey: (key: string) => void;
  onDismissGeneratedKey: () => void;
}

export const ApiKeysPanel: React.FC<ApiKeysPanelProps> = ({
  apiKeys,
  apiKeyForm,
  showAPIKeyDialog,
  generatedAPIKey,
  keyToDelete,
  isCreatePending,
  onSetShowAPIKeyDialog,
  onSetKeyToDelete,
  onGenerateAPIKey,
  onDeleteAPIKey,
  onCopyAPIKey,
  onDismissGeneratedKey,
}) => (
  <>
    <Card className="border-border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-foreground">API Keys</CardTitle>
            <CardDescription>Manage API keys for external integrations</CardDescription>
          </div>
          <Button
            onClick={() => onSetShowAPIKeyDialog(true)}
            className="bg-green-600 hover:bg-green-700"
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Key
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {apiKeys.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Key className="mx-auto mb-2 h-12 w-12 opacity-50" />
              <p>No API keys yet</p>
              <p className="text-sm">Generate your first API key to get started</p>
            </div>
          ) : (
            apiKeys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="flex items-center justify-between rounded-lg border border-border bg-accent/50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{apiKey.name}</p>
                  <p className="font-mono text-sm text-muted-foreground">{apiKey.key_prefix}...</p>
                  <p className="text-xs text-muted-foreground">
                    Created: {new Date(apiKey.created_at).toLocaleDateString()}
                    {apiKey.last_used_at &&
                      ` - Last used: ${new Date(apiKey.last_used_at).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => onCopyAPIKey(apiKey.key_prefix)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSetKeyToDelete(apiKey.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>

    {/* API Key Generation Dialog */}
    <AlertDialog open={showAPIKeyDialog} onOpenChange={onSetShowAPIKeyDialog}>
      <AlertDialogContent className="border-border bg-popover">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">
            {generatedAPIKey ? 'API Key Generated' : 'Generate New API Key'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-muted-foreground">
              {generatedAPIKey ? (
                <div className="space-y-4">
                  <p className="text-yellow-400">
                    <AlertTriangle className="mr-2 inline h-4 w-4" />
                    Save this key now. You will not be able to see it again!
                  </p>
                  <div className="break-all rounded border border-border bg-background/50 p-3 font-mono text-sm text-green-400">
                    {generatedAPIKey}
                  </div>
                  <Button onClick={() => onCopyAPIKey(generatedAPIKey)} className="w-full">
                    <Copy className="mr-2 h-4 w-4" />
                    Copy to Clipboard
                  </Button>
                </div>
              ) : (
                <Form {...apiKeyForm}>
                  <form
                    onSubmit={apiKeyForm.handleSubmit(onGenerateAPIKey)}
                    className="space-y-4 pt-4"
                  >
                    <FormField
                      control={apiKeyForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Key Name</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="e.g., Production API"
                              className="border-border bg-background text-foreground"
                            />
                          </FormControl>
                          <FormDescription>
                            A descriptive name to identify this API key
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          onSetShowAPIKeyDialog(false);
                          apiKeyForm.reset();
                        }}
                        className="border-border bg-secondary text-foreground hover:bg-secondary/80"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={isCreatePending || !apiKeyForm.formState.isValid}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {isCreatePending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Key className="mr-2 h-4 w-4" />
                        )}
                        Generate Key
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {generatedAPIKey && (
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={onDismissGeneratedKey}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Done
            </AlertDialogAction>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>

    {/* Delete API Key Confirmation */}
    <AlertDialog open={!!keyToDelete} onOpenChange={() => onSetKeyToDelete(null)}>
      <AlertDialogContent className="border-border bg-popover">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Delete API Key</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            Are you sure you want to delete this API key? This action cannot be undone. Any
            applications using this key will stop working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-border bg-secondary text-foreground hover:bg-secondary/80">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onDeleteAPIKey} className="bg-red-600 hover:bg-red-700">
            Delete Key
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
