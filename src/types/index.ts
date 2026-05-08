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

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string | null;
  private: boolean;
  default_branch: string;
  updated_at: string;
  html_url: string;
  language: string | null;
}

export interface GitHubContentItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  download_url: string | null;
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
