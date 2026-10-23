import type { GitAuth } from 'isomorphic-git';

/**
 * GitHub token storage for pushing from the browser.
 *
 * The token is stored in this browser's localStorage only. It is sent to
 * github.com only, always over HTTPS, and only via the isomorphic-git CORS proxy
 * (a public third-party relay) because git endpoints such as github.com do not
 * send CORS headers. Use a fine-grained token with the smallest scopes you can
 * live with and revoke it when done.
 */

const TOKEN_KEY = 'openbor-stats-git-token';
const USER_KEY = 'openbor-stats-git-user';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function getStoredUsername(): string | null {
  try {
    return localStorage.getItem(USER_KEY) || null;
  } catch {
    return null;
  }
}

/** Save or clear the stored credentials. Pass null to clear the token. */
export function setStoredCredentials(username: string | null, token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
    if (username === null) localStorage.removeItem(USER_KEY);
    else localStorage.setItem(USER_KEY, username);
  } catch {
    // Storage may be unavailable in private sessions; pushing will simply fail auth.
  }
}

export function hasStoredToken(): boolean {
  return Boolean(getStoredToken());
}

/** Masked display such as "****abcd", or null when nothing is configured. */
export function maskedToken(): string | null {
  const token = getStoredToken();
  if (!token) return null;
  return `****${token.slice(-4)}`;
}

/**
 * The isomorphic-git onAuth callback: GitHub PATs authenticate as the account
 * username with the token as the password.
 */
export function onAuthCallback(): (url: string, auth: object | undefined) => GitAuth | void {
  return () => {
    const token = getStoredToken();
    const username = getStoredUsername();
    if (!token) return undefined;
    return {
      username: username || 'OpenBOR-Stats',
      password: token,
    };
  };
}

/** True when a URL points at a git smart-HTTP remote usable with a token. */
export function needsToken(url: string): boolean {
  return /github\.com|gitlab\.com|bitbucket\.org/.test(url);
}
