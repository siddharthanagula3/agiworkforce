import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Label } from '@shared/ui/label';
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
import { Download, UserX, Loader2 } from 'lucide-react';

interface ExportDataPanelProps {
  isExporting: boolean;
  showDeleteAccount: boolean;
  isDeleting: boolean;
  deleteConfirmText: string;
  onExportData: () => void;
  onSetShowDeleteAccount: (open: boolean) => void;
  onSetDeleteConfirmText: (text: string) => void;
  onDeleteAccount: () => void;
}

export const ExportDataPanel: React.FC<ExportDataPanelProps> = ({
  isExporting,
  showDeleteAccount,
  isDeleting,
  deleteConfirmText,
  onExportData,
  onSetShowDeleteAccount,
  onSetDeleteConfirmText,
  onDeleteAccount,
}) => (
  <>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Export My Data</CardTitle>
          <CardDescription>
            Download a copy of all your personal data in JSON format (GDPR Article 20)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your export will include your profile, subscription details, credit transactions, email
            preferences, device authorizations, and organization memberships.
          </p>
          <Button
            onClick={onExportData}
            disabled={isExporting}
            variant="outline"
            className="w-full border-border"
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isExporting ? 'Exporting...' : 'Export My Data'}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border border-destructive/30 bg-card">
        <CardHeader>
          <CardTitle className="text-destructive">Delete My Account</CardTitle>
          <CardDescription>
            Permanently delete all your data from our systems (GDPR Article 17)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-sm text-destructive">
              This action is irreversible. All your data including profile, subscriptions, credits,
              and device authorizations will be permanently deleted.
            </p>
          </div>
          <Button
            onClick={() => onSetShowDeleteAccount(true)}
            variant="destructive"
            className="w-full"
          >
            <UserX className="mr-2 h-4 w-4" />
            Delete My Account
          </Button>
        </CardContent>
      </Card>
    </div>

    <AlertDialog open={showDeleteAccount} onOpenChange={onSetShowDeleteAccount}>
      <AlertDialogContent className="border-border bg-popover">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">Delete your account?</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            <div className="space-y-3">
              <p>This will permanently delete all your data. This action cannot be undone.</p>
              <div className="space-y-1.5">
                <Label htmlFor="delete-confirm" className="text-sm text-muted-foreground">
                  Type <strong>DELETE</strong> to confirm
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => onSetDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="border-border bg-background text-foreground"
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            className="border-border bg-secondary text-foreground hover:bg-secondary/80"
            onClick={() => onSetDeleteConfirmText('')}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onDeleteAccount}
            disabled={deleteConfirmText !== 'DELETE' || isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserX className="mr-2 h-4 w-4" />
            )}
            {isDeleting ? 'Deleting...' : 'Delete Everything'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
