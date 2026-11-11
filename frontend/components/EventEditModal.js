import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '../api';
import {
  RECURRENCE_OPTIONS,
  formatTimeInput,
  isoWeekday,
  parseApiDate,
  toLocalDateKey,
  toUtcIso,
} from '../datetime';
import { THEME } from '../theme';

const CATEGORIES = ['School', 'Work', 'Routine', 'One-off'];

const showConfirm = (title, message, onConfirm) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', onPress: onConfirm, style: 'destructive' },
    ]);
  }
};

export default function EventEditModal({ visible, event, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [recurrence, setRecurrence] = useState('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!event) return;
    setTitle(event.title || '');
    setCategory(event.category || 'General');
    setStartTime(formatTimeInput(event.start_time));
    setEndTime(formatTimeInput(event.end_time));
    setRecurrence(event.recurrence || 'none');
    setError('');
  }, [event]);

  const save = async () => {
    if (!event || saving) return;
    if (!title.trim()) {
      setError('Введите название события');
      return;
    }

    const startDate = parseApiDate(event.start_time);
    if (!startDate) {
      setError('Не удалось определить дату события');
      return;
    }
    const dateKey = toLocalDateKey(startDate);

    let startIso;
    let endIso;
    try {
      startIso = toUtcIso(dateKey, startTime);
      endIso = toUtcIso(dateKey, endTime);
    } catch (err) {
      setError('Время должно быть в формате ЧЧ:ММ');
      return;
    }

    if (new Date(endIso) <= new Date(startIso)) {
      setError('Время окончания должно быть позже начала');
      return;
    }

    const payload = {
      title: title.trim(),
      category,
      start_time: startIso,
      end_time: endIso,
      recurrence,
      recurrence_day:
        recurrence === 'weekly'
          ? isoWeekday(startDate)
          : recurrence === 'monthly'
          ? startDate.getDate()
          : null,
    };

    setSaving(true);
    try {
      await api.patch(`/events/${event.id}`, payload);
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Не удалось сохранить событие');
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!event) return;
    showConfirm('Удалить событие?', `Удалить "${event.title}"?`, async () => {
      setSaving(true);
      try {
        await api.delete(`/events/${event.id}`);
        onSaved?.();
        onClose?.();
      } catch (err) {
        setError(err.message || 'Не удалось удалить событие');
      } finally {
        setSaving(false);
      }
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Редактировать событие</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.label}>Название</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} />

            <View style={styles.timeRow}>
              <View style={styles.timeColumn}>
                <Text style={styles.label}>Начало (ЧЧ:ММ)</Text>
                <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} />
              </View>
              <View style={styles.timeColumn}>
                <Text style={styles.label}>Конец (ЧЧ:ММ)</Text>
                <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} />
              </View>
            </View>

            <Text style={styles.label}>Категория</Text>
            <View style={styles.chips}>
              {CATEGORIES.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.chip, category === item && styles.chipActive]}
                  onPress={() => setCategory(item)}
                >
                  <Text style={styles.chipText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Повторение</Text>
            <View style={styles.chips}>
              {RECURRENCE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.chip, recurrence === option.value && styles.chipActive]}
                  onPress={() => setRecurrence(option.value)}
                >
                  <Text style={styles.chipText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={remove}>
                <Text style={styles.deleteText}>Удалить</Text>
              </TouchableOpacity>
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
    maxHeight: '85%',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: THEME.colors.text,
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
    marginBottom: THEME.spacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeColumn: {
    flex: 1,
    marginRight: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: THEME.spacing.md,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: THEME.roundness.sm,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginRight: 6,
    marginBottom: 6,
  },
  chipActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  chipText: {
    fontSize: 11,
    color: THEME.colors.text,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    fontSize: 13,
  },
  cancelButton: {
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  cancelText: {
    color: THEME.colors.text,
    fontSize: 13,
  },
  deleteButton: {
    backgroundColor: '#FDECEE',
    borderWidth: 1,
    borderColor: THEME.colors.danger,
  },
  deleteText: {
    color: THEME.colors.danger,
    fontSize: 13,
    fontWeight: 'bold',
  },
  disabled: {
    opacity: 0.7,
  },
});
