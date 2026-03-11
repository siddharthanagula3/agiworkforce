import { DockPosition } from '../../hooks/useWindowManager';

interface DockingSystemProps {
  preview: DockPosition | null;
  docked: DockPosition | null;
}

const DockingSystem = ({ preview, docked }: DockingSystemProps) => {
  if (!preview && !docked) {
    return null;
  }

  return (
    <div className="dock-visualizer" aria-hidden="true">
      {docked && <div className={`dock-visualizer__state dock-${docked}`} />}
      {preview && <div className={`dock-visualizer__preview dock-${preview}`} />}
    </div>
  );
};

export default DockingSystem;
