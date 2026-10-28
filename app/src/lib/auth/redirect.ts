// Auth email links (sign-up confirmation, password reset) come back to the app as a URL with the result
// in the fragment: `…#access_token=…&refresh_token=…&type=recovery`, or `…#error=…&error_description=…`
// when the link was used or has expired (D-028). Pure parsing, so it's unit tested.

export interface AuthRedirect {
  /** Supabase's link type: 'recovery', 'signup', 'magiclink', … Null when the link didn't say. */
  type: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Set when Supabase refused the link, e.g. "Email link is invalid or has expired". */
  errorDescription: string | null;
}

function params(url: string): URLSearchParams {
  const hashAt = url.indexOf('#');
  const queryAt = url.indexOf('?');
  const merged = new URLSearchParams();
  // Supabase puts the result in the fragment; errors from older servers can arrive in the query.
  if (queryAt !== -1) {
    const end = hashAt > queryAt ? hashAt : url.length;
    new URLSearchParams(url.slice(queryAt + 1, end)).forEach((v, k) => merged.set(k, v));
  }
  if (hashAt !== -1) {
    new URLSearchParams(url.slice(hashAt + 1)).forEach((v, k) => merged.set(k, v));
  }
  return merged;
}

/** Returns the auth result carried by `url`, or null when it isn't an auth email link. */
export function parseAuthRedirect(url: string | null | undefined): AuthRedirect | null {
  if (!url) return null;
  const p = params(url);
  const accessToken = p.get('access_token');
  const refreshToken = p.get('refresh_token');
  const error = p.get('error_description') ?? p.get('error');
  if (!(accessToken && refreshToken) && !error) return null;
  return {
    type: p.get('type'),
    accessToken: error ? null : accessToken,
    refreshToken: error ? null : refreshToken,
    errorDescription: error,
  };
}
