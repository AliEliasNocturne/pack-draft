import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useDatabaseMigrations } from './src/db/migrate';

export default function App() {
  const { success, error } = useDatabaseMigrations();

  if (error) {
    return (
      <View style={styles.container}>
        <Text>Migration error: {error.message}</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (!success) {
    return (
      <View style={styles.container}>
        <Text>Loading…</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text>Hello!</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
