import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function SimplePage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Simple Page</Text>
      <Text style={styles.subtitle}>If you can see this, routing works.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#444444',
  },
});
