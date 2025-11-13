import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { Label } from '../ui/Label';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { ScrollArea } from '../ui/ScrollArea';
import { cn } from '../../lib/utils';
import { useConfiguratorStore } from '../../stores/configuratorStore';
import type { ConfigField } from '../../types/configurator';

interface ConfigurationPanelProps {
  className?: string;
}

export function ConfigurationPanel({ className }: ConfigurationPanelProps) {
  const selectedNode = useConfiguratorStore((state) => state.selectedNode);
  const employeeName = useConfiguratorStore((state) => state.employeeName);
  const employeeRole = useConfiguratorStore((state) => state.employeeRole);
  const employeeDescription = useConfiguratorStore((state) => state.employeeDescription);
  const customInstructions = useConfiguratorStore((state) => state.customInstructions);
  const capabilities = useConfiguratorStore((state) => state.capabilities);
  const workflowNodes = useConfiguratorStore((state) => state.workflowNodes);

  const setEmployeeName = useConfiguratorStore((state) => state.setEmployeeName);
  const setEmployeeRole = useConfiguratorStore((state) => state.setEmployeeRole);
  const setEmployeeDescription = useConfiguratorStore((state) => state.setEmployeeDescription);
  const setCustomInstructions = useConfiguratorStore((state) => state.setCustomInstructions);
  const updateNode = useConfiguratorStore((state) => state.updateNode);
  const deleteNode = useConfiguratorStore((state) => state.deleteNode);

  // Get the capability for the selected node
  const selectedCapability = React.useMemo(() => {
    if (!selectedNode) return null;
    const capabilityId = selectedNode.data.capabilityId;
    return capabilities.find((cap) => cap.id === capabilityId);
  }, [selectedNode, capabilities]);

  // Get previous nodes for variable selection
  const previousNodes = React.useMemo(() => {
    if (!selectedNode) return [];
    const selectedIndex = workflowNodes.findIndex((n) => n.id === selectedNode.id);
    return workflowNodes.slice(0, selectedIndex);
  }, [selectedNode, workflowNodes]);

  const handleConfigChange = (fieldName: string, value: any) => {
    if (!selectedNode) return;
    updateNode(selectedNode.id, {
      config: {
        ...selectedNode.data.config,
        [fieldName]: value,
      },
    });
  };

  const handleDeleteNode = () => {
    if (!selectedNode) return;
    if (confirm('Are you sure you want to delete this node?')) {
      deleteNode(selectedNode.id);
    }
  };

  const renderConfigField = (field: ConfigField) => {
    const value = selectedNode?.data.config?.[field.name] ?? field.defaultValue ?? '';

    switch (field.type) {
      case 'text':
        return (
          <Input
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleConfigChange(field.name, e.target.value)}
          />
        );

      case 'textarea':
        return (
          <Textarea
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleConfigChange(field.name, e.target.value)}
            rows={4}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleConfigChange(field.name, parseFloat(e.target.value))}
          />
        );

      case 'boolean':
        return (
          <Select
            value={value ? 'true' : 'false'}
            onValueChange={(v) => handleConfigChange(field.name, v === 'true')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">True</SelectItem>
              <SelectItem value="false">False</SelectItem>
            </SelectContent>
          </Select>
        );

      case 'select':
        return (
          <Select value={value} onValueChange={(v) => handleConfigChange(field.name, v)}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'json':
        return (
          <Textarea
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => handleConfigChange(field.name, e.target.value)}
            rows={6}
            className="font-mono text-xs"
          />
        );

      case 'variable':
        return (
          <Select value={value} onValueChange={(v) => handleConfigChange(field.name, v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select a variable..." />
            </SelectTrigger>
            <SelectContent>
              {previousNodes.map((node) => (
                <SelectItem key={node.id} value={node.id}>
                  {node.data.label} output
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      default:
        return null;
    }
  };

  return (
    <div className={cn('flex flex-col border-l bg-background', className)}>
      {!selectedNode ? (
        // Employee-level settings
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
            <div>
              <h3 className="mb-4 text-lg font-semibold">Employee Settings</h3>
            </div>

            <div className="space-y-2">
              <Label htmlFor="employee-name">Employee Name</Label>
              <Input
                id="employee-name"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="My Custom Employee"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="employee-role">Role</Label>
              <Select value={employeeRole} onValueChange={setEmployeeRole}>
                <SelectTrigger id="employee-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SupportAgent">Support Agent</SelectItem>
                  <SelectItem value="SalesAgent">Sales Agent</SelectItem>
                  <SelectItem value="Developer">Developer</SelectItem>
                  <SelectItem value="Operations">Operations</SelectItem>
                  <SelectItem value="Personal">Personal Assistant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="employee-description">Description</Label>
              <Textarea
                id="employee-description"
                value={employeeDescription}
                onChange={(e) => setEmployeeDescription(e.target.value)}
                placeholder="Describe what this employee does..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-instructions">Custom Instructions</Label>
              <Textarea
                id="custom-instructions"
                placeholder="Additional instructions for the LLM to follow when executing this workflow..."
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Provide specific guidance on how the AI should behave, tone, constraints, etc.
              </p>
            </div>
          </div>
        </ScrollArea>
      ) : (
        // Node-specific settings
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{selectedNode.data.label}</h3>
              <Button variant="ghost" size="icon" onClick={handleDeleteNode}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {selectedCapability?.description && (
              <p className="text-sm text-muted-foreground">{selectedCapability.description}</p>
            )}

            {selectedCapability?.configSchema.fields && (
              <div className="space-y-4">
                {selectedCapability.configSchema.fields.map((field) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name}>
                      {field.label}
                      {field.required && <span className="text-red-500"> *</span>}
                    </Label>
                    {renderConfigField(field)}
                    {field.description && (
                      <p className="text-xs text-muted-foreground">{field.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {previousNodes.length > 0 && (
              <div className="mt-6 space-y-2 border-t pt-4">
                <Label>Use output from previous step</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a previous node..." />
                  </SelectTrigger>
                  <SelectContent>
                    {previousNodes.map((node) => (
                      <SelectItem key={node.id} value={node.id}>
                        {node.data.label} output
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Reference data from a previous step in the workflow
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
