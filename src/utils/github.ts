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

// Delay helper
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
      const status = e.status || e.response?.status;

      // 409 Conflict: either git ref race or file already exists
      if (status === 409) {
        if (!sha) {
          // Try fetching existing file sha
          try {
            const { data: existing } = await octokit.repos.getContent({
              owner,
              repo,
              path: cleanPath,
              ref: branch,
            });
            const existingSha = Array.isArray(existing) ? undefined : (existing as any).sha;
            if (existingSha) {
              sha = existingSha;
              // Retry immediately with sha
              continue;
            }
          } catch {
            // File doesn't exist — this is a git ref race, retry with delay
          }
        }
        // Git ref race condition — wait and retry
        if (attempt < MAX_RETRIES) {
          await delay(1000 * (attempt + 1)); // 1s, 2s, 3s
          continue;
        }
      }

      // 422 Unprocessable: often means the file exists (sha required) or ref conflict
      if (status === 422) {
        if (!sha) {
          try {
            const { data: existing } = await octokit.repos.getContent({
              owner,
              repo,
              path: cleanPath,
              ref: branch,
            });
            const existingSha = Array.isArray(existing) ? undefined : (existing as any).sha;
            if (existingSha) {
              sha = existingSha;
              if (attempt < MAX_RETRIES) {
                await delay(500);
                continue;
              }
            }
          } catch {
            // File doesn't exist, might be a transient error
          }
        }
        if (attempt < MAX_RETRIES) {
          await delay(1000 * (attempt + 1));
          continue;
        }
      }

      throw e;
    }
  }

  throw new Error(`Failed to upload ${cleanPath} after ${MAX_RETRIES} retries`);
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

  // Return both files and directories, dirs first
  const items = data.map((item) => ({
    name: item.name,
    path: item.path,
    sha: item.sha,
    size: item.size || 0,
    type: item.type as 'file' | 'dir',
    download_url: item.download_url,
  }));

  // Sort: directories first, then files
  items.sort((a, b) => {
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;
    return a.name.localeCompare(b.name);
  });

  return items;
}

export async function createDirectory(
  owner: string,
  repo: string,
  dirPath: string,
  message: string,
  branch: string = 'main'
): Promise<CommitResult> {
  // GitHub doesn't have a "create directory" API — we create a .gitkeep file inside
  const keepPath = `${dirPath.replace(/\/+$/, '')}/.gitkeep`;
  const octokit = getOctokit();
  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: keepPath,
    message,
    content: '', // empty file
    branch,
  });

  return {
    sha: data.commit.sha || '',
    url: data.commit.html_url || '',
  };
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

/**
 * Rename a file by creating it at the new path and deleting the old one.
 * Uses a single-branch ref to minimize race conditions.
 */
export async function renameFile(
  owner: string,
  repo: string,
  oldPath: string,
  newPath: string,
  message: string,
  branch: string = 'main'
): Promise<CommitResult> {
  const octokit = getOctokit();

  // 1. Get existing file content + sha
  const { data: fileData } = await octokit.repos.getContent({
    owner,
    repo,
    path: oldPath,
    ref: branch,
  });

  if (Array.isArray(fileData) || fileData.type !== 'file') {
    throw new Error('Path is not a file');
  }

  const content = (fileData as any).content as string;
  const oldSha = fileData.sha;

  // 2. Create file at new path
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: newPath,
    message: message + ' (create)',
    content: content.replace(/\n/g, ''), // base64 without newlines
    branch,
  });

  // Small delay to let GitHub process
  await delay(500);

  // 3. Delete old file
  const { data: delData } = await octokit.repos.deleteFile({
    owner,
    repo,
    path: oldPath,
    message: message + ' (remove old)',
    sha: oldSha,
    branch,
  });

  return {
    sha: delData.commit.sha || '',
    url: delData.commit.html_url || '',
  };
}
