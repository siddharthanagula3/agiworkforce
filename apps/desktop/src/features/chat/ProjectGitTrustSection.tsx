import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/ui/Button';
import { Label } from '@/ui/Label';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import { invoke } from '../../lib/tauri-mock';
import { formatFolderPath } from '../../stores/projectStore';

export interface TrustedGitSetting {
  key: string;
  value: string;
  origin: string;
}

export function trustProjectGitSettings(projectPath: string): Promise<TrustedGitSetting[]> {
  return invoke<TrustedGitSetting[]>('git_trust_repository_config', { projectPath });
}

function describeTrustedSetting({ key, value, origin }: TrustedGitSetting): string {
  return `${key} = ${value} (${origin})`;
}

export function ProjectGitTrustSection({ projectPath }: { projectPath: string }) {
  const [isTrusting, setIsTrusting] = useState(false);
  const folderLabel = formatFolderPath(projectPath);

  const requestTrust = async () => {
    setIsTrusting(true);
    try {
      const trusted = await trustProjectGitSettings(projectPath);
      if (trusted.length === 0) {
        toast.success('No git settings in this repository run programs');
      } else {
        toast.success(`Trusted ${trusted.length} git settings`, {
          description: (
            <ul className="space-y-1 break-all">
              {trusted.map((setting) => (
                <li key={`${setting.origin}:${setting.key}`}>{describeTrustedSetting(setting)}</li>
              ))}
            </ul>
          ),
        });
      }
    } catch (error) {
      toast.error('The git settings were not trusted', {
        description: getSimpleErrorMessage(error),
      });
    } finally {
      setIsTrusting(false);
    }
  };

  return (
    <section className="space-y-2" aria-labelledby="project-git-trust-heading">
      <Label id="project-git-trust-heading" className="text-foreground">
        Git settings
      </Label>
      <p className="text-sm leading-6 text-muted-foreground">
        The app refuses git settings in{' '}
        <span className="break-all text-foreground" title={projectPath}>
          {folderLabel}
        </span>{' '}
        that run programs, such as filters, diff drivers and config hooks, unless they were there
        when the folder was first opened or you trust them here. Trusted settings run outside the
        sandbox. Before anything is trusted, a system dialog lists each setting and asks you.
      </p>
      <Button
        variant="outline"
        onClick={() => void requestTrust()}
        disabled={isTrusting}
        className="border-border text-foreground hover:bg-accent"
      >
        Trust this project’s git settings
      </Button>
    </section>
  );
}
