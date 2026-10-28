// The one boundary between backend errors and text a person reads (SPEC › Error copy). Supabase and
// fetch errors are diagnostics, not copy: every user-visible error goes through toFriendlyError.

export type ErrorKind = 'offline' | 'auth' | 'permission' | 'notFound' | 'unknown';

/** User-facing error copy. */
export interface FriendlyError {
  kind: ErrorKind;
  /** Short headline for the title. */
  title: string;
  /** One or two sentences telling the user what to do next. */
  message: string;
  /** False when retrying can't help (e.g. a wrong password). */
  retryable: boolean;
}

function rawMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const maybe = error as { message?: unknown; error_description?: unknown };
  if (typeof maybe.message === 'string') return maybe.message;
  if (typeof maybe.error_description === 'string') return maybe.error_description;
  return '';
}

/** True when the request never reached the server. React Native reports `Network request failed`. */
export function isOfflineError(error: unknown): boolean {
  const msg = rawMessage(error).toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('unable to resolve host')
  );
}

const TOO_MANY_ATTEMPTS = {
  title: 'Too many attempts',
  message: 'Please wait a minute before trying again.',
  retryable: true,
};

/** Known Supabase auth strings. Matched by substring because Supabase varies the exact wording. */
const AUTH_MESSAGES: { match: string; result: Omit<FriendlyError, 'kind'> }[] = [
  {
    match: 'invalid login credentials',
    result: {
      title: 'Incorrect email or password',
      message:
        "Double-check both and try again. If you've forgotten your password, use the reset link.",
      retryable: false,
    },
  },
  {
    match: 'email not confirmed',
    result: {
      title: 'Confirm your email first',
      message: 'We sent you a confirmation link when you signed up. Open it, then sign in again.',
      retryable: false,
    },
  },
  {
    match: 'user already registered',
    result: {
      title: 'That email is already registered',
      message: 'Try signing in instead, or reset your password.',
      retryable: false,
    },
  },
  {
    match: 'provider is not enabled',
    result: {
      title: "That sign-in method isn't available",
      message: 'Please sign in with your email and password instead.',
      retryable: false,
    },
  },
  {
    match: 'unable to validate email address',
    result: {
      title: "That email doesn't look right",
      message: 'Check for typos and enter a full address like you@example.com.',
      retryable: false,
    },
  },
  {
    match: 'password should be at least',
    result: {
      title: 'Password is too short',
      message: 'Use at least 8 characters.',
      retryable: false,
    },
  },
  { match: 'for security purposes', result: TOO_MANY_ATTEMPTS },
  { match: 'rate limit', result: TOO_MANY_ATTEMPTS },
  {
    match: 'new password should be different',
    result: {
      title: 'Choose a different password',
      message: 'Your new password must not match your current one.',
      retryable: false,
    },
  },
  {
    match: 'email link is invalid or has expired',
    result: {
      title: 'That link has expired',
      message: 'Email links work once and expire after an hour. Request a new one below.',
      retryable: false,
    },
  },
  {
    match: 'auth session missing',
    result: {
      title: "You're signed out",
      message: 'Open the link from your email again, or request a new one.',
      retryable: false,
    },
  },
  {
    match: 'not authenticated',
    result: {
      title: "You're signed out",
      message: 'Sign in again to continue.',
      retryable: false,
    },
  },
];

/** Classify any thrown value into something safe to render. */
export function toFriendlyError(error: unknown): FriendlyError {
  if (isOfflineError(error)) {
    return {
      kind: 'offline',
      title: 'You appear to be offline',
      message:
        "Check your connection and try again. Content you've already viewed is still available.",
      retryable: true,
    };
  }

  const msg = rawMessage(error).toLowerCase();

  for (const entry of AUTH_MESSAGES) {
    if (msg.includes(entry.match)) return { kind: 'auth', ...entry.result };
  }

  if (msg.includes('row-level security') || msg.includes('permission denied')) {
    return {
      kind: 'permission',
      title: "You don't have access to that",
      message: 'Try signing out and back in.',
      retryable: false,
    };
  }

  if (msg.includes('no rows') || msg.includes('not found')) {
    return {
      kind: 'notFound',
      title: "We couldn't find that",
      message: 'It may have been removed.',
      retryable: false,
    };
  }

  return {
    kind: 'unknown',
    title: 'Something went wrong',
    message: 'Please try again in a moment.',
    retryable: true,
  };
}

/** One sentence (or two) for inline form errors. */
export function toUserMessage(error: unknown): string {
  const friendly = toFriendlyError(error);
  return friendly.kind === 'unknown' ? friendly.message : `${friendly.title}. ${friendly.message}`;
}
