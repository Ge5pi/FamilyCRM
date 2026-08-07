import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { THEME } from '../theme';
import { API_URL } from '../App';

export default function CalendarScreen({ user, data, refreshData }) {
  const [selectedUser, setSelectedUser] = useState(user);
  const [selectedDayOffset, setSelectedDayOffset] = useState(0); // 0 = Today, 1 = Tomorrow, etc.
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('School');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:30');
  const [isRecurring, setIsRecurring] = useState(false); // Recurring Daily vs One-off
  const [errorMsg, setErrorMsg] = useState('');

  // Sync selectedUser if the currentUser is loaded/updated
  useEffect(() => {
    if (user && (!selectedUser || selectedUser.id === user.id)) {
      setSelectedUser(user);
    }
  }, [user]);

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

  // Fallback lists if backend offline
  const members = data?.users || [
    { id: 1, name: 'Даня', role: 'Child', coins: 120, family_id: 1 },
    { id: 2, name: 'Мама Ольга', role: 'Parent', coins: 40, family_id: 1 },
    { id: 3, name: 'Папа Сергей', role: 'Parent', coins: 90, family_id: 1 },
  ];

  const events = data?.events || [
    { id: 1, title: 'Школа (Математика)', start_time: '2026-07-03T10:00:00', end_time: '2026-07-03T11:30:00', category: 'School', is_recurring: true, user_id: 1 },
    { id: 2, title: 'Ужин семьи', start_time: '2026-07-03T19:00:00', end_time: '2026-07-03T20:00:00', category: 'Routine', is_recurring: false, user_id: 2 },
  ];

  // Generate day options (today + 6 upcoming days)
  const getDayOptions = () => {
    const days = [];
    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push({
        offset: i,
        dayNum: d.getDate(),
        dayName: weekdays[d.getDay()],
        dateString: d.toISOString().split('T')[0],
      });
    }
    return days;
  };

  const dayOptions = getDayOptions();
  const activeDay = dayOptions[selectedDayOffset];

  // Filter events based on:
  // 1. Belonging to the selected user
  // 2. Either it is a recurring event (active every day) OR it is scheduled on this specific date.
  const filteredEvents = events.filter(evt => {
    const belongsToUser = evt.user_id === selectedUser.id;
    if (!belongsToUser) return false;
    
    if (evt.is_recurring) return true; // Daily event
    
    const eventDate = evt.start_time.split('T')[0];
    return eventDate === activeDay.dateString;
  });

  const handleAddEvent = async () => {
    if (!title) {
      showAlert('Ошибка', 'Введите название события');
      return;
    }
    
    const newEvent = {
      title,
      description: "",
      start_time: `${activeDay.dateString}T${startTime}:00`,
      end_time: `${activeDay.dateString}T${endTime}:00`,
      category,
      is_recurring: isRecurring,
      user_id: user.id,
      family_id: user.family_id || 1,
    };

    try {
      const res = await fetch(`${API_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent),
      });

      if (res.ok) {
        setTitle('');
        setErrorMsg('');
        setIsRecurring(false);
        showAlert('Успешно', 'Событие сохранено!');
        refreshData();
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || 'Не удалось сохранить событие');
      }
    } catch (err) {
      // Offline fallback simulations
      showAlert('Офлайн режим', 'Событие добавлено локально');
    }
  };

  const getCategoryColor = (cat) => {
    switch (cat) {
      case 'School': return '#FFE5CC';
      case 'Work': return '#E5F9E0';
      case 'Routine': return '#E3F2FD';
      default: return '#ECEFF1';
    }
  };

  const isSelf = selectedUser.id === user.id;

  const handleDeleteEvent = async (eventId, eventTitle) => {
    showConfirm(
      'Удалить событие?',
      `Вы уверены, что хотите удалить "${eventTitle}"?`,
      async () => {
        try {
          const res = await fetch(`${API_URL}/events/${eventId}`, { method: 'DELETE' });
          if (res.ok || res.status === 204) {
            refreshData();
          }
        } catch (err) {
          showAlert('Ошибка', 'Не удалось удалить событие');
        }
      }
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Профили семьи (выберите для просмотра)</Text>
      
      {/* Family Profile Selector Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberSelector}>
        {members.map((member) => {
          const isMe = member.id === user.id;
          return (
            <TouchableOpacity
              key={member.id}
              style={[
                styles.memberTab,
                selectedUser.id === member.id && styles.memberTabActive,
                isMe && styles.myMemberTab
              ]}
              onPress={() => setSelectedUser(member)}
            >
              <View style={[
                styles.avatar,
                { backgroundColor: member.role === 'Parent' ? '#D2E0FB' : '#FFD9C0' },
                isMe && styles.myAvatar
              ]}>
                <Text style={styles.avatarText}>{member.name[0]}</Text>
                {isMe && <Text style={styles.editBadge}>✏️</Text>}
              </View>
              <Text style={[styles.memberName, isMe && styles.myMemberName]}>
                {isMe ? `Я (${member.name})` : member.name}
              </Text>
              <Text style={styles.memberRole}>
                {isMe ? 'Редактировать' : (member.role === 'Parent' ? 'Родитель' : 'Ребенок')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Calendar Header with Selected User */}
      <View style={styles.header}>
        <Text style={styles.subtitle}>
          Календарь профиля: <Text style={{fontWeight: 'bold', color: THEME.colors.primary}}>{selectedUser.name}</Text>
        </Text>
      </View>

      {/* Days of the Week Selector Widget */}
      <View style={styles.daySelectorContainer}>
        {dayOptions.map((day) => (
          <TouchableOpacity
            key={day.offset}
            style={[
              styles.dayTab,
              selectedDayOffset === day.offset && styles.dayTabActive
            ]}
            onPress={() => setSelectedDayOffset(day.offset)}
          >
            <Text style={[styles.dayLabel, selectedDayOffset === day.offset && styles.dayTextActive]}>
              {day.dayName}
            </Text>
            <Text style={[styles.dayNumber, selectedDayOffset === day.offset && styles.dayTextActive]}>
              {day.dayNum}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Расписание на {activeDay.dayNum} ({activeDay.dayName})</Text>
      
      <View style={styles.calendarContainer}>
        {filteredEvents.map((evt) => {
          const sTime = evt.start_time.split('T')[1]?.substring(0, 5) || evt.start_time;
          const eTime = evt.end_time.split('T')[1]?.substring(0, 5) || evt.end_time;
          const canDelete = isSelf && evt.user_id === user.id;
          return (
            <View key={evt.id} style={[styles.eventCard, { backgroundColor: getCategoryColor(evt.category) }]}>
              <View style={styles.eventInfoRow}>
                <Text style={styles.eventTime}>{sTime} - {eTime}</Text>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  {evt.is_recurring && <Text style={styles.recurringTag}>🔄 Ежедневно</Text>}
                  {canDelete && (
                    <TouchableOpacity 
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteEvent(evt.id, evt.title)}
                    >
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <Text style={styles.eventTitle}>{evt.title}</Text>
              <Text style={styles.eventCat}>{evt.category}</Text>
            </View>
          );
        })}
        {filteredEvents.length === 0 && (
          <Text style={styles.noEvents}>Событий нет. Добавьте, кликнув на день и время!</Text>
        )}
      </View>

      {/* Add Schedule Event form (Only visible when viewing own profile calendar) */}
      {isSelf ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Внести событие в свой календарь</Text>
          <Text style={styles.selectedDayHint}>Дата внесения: {activeDay.dayNum} {activeDay.dayName}</Text>
          
          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="Название (например: Школа / Работа)"
            value={title}
            onChangeText={setTitle}
          />

          <View style={styles.timeRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Начало (ЧЧ:ММ)</Text>
              <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Конец (ЧЧ:ММ)</Text>
              <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} />
            </View>
          </View>

          {/* Recurrence Type Selector */}
          <Text style={styles.label}>Тип события:</Text>
          <View style={styles.recurrenceRow}>
            <TouchableOpacity
              style={[styles.recurrenceBtn, !isRecurring && styles.recurrenceBtnActive]}
              onPress={() => setIsRecurring(false)}
            >
              <Text style={styles.recurrenceBtnText}>Разовое событие</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.recurrenceBtn, isRecurring && styles.recurrenceBtnActive]}
              onPress={() => setIsRecurring(true)}
            >
              <Text style={styles.recurrenceBtnText}>Повторять ежедневно 🔄</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.catRow}>
            {['School', 'Work', 'Routine', 'One-off'].map((catName) => (
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

          <TouchableOpacity style={styles.submitBtn} onPress={handleAddEvent}>
            <Text style={styles.submitBtnText}>Запланировать</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.readOnlyNotice}>
          <Text style={styles.readOnlyText}>Вы просматриваете календарь {selectedUser.name}. Изменения может вносить только владелец.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    padding: THEME.spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
    marginTop: THEME.spacing.sm,
  },
  memberSelector: {
    flexDirection: 'row',
    marginBottom: THEME.spacing.md,
  },
  memberTab: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    padding: 10,
    marginRight: 10,
    width: 100,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  memberTabActive: {
    borderColor: THEME.colors.primary,
    borderWidth: 2,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  memberName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  memberRole: {
    fontSize: 9,
    color: THEME.colors.textLight,
  },
  myMemberTab: {
    backgroundColor: '#FFF8F0',
    borderColor: '#FFD9C0',
    borderWidth: 2,
    shadowColor: '#FFD9C0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  myAvatar: {
    backgroundColor: '#86A789',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  editBadge: {
    position: 'absolute',
    bottom: -4,
    right: -6,
    fontSize: 10,
  },
  myMemberName: {
    color: THEME.colors.primary,
    fontWeight: 'bold',
  },
  header: {
    marginVertical: THEME.spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: THEME.colors.textLight,
  },
  daySelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.md,
  },
  dayTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: THEME.roundness.sm,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  dayTabActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  dayLabel: {
    fontSize: 10,
    color: THEME.colors.textLight,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  dayTextActive: {
    color: '#FFFFFF',
  },
  calendarContainer: {
    marginBottom: THEME.spacing.lg,
  },
  eventCard: {
    padding: THEME.spacing.md,
    borderRadius: THEME.roundness.md,
    marginBottom: THEME.spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  eventInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recurringTag: {
    fontSize: 9,
    color: THEME.colors.primary,
    fontWeight: 'bold',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deleteBtn: {
    marginLeft: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: THEME.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  eventTime: {
    fontSize: 12,
    fontWeight: 'bold',
    color: THEME.colors.textLight,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME.colors.text,
    marginTop: 4,
  },
  eventCat: {
    fontSize: 11,
    color: THEME.colors.textLight,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
  },
  noEvents: {
    textAlign: 'center',
    color: THEME.colors.textLight,
    fontStyle: 'italic',
    paddingVertical: 20,
  },
  formCard: {
    backgroundColor: THEME.colors.card,
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: THEME.spacing.xl,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  selectedDayHint: {
    fontSize: 11,
    color: THEME.colors.textLight,
    marginBottom: THEME.spacing.md,
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
    marginBottom: THEME.spacing.md,
    color: THEME.colors.text,
  },
  timeRow: {
    flexDirection: 'row',
    marginBottom: THEME.spacing.sm,
  },
  recurrenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.md,
  },
  recurrenceBtn: {
    flex: 1,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.roundness.sm,
    alignItems: 'center',
    marginHorizontal: 2,
    backgroundColor: '#FAF8F5',
  },
  recurrenceBtnActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  recurrenceBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  catRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.lg,
  },
  catButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: THEME.roundness.sm,
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  catButtonActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  catButtonText: {
    fontSize: 12,
    color: THEME.colors.text,
  },
  submitBtn: {
    backgroundColor: THEME.colors.primary,
    padding: 14,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  errorText: {
    color: THEME.colors.danger,
    fontSize: 13,
    marginBottom: 10,
    fontWeight: '500',
  },
  readOnlyNotice: {
    backgroundColor: '#FFFFFF',
    padding: THEME.spacing.md,
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    marginBottom: THEME.spacing.xl,
  },
  readOnlyText: {
    fontSize: 11,
    color: THEME.colors.textLight,
    textAlign: 'center',
    fontStyle: 'italic',
  }
});
