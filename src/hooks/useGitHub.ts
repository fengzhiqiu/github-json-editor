import { useState, useCallback } from 'react';
import { RepoConfig, GitHubFile, FileContent, CommitResult } from '../types';
import * as github from '../utils/github';

export function useGitHub() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(async (config: RepoConfig): Promise<GitHubFile[]> => {
    setLoading(true);
    setError(null);
    try {
      const files = await github.listFiles(config.owner, config.repo, config.path, config.branch);
      return files;
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllFiles = useCallback(async (config: RepoConfig): Promise<GitHubFile[]> => {
    setLoading(true);
    setError(null);
    try {
      const files = await github.listAllFiles(config.owner, config.repo, config.path, config.branch);
      return files;
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFileContent = useCallback(
    async (owner: string, repo: string, path: string, branch: string): Promise<FileContent> => {
      setLoading(true);
      setError(null);
      try {
        const content = await github.getFileContent(owner, repo, path, branch);
        return content;
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const saveFile = useCallback(
    async (
      owner: string,
      repo: string,
      path: string,
      content: string,
      sha: string,
      message: string,
      branch: string
    ): Promise<CommitResult> => {
      setLoading(true);
      setError(null);
      try {
        const result = await github.updateFile(owner, repo, path, content, sha, message, branch);
        return result;
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const uploadImage = useCallback(
    async (
      owner: string,
      repo: string,
      path: string,
      imageData: ArrayBuffer,
      message: string,
      branch: string,
      sha?: string
    ): Promise<CommitResult> => {
      setLoading(true);
      setError(null);
      try {
        const result = await github.uploadImage(owner, repo, path, imageData, message, branch, sha);
        return result;
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteFile = useCallback(
    async (
      owner: string,
      repo: string,
      path: string,
      sha: string,
      message: string,
      branch: string
    ): Promise<CommitResult> => {
      setLoading(true);
      setError(null);
      try {
        const result = await github.deleteFile(owner, repo, path, sha, message, branch);
        return result;
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const createDirectory = useCallback(
    async (
      owner: string,
      repo: string,
      dirPath: string,
      message: string,
      branch: string
    ): Promise<CommitResult> => {
      setLoading(true);
      setError(null);
      try {
        const result = await github.createDirectory(owner, repo, dirPath, message, branch);
        return result;
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    error,
    fetchFiles,
    fetchAllFiles,
    fetchFileContent,
    saveFile,
    uploadImage,
    deleteFile,
    createDirectory,
  };
}
