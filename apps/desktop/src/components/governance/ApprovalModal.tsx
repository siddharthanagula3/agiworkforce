import React, { useState } from 'react';
import type { ApprovalRequest } from '../../stores/governanceStore';
import { useGovernanceStore } from '../../stores/governanceStore';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../ui/Button';
import { X, CheckCircle, XCircle } from 'lucide-react';

interface ApprovalModalProps {
  request: ApprovalRequest;
  action: 'approve' | 'reject';
  onClose: () => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({ request, action, onClose }) => {
  const { approveRequest, rejectRequest } = useGovernanceStore();
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentUserId = useAuthStore((state) => state.getCurrentUserId());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (action === 'approve') {
        await approveRequest(request.id, currentUserId, notes || undefined);
      } else {
        if (!notes.trim()) {
          setError('Please provide a reason for rejection');
          setSubmitting(false);
          return;
        }
        await rejectRequest(request.id, currentUserId, notes);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            {action === 'approve' ? (
              <>
                <CheckCircle className="mr-2 h-6 w-6 text-green-600" />
                Approve Request
              </>
            ) : (
              <>
                <XCircle className="mr-2 h-6 w-6 text-red-600" />
                Reject Request
              </>
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Request Details */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Requester:
              </span>
              <span className="ml-2 text-sm text-gray-900 dark:text-white">
                {request.requester_id}
              </span>
            </div>

            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Action Type:
              </span>
              <span className="ml-2 text-sm text-gray-900 dark:text-white">
                {request.action.action_type}
              </span>
            </div>

            {request.action.resource_type && (
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Resource:
                </span>
                <span className="ml-2 text-sm text-gray-900 dark:text-white">
                  {request.action.resource_type}: {request.action.resource_id || 'N/A'}
                </span>
              </div>
            )}

            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Risk Level:
              </span>
              <span className="ml-2 text-sm font-semibold capitalize text-gray-900 dark:text-white">
                {request.risk_level}
              </span>
            </div>

            {request.justification && (
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  Justification:
                </span>
                <p className="text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 p-3 rounded">
                  {request.justification}
                </p>
              </div>
            )}

            {request.action.parameters && Object.keys(request.action.parameters).length > 0 && (
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  Parameters:
                </span>
                <pre className="text-xs bg-white dark:bg-gray-800 p-3 rounded overflow-x-auto">
                  {JSON.stringify(request.action.parameters, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
              <span>Created: {new Date(request.created_at).toLocaleString()}</span>
              <span>Expires: {new Date(request.expires_at).toLocaleString()}</span>
            </div>
          </div>

          {/* Notes/Reason */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {action === 'approve' ? 'Notes (optional)' : 'Reason for rejection (required)'}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                required={action === 'reject'}
                placeholder={
                  action === 'approve'
                    ? 'Add any notes about this approval...'
                    : 'Explain why this request is being rejected...'
                }
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              {action === 'approve' ? (
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {submitting ? 'Approving...' : 'Approve Request'}
                </Button>
              ) : (
                <Button type="submit" disabled={submitting} variant="destructive">
                  <XCircle className="mr-2 h-4 w-4" />
                  {submitting ? 'Rejecting...' : 'Reject Request'}
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
