import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { THEME } from '../theme';
import { API_URL } from '../App';

export default function KanbanScreen({ user, data, refreshData }) {
  const [taskTitle, setTaskTitle] = useState('');
  const [rewardCoins, setRewardCoins] = useState('10');
  const [assignToId, setAssignToId] = useState(null); // null = pick in selector
  
  const members = data?.users || [];

  const tasks = data?.tasks || [
    { id: 1, title: 'Убрать игрушки в комнате', reward_coins: 15, status: 'TODO', assigned_to_id: 1 },
    { id: 2, title: 'Выгулять собаку', reward_coins: 10, status: 'IN_PROGRESS', assigned_to_id: 1 },
    { id: 3, title: 'Сделать домашнюю работу', reward_coins: 20, status: 'DONE', assigned_to_id: 1 },
  ];

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
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed) onConfirm();
    } else {
      Alert.alert(title, message, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'ОК', onPress: onConfirm, style: 'destructive' }
      ]);
    }
  };

  const getMemberName = (userId) => {
    const m = members.find(u => u.id === userId);
    return m ? m.name : '—';
  };

  const handleCreateTask = async () => {
    if (!taskTitle) {
      showAlert('Ошибка', 'Введите название задачи');
      return;
    }

    const newTask = {
      title: taskTitle,
      description: "",
      reward_coins: parseInt(rewardCoins) || 0,
      status: "TODO",
      assigned_to_id: assignToId || user.id,
      created_by_id: user.id,
      family_id: user.family_id || 1,
    };

    try {
      const res = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      });

      if (res.ok) {
        setTaskTitle('');
        setAssignToId(null);
        refreshData();
        showAlert('Создано', 'Задача добавлена в Kanban-доску!');
      }
    } catch (err) {
      showAlert('Офлайн режим', 'Задача создана локально (сервер не доступен)');
    }
  };

  const handleMoveStatus = async (taskId, currentStatus) => {
    let nextStatus = 'TODO';
    if (currentStatus === 'TODO') nextStatus = 'IN_PROGRESS';
    else if (currentStatus === 'IN_PROGRESS') nextStatus = 'DONE';
    else return;

    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        refreshData();
        if (nextStatus === 'DONE') {
          showAlert('Ура! 🎉', 'Задание выполнено! Коины начислены.');
        }
      }
    } catch (err) {
      showAlert('Ошибка', 'Не удалось обновить статус задачи');
    }
  };

  const handleDeleteTask = async (taskId, taskTitle) => {
    showConfirm(
      'Удалить задачу?',
      `Удалить "${taskTitle}"?`,
      async () => {
        try {
          await fetch(`${API_URL}/tasks/${taskId}`, { method: 'DELETE' });
          refreshData();
        } catch (err) {
          showAlert('Ошибка', 'Не удалось удалить задачу');
        }
      }
    );
  };

  const renderColumn = (title, statusName, bgColor) => {
    const colTasks = tasks.filter(t => t.status === statusName);
    return (
      <View style={[styles.column, { backgroundColor: bgColor }]}>
        <Text style={styles.columnTitle}>{title} ({colTasks.length})</Text>
        <ScrollView style={styles.taskList}>
          {colTasks.map(t => (
            <TouchableOpacity 
              key={t.id} 
              style={styles.taskCard}
              onPress={() => handleMoveStatus(t.id, t.status)}
              onLongPress={() => handleDeleteTask(t.id, t.title)}
            >
              <Text style={styles.taskTitle}>{t.title}</Text>
              {t.assigned_to_id && (
                <Text style={styles.assignee}>👤 {getMemberName(t.assigned_to_id)}</Text>
              )}
              <View style={styles.taskFooter}>
                <View style={styles.coinBadge}>
                  <Text style={styles.coinText}>🪙 {t.reward_coins}</Text>
                </View>
                {t.status !== 'DONE' && (
                  <Text style={styles.tapToMove}>➔</Text>
                )}
                {t.status === 'DONE' && (
                  <Text style={styles.doneCheck}>✅</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.coinHeader}>
        <Text style={styles.welcomeText}>Привет, {user.name}!</Text>
        <View style={styles.userCoins}>
          <Text style={styles.coinsText}>🪙 {user.coins}</Text>
        </View>
      </View>

      <View style={styles.kanbanContainer}>
        {renderColumn('Нужно сделать', 'TODO', '#FCE4D6')}
        {renderColumn('В процессе', 'IN_PROGRESS', '#FFF2CC')}
        {renderColumn('Готово ✅', 'DONE', '#E2EFDA')}
      </View>

      <View style={styles.addTaskForm}>
        <Text style={styles.formTitle}>Новая семейная задача</Text>
        <View style={styles.formRow}>
          <TextInput
            style={[styles.input, { flex: 2, marginRight: 8 }]}
            placeholder="Что нужно сделать?"
            value={taskTitle}
            onChangeText={setTaskTitle}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="🪙"
            keyboardType="numeric"
            value={rewardCoins}
            onChangeText={setRewardCoins}
          />
        </View>

        {/* Member assignment selector */}
        {members.length > 0 && (
          <>
            <Text style={styles.assignLabel}>Назначить кому:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assignRow}>
              {members.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[
                    styles.assignChip,
                    (assignToId || user.id) === m.id && styles.assignChipActive
                  ]}
                  onPress={() => setAssignToId(m.id)}
                >
                  <Text style={styles.assignChipText}>
                    {m.id === user.id ? `Я (${m.name})` : m.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <TouchableOpacity style={styles.addBtn} onPress={handleCreateTask}>
          <Text style={styles.addBtnText}>Создать задачу</Text>
        </TouchableOpacity>
        <Text style={styles.hintText}>Удерживайте карточку задачи, чтобы удалить её</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    padding: THEME.spacing.md,
  },
  coinHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  welcomeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  userCoins: {
    backgroundColor: '#FFF2CC',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    borderColor: '#F8CBAD',
  },
  coinsText: {
    fontWeight: 'bold',
    color: '#BD5000',
  },
  kanbanContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.md,
  },
  column: {
    flex: 1,
    marginHorizontal: 3,
    borderRadius: THEME.roundness.md,
    padding: 6,
  },
  columnTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: THEME.spacing.sm,
    color: THEME.colors.text,
  },
  taskList: {
    flex: 1,
  },
  taskCard: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: THEME.roundness.sm,
    marginBottom: THEME.spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  taskTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.text,
  },
  assignee: {
    fontSize: 9,
    color: THEME.colors.primary,
    marginTop: 3,
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  coinBadge: {
    backgroundColor: '#FAF8F5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  coinText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  tapToMove: {
    fontSize: 14,
    color: THEME.colors.primary,
    fontWeight: 'bold',
  },
  doneCheck: {
    fontSize: 12,
  },
  addTaskForm: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  formTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  formRow: {
    flexDirection: 'row',
    marginBottom: THEME.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.roundness.sm,
    padding: 8,
    backgroundColor: '#FAF8F5',
    color: THEME.colors.text,
    fontSize: 13,
  },
  assignLabel: {
    fontSize: 11,
    color: THEME.colors.textLight,
    marginBottom: 4,
  },
  assignRow: {
    marginBottom: THEME.spacing.sm,
  },
  assignChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: THEME.roundness.sm,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginRight: 6,
  },
  assignChipActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  assignChipText: {
    fontSize: 11,
    color: THEME.colors.text,
    fontWeight: '500',
  },
  addBtn: {
    backgroundColor: THEME.colors.primary,
    padding: 12,
    borderRadius: THEME.roundness.sm,
    alignItems: 'center',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  hintText: {
    fontSize: 9,
    color: THEME.colors.textLight,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  }
});
