import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Inbox,
  Mail,
  Plus,
  RefreshCcw,
  Send,
  Trash2,
  Check,
  Circle,
  Search,
} from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/Dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { ScrollArea } from '../ui/ScrollArea';
import { Badge } from '../ui/Badge';
import { Separator } from '../ui/Separator';
import { useEmailStore, type ConnectAccountPayload, type SendEmailPayload } from '../../stores/emailStore';
import type { EmailAddress, EmailMessage, EmailFilter, Contact, EmailProviderConfig } from '../../types/email';

const PROVIDER_OPTIONS = [
  { value: 'gmail', label: 'Gmail' },
  { value: 'outlook', label: 'Outlook' },
  { value: 'yahoo', label: 'Yahoo Mail' },
  { value: 'custom', label: 'Custom (IMAP/SMTP)' },
];

interface EmailWorkspaceProps {
  className?: string;
}

const DEFAULT_CUSTOM_CONFIG: EmailProviderConfig = {
  name: 'Custom',
  imap_host: '',
  imap_port: 993,
  imap_use_tls: true,
  smtp_host: '',
  smtp_port: 587,
  smtp_use_tls: true,
};

type ComposeDraft = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body_text: string;
};

export function EmailWorkspace({ className }: EmailWorkspaceProps) {
  const {
    accounts,
    selectedAccountId,
    folders,
    selectedFolder,
    emails,
    selectedEmail,
    loading,
    error,
    filter,
    contacts,
    refreshAccounts,
    connectAccount,
    removeAccount,
    selectAccount,
    refreshFolders,
    refreshEmails,
    selectEmail,
    markRead,
    deleteEmail,
    sendEmail,
    setFilter,
    clearError,
    refreshContacts,
  } = useEmailStore();

  const [connectOpen, setConnectOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [provider, setProvider] = useState<string>('gmail');
  const [customConfig, setCustomConfig] = useState<EmailProviderConfig>(DEFAULT_CUSTOM_CONFIG);
  const [credentials, setCredentials] = useState({ email: '', password: '', display_name: '' });
  const [composeDraft, setComposeDraft] = useState<ComposeDraft>({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body_text: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [tabValue, setTabValue] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    refreshAccounts();
    refreshContacts();
  }, [refreshAccounts, refreshContacts]);

  useEffect(() => {
    if (error) {
      console.error('[email]', error);
    }
  }, [error]);

  const currentAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  const filteredEmails = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) {
      return emails;
    }
    return emails.filter((message) => {
      const haystack = [
        message.subject,
        message.from.email,
        message.from.name ?? '',
        message.body_text ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [emails, searchQuery]);

  const handleConnect = async () => {
    const payload: ConnectAccountPayload = {
      provider,
      email: credentials.email.trim(),
      password: credentials.password,
      display_name: credentials.display_name.trim() || undefined,
    };

    if (!payload.email || !payload.password) {
      toastError('Email and password are required');
      return;
    }

    if (provider === 'custom') {
      if (!customConfig.imap_host || !customConfig.smtp_host) {
        toastError('Custom provider requires IMAP and SMTP hostnames');
        return;
      }
      payload.custom_config = customConfig;
    }

    try {
      await connectAccount(payload);
      setConnectOpen(false);
      setCredentials({ email: '', password: '', display_name: '' });
      setCustomConfig(DEFAULT_CUSTOM_CONFIG);
    } catch {
      // Errors handled in store
    }
  };

  const handleSendEmail = async () => {
    if (!selectedAccountId) {
      toastError('Select an account to send email');
      return;
    }

    const toRecipients = parseRecipients(composeDraft.to);
    if (toRecipients.length === 0) {
      toastError('Please specify at least one recipient');
      return;
    }

    const payload: SendEmailPayload = {
      account_id: selectedAccountId,
      to: toRecipients,
      cc: parseRecipients(composeDraft.cc),
      bcc: parseRecipients(composeDraft.bcc),
      subject: composeDraft.subject,
      body_text: composeDraft.body_text,
    };

    try {
      await sendEmail(payload);
      setComposeDraft({ to: '', cc: '', bcc: '', subject: '', body_text: '' });
      setComposeOpen(false);
    } catch {
      // handled upstream
    }
  };

  const handleToggleRead = async (message: EmailMessage) => {
    try {
      await markRead(message.uid, !message.is_read);
    } catch {
      // handled upstream
    }
  };

  const handleDelete = async (message: EmailMessage) => {
    try {
      await deleteEmail(message.uid);
    } catch {
      // handled upstream
    }
  };

  const handleFolderChange = async (folder: string) => {
    await refreshEmails({ folder, filter });
  };

  const onFilterChange = async (partial: Partial<EmailFilter>) => {
    const next = { ...filter, ...partial };
    setFilter(next);
    await refreshEmails({ filter: next });
  };

  const handleTabChange = async (value: 'all' | 'unread') => {
    setTabValue(value);
    await onFilterChange({ unread_only: value === 'unread' });
  };

  return (
    <div className={cn('flex h-full bg-background', className)}>
      <aside className="w-72 border-r border-border/80 bg-muted/20">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold leading-tight">Email Accounts</p>
              <p className="text-xs text-muted-foreground">Manage inboxes &amp; compose</p>
            </div>
          </div>
          <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Connect Email Account</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">Provider</label>
                  <select
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground">Email</label>
                    <Input
                      type="email"
                      autoComplete="email"
                      value={credentials.email}
                      onChange={(event) => setCredentials((prev) => ({ ...prev, email: event.target.value }))}
                      placeholder="me@example.com"
                    />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground">Display Name</label>
                    <Input
                      value={credentials.display_name}
                      onChange={(event) =>
                        setCredentials((prev) => ({ ...prev, display_name: event.target.value }))
                      }
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground">App Password</label>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={credentials.password}
                      onChange={(event) => setCredentials((prev) => ({ ...prev, password: event.target.value }))}
                      placeholder="••••••••"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use an app-specific password if your provider requires one.
                    </p>
                  </div>
                </div>

                {provider === 'custom' && (
                  <div className="space-y-3 rounded-md border border-dashed border-border/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Custom Server Settings
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground">IMAP Host</label>
                        <Input
                          value={customConfig.imap_host}
                          onChange={(event) =>
                            setCustomConfig((prev) => ({ ...prev, imap_host: event.target.value }))
                          }
                          placeholder="imap.example.com"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground">IMAP Port</label>
                        <Input
                          type="number"
                          value={customConfig.imap_port}
                          onChange={(event) =>
                            setCustomConfig((prev) => ({
                              ...prev,
                              imap_port: Number(event.target.value) || 993,
                            }))
                          }
                        />
                      </div>
                      <div className="col-span-1 md:col-span-2">
                        <label className="block text-xs font-medium text-muted-foreground">SMTP Host</label>
                        <Input
                          value={customConfig.smtp_host}
                          onChange={(event) =>
                            setCustomConfig((prev) => ({ ...prev, smtp_host: event.target.value }))
                          }
                          placeholder="smtp.example.com"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground">SMTP Port</label>
                        <Input
                          type="number"
                          value={customConfig.smtp_port}
                          onChange={(event) =>
                            setCustomConfig((prev) => ({
                              ...prev,
                              smtp_port: Number(event.target.value) || 587,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConnectOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleConnect} disabled={loading}>
                  Connect
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Separator />
        <div className="space-y-2 px-3 py-3">
          {accounts.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
              Connect an email account to get started.
            </div>
          )}
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => selectAccount(account.id)}
              className={cn(
                'w-full rounded-md border px-3 py-2 text-left transition-colors',
                account.id === selectedAccountId
                  ? 'border-primary/80 bg-primary/10 text-foreground shadow-sm'
                  : 'border-transparent hover:border-border hover:bg-muted/50',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{account.display_name ?? account.email}</span>
                {account.id === selectedAccountId && (
                  <Badge variant="outline" className="text-[10px] uppercase">
                    Active
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{account.email}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-6"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeAccount(account.id);
                  }}
                >
                  Remove
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-6"
                  onClick={(event) => {
                    event.stopPropagation();
                    refreshFolders(account.id);
                    refreshEmails({ accountId: account.id });
                  }}
                >
                  <RefreshCcw className="mr-1 h-3 w-3" />
                  Sync
                </Button>
              </div>
            </button>
          ))}
        </div>
        <Separator />
        <div className="px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folders</p>
          <div className="mt-2 space-y-1">
            {folders.map((folder) => (
              <button
                key={folder}
                type="button"
                onClick={() => handleFolderChange(folder)}
                className={cn(
                  'w-full rounded-md px-2 py-1 text-left text-sm transition-colors',
                  folder === selectedFolder
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted/50 text-muted-foreground',
                )}
              >
                {folder}
              </button>
            ))}
          </div>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refreshEmails()}>
              <RefreshCcw className="mr-1 h-4 w-4" />
              Refresh
            </Button>
            <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Send className="mr-1 h-4 w-4" />
                  Compose
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Compose Email</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-3 py-2">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">To</label>
                    <Input
                      value={composeDraft.to}
                      onChange={(event) => setComposeDraft((prev) => ({ ...prev, to: event.target.value }))}
                      placeholder="recipient@example.com"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground">CC</label>
                      <Input
                        value={composeDraft.cc}
                        onChange={(event) => setComposeDraft((prev) => ({ ...prev, cc: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground">BCC</label>
                      <Input
                        value={composeDraft.bcc}
                        onChange={(event) => setComposeDraft((prev) => ({ ...prev, bcc: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">Subject</label>
                    <Input
                      value={composeDraft.subject}
                      onChange={(event) => setComposeDraft((prev) => ({ ...prev, subject: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">Message</label>
                    <Textarea
                      value={composeDraft.body_text}
                      onChange={(event) => setComposeDraft((prev) => ({ ...prev, body_text: event.target.value }))}
                      rows={10}
                      placeholder="Write your message..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setComposeOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSendEmail} disabled={loading}>
                    <Send className="mr-1 h-4 w-4" />
                    Send
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search messages..."
                className="pl-9 pr-3 text-sm"
              />
            </div>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-[320px_minmax(0,1fr)]">
          <div className="border-r border-border/80">
            <Tabs value={tabValue} onValueChange={(value) => handleTabChange(value as 'all' | 'unread')}>
              <TabsList className="grid grid-cols-2 px-2 py-2">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unread">Unread</TabsTrigger>
              </TabsList>
              <TabsContent value="all">
                <EmailList
                  emails={filteredEmails}
                  selectedEmail={selectedEmail}
                  onSelect={selectEmail}
                  onToggleRead={handleToggleRead}
                  onDelete={handleDelete}
                />
              </TabsContent>
              <TabsContent value="unread">
                <EmailList
                  emails={filteredEmails.filter((message) => !message.is_read)}
                  selectedEmail={selectedEmail}
                  onSelect={selectEmail}
                  onToggleRead={handleToggleRead}
                  onDelete={handleDelete}
                />
              </TabsContent>
            </Tabs>
          </div>
          <div className="flex flex-col">
            {selectedEmail ? (
              <EmailDetail message={selectedEmail} contacts={contacts} onMarkRead={handleToggleRead} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <Inbox className="h-12 w-12 opacity-30" />
                <p className="mt-2 text-sm">Select a message to preview</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function EmailList({
  emails,
  selectedEmail,
  onSelect,
  onToggleRead,
  onDelete,
}: {
  emails: EmailMessage[];
  selectedEmail: EmailMessage | null;
  onSelect: (id: string) => void;
  onToggleRead: (message: EmailMessage) => void;
  onDelete: (message: EmailMessage) => void;
}) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 px-2 pb-4">
        {emails.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
            No messages found.
          </div>
        )}
        {emails.map((message) => (
          <div
            key={message.id}
            onClick={() => onSelect(message.id)}
            className={cn(
              'group cursor-pointer rounded-md border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-muted/40',
              selectedEmail?.id === message.id && 'border-primary/70 bg-primary/10',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold leading-tight">{message.from.name ?? message.from.email}</span>
                {!message.is_read ? <Circle className="h-3 w-3 text-primary" /> : <Check className="h-3 w-3 text-muted-foreground" />}
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(message);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <p className={cn('text-sm', !message.is_read && 'font-semibold')}>{message.subject || '(No subject)'}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{message.body_text ?? '(no preview available)'}</p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Button
                variant="ghost"
                size="xs"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleRead(message);
                }}
              >
                {message.is_read ? 'Mark unread' : 'Mark read'}
              </Button>
              <span>{new Date(message.date * 1000).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function EmailDetail({
  message,
  contacts,
  onMarkRead,
}: {
  message: EmailMessage;
  contacts: Contact[];
  onMarkRead: (message: EmailMessage) => void;
}) {
  const senderContact = contacts.find((contact) => contact.email === message.from.email);
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/80 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{message.subject || '(No subject)'}</h2>
            <p className="text-sm text-muted-foreground">
              From {message.from.name ? `${message.from.name} <${message.from.email}>` : message.from.email}
            </p>
            <p className="text-xs text-muted-foreground">
              Sent {new Date(message.date * 1000).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onMarkRead(message)}>
              {message.is_read ? 'Mark unread' : 'Mark read'}
            </Button>
          </div>
        </div>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold">To:</span> {formatAddresses(message.to)}
          </p>
          {message.cc.length > 0 && (
            <p>
              <span className="font-semibold">Cc:</span> {formatAddresses(message.cc)}
            </p>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="prose prose-sm max-w-none px-6 py-5">
          {message.body_html ? (
            <div dangerouslySetInnerHTML={{ __html: message.body_html }} />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">
              {message.body_text ?? 'No message body'}
            </pre>
          )}
        </div>
      </ScrollArea>
      {senderContact ? (
        <div className="border-t border-border/80 px-6 py-3 text-xs text-muted-foreground">
          <p>
            Saved contact:{' '}
            <span className="font-semibold">
              {senderContact.display_name ?? `${senderContact.first_name ?? ''} ${senderContact.last_name ?? ''}`}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function parseRecipients(raw: string): EmailAddress[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((address) => ({ email: address }));
}

function formatAddresses(addresses: EmailAddress[]): string {
  if (addresses.length === 0) {
  if (addresses.length === 0) {
    return '--';
  return addresses
    .map((address) => (address.name ? `${address.name} <${address.email}>` : address.email))
    .join(', ');
}

function toastError(message: string) {
  toast.error(message);
}

export default EmailWorkspace;


