import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { THEME } from '../theme';
import { api } from '../api';

export default function FinanceScreen({ user, data, refreshData }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Продукты');
  const [summary, setSummary] = useState({});

  // Cross-platform Alert wrapper
  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // Cross-platform Confirm wrapper
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

  const expenses = data?.expenses || [];

  const fetchSummary = async () => {
    if (!user?.family_id) return;
    try {
      const sumData = await api.get(
        `/families/${user.family_id}/expenses/summary`
      );
      setSummary(sumData || {});
    } catch (err) {
      // Keep the last known summary; the next poll will retry.
      console.warn('Не удалось загрузить сводку расходов:', err.message);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [data]);

  const handleAddExpense = async () => {
    if (!title || !amount) {
      showAlert('Ошибка', 'Заполните все поля');
      return;
    }

    const newExpense = {
      title,
      amount: parseFloat(amount),
      category,
      user_id: user.id,
      family_id: user.family_id || 1,
    };

    try {
      await api.post('/expenses', newExpense);
      setTitle('');
      setAmount('');
      showAlert('Успешно', 'Расход добавлен!');
      refreshData();
      fetchSummary();
    } catch (err) {
      showAlert('Ошибка', err.message || 'Не удалось добавить расход');
    }
  };

  const handleDeleteExpense = (expense) => {
    showConfirm(
      'Удалить расход?',
      `Удалить "${expense.title}" на ${expense.amount} ₽?`,
      async () => {
        try {
          await api.delete(`/expenses/${expense.id}`);
          refreshData();
          fetchSummary();
        } catch (err) {
          showAlert('Ошибка', err.message || 'Не удалось удалить расход');
        }
      }
    );
  };

  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'Продукты': return '#D2E0FB';
      case 'Коммунальные': return '#F1C2B6';
      case 'Развлечения': return '#FFD9C0';
      default: return '#EADBC8';
    }
  };

  const totalAmount = Object.values(summary).reduce((a, b) => a + b, 0);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>Ручной трекер расходов вашей семьи</Text>
      </View>

      {/* Visual Chart - Horizontal Bar Chart Representation */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Распределение расходов (Всего: {totalAmount.toFixed(0)} ₽)</Text>
        {Object.entries(summary).map(([cat, val]) => {
          const percentage = totalAmount > 0 ? (val / totalAmount) * 100 : 0;
          return (
            <View key={cat} style={styles.chartRow}>
              <View style={styles.chartLabelRow}>
                <Text style={styles.chartLabelText}>{cat}</Text>
                <Text style={styles.chartValueText}>{val.toFixed(0)} ₽ ({percentage.toFixed(0)}%)</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${percentage}%`, backgroundColor: getCategoryColor(cat) }]} />
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Внести расход</Text>
        <TextInput
          style={styles.input}
          placeholder="Название расхода (например: Молоко, хлеб)"
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={styles.input}
          placeholder="Сумма в рублях"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />

        <Text style={styles.label}>Категория</Text>
        <View style={styles.catRow}>
          {['Продукты', 'Коммунальные', 'Развлечения', 'Другое'].map((catName) => (
            <TouchableOpacity
              key={catName}
              style={[
                styles.catButton,
                category === catName && styles.catButtonActive
              ]}
              onPress={() => setCategory(catName)}
            >
              <Text style={styles.catButtonText}>{catName}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleAddExpense}>
          <Text style={styles.submitBtnText}>Записать расход</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.listTitle}>История операций</Text>
      <Text style={styles.listHint}>Удерживайте запись, чтобы удалить её</Text>
      <View style={styles.listContainer}>
        {expenses.map((exp) => (
          <TouchableOpacity
            key={exp.id}
            style={styles.expenseItem}
            onLongPress={() => handleDeleteExpense(exp)}
          >
            <View style={styles.expenseInfo}>
              <Text style={styles.expenseTextTitle}>{exp.title}</Text>
              <Text style={styles.expenseCatTag}>{exp.category}</Text>
            </View>
            <Text style={styles.expenseValue}>- {exp.amount} ₽</Text>
          </TouchableOpacity>
        ))}
      </View>
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
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.md,
  },
  chartTitle: {
    fontWeight: 'bold',
    fontSize: 13,
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  chartRow: {
    marginBottom: THEME.spacing.sm,
  },
  chartLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chartLabelText: {
    fontSize: 11,
    color: THEME.colors.text,
  },
  chartValueText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#F5EFE6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.md,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
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
  label: {
    fontSize: 12,
    color: THEME.colors.textLight,
    marginBottom: 6,
  },
  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.md,
  },
  catButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: THEME.roundness.sm,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 6,
  },
  catButtonActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  catButtonText: {
    fontSize: 11,
    color: THEME.colors.text,
  },
  submitBtn: {
    backgroundColor: THEME.colors.primary,
    padding: 12,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  listTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: THEME.colors.text,
    marginVertical: THEME.spacing.sm,
  },
  listHint: {
    fontSize: 10,
    color: THEME.colors.textLight,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  listContainer: {
    marginBottom: THEME.spacing.xl,
  },
  expenseItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.sm,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseTextTitle: {
    fontWeight: 'bold',
    color: THEME.colors.text,
    fontSize: 13,
  },
  expenseCatTag: {
    fontSize: 10,
    color: THEME.colors.textLight,
    marginTop: 2,
  },
  expenseValue: {
    fontWeight: 'bold',
    color: THEME.colors.danger,
    fontSize: 14,
  }
});
