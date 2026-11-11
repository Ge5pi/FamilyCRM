import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '../api';
import { THEME } from '../theme';

export default function BudgetModal({
  visible,
  familyId,
  categories,
  budgets,
  onClose,
  onSaved,
}) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    const next = {};
    categories.forEach((category) => {
      next[category] = budgets[category] != null ? String(budgets[category]) : '';
    });
    setValues(next);
    setError('');
  }, [visible, categories, budgets]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      for (const category of categories) {
        const raw = (values[category] || '').trim();
        const hasBudget = budgets[category] != null;
        const encoded = encodeURIComponent(category);

        if (!raw) {
          if (hasBudget) {
            await api.delete(`/families/${familyId}/budgets/${encoded}`);
          }
          continue;
        }

        const limit = Number.parseFloat(raw.replace(',', '.'));
        if (Number.isNaN(limit) || limit < 0) {
          throw new Error(`Некорректный лимит для «${category}»`);
        }
        await api.put(`/families/${familyId}/budgets/${encoded}`, {
          monthly_limit: limit,
        });
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || 'Не удалось сохранить бюджеты');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Бюджеты на месяц</Text>
            <Text style={styles.hint}>
              Оставьте поле пустым, чтобы убрать лимит. Суммы указываются в рублях.
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {categories.map((category) => (
              <View key={category} style={styles.field}>
                <Text style={styles.label}>{category}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="Без лимита"
                  value={values[category] || ''}
                  onChangeText={(text) =>
                    setValues((prev) => ({ ...prev, [category]: text }))
                  }
                />
              </View>
            ))}

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
    maxHeight: '85%',
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
  field: {
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
