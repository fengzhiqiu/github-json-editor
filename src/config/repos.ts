import { RepoConfig } from '../types';

const RECENT_KEY_PREFIX = 'github-json-editor-recent-';

/**
 * Get the storage key for a specific user's recent repos
 */
function getStorageKey(login: string): string {
  return `${RECENT_KEY_PREFIX}${login}`;
}

/**
 * Get recent repos for a specific user
 */
export function getRecentRepos(login: string): RepoConfig[] {
  const key = getStorageKey(login);
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Save a repo config as recently used (add to front, deduplicate, max 10)
 */
export function addRecentRepo(login: string, repo: RepoConfig): void {
  const recent = getRecentRepos(login);
  // Remove if already exists (by matching owner/repo/path)
  const filtered = recent.filter(
    (r) => !(r.owner === repo.owner && r.repo === repo.repo && r.path === repo.path)
  );
  // Add to front
  const updated = [repo, ...filtered].slice(0, 10);
  const key = getStorageKey(login);
  localStorage.setItem(key, JSON.stringify(updated));
}

/**
 * Remove a recent repo entry
 */
export function removeRecentRepo(login: string, id: string): void {
  const recent = getRecentRepos(login);
  const filtered = recent.filter((r) => r.id !== id);
  const key = getStorageKey(login);
  localStorage.setItem(key, JSON.stringify(filtered));
}

/**
 * Legacy: get repos stored in old format (for migration)
 */
export function getLegacyRepos(): RepoConfig[] {
  const stored = localStorage.getItem('github-json-editor-repos');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  return [];
}
