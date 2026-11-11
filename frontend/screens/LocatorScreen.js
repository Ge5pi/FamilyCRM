import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import { THEME } from '../theme';
import { api } from '../api';
import { formatTime } from '../datetime';
import FamilyMap from '../components/FamilyMap';

export default function LocatorScreen({ user, data, refreshData }) {
  const [busy, setBusy] = useState(false);

  // Cross-platform Alert wrapper
  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const users = data?.users || [];

  const getCurrentPosition = () => {
    if (Platform.OS === 'web') {
      return new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          reject(new Error('Браузер не поддерживает геолокацию'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        });
      });
    }

    return (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Разрешите доступ к геолокации в настройках устройства');
      }
      return Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
    })();
  };

  const handleShareLocation = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const position = await getCurrentPosition();
      await api.put(`/users/${user.id}/location`, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      showAlert('Обновлено', 'Геопозиция отправлена семье!');
      refreshData();
    } catch (err) {
      showAlert(
        'Геолокация недоступна',
        err.message || 'Не удалось получить координаты'
      );
    } finally {
      setBusy(false);
    }
  };


  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>Текущая геопозиция членов семьи</Text>
      </View>

      <FamilyMap members={users} currentUserId={user.id} />

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

      <TouchableOpacity
        style={[styles.shareBtn, busy && styles.shareBtnDisabled]}
        onPress={handleShareLocation}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.shareBtnText}>Отправить мою геопозицию семье</Text>
        )}
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
  shareBtnDisabled: {
    opacity: 0.7,
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
