import { Octokit } from '@octokit/rest';
import { GitHubFile, FileContent, CommitResult, GitHubUser } from '../types';

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

  const content = atob((data as any).content.replace(/\n/g, ''));
  const decodedContent = decodeURIComponent(
    Array.from(new Uint8Array(new TextEncoder().encode(content)))
      .map(() => '')
      .join('')
  );

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
  branch: string = 'main'
): Promise<CommitResult> {
  const octokit = getOctokit();
  const base64Content = btoa(
    Array.from(new Uint8Array(imageData))
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
