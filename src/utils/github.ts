import { Octokit } from '@octokit/rest';
import { GitHubFile, FileContent, CommitResult, GitHubUser, GitHubRepo, GitHubContentItem } from '../types';

let octokitInstance: Octokit | null = null;

export function initOctokit(token: string): Octokit {
  octokitInstance = new Octokit({ auth: token });
  return octokitInstance;
}

export function getOctokit(): Octokit {
  if (!octokitInstance) {
    throw new Error('Octokit not initialized. Please login first.');
  }
  return octokitInstance;
}

export async function getCurrentUser(): Promise<GitHubUser> {
  const octokit = getOctokit();
  const { data } = await octokit.users.getAuthenticated();
  return {
    login: data.login,
    avatar_url: data.avatar_url,
    name: data.name,
  };
}

export async function listUserRepos(
  page: number = 1,
  perPage: number = 30
): Promise<{ repos: GitHubRepo[]; hasMore: boolean }> {
  const octokit = getOctokit();
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: 'updated',
    direction: 'desc',
    per_page: perPage,
    page,
  });

  const repos: GitHubRepo[] = data.map((repo) => ({
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    owner: {
      login: repo.owner.login,
      avatar_url: repo.owner.avatar_url,
    },
    description: repo.description,
    private: repo.private,
    default_branch: repo.default_branch,
    updated_at: repo.updated_at || '',
    html_url: repo.html_url,
    language: repo.language,
  }));

  return {
    repos,
    hasMore: repos.length === perPage,
  };
}

export async function listContents(
  owner: string,
  repo: string,
  path: string = '',
  branch?: string
): Promise<GitHubContentItem[]> {
  const octokit = getOctokit();
  const params: any = { owner, repo, path };
  if (branch) {
    params.ref = branch;
  }
  const { data } = await octokit.repos.getContent(params);

  if (!Array.isArray(data)) {
    throw new Error('Path is not a directory');
  }

  return data.map((item) => ({
    name: item.name,
    path: item.path,
    sha: item.sha,
    size: item.size || 0,
    type: item.type as GitHubContentItem['type'],
    download_url: item.download_url,
  }));
}

export async function listFiles(
  owner: string,
  repo: string,
  path: string,
  branch: string = 'main'
): Promise<GitHubFile[]> {
  const octokit = getOctokit();
  const { data } = await octokit.repos.getContent({
    owner,
    repo,
    path,
    ref: branch,
  });

  if (!Array.isArray(data)) {
    throw new Error('Path is not a directory');
  }

  return data
    .filter((item) => item.type === 'file' && item.name.endsWith('.json'))
    .map((item) => ({
      name: item.name,
      path: item.path,
      sha: item.sha,
      size: item.size || 0,
      type: item.type as 'file' | 'dir',
      download_url: item.download_url,
    }));
}

export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string = 'main'
): Promise<FileContent> {
  const octokit = getOctokit();
  const { data } = await octokit.repos.getContent({
    owner,
    repo,
    path,
    ref: branch,
  });

  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error('Path is not a file');
  }

  // Use TextDecoder for proper UTF-8 handling
  const rawContent = Uint8Array.from(atob((data as any).content.replace(/\n/g, '')), (c) =>
    c.charCodeAt(0)
  );
  const textContent = new TextDecoder('utf-8').decode(rawContent);

  return {
    name: data.name,
    path: data.path,
    sha: data.sha,
    content: textContent,
    encoding: 'utf-8',
  };
}

export async function updateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  sha: string,
  message: string,
  branch: string = 'main'
): Promise<CommitResult> {
  const octokit = getOctokit();
  // Encode content as base64 with UTF-8 support
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(content);
  const base64Content = btoa(
    Array.from(uint8Array)
      .map((byte) => String.fromCharCode(byte))
      .join('')
  );

  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: base64Content,
    sha,
    branch,
  });

  return {
    sha: data.commit.sha || '',
    url: data.commit.html_url || '',
  };
}

export async function createFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string = 'main'
): Promise<CommitResult> {
  const octokit = getOctokit();
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(content);
  const base64Content = btoa(
    Array.from(uint8Array)
      .map((byte) => String.fromCharCode(byte))
      .join('')
  );

  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: base64Content,
    branch,
  });

  return {
    sha: data.commit.sha || '',
    url: data.commit.html_url || '',
  };
}

export async function uploadImage(
  owner: string,
  repo: string,
  path: string,
  imageData: ArrayBuffer,
  message: string,
  branch: string = 'main',
  sha?: string
): Promise<CommitResult> {
  const octokit = getOctokit();
  const base64Content = btoa(
    Array.from(new Uint8Array(imageData))
      .map((byte) => String.fromCharCode(byte))
      .join('')
  );

  // GitHub API rejects paths starting with /
  const cleanPath = path.replace(/^\/+/, '');

  const params: any = {
    owner,
    repo,
    path: cleanPath,
    message,
    content: base64Content,
    branch,
  };
  if (sha) {
    params.sha = sha;
  }

  try {
    const { data } = await octokit.repos.createOrUpdateFileContents(params);
    return {
      sha: data.commit.sha || '',
      url: data.commit.html_url || '',
    };
  } catch (e: any) {
    // 409 Conflict: file already exists but sha not provided. Fetch sha and retry.
    if (e.status === 409 && !sha) {
      const { data: existing } = await octokit.repos.getContent({
        owner,
        repo,
        path: cleanPath,
        ref: branch,
      });
      const existingSha = Array.isArray(existing) ? undefined : (existing as any).sha;
      if (existingSha) {
        params.sha = existingSha;
        const { data } = await octokit.repos.createOrUpdateFileContents(params);
        return {
          sha: data.commit.sha || '',
          url: data.commit.html_url || '',
        };
      }
    }
    throw e;
  }
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

export function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export async function listAllFiles(
  owner: string,
  repo: string,
  path: string,
  branch: string = 'main'
): Promise<GitHubFile[]> {
  const octokit = getOctokit();
  const { data } = await octokit.repos.getContent({
    owner,
    repo,
    path,
    ref: branch,
  });

  if (!Array.isArray(data)) {
    throw new Error('Path is not a directory');
  }

  return data
    .filter((item) => item.type === 'file')
    .map((item) => ({
      name: item.name,
      path: item.path,
      sha: item.sha,
      size: item.size || 0,
      type: item.type as 'file' | 'dir',
      download_url: item.download_url,
    }));
}

export async function deleteFile(
  owner: string,
  repo: string,
  path: string,
  sha: string,
  message: string,
  branch: string = 'main'
): Promise<CommitResult> {
  const octokit = getOctokit();
  const { data } = await octokit.repos.deleteFile({
    owner,
    repo,
    path,
    message,
    sha,
    branch,
  });

  return {
    sha: data.commit.sha || '',
    url: data.commit.html_url || '',
  };
}
