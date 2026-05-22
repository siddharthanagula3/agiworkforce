import type { ProjectRole } from '@/lib/types';

const roleRank: Record<ProjectRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function canManageProject(role: ProjectRole): boolean {
  return roleRank[role] >= roleRank.admin;
}

export function canWriteTasks(role: ProjectRole): boolean {
  return roleRank[role] >= roleRank.member;
}

export function canViewProject(role: ProjectRole): boolean {
  return roleRank[role] >= roleRank.viewer;
}
