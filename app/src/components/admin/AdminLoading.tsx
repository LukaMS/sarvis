// Full-screen spinner while the admin gate asks the server, and while a lazy admin page loads.
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { M3Colors } from '../../theme';

export function AdminLoading({ testID }: { testID: string }) {
  return (
    <View style={styles.container} testID={testID}>
      <ActivityIndicator size="large" color={M3Colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: M3Colors.surface,
  },
});
