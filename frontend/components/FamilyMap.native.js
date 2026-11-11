import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { THEME } from '../theme';

function buildRegion(located) {
  const lats = located.map((member) => member.latitude);
  const lngs = located.map((member) => member.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    // Keep a sensible zoom even when everyone is at the same point.
    latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.6),
  };
}

export default function FamilyMap({ members, currentUserId }) {
  const located = useMemo(
    () =>
      (members || []).filter(
        (member) =>
          typeof member.latitude === 'number' && typeof member.longitude === 'number'
      ),
    [members]
  );

  const region = useMemo(() => buildRegion(located), [located]);

  if (!located.length) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderIcon}>🗺️</Text>
        <Text style={styles.placeholderTitle}>Пока нет координат</Text>
        <Text style={styles.placeholderHint}>
          Нажмите «Отправить мою геопозицию», чтобы появиться на карте семьи.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <MapView style={styles.map} initialRegion={region}>
        {located.map((member) => (
          <Marker
            key={member.id}
            coordinate={{
              latitude: member.latitude,
              longitude: member.longitude,
            }}
            title={member.name}
            description={member.role === 'Parent' ? 'Родитель' : 'Ребёнок'}
            pinColor={
              member.id === currentUserId ? THEME.colors.primary : THEME.colors.danger
            }
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 220,
    borderRadius: THEME.roundness.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.md,
  },
  map: {
    flex: 1,
  },
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
  },
  placeholderHint: {
    fontSize: 10,
    color: THEME.colors.textLight,
    textAlign: 'center',
    marginTop: 4,
  },
});
