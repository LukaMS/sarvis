import { describe, expect, it } from 'vitest';

import { parseAuthRedirect } from './redirect';

describe('parseAuthRedirect', () => {
  it('reads a recovery link on web', () => {
    expect(
      parseAuthRedirect(
        'http://localhost:8081/#access_token=at&expires_in=3600&refresh_token=rt&token_type=bearer&type=recovery',
      ),
    ).toEqual({ type: 'recovery', accessToken: 'at', refreshToken: 'rt', errorDescription: null });
  });

  it('reads Expo Go and app-scheme links', () => {
    expect(
      parseAuthRedirect('exp://127.0.0.1:8081/--/#access_token=a&refresh_token=r&type=recovery'),
    ).toMatchObject({ type: 'recovery', accessToken: 'a', refreshToken: 'r' });
    expect(parseAuthRedirect('sarvis://#access_token=a&refresh_token=r&type=signup')).toMatchObject(
      { type: 'signup', accessToken: 'a', refreshToken: 'r' },
    );
  });

  it('reports an expired or used link', () => {
    expect(
      parseAuthRedirect(
        'http://localhost:8081/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toEqual({
      type: null,
      accessToken: null,
      refreshToken: null,
      errorDescription: 'Email link is invalid or has expired',
    });
    expect(parseAuthRedirect('http://localhost:8081/?error=access_denied')).toMatchObject({
      errorDescription: 'access_denied',
    });
  });

  it('ignores ordinary URLs', () => {
    expect(parseAuthRedirect(null)).toBeNull();
    expect(parseAuthRedirect('http://localhost:8081/product/42?tab=brands')).toBeNull();
    expect(parseAuthRedirect('exp://127.0.0.1:8081/--/settings')).toBeNull();
    // A lone access token isn't enough to sign in.
    expect(parseAuthRedirect('http://localhost:8081/#access_token=a')).toBeNull();
  });
});
