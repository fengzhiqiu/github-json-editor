export interface RepoConfig {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  label?: string;
}

export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  download_url: string | null;
}

export interface FileContent {
  name: string;
  path: string;
  sha: string;
  content: string;
  encoding: string;
}

export interface CommitResult {
  sha: string;
  url: string;
}

export interface AuthState {
  token: string | null;
  user: GitHubUser | null;
  loading: boolean;
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
}

export interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  title?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  required?: string[];
}
