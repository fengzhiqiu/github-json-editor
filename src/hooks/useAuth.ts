import { useState, useEffect, useCallback } from 'react';
import { AuthState, GitHubUser } from '../types';
import { initOctokit, getCurrentUser } from '../utils/github';

const TOKEN_KEY = 'github-json-editor-token';

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    token: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    // Check for token in URL (OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');

    if (tokenFromUrl) {
      localStorage.setItem(TOKEN_KEY, tokenFromUrl);
      window.history.replaceState({}, '', window.location.pathname);
      initializeWithToken(tokenFromUrl);
      return;
    }

    // Check localStorage for persisted token
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      initializeWithToken(storedToken);
      return;
    }

    setAuthState({ token: null, user: null, loading: false });
  }, []);

  const initializeWithToken = async (token: string) => {
    try {
      initOctokit(token);
      const user = await getCurrentUser();
      setAuthState({ token, user, loading: false });
    } catch (error) {
      console.error('Failed to authenticate:', error);
      localStorage.removeItem(TOKEN_KEY);
      setAuthState({ token: null, user: null, loading: false });
    }
  };

  const loginWithToken = useCallback(async (token: string) => {
    setAuthState((prev) => ({ ...prev, loading: true }));
    try {
      initOctokit(token);
      const user = await getCurrentUser();
      localStorage.setItem(TOKEN_KEY, token);
      setAuthState({ token, user, loading: false });
    } catch (error) {
      setAuthState({ token: null, user: null, loading: false });
      throw error;
    }
  }, []);

  const loginWithOAuth = useCallback(() => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
    if (!clientId) {
      throw new Error('GitHub OAuth Client ID not configured');
    }
    const redirectUri = `${window.location.origin}/api/auth/callback`;
    const scope = 'repo';
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
    window.location.href = authUrl;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthState({ token: null, user: null, loading: false });
  }, []);

  return {
    ...authState,
    loginWithToken,
    loginWithOAuth,
    logout,
  };
}
