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
import { THEME } from '../theme';

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

export default function TaskEditModal({ visible, task, members, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [reward, setReward] = useState('0');
  const [assigneeId, setAssigneeId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!task) return;
    setTitle(task.title || '');
    setReward(String(task.reward_coins ?? 0));
    setAssigneeId(task.assigned_to_id ?? null);
    setError('');
  }, [task]);

  const save = async () => {
    if (!task || saving) return;
    if (!title.trim()) {
      setError('Введите название задачи');
      return;
    }
    const coins = Number.parseInt(reward, 10);
    if (Number.isNaN(coins) || coins < 0) {
      setError('Награда должна быть неотрицательным числом');
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/tasks/${task.id}`, {
        title: title.trim(),
        reward_coins: coins,
        assigned_to_id: assigneeId,
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Не удалось сохранить задачу');
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!task) return;
    showConfirm('Удалить задачу?', `Удалить "${task.title}"?`, async () => {
      setSaving(true);
      try {
        await api.delete(`/tasks/${task.id}`);
        onSaved?.();
        onClose?.();
      } catch (err) {
        setError(err.message || 'Не удалось удалить задачу');
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
            <Text style={styles.title}>Редактировать задачу</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.label}>Название</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} />

            <Text style={styles.label}>Награда (🪙)</Text>
            <TextInput
              style={styles.input}
              value={reward}
              onChangeText={setReward}
              keyboardType="numeric"
            />

            <Text style={styles.label}>Исполнитель</Text>
            <View style={styles.chips}>
              <TouchableOpacity
                style={[styles.chip, assigneeId == null && styles.chipActive]}
                onPress={() => setAssigneeId(null)}
              >
                <Text style={styles.chipText}>Без исполнителя</Text>
              </TouchableOpacity>
              {(members || []).map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={[styles.chip, assigneeId === member.id && styles.chipActive]}
                  onPress={() => setAssigneeId(member.id)}
                >
                  <Text style={styles.chipText}>{member.name}</Text>
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: THEME.spacing.lg,
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
