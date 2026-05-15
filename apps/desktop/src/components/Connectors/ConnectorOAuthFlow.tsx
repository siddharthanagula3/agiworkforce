import { Check, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';

export type OAuthFlowState =
  | { status: 'idle' }
  | { status: 'connecting'; connectorName: string }
  | { status: 'success'; connectorName: string }
  | { status: 'error'; connectorName: string; message: string };

interface ConnectorOAuthFlowProps {
  state: OAuthFlowState;
  onClose: () => void;
  onRetry: () => void;
}

export function ConnectorOAuthFlow({ state, onClose, onRetry }: ConnectorOAuthFlowProps) {
  if (state.status === 'idle') return null;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {state.status === 'connecting' && `Connecting to ${state.connectorName}...`}
            {state.status === 'success' && 'Connected'}
            {state.status === 'error' && 'Connection Failed'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center py-6 gap-4">
          {state.status === 'connecting' && (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-teal-500" />
              <p className="text-sm text-muted-foreground text-center">
                Opening authorization page for {state.connectorName}...
              </p>
            </>
          )}

          {state.status === 'success' && (
            <>
              <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                You can now use {state.connectorName} in your chats.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition-colors"
              >
                Done
              </button>
            </>
          )}

          {state.status === 'error' && (
            <>
              <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <X className="h-6 w-6 text-red-500" />
              </div>
              <p className="text-sm text-destructive text-center">{state.message}</p>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition-colors"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
