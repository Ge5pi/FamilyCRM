import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { THEME } from '../theme';
import { api } from '../api';
import TaskEditModal from '../components/TaskEditModal';
import useFamilyResource from '../useFamilyResource';

export default function KanbanScreen({ user, members, refreshKey, refreshData }) {
  const [taskTitle, setTaskTitle] = useState('');
  const [rewardCoins, setRewardCoins] = useState('10');
  const [assignToId, setAssignToId] = useState(null); // null = pick in selector
  const [editingTask, setEditingTask] = useState(null);
  
  const isParent = user.role === 'Parent';
  const familyId = user?.family_id;
  const {
    data: tasksData,
    error: tasksError,
    refresh: refreshTasks,
  } = useFamilyResource(
    familyId ? `/families/${familyId}/tasks` : null,
    { refreshKey }
  );
  const tasks = tasksData || [];

  // Cross-platform Alert wrapper
  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const getMember = (userId) => members.find((u) => u.id === userId);

  const getMemberName = (userId) => {
    const m = getMember(userId);
    return m ? m.name : '—';
  };

  const getMemberAvatar = (userId) => getMember(userId)?.avatar || '👤';

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
      await api.post('/tasks', newTask);
      setTaskTitle('');
      setAssignToId(null);
      refreshTasks();
      refreshData?.();
      showAlert('Создано', 'Задача добавлена в Kanban-доску!');
    } catch (err) {
      showAlert('Ошибка', err.message || 'Не удалось создать задачу');
    }
  };

  const handleMoveStatus = async (taskId, currentStatus) => {
    let nextStatus = 'TODO';
    if (currentStatus === 'TODO') nextStatus = 'IN_PROGRESS';
    else if (currentStatus === 'IN_PROGRESS') nextStatus = 'DONE';
    else return;

    try {
      await api.put(`/tasks/${taskId}/status`, { status: nextStatus });
      refreshTasks();
      refreshData?.();
      if (nextStatus === 'DONE') {
        showAlert('Ура! 🎉', 'Задание выполнено! Коины начислены.');
      }
    } catch (err) {
      showAlert('Ошибка', err.message || 'Не удалось обновить статус задачи');
    }
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
              onLongPress={() => {
                const canEdit = user.role === 'Parent' || t.created_by_id === user.id;
                if (canEdit) {
                  setEditingTask(t);
                } else {
                  showAlert(
                    'Нет прав',
                    'Редактировать задачу может её автор или родитель'
                  );
                }
              }}
            >
              <Text style={styles.taskTitle}>{t.title}</Text>
              {t.assigned_to_id && (
                <Text style={styles.assignee}>
                  {getMemberAvatar(t.assigned_to_id)} {getMemberName(t.assigned_to_id)}
                </Text>
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
      {tasksError ? <Text style={styles.errorBanner}>{tasksError}</Text> : null}

      <View style={styles.coinHeader}>
        <Text style={styles.welcomeText}>
          Привет, {user.name}! {user.avatar || ''}
        </Text>
        <View style={styles.userCoins}>
          <Text style={styles.coinsText}>🪙 {user.coins}</Text>
        </View>
      </View>

      <View style={styles.kanbanContainer}>
        {renderColumn('Нужно сделать', 'TODO', '#FCE4D6')}
        {renderColumn('В процессе', 'IN_PROGRESS', '#FFF2CC')}
        {renderColumn('Готово ✅', 'DONE', '#E2EFDA')}
      </View>

      {isParent ? (
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
                    {m.avatar || '👤'} {m.id === user.id ? `Я (${m.name})` : m.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

          <TouchableOpacity style={styles.addBtn} onPress={handleCreateTask}>
            <Text style={styles.addBtnText}>Создать задачу</Text>
          </TouchableOpacity>
          <Text style={styles.hintText}>
            Коснитесь карточки, чтобы сменить статус. Удерживайте — чтобы редактировать.
          </Text>
        </View>
      ) : (
        <View style={styles.childNotice}>
          <Text style={styles.childNoticeText}>
            Задачи назначает родитель. Коснитесь карточки, чтобы отметить прогресс.
          </Text>
        </View>
      )}

      <TaskEditModal
        visible={!!editingTask}
        task={editingTask}
        members={members}
        onClose={() => setEditingTask(null)}
        onSaved={() => {
          refreshTasks();
          refreshData?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    padding: THEME.spacing.md,
  },
  errorBanner: {
    backgroundColor: '#FDECEE',
    color: THEME.colors.danger,
    fontSize: 11,
    padding: 8,
    borderRadius: THEME.roundness.sm,
    marginBottom: THEME.spacing.sm,
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
  childNotice: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
  },
  childNoticeText: {
    fontSize: 11,
    color: THEME.colors.textLight,
    textAlign: 'center',
    fontStyle: 'italic',
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
