import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import { THEME } from '../theme';
import { api } from '../api';
import { formatTime } from '../datetime';
import FamilyMap from '../components/FamilyMap';
import GeofenceModal from '../components/GeofenceModal';
import useFamilyResource from '../useFamilyResource';
import {
  isBackgroundTrackingActive,
  startBackgroundTracking,
  stopBackgroundTracking,
} from '../backgroundLocation';

export default function LocatorScreen({
  user,
  members,
  family,
  refreshKey,
  refreshData,
}) {
  const [busy, setBusy] = useState(false);
  const [backgroundOn, setBackgroundOn] = useState(false);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingFence, setEditingFence] = useState(null);

  const isParent = user?.role === 'Parent';
  const familyId = user?.family_id;
  const users = members || [];

  const {
    data: geofencesData,
    error: geofencesError,
    refresh: refreshGeofences,
  } = useFamilyResource(
    familyId ? `/families/${familyId}/geofences` : null,
    { refreshKey }
  );

  const {
    data: alertsData,
    refresh: refreshAlerts,
  } = useFamilyResource(
    familyId ? `/families/${familyId}/location-alerts?limit=20` : null,
    { refreshKey }
  );

  const geofences = geofencesData || [];
  const alerts = alertsData || [];

  useEffect(() => {
    isBackgroundTrackingActive()
      .then(setBackgroundOn)
      .catch(() => {});
  }, []);

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const showConfirm = (title, message, onConfirm) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    } else {
      Alert.alert(title, message, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'ОК', onPress: onConfirm, style: 'destructive' },
      ]);
    }
  };

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
      refreshData?.();
      refreshAlerts();
    } catch (err) {
      showAlert(
        'Геолокация недоступна',
        err.message || 'Не удалось получить координаты'
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleBackground = async (value) => {
    if (backgroundBusy) return;
    setBackgroundBusy(true);
    try {
      if (value) {
        await startBackgroundTracking();
        setBackgroundOn(true);
        showAlert(
          'Фоновая геолокация включена',
          'Приложение будет передавать позицию семьи примерно раз в минуту или при перемещении на 100 м.'
        );
      } else {
        await stopBackgroundTracking();
        setBackgroundOn(false);
      }
    } catch (err) {
      showAlert(
        'Не удалось изменить режим',
        err.message || 'Проверьте разрешения геолокации'
      );
    } finally {
      setBackgroundBusy(false);
    }
  };

  const openAddFence = () => {
    setEditingFence(null);
    setModalVisible(true);
  };

  const openEditFence = (fence) => {
    setEditingFence(fence);
    setModalVisible(true);
  };

  const deleteFence = (fence) => {
    showConfirm('Удалить геозону?', `Удалить «${fence.name}»?`, async () => {
      try {
        await api.delete(`/geofences/${fence.id}`);
        refreshGeofences();
      } catch (err) {
        showAlert('Ошибка', err.message || 'Не удалось удалить геозону');
      }
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>Текущая геопозиция членов семьи</Text>
      </View>

      <FamilyMap
        members={users}
        geofences={geofences}
        currentUserId={user.id}
      />

      {Platform.OS !== 'web' ? (
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Передавать геопозицию в фоне</Text>
            <Switch
              value={backgroundOn}
              onValueChange={toggleBackground}
              disabled={backgroundBusy}
              trackColor={{ true: THEME.colors.primary }}
            />
          </View>
          <Text style={styles.hint}>
            Обновления примерно раз в минуту или при перемещении на 100 м. На iOS
            потребуется разрешение «Всегда».
          </Text>
        </View>
      ) : null}

      <View style={styles.memberList}>
        {users.map((member) => {
          const hasLoc = member.latitude && member.longitude;
          const time = member.last_updated ? formatTime(member.last_updated) : 'Неизвестно';
          return (
            <View key={member.id} style={styles.memberCard}>
              <View style={styles.avatarRow}>
                <View style={[styles.avatar, { backgroundColor: member.role === 'Parent' ? '#D2E0FB' : '#FFD9C0' }]}>
                  <Text style={styles.avatarLetter}>{member.avatar || member.name[0]}</Text>
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
        <Text style={styles.joinCodeText}>{family?.join_code || 'Загрузка...'}</Text>
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

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Геозоны</Text>
        {isParent ? (
          <TouchableOpacity style={styles.addFenceBtn} onPress={openAddFence}>
            <Text style={styles.addFenceText}>+ Добавить</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {geofencesError ? (
        <Text style={styles.errorBanner}>{geofencesError}</Text>
      ) : null}

      {geofences.length === 0 ? (
        <Text style={styles.emptyText}>
          {isParent
            ? 'Добавьте школу или дом, чтобы получать уведомления о входе и выходе.'
            : 'Родитель пока не настроил геозоны.'}
        </Text>
      ) : (
        geofences.map((fence) => (
          <TouchableOpacity
            key={fence.id}
            style={styles.fenceCard}
            activeOpacity={isParent ? 0.7 : 1}
            onPress={() => isParent && openEditFence(fence)}
          >
            <View style={styles.fenceInfo}>
              <Text style={styles.fenceName}>{fence.name}</Text>
              <Text style={styles.fenceMeta}>
                радиус {Math.round(fence.radius_m)} м
                {fence.notify_enter ? ' · вход' : ''}
                {fence.notify_exit ? ' · выход' : ''}
              </Text>
            </View>
            {isParent ? (
              <TouchableOpacity
                style={styles.fenceDelete}
                onPress={() => deleteFence(fence)}
              >
                <Text style={styles.fenceDeleteText}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        ))
      )}

      <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>
        События геозон
      </Text>
      <View style={styles.alertList}>
        {alerts.length === 0 ? (
          <Text style={styles.emptyText}>Пока событий нет.</Text>
        ) : (
          alerts.map((alert) => (
            <View key={alert.id} style={styles.alertRow}>
              <Text style={styles.alertIcon}>
                {alert.type === 'enter' ? '→' : '←'}
              </Text>
              <View style={styles.alertBody}>
                <Text style={styles.alertText}>
                  {alert.user_name}{' '}
                  {alert.type === 'enter' ? 'вошёл в' : 'покинул'} «
                  {alert.geofence_name}»
                </Text>
                <Text style={styles.alertTime}>{formatTime(alert.created_at)}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <GeofenceModal
        visible={modalVisible}
        familyId={familyId}
        geofence={editingFence}
        user={user}
        onClose={() => setModalVisible(false)}
        onSaved={() => {
          refreshGeofences();
          refreshData?.();
        }}
      />
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    fontSize: 13,
    color: THEME.colors.text,
    fontWeight: 'bold',
  },
  hint: {
    fontSize: 10,
    color: THEME.colors.textLight,
    marginTop: 6,
    fontStyle: 'italic',
  },
  memberList: {
    marginBottom: THEME.spacing.md,
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
    marginBottom: THEME.spacing.lg,
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
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: THEME.spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  sectionTitleSpaced: {
    marginTop: THEME.spacing.lg,
    marginBottom: THEME.spacing.sm,
  },
  addFenceBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: THEME.roundness.sm,
    borderWidth: 1,
    borderColor: THEME.colors.primary,
  },
  addFenceText: {
    fontSize: 11,
    color: THEME.colors.primary,
    fontWeight: 'bold',
  },
  fenceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.md,
    marginTop: THEME.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fenceInfo: {
    flex: 1,
  },
  fenceName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  fenceMeta: {
    fontSize: 10,
    color: THEME.colors.textLight,
    marginTop: 2,
  },
  fenceDelete: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FDECEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fenceDeleteText: {
    color: THEME.colors.danger,
    fontWeight: 'bold',
    fontSize: 12,
  },
  alertList: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.sm,
    marginBottom: THEME.spacing.xl,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EFE6',
  },
  alertIcon: {
    fontSize: 14,
    color: THEME.colors.primary,
    marginRight: 8,
    fontWeight: 'bold',
  },
  alertBody: {
    flex: 1,
  },
  alertText: {
    fontSize: 11,
    color: THEME.colors.text,
  },
  alertTime: {
    fontSize: 9,
    color: THEME.colors.textLight,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 11,
    color: THEME.colors.textLight,
    fontStyle: 'italic',
    marginTop: THEME.spacing.sm,
  },
  errorBanner: {
    backgroundColor: '#FDECEE',
    color: THEME.colors.danger,
    fontSize: 11,
    padding: 8,
    borderRadius: THEME.roundness.sm,
    marginTop: THEME.spacing.sm,
  },
});
