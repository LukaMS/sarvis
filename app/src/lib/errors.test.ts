import { describe, expect, it } from 'vitest';

import { toFriendlyError, toUserMessage } from './errors';

describe('toFriendlyError', () => {
  it('maps a wrong password', () => {
    const e = toFriendlyError(new Error('Invalid login credentials'));
    expect(e).toMatchObject({
      kind: 'auth',
      title: 'Incorrect email or password',
      retryable: false,
    });
  });

  it('maps offline failures from fetch and React Native', () => {
    expect(toFriendlyError(new TypeError('Failed to fetch')).kind).toBe('offline');
    expect(toFriendlyError('Network request failed').kind).toBe('offline');
  });

  it('maps rate limits as retryable', () => {
    const e = toFriendlyError({
      message: 'For security purposes, you can only request this after 30 seconds.',
    });
    expect(e).toMatchObject({ kind: 'auth', title: 'Too many attempts', retryable: true });
  });

  it('maps used or expired email links and a missing session', () => {
    expect(toFriendlyError(new Error('Email link is invalid or has expired'))).toMatchObject({
      kind: 'auth',
      title: 'That link has expired',
      retryable: false,
    });
    expect(toFriendlyError(new Error('Auth session missing!'))).toMatchObject({
      kind: 'auth',
      title: "You're signed out",
    });
  });

  it('maps RLS and not-found errors', () => {
    expect(toFriendlyError('new row violates row-level security policy').kind).toBe('permission');
    expect(toFriendlyError('no rows returned').kind).toBe('notFound');
  });

  it('never passes an unknown raw message through', () => {
    const e = toFriendlyError(new Error('pg: relation "x" does not exist'));
    expect(e.kind).toBe('unknown');
    expect(toUserMessage(new Error('pg: relation "x" does not exist'))).toBe(
      'Please try again in a moment.',
    );
  });

  it('joins title and message for known errors', () => {
    expect(toUserMessage(new Error('Email not confirmed'))).toBe(
      'Confirm your email first. We sent you a confirmation link when you signed up. Open it, then sign in again.',
    );
  });
});
