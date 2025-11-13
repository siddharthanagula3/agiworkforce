import * as React from 'react';
import { ArrowLeft, Save, Play, Upload, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { useConfiguratorStore } from '../../stores/configuratorStore';

export function ConfiguratorHeader() {
  const navigate = useNavigate();

  const employeeName = useConfiguratorStore((state) => state.employeeName);
  const employeeRole = useConfiguratorStore((state) => state.employeeRole);
  const setEmployeeName = useConfiguratorStore((state) => state.setEmployeeName);
  const setTestModalOpen = useConfiguratorStore((state) => state.setTestModalOpen);
  const setPublishModalOpen = useConfiguratorStore((state) => state.setPublishModalOpen);
  const saveEmployee = useConfiguratorStore((state) => state.saveEmployee);
  const selectedEmployee = useConfiguratorStore((state) => state.selectedEmployee);
  const isSaving = useConfiguratorStore((state) => state.isSaving);
  const isDirty = useConfiguratorStore((state) => state.isDirty);
  const workflowNodes = useConfiguratorStore((state) => state.workflowNodes);

  const handleSave = async () => {
    try {
      await saveEmployee();
    } catch (error) {
      console.error('Save failed:', error);
      alert('Failed to save employee. Please try again.');
    }
  };

  const handleTest = () => {
    if (workflowNodes.length === 0) {
      alert('Please add some nodes to your workflow before testing');
      return;
    }
    setTestModalOpen(true);
  };

  const handlePublish = () => {
    if (!selectedEmployee?.id) {
      alert('Please save your employee before publishing');
      return;
    }
    setPublishModalOpen(true);
  };

  const handleGoBack = () => {
    if (isDirty) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        navigate(-1);
      }
    } else {
      navigate(-1);
    }
  };

  const roleLabels: Record<string, string> = {
    SupportAgent: 'Support Agent',
    SalesAgent: 'Sales Agent',
    Developer: 'Developer',
    Operations: 'Operations',
    Personal: 'Personal Assistant',
  };

  return (
    <div className="flex items-center justify-between border-b p-4">
      {/* Left: Employee Info */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleGoBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={employeeName}
          onChange={(e) => setEmployeeName(e.target.value)}
          placeholder="My Custom Employee"
          className="w-64 text-lg font-semibold"
        />
        <Badge variant="secondary">{roleLabels[employeeRole] || employeeRole}</Badge>
        {isDirty && (
          <Badge variant="outline" className="text-orange-600">
            Unsaved Changes
          </Badge>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleSave} disabled={isSaving || !isDirty}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handleTest}>
          <Play className="mr-2 h-4 w-4" />
          Test
        </Button>
        <Button onClick={handlePublish}>
          <Upload className="mr-2 h-4 w-4" />
          Publish
        </Button>
      </div>
    </div>
  );
}
