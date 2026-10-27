// Sign in / sign up (SPEC F1, baseline 01 and 02). Leaving this screen is the root layout's job: once a
// session exists its guard swaps /auth for the tabs, so nothing here navigates.
import { Ionicons } from '@expo/vector-icons';
import { APP_NAME } from '@sarvis/core';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/ui/Button';
import {
  PASSWORD_MIN_LENGTH,
  isValidEmail,
  resendConfirmationEmail,
  resetPassword,
  signInWithEmail,
  signUpWithEmail,
} from '../lib/auth/service';
import { toUserMessage } from '../lib/errors';
import { FontWeight, M3Colors, Radius, Spacing, Typography } from '../theme';

type Mode = 'sign-in' | 'sign-up';

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** The address a sign-up is waiting on, when Supabase withheld the session until it's confirmed. */
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  /** A stale error above an unrelated action is worse than none, so edits and mode switches clear it. */
  function clearMessages() {
    setError(null);
    setInfo(null);
  }

  function showError(message: string) {
    setError(message);
    setInfo(null);
  }

  function switchMode() {
    clearMessages();
    setMode((m) => (m === 'sign-in' ? 'sign-up' : 'sign-in'));
  }

  function validate(): string | null {
    if (!email.trim()) return 'Enter your email address.';
    if (!isValidEmail(email)) {
      return "That email doesn't look right. Use a full address like you@example.com.";
    }
    if (!password) return 'Enter your password.';
    if (mode === 'sign-up' && password.length < PASSWORD_MIN_LENGTH) {
      return `Your password needs at least ${PASSWORD_MIN_LENGTH} characters.`;
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      showError(validationError);
      return;
    }

    setLoading(true);
    clearMessages();
    try {
      if (mode === 'sign-up') {
        const result = await signUpWithEmail(email, password, name);
        if (result.needsEmailConfirmation) setAwaitingConfirmation(email.trim());
      } else {
        await signInWithEmail(email, password);
      }
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!awaitingConfirmation) return;
    setResending(true);
    clearMessages();
    try {
      await resendConfirmationEmail(awaitingConfirmation);
      setInfo('Confirmation email sent again. It can take a minute to arrive.');
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setResending(false);
    }
  }

  async function handleForgotPassword() {
    if (!isValidEmail(email)) {
      showError('Enter your email address above first, then tap Forgot password.');
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      await resetPassword(email);
      setInfo(`Password reset link sent to ${email.trim()}. Check your inbox.`);
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const messages = (
    <>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite" testID="auth-error">
          {error}
        </Text>
      ) : null}
      {info ? (
        <Text style={styles.info} accessibilityLiveRegion="polite" testID="auth-info">
          {info}
        </Text>
      ) : null}
    </>
  );

  if (awaitingConfirmation) {
    return (
      <View
        style={[styles.container, styles.confirmContainer, { paddingTop: insets.top + 24 }]}
        testID="auth-confirm"
      >
        <View style={styles.confirmIcon}>
          <Ionicons name="mail-outline" size={38} color={M3Colors.primary} />
        </View>
        <Text style={styles.title}>Check your inbox</Text>
        <Text style={styles.confirmBody}>
          We sent a confirmation link to{'\n'}
          <Text style={styles.confirmEmail} testID="auth-confirm-email">
            {awaitingConfirmation}
          </Text>
          {'\n\n'}Open it to finish setting up your account, then come back and sign in.
        </Text>

        {messages}

        <Button
          label="Resend email"
          onPress={handleResend}
          shape="block"
          loading={resending}
          accessibilityLabel="Resend confirmation email"
          style={styles.confirmButton}
          testID="auth-resend"
        />
        <Pressable
          onPress={() => {
            setAwaitingConfirmation(null);
            setMode('sign-in');
            clearMessages();
          }}
          hitSlop={12}
          accessibilityRole="button"
          testID="auth-back-to-sign-in"
        >
          <Text style={styles.toggleText}>Back to sign in</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setAwaitingConfirmation(null);
            setMode('sign-up');
            clearMessages();
          }}
          hitSlop={12}
          accessibilityRole="button"
          testID="auth-different-email"
        >
          <Text style={styles.mutedLink}>Use a different email address</Text>
        </Pressable>
      </View>
    );
  }

  const signingUp = mode === 'sign-up';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      testID="screen-auth"
    >
      <ScrollView
        contentContainerStyle={[
          styles.inner,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Ionicons
          name="leaf"
          size={48}
          color={M3Colors.primary}
          style={styles.logo}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={styles.title} testID="auth-title">
          {APP_NAME}
        </Text>
        <Text style={styles.subtitle} testID="auth-subtitle">
          {signingUp ? 'Create your account' : 'Welcome back'}
        </Text>

        {signingUp ? (
          <TextInput
            style={styles.input}
            placeholder="Display name (optional)"
            placeholderTextColor={M3Colors.outline}
            value={name}
            onChangeText={(t) => {
              setName(t);
              clearMessages();
            }}
            autoCapitalize="words"
            accessibilityLabel="Display name"
            returnKeyType="next"
            testID="auth-name"
          />
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={M3Colors.outline}
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            clearMessages();
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          accessibilityLabel="Email address"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
          testID="auth-email"
        />

        <View style={styles.passwordRow}>
          <TextInput
            ref={passwordRef}
            style={[styles.input, styles.passwordInput]}
            placeholder="Password"
            placeholderTextColor={M3Colors.outline}
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              clearMessages();
            }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType={signingUp ? 'newPassword' : 'password'}
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            accessibilityLabel="Password"
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
            testID="auth-password"
          />
          <Pressable
            style={styles.passwordToggle}
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            testID="auth-password-toggle"
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={M3Colors.onSurfaceVariant}
            />
          </Pressable>
        </View>

        {signingUp ? (
          <Text style={styles.hint} testID="auth-hint">
            At least {PASSWORD_MIN_LENGTH} characters.
          </Text>
        ) : null}

        {messages}

        {!signingUp ? (
          <Pressable
            onPress={handleForgotPassword}
            disabled={loading}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
            testID="auth-forgot"
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
        ) : null}

        <Button
          label={signingUp ? 'Create Account' : 'Sign In'}
          onPress={handleSubmit}
          shape="block"
          loading={loading}
          testID="auth-submit"
        />

        <Pressable
          onPress={switchMode}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={signingUp ? 'Switch to signing in' : 'Switch to creating an account'}
          testID="auth-toggle-mode"
        >
          <Text style={styles.toggleText}>
            {signingUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: M3Colors.surface,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.screenGutter,
    gap: 12,
  },
  confirmContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  confirmIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: M3Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  confirmBody: {
    fontSize: 15,
    color: M3Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },
  confirmEmail: { fontWeight: FontWeight.bold, color: M3Colors.onSurface },
  confirmButton: { marginTop: 12 },
  logo: { alignSelf: 'center', marginBottom: 4 },
  title: {
    ...Typography.authTitle,
    color: M3Colors.onSurface,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: M3Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 12,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: M3Colors.outlineVariant,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    fontSize: 16,
    color: M3Colors.onSurface,
    backgroundColor: M3Colors.surfaceContainerLow,
  },
  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingRight: 48 },
  passwordToggle: {
    position: 'absolute',
    right: 8,
    height: 44,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: 12,
    color: M3Colors.outline,
    marginTop: -4,
    marginLeft: 4,
  },
  error: {
    color: M3Colors.error,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  info: {
    color: M3Colors.primary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  forgotText: {
    color: M3Colors.onSurfaceVariant,
    textAlign: 'right',
    fontSize: 13,
    textDecorationLine: 'underline',
    paddingVertical: 4,
  },
  toggleText: {
    color: M3Colors.primary,
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: 8,
  },
  mutedLink: {
    color: M3Colors.outline,
    textAlign: 'center',
    fontSize: 13,
    paddingVertical: 6,
  },
});
