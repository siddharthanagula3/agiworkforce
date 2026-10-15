import { useCallback, useEffect, useState } from 'react';
import { skills } from '@agiworkforce/desktop-command-client';
import { Button } from '@/ui/Button';

type WorkspaceSkillsStatus = skills.WorkspaceSkillsStatus;

function countOf(count: number): string {
  return `${count} skill${count === 1 ? '' : 's'}`;
}

export function WorkspaceSkillsNotice({
  onChanged,
  loadStatus = skills.skillWorkspaceStatus,
  setConsent = skills.skillSetWorkspaceConsent,
}: {
  onChanged?: () => void;
  loadStatus?: () => Promise<WorkspaceSkillsStatus>;
  setConsent?: (consented: boolean) => Promise<WorkspaceSkillsStatus>;
}) {
  const [status, setStatus] = useState<WorkspaceSkillsStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await loadStatus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [loadStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const change = async (consented: boolean) => {
    setSaving(true);
    setError(null);
    setDeclined(false);
    try {
      const next = await setConsent(consented);
      setStatus(next);
      if (next.consented === consented) {
        onChanged?.();
      } else {
        setDeclined(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  if (!status?.skillsDir || status.skillCount === 0) {
    return error ? (
      <p role="alert" className="mb-4 text-sm text-danger-text">
        {error}
      </p>
    ) : null;
  }

  return (
    <section
      aria-labelledby="workspace-skills-title"
      className="mb-4 space-y-2 rounded-lg border border-border p-4"
    >
      <h3 id="workspace-skills-title" className="text-sm font-medium text-foreground">
        {status.consented
          ? `The model can read this project's ${countOf(status.skillCount)}`
          : status.changedSinceConsent
            ? `This project's skills changed since you allowed them`
            : `This project brings ${countOf(status.skillCount)} the model cannot read yet`}
      </h3>
      <p className="break-all font-mono text-sm text-muted-foreground">{status.skillsDir}</p>
      <p className="text-sm text-muted-foreground">
        {status.consented
          ? 'Their instructions are given to the model when it asks for them. Stop this if you no longer trust what the project folder contains.'
          : status.changedSinceConsent
            ? `What you allowed is not what the folder holds now, so the instructions of its ${countOf(status.skillCount)} are withheld again. Allow them only if you trust the change. Your system asks you to confirm and lists the skills.`
            : 'They are listed by name, but their instructions are withheld until you allow them. Instructions in a project you did not write can steer the model, so allow them only for a folder you trust. Your system asks you to confirm and lists the skills.'}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={saving}
        onClick={() => void change(!status.consented)}
      >
        {status.consented ? 'Stop sharing project skills' : 'Allow project skills'}
      </Button>
      {declined ? (
        <p role="status" className="text-sm text-muted-foreground">
          Nothing changed. The model still cannot read these skills.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
    </section>
  );
}
