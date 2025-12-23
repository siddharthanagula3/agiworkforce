import * as React from 'react';
import { ConfiguratorHeader } from '../components/Configurator/ConfiguratorHeader';
import { CapabilityLibrary } from '../components/Configurator/CapabilityLibrary';
import { WorkflowCanvas } from '../components/Configurator/WorkflowCanvas';
import { ConfigurationPanel } from '../components/Configurator/ConfigurationPanel';
import { TrainingPanel } from '../components/Configurator/TrainingPanel';
import { TestEmployeeModal } from '../components/Configurator/TestEmployeeModal';
import { PublishModal } from '../components/Configurator/PublishModal';
import { useConfiguratorStore } from '../stores/configuratorStore';

export function ConfiguratorPage() {
  const fetchCapabilities = useConfiguratorStore((state) => state.fetchCapabilities);
  const capabilities = useConfiguratorStore((state) => state.capabilities);

  React.useEffect(() => {
    if (capabilities.length === 0) {
      fetchCapabilities();
    }
  }, [capabilities.length, fetchCapabilities]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {}
      <ConfiguratorHeader />

      {}
      <div className="flex flex-1 overflow-hidden">
        {}
        <CapabilityLibrary className="w-64" />

        {}
        <div className="flex-1">
          <WorkflowCanvas />
        </div>

        {}
        <ConfigurationPanel className="w-80" />
      </div>

      {}
      <TrainingPanel />

      {}
      <TestEmployeeModal />
      <PublishModal />
    </div>
  );
}
