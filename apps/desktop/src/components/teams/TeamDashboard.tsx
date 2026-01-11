import React, { useEffect, useState } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { TeamMemberList } from './TeamMemberList';
import { TeamInvitation } from './TeamInvitation';
import { TeamSettings } from './TeamSettings';
import { TeamActivityLog } from './TeamActivityLog';
import { Button } from '../ui/Button';
import { Users, UserPlus, Settings, Activity, CreditCard } from 'lucide-react';

type TabView = 'members' | 'invitations' | 'settings' | 'activity' | 'billing';

export const TeamDashboard: React.FC = () => {
  const {
    currentTeam,
    teams,
    members,
    invitations,
    activities,
    billing,
    isLoading,
    isLoadingMembers,
    error,
    setCurrentTeam,
    getTeamMembers,
    getTeamInvitations,
    getTeamActivity,
    getTeamBilling,
    clearError,
  } = useTeamStore();

  const [activeTab, setActiveTab] = useState<TabView>('members');

  useEffect(() => {
    if (teams.length > 0 && !currentTeam) {
      const firstTeam = teams[0];
      if (firstTeam) {
        setCurrentTeam(firstTeam);
      }
    }
  }, [teams, currentTeam, setCurrentTeam]);

  useEffect(() => {
    if (currentTeam) {
      void getTeamMembers(currentTeam.id);
      void getTeamInvitations(currentTeam.id);
      void getTeamActivity(currentTeam.id, 50, 0);
      void getTeamBilling(currentTeam.id);
    }
  }, [currentTeam, getTeamMembers, getTeamInvitations, getTeamActivity, getTeamBilling]);

  const tabs = [
    { id: 'members' as TabView, label: 'Members', icon: Users },
    { id: 'invitations' as TabView, label: 'Invitations', icon: UserPlus },
    { id: 'settings' as TabView, label: 'Settings', icon: Settings },
    { id: 'activity' as TabView, label: 'Activity', icon: Activity },
    { id: 'billing' as TabView, label: 'Billing', icon: CreditCard },
  ];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading teams...</p>
        </div>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center max-w-md px-4">
          <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-bold mb-2">No Teams Yet</h2>
          <p className="text-muted-foreground mb-6">
            Create a team to collaborate with others on workflows, templates, and automations.
          </p>
          <Button size="lg">
            <UserPlus className="mr-2 h-4 w-4" />
            Create Your First Team
          </Button>
        </div>
      </div>
    );
  }

  if (!currentTeam) {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {currentTeam.name}
              </h1>
              {currentTeam.description && (
                <p className="text-gray-600 dark:text-gray-400 mt-1">{currentTeam.description}</p>
              )}
            </div>
            {teams.length > 1 && (
              <select
                value={currentTeam.id}
                onChange={(e) => {
                  const team = teams.find((t) => t.id === e.target.value);
                  if (team) setCurrentTeam(team);
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 border-b border-gray-200 dark:border-gray-700">
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
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 py-4 w-full">
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded relative">
            <span className="block sm:inline">{error}</span>
            <button onClick={clearError} className="absolute top-0 bottom-0 right-0 px-4 py-3">
              <span className="text-2xl">&times;</span>
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {activeTab === 'members' && (
            <TeamMemberList
              members={members}
              currentTeam={currentTeam}
              isLoading={isLoadingMembers}
            />
          )}
          {activeTab === 'invitations' && (
            <TeamInvitation
              invitations={invitations}
              currentTeam={currentTeam}
              isLoading={isLoadingMembers}
            />
          )}
          {activeTab === 'settings' && <TeamSettings currentTeam={currentTeam} />}
          {activeTab === 'activity' && <TeamActivityLog activities={activities} />}
          {activeTab === 'billing' && billing && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-xl font-semibold mb-4">Billing Information</h2>
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Plan:</span>
                  <p className="font-medium capitalize">{billing.planTier}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Billing Cycle:</span>
                  <p className="font-medium capitalize">{billing.billingCycle}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">Seats:</span>
                  <p className="font-medium">{billing.seatCount}</p>
                </div>
                {billing.nextBillingDate && (
                  <div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Next Billing Date:
                    </span>
                    <p className="font-medium">
                      {new Date(billing.nextBillingDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
