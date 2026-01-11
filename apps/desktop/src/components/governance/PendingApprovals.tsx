import React, { useState } from 'react';
import type { ApprovalRequest } from '../../stores/governanceStore';
import { ApprovalModal } from './ApprovalModal';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

interface PendingApprovalsProps {
  requests: ApprovalRequest[];
  isLoading: boolean;
}

export const PendingApprovals: React.FC<PendingApprovalsProps> = ({ requests, isLoading }) => {
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [modalAction, setModalAction] = useState<'approve' | 'reject' | null>(null);

  const handleApprove = (request: ApprovalRequest) => {
    setSelectedRequest(request);
    setModalAction('approve');
  };

  const handleReject = (request: ApprovalRequest) => {
    setSelectedRequest(request);
    setModalAction('reject');
  };

  const closeModal = () => {
    setSelectedRequest(null);
    setModalAction(null);
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case 'timed_out':
        return <AlertCircle className="h-5 w-5 text-gray-600" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">Loading approval requests...</p>
      </div>
    );
  }

  const pendingRequests = requests.filter((r) => r.status === 'pending');

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Pending Approval Requests ({pendingRequests.length})
          </h2>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-600 dark:text-gray-400">No pending approval requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {getStatusIcon(request.status)}
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${getRiskLevelColor(request.risk_level)}`}
                      >
                        {request.risk_level} Risk
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Requested by {request.requester_id}
                      </span>
                    </div>

                    <div className="space-y-2">
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

                      {request.justification && (
                        <div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Justification:
                          </span>
                          <p className="mt-1 text-sm text-gray-900 dark:text-white">
                            {request.justification}
                          </p>
                        </div>
                      )}

                      <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                        <span>Created: {new Date(request.created_at).toLocaleString()}</span>
                        <span>Expires: {new Date(request.expires_at).toLocaleString()}</span>
                      </div>

                      {request.action.parameters &&
                        Object.keys(request.action.parameters).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-sm text-blue-600 dark:text-blue-400 cursor-pointer">
                              View parameters
                            </summary>
                            <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-x-auto">
                              {JSON.stringify(request.action.parameters, null, 2)}
                            </pre>
                          </details>
                        )}
                    </div>
                  </div>

                  <div className="flex flex-col space-y-2 ml-4">
                    <Button
                      onClick={() => handleApprove(request)}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                    <Button onClick={() => handleReject(request)} variant="destructive">
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* All Requests History */}
        {requests.filter((r) => r.status !== 'pending').length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Request History</h2>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Requester
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Risk Level
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Reviewed By
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {requests
                    .filter((r) => r.status !== 'pending')
                    .map((request) => (
                      <tr key={request.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {request.requester_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {request.action.action_type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${getRiskLevelColor(request.risk_level)}`}
                          >
                            {request.risk_level}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {getStatusIcon(request.status)}
                            <span className="ml-2 text-sm capitalize">{request.status}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {request.reviewed_by || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {request.reviewed_at
                            ? new Date(request.reviewed_at).toLocaleString()
                            : '-'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedRequest && modalAction && (
        <ApprovalModal request={selectedRequest} action={modalAction} onClose={closeModal} />
      )}
    </>
  );
};
