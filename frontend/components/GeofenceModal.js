import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import { api } from '../api';
import { THEME } from '../theme';

export default function GeofenceModal({
  visible,
  familyId,
  geofence,
  user,
  onClose,
  onSaved,
}) {
  const [name, setName] = useState('');
  const [radius, setRadius] = useState('150');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [notifyEnter, setNotifyEnter] = useState(true);
  const [notifyExit, setNotifyExit] = useState(true);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setName(geofence?.name || '');
    setRadius(String(geofence?.radius_m ?? 150));
    setLatitude(
      geofence?.latitude != null
        ? String(geofence.latitude)
        : user?.latitude != null
        ? String(user.latitude)
        : ''
    );
    setLongitude(
      geofence?.longitude != null
        ? String(geofence.longitude)
        : user?.longitude != null
        ? String(user.longitude)
        : ''
    );
    setNotifyEnter(geofence?.notify_enter ?? true);
    setNotifyExit(geofence?.notify_exit ?? true);
    setError('');
  }, [visible, geofence, user?.latitude, user?.longitude]);

  const takeCurrentPosition = async () => {
    setLocating(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Разрешите доступ к геолокации');
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLatitude(String(position.coords.latitude));
      setLongitude(String(position.coords.longitude));
    } catch (err) {
      setError(err.message || 'Не удалось получить координаты');
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (saving) return;
    const latitudeValue = Number.parseFloat(String(latitude).replace(',', '.'));
    const longitudeValue = Number.parseFloat(String(longitude).replace(',', '.'));
    const radiusValue = Number.parseFloat(String(radius).replace(',', '.'));

    if (!name.trim()) {
      setError('Введите название геозоны');
      return;
    }
    if (
      Number.isNaN(latitudeValue) ||
      Number.isNaN(longitudeValue) ||
      Math.abs(latitudeValue) > 90 ||
      Math.abs(longitudeValue) > 180
    ) {
      setError('Укажите корректные координаты (или возьмите текущую позицию)');
      return;
    }
    if (Number.isNaN(radiusValue) || radiusValue < 30 || radiusValue > 10000) {
      setError('Радиус должен быть от 30 до 10 000 метров');
      return;
    }

    const payload = {
      name: name.trim(),
      latitude: latitudeValue,
      longitude: longitudeValue,
      radius_m: radiusValue,
      notify_enter: notifyEnter,
      notify_exit: notifyExit,
    };

    setSaving(true);
    try {
      if (geofence) {
        await api.patch(`/geofences/${geofence.id}`, payload);
      } else {
        await api.post(`/families/${familyId}/geofences`, payload);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Не удалось сохранить геозону');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>
              {geofence ? 'Редактировать геозону' : 'Новая геозона'}
            </Text>
            <Text style={styles.hint}>
              Родитель получит push, когда ребёнок войдёт в зону или покинет её.
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.label}>Название</Text>
            <TextInput
              style={styles.input}
              placeholder="Школа, Дом, Секция"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Радиус (метры)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={radius}
              onChangeText={setRadius}
            />

            <Text style={styles.label}>Координаты центра</Text>
            <View style={styles.coordsRow}>
              <TextInput
                style={[styles.input, styles.coordInput]}
                placeholder="Широта"
                keyboardType="numbers-and-punctuation"
                value={latitude}
                onChangeText={setLatitude}
              />
              <TextInput
                style={[styles.input, styles.coordInput]}
                placeholder="Долгота"
                keyboardType="numbers-and-punctuation"
                value={longitude}
                onChangeText={setLongitude}
              />
            </View>
            <TouchableOpacity
              style={[styles.locateButton, locating && styles.disabled]}
              onPress={takeCurrentPosition}
              disabled={locating}
            >
              {locating ? (
                <ActivityIndicator color={THEME.colors.primary} />
              ) : (
                <Text style={styles.locateText}>Взять текущую позицию</Text>
              )}
            </TouchableOpacity>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Уведомлять о входе</Text>
              <Switch value={notifyEnter} onValueChange={setNotifyEnter} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Уведомлять о выходе</Text>
              <Switch value={notifyExit} onValueChange={setNotifyExit} />
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
                <Text style={styles.cancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton, saving && styles.disabled]}
                onPress={save}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveText}>Сохранить</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: THEME.roundness.lg,
    borderTopRightRadius: THEME.roundness.lg,
    padding: THEME.spacing.lg,
    maxHeight: '88%',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: THEME.colors.text,
    marginBottom: 4,
  },
  hint: {
    fontSize: 11,
    color: THEME.colors.textLight,
    marginBottom: THEME.spacing.md,
  },
  error: {
    color: THEME.colors.danger,
    fontSize: 12,
    marginBottom: THEME.spacing.sm,
  },
  label: {
    fontSize: 12,
    color: THEME.colors.textLight,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.roundness.sm,
    padding: 10,
    backgroundColor: '#FAF8F5',
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  coordsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  coordInput: {
    flex: 1,
    marginRight: 6,
  },
  locateButton: {
    borderWidth: 1,
    borderColor: THEME.colors.primary,
    borderRadius: THEME.roundness.sm,
    paddingVertical: 9,
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  locateText: {
    color: THEME.colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  switchLabel: {
    fontSize: 12,
    color: THEME.colors.text,
  },
  actions: {
    flexDirection: 'row',
    marginTop: THEME.spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: THEME.roundness.sm,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  saveButton: {
    backgroundColor: THEME.colors.primary,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  cancelText: {
    color: THEME.colors.text,
  },
  disabled: {
    opacity: 0.7,
  },
});
