import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { THEME } from '../theme';
import { API_URL } from '../App';

export default function LocatorScreen({ user, data, refreshData }) {
  // Cross-platform Alert wrapper
  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const users = data?.users || [
    { id: 1, name: 'Даня', role: 'Child', latitude: 55.7558, longitude: 37.6173, last_updated: '2026-07-03T18:30:00' },
    { id: 2, name: 'Мама Ольга', role: 'Parent', latitude: 55.7522, longitude: 37.6155, last_updated: '2026-07-03T19:45:00' },
    { id: 3, name: 'Папа Сергей', role: 'Parent', latitude: 55.7599, longitude: 37.6250, last_updated: '2026-07-03T19:58:00' },
  ];

  const handleShareLocation = async () => {
    const randomLat = 55.75 + (Math.random() - 0.5) * 0.05;
    const randomLng = 37.61 + (Math.random() - 0.5) * 0.05;

    try {
      const res = await fetch(`${API_URL}/users/${user.id}/location`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: randomLat,
          longitude: randomLng,
        }),
      });

      if (res.ok) {
        showAlert('Обновлено', 'Геопозиция отправлена семье!');
        refreshData();
      }
    } catch (err) {
      showAlert('Успешно', 'Координаты симулированы в офлайн режиме');
    }
  };


  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>Текущая геопозиция членов семьи</Text>
      </View>

      <View style={styles.mapMock}>
        <Text style={styles.mapIcon}>🗺️</Text>
        <Text style={styles.mapText}>Интерактивная карта (В платной подписке)</Text>
        <Text style={styles.mapHint}>Смотрите историю перемещений и настраивайте геозоны (школа, дом).</Text>
      </View>

      <View style={styles.memberList}>
        {users.map((member) => {
          const hasLoc = member.latitude && member.longitude;
          const time = member.last_updated ? member.last_updated.split('T')[1]?.substring(0, 5) : 'Неизвестно';
          return (
            <View key={member.id} style={styles.memberCard}>
              <View style={styles.avatarRow}>
                <View style={[styles.avatar, { backgroundColor: member.role === 'Parent' ? '#D2E0FB' : '#FFD9C0' }]}>
                  <Text style={styles.avatarLetter}>{member.name[0]}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberRole}>{member.role === 'Parent' ? 'Родитель' : 'Ребенок'}</Text>
                </View>
              </View>

              <View style={styles.locationDetails}>
                {hasLoc ? (
                  <>
                    <Text style={styles.locCoords}>Широта: {member.latitude.toFixed(4)}, Долгота: {member.longitude.toFixed(4)}</Text>
                    <Text style={styles.locTime}>Обновлено в {time}</Text>
                  </>
                ) : (
                  <Text style={styles.noLoc}>Геолокация не отправлялась</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.inviteCard}>
        <Text style={styles.inviteTitle}>Код вашей семьи</Text>
        <Text style={styles.joinCodeText}>{data?.join_code || 'Загрузка...'}</Text>
        <Text style={styles.inviteHint}>
          Скопируйте этот код и отправьте близким. Они смогут ввести его при регистрации, чтобы присоединиться к вашей семье.
        </Text>
      </View>

      <TouchableOpacity style={styles.shareBtn} onPress={handleShareLocation}>
        <Text style={styles.shareBtnText}>Отправить мою геопозицию семье</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    padding: THEME.spacing.md,
  },
  header: {
    marginBottom: THEME.spacing.md,
  },
  subtitle: {
    fontSize: 15,
    color: THEME.colors.textLight,
  },
  mapMock: {
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
  mapIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  mapText: {
    fontWeight: 'bold',
    fontSize: 13,
    color: THEME.colors.text,
  },
  mapHint: {
    fontSize: 10,
    color: THEME.colors.textLight,
    textAlign: 'center',
    marginTop: 4,
  },
  memberList: {
    marginBottom: THEME.spacing.lg,
  },
  memberCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.sm,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarLetter: {
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  memberInfo: {
    justifyContent: 'center',
  },
  memberName: {
    fontWeight: 'bold',
    color: THEME.colors.text,
    fontSize: 14,
  },
  memberRole: {
    fontSize: 11,
    color: THEME.colors.textLight,
  },
  locationDetails: {
    borderTopWidth: 1,
    borderTopColor: '#F5EFE6',
    paddingTop: 8,
  },
  locCoords: {
    fontSize: 11,
    color: THEME.colors.text,
  },
  locTime: {
    fontSize: 9,
    color: THEME.colors.textLight,
    marginTop: 2,
  },
  noLoc: {
    fontSize: 11,
    color: THEME.colors.textLight,
    fontStyle: 'italic',
  },
  shareBtn: {
    backgroundColor: THEME.colors.primary,
    padding: 14,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
    marginBottom: THEME.spacing.xl,
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  inviteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.md,
    alignItems: 'center',
  },
  inviteTitle: {
    fontWeight: 'bold',
    fontSize: 13,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  joinCodeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME.colors.primary,
    letterSpacing: 2,
    marginVertical: THEME.spacing.sm,
  },
  inviteHint: {
    fontSize: 11,
    color: THEME.colors.textLight,
    textAlign: 'center',
    marginTop: THEME.spacing.sm,
  }
});
