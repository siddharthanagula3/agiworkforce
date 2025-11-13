import React, { useState } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import type { Team } from '../../types/teams';
import { Button } from '../ui/Button';
import { Save, Trash2 } from 'lucide-react';

interface TeamSettingsProps {
  currentTeam: Team;
}

export const TeamSettings: React.FC<TeamSettingsProps> = ({ currentTeam }) => {
  const { updateTeam, deleteTeam } = useTeamStore();
  const [name, setName] = useState(currentTeam.name);
  const [description, setDescription] = useState(currentTeam.description || '');
  const [defaultMemberRole, setDefaultMemberRole] = useState(
    currentTeam.settings.defaultMemberRole,
  );
  const [allowResourceSharing, setAllowResourceSharing] = useState(
    currentTeam.settings.allowResourceSharing,
  );
  const [requireApprovalForAutomations, setRequireApprovalForAutomations] = useState(
    currentTeam.settings.requireApprovalForAutomations,
  );
  const [enableActivityNotifications, setEnableActivityNotifications] = useState(
    currentTeam.settings.enableActivityNotifications,
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateTeam(currentTeam.id, name, description || null);
      // Note: Settings update would require a separate backend endpoint
    } catch (error) {
      console.error('Failed to update team:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        'Are you sure you want to delete this team? This action cannot be undone and will remove all members and shared resources.',
      )
    ) {
      return;
    }
    try {
      await deleteTeam(currentTeam.id);
    } catch (error) {
      console.error('Failed to delete team:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Team Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button type="submit" disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </div>

      {/* Team Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold mb-4">Team Settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Default Member Role
            </label>
            <select
              value={defaultMemberRole}
              onChange={(e) => setDefaultMemberRole(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              New members will be assigned this role by default
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Allow Resource Sharing
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Members can share workflows and templates with the team
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAllowResourceSharing(!allowResourceSharing)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                allowResourceSharing ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  allowResourceSharing ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Require Approval for Automations
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Automations must be approved by an admin before execution
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRequireApprovalForAutomations(!requireApprovalForAutomations)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                requireApprovalForAutomations ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  requireApprovalForAutomations ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable Activity Notifications
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Notify members about team activity and changes
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEnableActivityNotifications(!enableActivityNotifications)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enableActivityNotifications ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enableActivityNotifications ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-6">
        <h2 className="text-xl font-semibold text-red-900 dark:text-red-300 mb-4">Danger Zone</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-red-900 dark:text-red-300">Delete this team</p>
            <p className="text-sm text-red-700 dark:text-red-400">
              Once you delete a team, there is no going back. Please be certain.
            </p>
          </div>
          <Button variant="destructive" onClick={() => void handleDelete()}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Team
          </Button>
        </div>
      </div>
    </div>
  );
};
