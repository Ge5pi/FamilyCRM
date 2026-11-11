import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import { THEME } from '../theme';

function buildRegion(points) {
  const lats = points.map((point) => point.latitude);
  const lngs = points.map((point) => point.longitude);
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

export default function FamilyMap({ members, geofences, currentUserId }) {
  const located = useMemo(
    () =>
      (members || []).filter(
        (member) =>
          typeof member.latitude === 'number' && typeof member.longitude === 'number'
      ),
    [members]
  );

  const fences = useMemo(
    () =>
      (geofences || []).filter(
        (fence) =>
          typeof fence.latitude === 'number' && typeof fence.longitude === 'number'
      ),
    [geofences]
  );

  const region = useMemo(() => {
    const points = [
      ...located.map((member) => ({
        latitude: member.latitude,
        longitude: member.longitude,
      })),
      ...fences.map((fence) => ({
        latitude: fence.latitude,
        longitude: fence.longitude,
      })),
    ];
    return points.length ? buildRegion(points) : null;
  }, [located, fences]);

  if (!region) {
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
        {fences.map((fence) => (
          <Circle
            key={`fence-${fence.id}`}
            center={{ latitude: fence.latitude, longitude: fence.longitude }}
            radius={fence.radius_m}
            strokeColor="rgba(134,167,137,0.9)"
            fillColor="rgba(134,167,137,0.18)"
          />
        ))}
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
