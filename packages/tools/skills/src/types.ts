
export type SkillSource =
  | 'bundled'
  | 'managed-local'
  | 'personal'
  | 'project'
  | 'workspace'
  | 'extra';

export interface SkillMetadata {
  always?: boolean;
  skillKey?: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  os?: string[];
  requires?: {
    bins?: string[];
    anyBins?: string[];
    tools?: string[];
    env?: string[];
    config?: string[];
  };
}

export interface Skill {
  name: string;
  description: string;
  body: string;
  version?: string;
  contentHash: string;
  treeHash?: string;
  filePath: string;
  source: SkillSource;
  metadata: SkillMetadata;
  frontmatter: Record<string, unknown>;
}

export interface SkillLayer {
  rootDir: string;
  source: SkillSource;
}
