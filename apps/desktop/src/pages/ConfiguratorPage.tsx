/**
 * AI Employee Configurator Page
 * Visual workflow builder for creating custom AI employees
 */

import * as React from 'react';
import { ConfiguratorHeader } from '../components/configurator/ConfiguratorHeader';
import { CapabilityLibrary } from '../components/configurator/CapabilityLibrary';
import { WorkflowCanvas } from '../components/configurator/WorkflowCanvas';
import { ConfigurationPanel } from '../components/configurator/ConfigurationPanel';
import { TrainingPanel } from '../components/configurator/TrainingPanel';
import { TestEmployeeModal } from '../components/configurator/TestEmployeeModal';
import { PublishModal } from '../components/configurator/PublishModal';
import { useConfiguratorStore } from '../stores/configuratorStore';

export function ConfiguratorPage() {
  const fetchCapabilities = useConfiguratorStore((state) => state.fetchCapabilities);
  const capabilities = useConfiguratorStore((state) => state.capabilities);

  // Initialize capabilities on mount
  React.useEffect(() => {
    if (capabilities.length === 0) {
      fetchCapabilities();
    }
  }, [capabilities.length, fetchCapabilities]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header with Actions */}
      <ConfiguratorHeader />

      {/* Main Content - 3 Column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Capability Library */}
        <CapabilityLibrary className="w-64" />

        {/* Center: Workflow Canvas */}
        <div className="flex-1">
          <WorkflowCanvas />
        </div>

        {/* Right: Configuration Panel */}
        <ConfigurationPanel className="w-80" />
      </div>

      {/* Bottom: Training Panel (collapsible) */}
      <TrainingPanel />

      {/* Modals */}
      <TestEmployeeModal />
      <PublishModal />
    </div>
  );
}
