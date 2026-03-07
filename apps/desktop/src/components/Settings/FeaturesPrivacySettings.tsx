/**
 * FeaturesPrivacySettings
 *
 * Capability toggles for AGI Workforce features: web search, browser automation,
 * computer use, voice, file ops, terminal, media generation, and experimental flags.
 * Uses the `features` field in settingsStore (v11+).
 */

import { FlaskConical, Zap } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../../stores/settingsStore';
import { Label } from '../ui/Label';
import { Switch } from '../ui/Switch';

interface CapabilityRow {
  key: string;
  label: string;
  description: string;
}

const CAPABILITIES: CapabilityRow[] = [
  {
    key: 'webSearch',
    label: 'Web Search',
    description: 'Allow agents to search the web for up-to-date information.',
  },
  {
    key: 'browserAutomation',
    label: 'Browser Automation',
    description: 'Allow agents to open, navigate, and interact with web browsers.',
  },
  {
    key: 'computerUse',
    label: 'Computer Use',
    description: 'Allow agents to control the mouse, keyboard, and desktop applications.',
  },
  {
    key: 'screenshotOcr',
    label: 'Screenshot & OCR',
    description: 'Allow agents to capture screenshots and extract text from images.',
  },
  {
    key: 'voiceInput',
    label: 'Voice Input (STT)',
    description: 'Allow agents to listen to your voice via the microphone.',
  },
  {
    key: 'voiceOutput',
    label: 'Voice Output (TTS)',
    description: 'Allow agents to read responses aloud via text-to-speech.',
  },
  {
    key: 'fileOperations',
    label: 'File Operations',
    description: 'Allow agents to read, write, move, and delete files on disk.',
  },
  {
    key: 'terminalAccess',
    label: 'Terminal Access',
    description: 'Allow agents to execute shell commands in a terminal.',
  },
  {
    key: 'gitIntegration',
    label: 'Git Integration',
    description: 'Allow agents to commit, branch, and push changes via Git.',
  },
  {
    key: 'imageGeneration',
    label: 'Image Generation',
    description: 'Allow agents to generate images using AI image models.',
  },
  {
    key: 'videoGeneration',
    label: 'Video Generation',
    description: 'Allow agents to generate short video clips using AI video models.',
  },
  {
    key: 'musicGeneration',
    label: 'Music Generation',
    description: 'Allow agents to generate audio and music using AI models.',
  },
  {
    key: 'documentCreation',
    label: 'Document Creation',
    description: 'Allow agents to create and edit Office documents, PDFs, and spreadsheets.',
  },
  {
    key: 'codeExecution',
    label: 'Code Execution',
    description: 'Allow agents to run code snippets directly (Python, JS, etc.).',
  },
];

const EXPERIMENTAL: CapabilityRow[] = [
  {
    key: 'backgroundAgents',
    label: 'Background Agents',
    description:
      'Run scheduled agents in the background even when the chat is not open. May increase CPU and memory usage.',
  },
  {
    key: 'autoPlanning',
    label: 'Auto-Planning',
    description:
      'Automatically decompose complex user requests into multi-step plans before execution.',
  },
  {
    key: 'multiModelConsensus',
    label: 'Multi-Model Consensus',
    description:
      'Send high-stakes queries to multiple LLM providers and synthesize their answers for higher accuracy.',
  },
];

export function FeaturesPrivacySettings() {
  const features = useSettingsStore(useShallow((state) => state.features));
  const setFeature = useSettingsStore((state) => state.setFeature);

  return (
    <div className="space-y-8">
      {/* Capability Toggles */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Zap className="h-5 w-5 text-white" />
          <h3 className="text-lg font-semibold">Capability Toggles</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Enable or disable individual AGI Workforce capabilities. Disabled capabilities are
          completely unavailable to agents regardless of approval mode.
        </p>

        <div className="rounded-lg border border-border bg-[#242424] divide-y divide-border">
          {CAPABILITIES.map((cap) => (
            <div key={cap.key} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor={`feature-${cap.key}`}>{cap.label}</Label>
                <p className="text-xs text-muted-foreground">{cap.description}</p>
              </div>
              <Switch
                id={`feature-${cap.key}`}
                checked={features[cap.key] !== false}
                onCheckedChange={(v) => setFeature(cap.key, v)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Experimental Features */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="h-5 w-5 text-yellow-500" />
          <h3 className="text-lg font-semibold">Experimental Features</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          These features are in active development. They may have bugs, performance issues, or
          change behaviour without notice.
        </p>

        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 divide-y divide-yellow-500/20">
          {EXPERIMENTAL.map((cap) => (
            <div key={cap.key} className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="space-y-0.5 flex-1">
                <Label htmlFor={`feature-${cap.key}`} className="flex items-center gap-2">
                  {cap.label}
                  <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-600 dark:text-yellow-400">
                    BETA
                  </span>
                </Label>
                <p className="text-xs text-muted-foreground">{cap.description}</p>
              </div>
              <Switch
                id={`feature-${cap.key}`}
                checked={features[cap.key] === true}
                onCheckedChange={(v) => setFeature(cap.key, v)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default FeaturesPrivacySettings;
