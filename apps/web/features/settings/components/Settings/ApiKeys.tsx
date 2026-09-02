import React, { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Checkbox,
  Input,
} from '@agiworkforce/ui';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@shared/ui/form';
import { Plus, Key, Copy, Trash2, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  createApiKeySchema,
  type CreateApiKeyFormData,
} from '@features/settings/schemas/settings-validation';
import {
  useAPIKeys,
  useCreateAPIKey,
  useDeleteAPIKey,
  type CreateAPIKeyResult,
} from '@features/settings/hooks/use-settings-queries';
import { API_KEY_SCOPE_OPTIONS, type ApiKeyScope } from '@/lib/api-key-scopes';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: ApiKeyScope[];
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
  isLoading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
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
  isLoading = false,
  loadError = null,
  onRetry,
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
            className="bg-green-700 text-white hover:bg-green-800"
            size="sm"
            disabled={Boolean(loadError)}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Key
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading API keys...
            </div>
          ) : loadError ? (
            <div className="space-y-3 py-6 text-center">
              <p role="alert" className="text-sm text-danger">
                {loadError}
              </p>
              {onRetry ? (
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              ) : null}
            </div>
          ) : apiKeys.length === 0 ? (
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
                    {apiKey.scopes
                      .map(
                        (scope) =>
                          API_KEY_SCOPE_OPTIONS.find((option) => option.value === scope)?.label ??
                          scope,
                      )
                      .join(' · ')}
                  </p>
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
                    onClick={() => onSetKeyToDelete(apiKey.id)}
                    aria-label={`Delete ${apiKey.name}`}
                    className="text-danger hover:text-danger"
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
                  <p className="text-warning-text">
                    <AlertTriangle className="mr-2 inline h-4 w-4" />
                    Save this key now. You will not be able to see it again!
                  </p>
                  <div className="break-all rounded border border-border bg-background/50 p-3 font-mono text-sm text-success-text">
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
                    <FormField
                      control={apiKeyForm.control}
                      name="scopes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-foreground">Scopes</FormLabel>
                          <FormDescription>
                            Choose only the public API capabilities this key needs.
                          </FormDescription>
                          <div className="space-y-3 rounded-md border border-border p-3">
                            {API_KEY_SCOPE_OPTIONS.map((option) => (
                              <label
                                key={option.value}
                                className="flex cursor-pointer items-start gap-3"
                              >
                                <Checkbox
                                  checked={field.value.includes(option.value)}
                                  onCheckedChange={(checked) => {
                                    field.onChange(
                                      checked === true
                                        ? [...field.value, option.value]
                                        : field.value.filter((scope) => scope !== option.value),
                                    );
                                  }}
                                />
                                <span>
                                  <span className="block text-sm font-medium text-foreground">
                                    {option.label}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    {option.description}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
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
                        className="bg-green-700 text-white hover:bg-green-800"
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
            <AlertDialogAction onClick={onDismissGeneratedKey}>Done</AlertDialogAction>
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

const DEFAULT_API_KEY_FORM: CreateApiKeyFormData = {
  name: '',
  scopes: ['models:read', 'inference:write'],
};

export function ApiKeysManager() {
  const { data: apiKeys = [], isLoading, isError, error, refetch } = useAPIKeys();
  const createMutation = useCreateAPIKey();
  const deleteMutation = useDeleteAPIKey();
  const apiKeyForm = useForm<CreateApiKeyFormData>({
    resolver: zodResolver(createApiKeySchema),
    mode: 'onChange',
    defaultValues: DEFAULT_API_KEY_FORM,
  });
  const [showAPIKeyDialog, setShowAPIKeyDialog] = useState(false);
  const [generatedAPIKey, setGeneratedAPIKey] = useState('');
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  const setDialogOpen = (open: boolean) => {
    setShowAPIKeyDialog(open);
    if (!open) {
      setGeneratedAPIKey('');
      apiKeyForm.reset(DEFAULT_API_KEY_FORM);
    }
  };

  const generateAPIKey = (data: CreateApiKeyFormData) => {
    createMutation.mutate(data, {
      onSuccess: (result: CreateAPIKeyResult) => {
        setGeneratedAPIKey(result.fullKey);
        apiKeyForm.reset(DEFAULT_API_KEY_FORM);
      },
    });
  };

  const deleteAPIKey = () => {
    if (!keyToDelete) return;
    deleteMutation.mutate(keyToDelete, {
      onSettled: () => setKeyToDelete(null),
    });
  };

  const copyAPIKey = (key: string) => {
    void navigator.clipboard
      .writeText(key)
      .then(() => toast.success('API key copied to clipboard'))
      .catch(() => toast.error('Could not copy the API key'));
  };

  return (
    <ApiKeysPanel
      apiKeys={apiKeys}
      apiKeyForm={apiKeyForm}
      showAPIKeyDialog={showAPIKeyDialog}
      generatedAPIKey={generatedAPIKey}
      keyToDelete={keyToDelete}
      isCreatePending={createMutation.isPending}
      isLoading={isLoading}
      loadError={isError ? (error?.message ?? 'Unable to load API keys.') : null}
      onRetry={() => void refetch()}
      onSetShowAPIKeyDialog={setDialogOpen}
      onSetKeyToDelete={setKeyToDelete}
      onGenerateAPIKey={generateAPIKey}
      onDeleteAPIKey={deleteAPIKey}
      onCopyAPIKey={copyAPIKey}
      onDismissGeneratedKey={() => setDialogOpen(false)}
    />
  );
}
