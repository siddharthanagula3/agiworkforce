import React, { useEffect, useState } from 'react';
import { useGovernanceStore } from '../../stores/governanceStore';
import { AuditEventsList } from './AuditEventsList';
import { PendingApprovals } from './PendingApprovals';
import { Shield, FileText, AlertTriangle, CheckCircle } from 'lucide-react';

type TabView = 'audit' | 'approvals' | 'alerts';

export const GovernanceDashboard: React.FC = () => {
  const {
    auditEvents,
    approvalRequests,
    approvalStatistics,
    isLoadingAudit,
    isLoadingApprovals,
    auditError,
    approvalError,
    fetchAuditEvents,
    fetchPendingApprovals,
    fetchApprovalStatistics,
  } = useGovernanceStore();

  const [activeTab, setActiveTab] = useState<TabView>('audit');

  useEffect(() => {
    void fetchAuditEvents();
    void fetchPendingApprovals();
    void fetchApprovalStatistics();
  }, [fetchAuditEvents, fetchPendingApprovals, fetchApprovalStatistics]);

  const tabs = [
    { id: 'audit' as TabView, label: 'Audit Log', icon: FileText, count: auditEvents.length },
    {
      id: 'approvals' as TabView,
      label: 'Approvals',
      icon: CheckCircle,
      count: approvalRequests.filter((r) => r.status === 'pending').length,
    },
    { id: 'alerts' as TabView, label: 'Security Alerts', icon: AlertTriangle, count: 0 },
  ];

  const error = auditError || approvalError;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center mb-4">
            <Shield className="h-8 w-8 mr-3 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Governance & Compliance
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Monitor security, audit trails, and approval workflows
              </p>
            </div>
          </div>

          {/* Statistics Cards */}
          {approvalStatistics && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  Total Requests
                </p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-300 mt-1">
                  {approvalStatistics.total_requests}
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">Approved</p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-300 mt-1">
                  {approvalStatistics.approved}
                </p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">Rejected</p>
                <p className="text-2xl font-bold text-red-900 dark:text-red-300 mt-1">
                  {approvalStatistics.rejected}
                </p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">Pending</p>
                <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-300 mt-1">
                  {approvalStatistics.pending}
                </p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex space-x-1 border-b border-gray-200 dark:border-gray-700 mt-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <tab.icon className="mr-2 h-4 w-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 py-4 w-full">
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded">
            <span className="block sm:inline">{error}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {activeTab === 'audit' && (
            <AuditEventsList events={auditEvents} isLoading={isLoadingAudit} />
          )}
          {activeTab === 'approvals' && (
            <PendingApprovals requests={approvalRequests} isLoading={isLoadingApprovals} />
          )}
          {activeTab === 'alerts' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p className="text-gray-600 dark:text-gray-400">No security alerts</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
