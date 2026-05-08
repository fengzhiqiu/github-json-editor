import { RepoConfig } from '../types';

const STORAGE_KEY = 'github-json-editor-repos';

export const defaultRepos: RepoConfig[] = [
  {
    id: 'ckd-manage-data',
    owner: 'fengzhiqiu',
    repo: 'minigrogram-ckd-manage',
    branch: 'main',
    path: 'data',
    label: 'CKD 管理 - 数据',
  },
];

export function getRepos(): RepoConfig[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return defaultRepos;
    }
  }
  return defaultRepos;
}

export function saveRepos(repos: RepoConfig[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(repos));
}
