import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { THEME } from '../theme';
import { api } from '../api';
import { formatTime } from '../datetime';

export default function LocatorScreen({ user, data, refreshData }) {
  // Cross-platform Alert wrapper
  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const users = data?.users || [];

  const handleShareLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showAlert(
        'Геолокация недоступна',
        'Это устройство не поддерживает определение местоположения. ' +
          'На телефоне потребуется модуль геолокации (будет добавлен позже).'
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await api.put(`/users/${user.id}/location`, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          showAlert('Обновлено', 'Геопозиция отправлена семье!');
          refreshData();
        } catch (err) {
          showAlert('Ошибка', err.message || 'Не удалось отправить геопозицию');
        }
      },
      (geoError) => {
        showAlert(
          'Геолокация недоступна',
          geoError?.message || 'Разрешите доступ к геолокации в настройках.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
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
          const time = member.last_updated ? formatTime(member.last_updated) : 'Неизвестно';
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
