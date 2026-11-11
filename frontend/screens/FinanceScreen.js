import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '../api';
import { formatDate, parseApiDate } from '../datetime';
import BudgetModal from '../components/BudgetModal';
import { THEME } from '../theme';

const CATEGORIES = ['Продукты', 'Коммунальные', 'Развлечения', 'Другое'];

export default function FinanceScreen({ user, data, refreshData }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Продукты');

  const [monthOffset, setMonthOffset] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [budgets, setBudgets] = useState({});
  const [budgetVisible, setBudgetVisible] = useState(false);

  const isParent = user.role === 'Parent';

  const showAlert = (alertTitle, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${alertTitle}\n\n${message}`);
    } else {
      Alert.alert(alertTitle, message);
    }
  };

  const showConfirm = (confirmTitle, message, onConfirm) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${confirmTitle}\n\n${message}`)) onConfirm();
    } else {
      Alert.alert(confirmTitle, message, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'ОК', onPress: onConfirm, style: 'destructive' },
      ]);
    }
  };

  const loadBudgets = useCallback(async () => {
    if (!user?.family_id) return;
    try {
      const list = await api.get(`/families/${user.family_id}/budgets`);
      const map = {};
      (list || []).forEach((budget) => {
        map[budget.category] = budget.monthly_limit;
      });
      setBudgets(map);
    } catch (err) {
      console.warn('Не удалось загрузить бюджеты:', err.message);
    }
  }, [user?.family_id]);

  useEffect(() => {
    loadBudgets();
  }, [loadBudgets]);

  const monthDate = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const monthLabel = monthDate.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });

  const monthExpenses = useMemo(() => {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );
    return (data?.expenses || []).filter((expense) => {
      const date = parseApiDate(expense.date);
      return date && date >= start && date <= end;
    });
  }, [data, monthDate]);

  const visibleExpenses = useMemo(
    () =>
      categoryFilter === 'all'
        ? monthExpenses
        : monthExpenses.filter((expense) => expense.category === categoryFilter),
    [monthExpenses, categoryFilter]
  );

  const summary = useMemo(() => {
    const result = {};
    monthExpenses.forEach((expense) => {
      result[expense.category] = (result[expense.category] || 0) + expense.amount;
    });
    return result;
  }, [monthExpenses]);

  const totalAmount = Object.values(summary).reduce((sum, value) => sum + value, 0);

  const handleAddExpense = async () => {
    if (!title || !amount) {
      showAlert('Ошибка', 'Заполните все поля');
      return;
    }

    const newExpense = {
      title,
      amount: Number.parseFloat(String(amount).replace(',', '.')),
      category,
      user_id: user.id,
      family_id: user.family_id,
    };

    if (!Number.isFinite(newExpense.amount) || newExpense.amount <= 0) {
      showAlert('Ошибка', 'Сумма должна быть положительным числом');
      return;
    }

    try {
      await api.post('/expenses', newExpense);
      setTitle('');
      setAmount('');
      showAlert('Успешно', 'Расход добавлен!');
      refreshData();
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
        } catch (err) {
          showAlert('Ошибка', err.message || 'Не удалось удалить расход');
        }
      }
    );
  };

  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'Продукты':
        return '#D2E0FB';
      case 'Коммунальные':
        return '#F1C2B6';
      case 'Развлечения':
        return '#FFD9C0';
      default:
        return '#EADBC8';
    }
  };

  const budgetEntries = Object.entries(budgets);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>Ручной трекер расходов вашей семьи</Text>
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => setMonthOffset((value) => value - 1)}>
          <Text style={styles.monthArrow}>◀</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => setMonthOffset((value) => value + 1)}>
          <Text style={styles.monthArrow}>▶</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>
          Расходы за месяц (Всего: {totalAmount.toFixed(0)} ₽)
        </Text>
        {Object.entries(summary).length === 0 ? (
          <Text style={styles.emptyChart}>За этот месяц расходов пока нет</Text>
        ) : (
          Object.entries(summary)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, val]) => {
              const percentage = totalAmount > 0 ? (val / totalAmount) * 100 : 0;
              return (
                <View key={cat} style={styles.chartRow}>
                  <View style={styles.chartLabelRow}>
                    <Text style={styles.chartLabelText}>{cat}</Text>
                    <Text style={styles.chartValueText}>
                      {val.toFixed(0)} ₽ ({percentage.toFixed(0)}%)
                    </Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${percentage}%`, backgroundColor: getCategoryColor(cat) },
                      ]}
                    />
                  </View>
                </View>
              );
            })
        )}
      </View>

      {budgetEntries.length > 0 ? (
        <View style={styles.chartCard}>
          <View style={styles.budgetHeader}>
            <Text style={styles.chartTitle}>Бюджеты на месяц</Text>
            {isParent ? (
              <TouchableOpacity onPress={() => setBudgetVisible(true)}>
                <Text style={styles.budgetEdit}>Изменить</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {budgetEntries.map(([cat, limit]) => {
            const spent = summary[cat] || 0;
            const percentage = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
            const over = spent > limit;
            return (
              <View key={`budget-${cat}`} style={styles.chartRow}>
                <View style={styles.chartLabelRow}>
                  <Text style={styles.chartLabelText}>{cat}</Text>
                  <Text style={[styles.chartValueText, over && styles.overText]}>
                    {spent.toFixed(0)} / {limit.toFixed(0)} ₽
                  </Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${percentage}%`,
                        backgroundColor: over ? THEME.colors.danger : THEME.colors.primary,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : isParent ? (
        <TouchableOpacity
          style={styles.budgetButton}
          onPress={() => setBudgetVisible(true)}
        >
          <Text style={styles.budgetButtonText}>Настроить бюджеты</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.label}>Фильтр по категории</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, categoryFilter === 'all' && styles.filterChipActive]}
          onPress={() => setCategoryFilter('all')}
        >
          <Text style={styles.filterChipText}>Все</Text>
        </TouchableOpacity>
        {CATEGORIES.map((catName) => (
          <TouchableOpacity
            key={catName}
            style={[styles.filterChip, categoryFilter === catName && styles.filterChipActive]}
            onPress={() => setCategoryFilter(catName)}
          >
            <Text style={styles.filterChipText}>{catName}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
          {CATEGORIES.map((catName) => (
            <TouchableOpacity
              key={catName}
              style={[styles.catButton, category === catName && styles.catButtonActive]}
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
        {visibleExpenses.map((exp) => (
          <TouchableOpacity
            key={exp.id}
            style={styles.expenseItem}
            onLongPress={() => handleDeleteExpense(exp)}
          >
            <View style={styles.expenseInfo}>
              <Text style={styles.expenseTextTitle}>{exp.title}</Text>
              <Text style={styles.expenseCatTag}>
                {exp.category} · {formatDate(exp.date)}
              </Text>
            </View>
            <Text style={styles.expenseValue}>- {exp.amount} ₽</Text>
          </TouchableOpacity>
        ))}
        {visibleExpenses.length === 0 && (
          <Text style={styles.emptyChart}>За этот период операций нет</Text>
        )}
      </View>

      <BudgetModal
        visible={budgetVisible}
        familyId={user.family_id}
        categories={CATEGORIES}
        budgets={budgets}
        onClose={() => setBudgetVisible(false)}
        onSaved={() => {
          loadBudgets();
          refreshData();
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
    marginBottom: THEME.spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    color: THEME.colors.textLight,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingVertical: 8,
    paddingHorizontal: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
  },
  monthArrow: {
    fontSize: 18,
    color: THEME.colors.primary,
    fontWeight: 'bold',
    paddingHorizontal: 8,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: THEME.colors.text,
    textTransform: 'capitalize',
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
    marginBottom: THEME.spacing.sm,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetEdit: {
    fontSize: 11,
    color: THEME.colors.primary,
    fontWeight: 'bold',
    marginBottom: THEME.spacing.sm,
  },
  budgetButton: {
    borderWidth: 1,
    borderColor: THEME.colors.primary,
    borderRadius: THEME.roundness.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  budgetButtonText: {
    color: THEME.colors.primary,
    fontWeight: 'bold',
    fontSize: 12,
  },
  emptyChart: {
    fontSize: 11,
    color: THEME.colors.textLight,
    fontStyle: 'italic',
    paddingVertical: 8,
    textAlign: 'center',
  },
  overText: {
    color: THEME.colors.danger,
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
  filterRow: {
    flexDirection: 'row',
    marginBottom: THEME.spacing.md,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: THEME.roundness.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  filterChipText: {
    fontSize: 11,
    color: THEME.colors.text,
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
  },
});
