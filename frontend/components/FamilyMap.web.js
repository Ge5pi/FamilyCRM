import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { THEME } from '../theme';

/**
 * Web build: react-native-maps has no web implementation, so the browser
 * version shows the coordinate list (rendered by LocatorScreen) instead.
 */
export default function FamilyMap() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderIcon}>🗺️</Text>
      <Text style={styles.placeholderTitle}>Карта доступна в мобильном приложении</Text>
      <Text style={styles.placeholderHint}>
        Откройте FamilyCRM на iOS или Android, чтобы увидеть членов семьи на карте.
        Координаты ниже доступны и в вебе.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: 150,
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  placeholderIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  placeholderTitle: {
    fontWeight: 'bold',
    fontSize: 13,
    color: THEME.colors.text,
    textAlign: 'center',
  },
  placeholderHint: {
    fontSize: 10,
    color: THEME.colors.textLight,
    textAlign: 'center',
    marginTop: 4,
  },
});
