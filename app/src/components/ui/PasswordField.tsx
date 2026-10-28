// The auth screens' password input with its show/hide toggle (baseline 01 and 02).
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { M3Colors } from '../../theme';
import { authInputStyle } from './authInputStyle';

interface PasswordFieldProps extends Pick<
  TextInputProps,
  'value' | 'onChangeText' | 'onSubmitEditing' | 'returnKeyType' | 'placeholder'
> {
  /** 'new' for sign-up and reset (password managers offer to generate one); 'current' for sign-in. */
  purpose: 'new' | 'current';
  accessibilityLabel?: string;
  /** The input's testID; the toggle gets `${testID}-toggle`. */
  testID: string;
}

export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(function PasswordField(
  { purpose, placeholder = 'Password', accessibilityLabel = 'Password', testID, ...input },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const isNew = purpose === 'new';
  return (
    <View style={styles.row}>
      <TextInput
        ref={ref}
        style={[authInputStyle, styles.input]}
        placeholder={placeholder}
        placeholderTextColor={M3Colors.outline}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={isNew ? 'newPassword' : 'password'}
        autoComplete={isNew ? 'new-password' : 'current-password'}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        {...input}
      />
      <Pressable
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        testID={`${testID}-toggle`}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={M3Colors.onSurfaceVariant}
        />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { justifyContent: 'center' },
  input: { paddingRight: 48 },
  toggle: {
    position: 'absolute',
    right: 8,
    height: 44,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
