// Placeholder home screen. Renders a constant from @sarvis/core to prove workspace resolution.
import { APP_NAME } from '@sarvis/core';
import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.container} testID="placeholder-home">
      <Text style={styles.title} testID="placeholder-home-title">
        {APP_NAME}
      </Text>
      <Text style={styles.subtitle}>Rebuild in progress</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#666666',
  },
});
