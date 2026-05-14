import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../../stores/settingsStore';
import { Label } from '../ui/Label';
import { Switch } from '../ui/Switch';

type ToolAccessMode = 'load-when-needed' | 'already-loaded';

export const CapabilitiesSettings = () => {
  const { features, setFeature, autoSaveMemories, setAutoSaveMemories } = useSettingsStore(
    useShallow((s) => ({
      features: s.features,
      setFeature: s.setFeature,
      autoSaveMemories: s.chatPreferences.autoSaveMemories ?? false,
      setAutoSaveMemories: s.setAutoSaveMemories,
    })),
  );

  const toolAccessMode: ToolAccessMode =
    (features['toolAccessMode'] as ToolAccessMode | undefined) ?? 'load-when-needed';

  const setToolAccessMode = (mode: ToolAccessMode) =>
    setFeature('toolAccessMode', mode as unknown as boolean);

  return (
    <div className="space-y-8">
      {/* ── Memory ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Memory</h2>
        <div className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="cap-memory" className="text-sm font-medium">
              Generate memory from chat history
            </Label>
            <p className="text-xs text-muted-foreground">
              Allow AGI Workforce to remember relevant context from your chats and projects.
            </p>
          </div>
          <Switch
            id="cap-memory"
            checked={autoSaveMemories}
            onCheckedChange={(checked) => setAutoSaveMemories(checked)}
          />
        </div>
      </section>

      {/* ── Tool Access ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Tool Access</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Controls how connector tools are loaded in new conversations.
        </p>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="toolAccessMode"
              value="load-when-needed"
              checked={toolAccessMode === 'load-when-needed'}
              onChange={() => setToolAccessMode('load-when-needed')}
              className="mt-0.5 accent-primary"
            />
            <div>
              <p className="text-sm font-medium">Load tools when needed</p>
              <p className="text-xs text-muted-foreground">
                Chats compact less since tools aren&apos;t pre-loaded.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="toolAccessMode"
              value="already-loaded"
              checked={toolAccessMode === 'already-loaded'}
              onChange={() => setToolAccessMode('already-loaded')}
              className="mt-0.5 accent-primary"
            />
            <div>
              <p className="text-sm font-medium">Tools already loaded</p>
              <p className="text-xs text-muted-foreground">
                Chats compact more often since tools are always there.
              </p>
            </div>
          </label>
        </div>
      </section>

      {/* ── Visuals ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Visuals</h2>
        <div className="space-y-3">
          <CapRow
            id="cap-artifacts"
            title="Artifacts"
            description="Ask AGI Workforce to generate content like code snippets, text documents, or website designs, and it will create an Artifact that appears in a dedicated window alongside your conversation."
            featureKey="artifacts"
            features={features}
            setFeature={setFeature}
            defaultOn
          />
          <CapRow
            id="cap-ai-artifacts"
            title="AI-powered artifacts"
            description="Create apps, prototypes, and interactive documents that use AGI Workforce inside the artifact."
            featureKey="aiPoweredArtifacts"
            features={features}
            setFeature={setFeature}
            defaultOn
          />
          <CapRow
            id="cap-inline-vis"
            title="Inline visualizations"
            description="Allow AGI Workforce to generate interactive visualizations, charts, and diagrams directly in the conversation."
            featureKey="inlineVisualizations"
            features={features}
            setFeature={setFeature}
            defaultOn
          />
        </div>
      </section>

      {/* ── Code Execution ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Code Execution and File Creation</h2>
        <div className="space-y-3">
          <CapRow
            id="cap-code-exec"
            title="Code execution and file creation"
            description="AGI Workforce can execute code and edit docs, spreadsheets, presentations, PDFs, and data reports."
            featureKey="codeExecution"
            features={features}
            setFeature={setFeature}
            defaultOn
          />
          <CapRow
            id="cap-network"
            title="Allow network egress"
            description="Allow AGI Workforce to access common package managers and libraries for data analysis, visualizations, and file processing."
            featureKey="networkEgress"
            features={features}
            setFeature={setFeature}
          />
        </div>
      </section>
    </div>
  );
};

interface CapRowProps {
  id: string;
  title: string;
  description: string;
  featureKey: string;
  features: Record<string, boolean>;
  setFeature: (key: string, enabled: boolean) => void;
  defaultOn?: boolean;
}

const CapRow = ({
  id,
  title,
  description,
  featureKey,
  features,
  setFeature,
  defaultOn,
}: CapRowProps) => {
  const enabled = featureKey in features ? features[featureKey] : (defaultOn ?? false);
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {title}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={enabled}
        onCheckedChange={(checked) => setFeature(featureKey, checked)}
      />
    </div>
  );
};
