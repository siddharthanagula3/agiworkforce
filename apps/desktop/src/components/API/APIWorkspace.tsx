import { FileJson, Globe, History, Key, Plus, Save, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useApiStore, type ApiRequest } from '../../stores/apiStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';

interface APIWorkspaceProps {
  className?: string;
}

const METHOD_OPTIONS: ApiRequest['method'][] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

export function APIWorkspace({ className }: APIWorkspaceProps) {
  const {
    currentRequest,
    response,
    loading,
    error,
    savedRequests,
    history,
    executeRequest,
    get,
    post,
    setCurrentRequest,
    saveRequest,
    loadRequest,
    deleteRequest,
    clearError,
  } = useApiStore();

  const [requestName, setRequestName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const [authType, setAuthType] = useState<'none' | 'bearer' | 'basic' | 'apikey'>('none');
  const [authToken, setAuthToken] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authKey, setAuthKey] = useState('');
  const [authValue, setAuthValue] = useState('');
  const [authPlacement, setAuthPlacement] = useState<'header' | 'query'>('header');

  // Update headers when auth changes
  useEffect(() => {
    const newHeaders = { ...currentRequest.headers };

    // Clear existing auth headers
    delete newHeaders['Authorization'];
    if (authKey) delete newHeaders[authKey];

    if (authType === 'bearer' && authToken) {
      newHeaders['Authorization'] = `Bearer ${authToken}`;
    } else if (authType === 'basic' && (authUsername || authPassword)) {
      const basic = btoa(`${authUsername}:${authPassword}`);
      newHeaders['Authorization'] = `Basic ${basic}`;
    } else if (authType === 'apikey' && authKey && authValue && authPlacement === 'header') {
      newHeaders[authKey] = authValue;
    }

    setCurrentRequest({ headers: newHeaders });
  }, [authType, authToken, authUsername, authPassword, authKey, authValue, authPlacement]);

  const handleMethodChange = (method: ApiRequest['method']) => {
    setCurrentRequest({ method });
  };

  const handleUrlChange = (url: string) => {
    setCurrentRequest({ url });
  };

  const handleBodyChange = (body: string) => {
    setCurrentRequest({ body });
  };

  const handleAddHeader = () => {
    if (!headerKey.trim() || !headerValue.trim()) {
      toast.error('Please enter both key and value');
      return;
    }

    setCurrentRequest({
      headers: {
        ...currentRequest.headers,
        [headerKey]: headerValue,
      },
    });

    setHeaderKey('');
    setHeaderValue('');
    toast.success('Header added');
  };

  const handleRemoveHeader = (key: string) => {
    const { [key]: _, ...rest } = currentRequest.headers || {};
    setCurrentRequest({ headers: rest });
    toast.success('Header removed');
  };

  const handleExecuteRequest = async () => {
    if (!currentRequest.url.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    try {
      await executeRequest(currentRequest);
      toast.success(`${currentRequest.method} request completed`);
    } catch (error) {
      toast.error(`Request failed: ${error}`);
    }
  };

  const handleQuickGet = async () => {
    if (!currentRequest.url.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    try {
      await get(currentRequest.url);
      toast.success('GET request completed');
    } catch (error) {
      toast.error(`Request failed: ${error}`);
    }
  };

  const handleQuickPost = async () => {
    if (!currentRequest.url.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    try {
      await post(currentRequest.url, currentRequest.body || '{}');
      toast.success('POST request completed');
    } catch (error) {
      toast.error(`Request failed: ${error}`);
    }
  };

  const handleSaveRequest = () => {
    if (!requestName.trim()) {
      toast.error('Please enter a name');
      return;
    }

    saveRequest(requestName, currentRequest);
    setRequestName('');
    setShowSaveDialog(false);
    toast.success('Request saved');
  };

  const handleLoadRequest = (id: string) => {
    loadRequest(id);
    toast.success('Request loaded');
  };

  const handleDeleteRequest = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    deleteRequest(id);
    toast.success('Request deleted');
  };

  const formatStatusColor = (status: number): string => {
    if (status >= 200 && status < 300) return 'text-green-500';
    if (status >= 300 && status < 400) return 'text-blue-500';
    if (status >= 400 && status < 500) return 'text-yellow-500';
    return 'text-red-500';
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/10">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">API Client</span>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(!showSaveDialog)}>
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>
        </div>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="px-3 py-2 border-b border-border bg-muted/5 flex gap-2">
          <Input
            value={requestName}
            onChange={(e) => setRequestName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveRequest()}
            placeholder="Request name..."
            className="flex-1"
          />
          <Button onClick={handleSaveRequest}>Save</Button>
          <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Request Builder */}
      <div className="flex flex-col gap-2 px-3 py-2 border-b border-border">
        {/* Method and URL */}
        <div className="flex gap-2">
          <select
            value={currentRequest.method}
            onChange={(e) => {
              const selected = METHOD_OPTIONS.find((option) => option === e.target.value);
              if (selected) {
                handleMethodChange(selected);
              }
            }}
            className="px-3 py-2 border border-border rounded-md bg-background w-28"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
            <option value="HEAD">HEAD</option>
            <option value="OPTIONS">OPTIONS</option>
          </select>

          <Input
            value={currentRequest.url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://api.example.com/endpoint"
            className="flex-1 font-mono text-sm"
          />

          <Button onClick={handleExecuteRequest} disabled={loading}>
            <Send className="h-4 w-4 mr-1" />
            Send
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleQuickGet} disabled={loading}>
            Quick GET
          </Button>
          <Button variant="outline" size="sm" onClick={handleQuickPost} disabled={loading}>
            Quick POST
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Request Config */}
        <div className="w-1/2 border-r border-border flex flex-col">
          <Tabs defaultValue="body" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="px-3">
              <TabsTrigger value="body">
                <FileJson className="h-3 w-3 mr-1" />
                Body
              </TabsTrigger>
              <TabsTrigger value="headers">
                <Key className="h-3 w-3 mr-1" />
                Headers
              </TabsTrigger>
              <TabsTrigger value="auth">
                <Key className="h-3 w-3 mr-1" />
                Auth
              </TabsTrigger>
              <TabsTrigger value="saved">
                <Save className="h-3 w-3 mr-1" />
                Saved
              </TabsTrigger>
            </TabsList>

            <TabsContent value="body" className="flex-1 overflow-auto p-3">
              <textarea
                value={currentRequest.body || ''}
                onChange={(e) => handleBodyChange(e.target.value)}
                placeholder='{"key": "value"}'
                className="w-full h-full p-3 border border-border rounded-md font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </TabsContent>

            <TabsContent value="headers" className="flex-1 overflow-auto p-3 space-y-3">
              {/* Add Header */}
              <div className="flex gap-2">
                <Input
                  value={headerKey}
                  onChange={(e) => setHeaderKey(e.target.value)}
                  placeholder="Key"
                  className="flex-1"
                />
                <Input
                  value={headerValue}
                  onChange={(e) => setHeaderValue(e.target.value)}
                  placeholder="Value"
                  className="flex-1"
                />
                <Button onClick={handleAddHeader}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Headers List */}
              <div className="space-y-1">
                {Object.entries(currentRequest.headers || {}).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-2 border border-border rounded-md"
                  >
                    <div className="flex-1 font-mono text-sm">
                      <span className="text-primary">{key}:</span> {value}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveHeader(key)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="auth" className="flex-1 overflow-auto p-3 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Auth Type</label>
                <select
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                >
                  <option value="none">No Auth</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="basic">Basic Auth</option>
                  <option value="apikey">API Key</option>
                </select>
              </div>

              {authType === 'bearer' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Token</label>
                  <Input
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder="Bearer token"
                    type="password"
                  />
                </div>
              )}

              {authType === 'basic' && (
                <div className="space-y-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Username</label>
                    <Input
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      placeholder="Username"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Password</label>
                    <Input
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Password"
                      type="password"
                    />
                  </div>
                </div>
              )}

              {authType === 'apikey' && (
                <div className="space-y-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Key</label>
                    <Input
                      value={authKey}
                      onChange={(e) => setAuthKey(e.target.value)}
                      placeholder="Key (e.g. X-API-Key)"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Value</label>
                    <Input
                      value={authValue}
                      onChange={(e) => setAuthValue(e.target.value)}
                      placeholder="Value"
                      type="password"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Add To</label>
                    <select
                      value={authPlacement}
                      onChange={(e) => setAuthPlacement(e.target.value as any)}
                      className="w-full px-3 py-2 border border-border rounded-md bg-background"
                    >
                      <option value="header">Header</option>
                      <option value="query">Query Params</option>
                    </select>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="saved" className="flex-1 overflow-auto p-3">
              {savedRequests.length > 0 ? (
                <div className="space-y-1">
                  {savedRequests.map((saved) => (
                    <div
                      key={saved.id}
                      onClick={() => handleLoadRequest(saved.id)}
                      className="flex items-center justify-between p-2 border border-border rounded-md hover:bg-muted/50 cursor-pointer group"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm">{saved.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {saved.request.method} {saved.request.url}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleDeleteRequest(saved.id, e)}
                        className="opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">No saved requests</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel - Response */}
        <div className="w-1/2 flex flex-col">
          <Tabs defaultValue="response" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="px-3">
              <TabsTrigger value="response">Response</TabsTrigger>
              <TabsTrigger value="headers">Headers</TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-3 w-3 mr-1" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="response" className="flex-1 overflow-auto">
              {response ? (
                <div className="flex flex-col h-full">
                  {/* Response Metadata */}
                  <div className="px-3 py-2 border-b border-border bg-muted/5 flex items-center gap-4">
                    <span className={cn('font-medium', formatStatusColor(response.status))}>
                      Status: {response.status}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Time: {formatDuration(response.duration_ms)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Size: {new Blob([response.body]).size} bytes
                    </span>
                  </div>

                  {/* Response Body */}
                  <div className="flex-1 overflow-auto p-3">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {JSON.stringify(JSON.parse(response.body || '{}'), null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">No response yet</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="headers" className="flex-1 overflow-auto p-3">
              {response ? (
                <div className="space-y-1">
                  {Object.entries(response.headers || {}).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-2 border border-border rounded-md"
                    >
                      <div className="flex-1 font-mono text-sm">
                        <span className="text-primary">{key}:</span> {value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">No response yet</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="flex-1 overflow-auto p-3">
              {history.length > 0 ? (
                <div className="space-y-2">
                  {history
                    .slice()
                    .reverse()
                    .map((item, i) => (
                      <div key={i} className="p-3 border border-border rounded-md group">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'font-medium text-sm',
                                formatStatusColor(item.response.status),
                              )}
                            >
                              {item.response.status}
                            </span>
                            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                              {item.request.method}
                            </span>
                            <span
                              className="text-xs text-muted-foreground truncate max-w-[200px]"
                              title={item.request.url}
                            >
                              {item.request.url}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {formatDuration(item.response.duration_ms)}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                              onClick={() => {
                                setCurrentRequest(item.request);
                                toast.success('Request loaded from history');
                              }}
                              title="Load request"
                            >
                              <Send className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <pre className="text-xs font-mono whitespace-pre-wrap line-clamp-3 text-muted-foreground">
                          {item.response.body}
                        </pre>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">No history yet</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
