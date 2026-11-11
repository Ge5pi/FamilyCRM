import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { THEME } from '../theme';
import { api } from '../api';
import {
  RECURRENCE_OPTIONS,
  eventOccursOn,
  formatTime,
  isSameDay,
  isoWeekday,
  monthMatrix,
  monthTitle,
  recurrenceLabel,
  startOfMonth,
  toLocalDateKey,
  toUtcIso,
} from '../datetime';
import EventEditModal from '../components/EventEditModal';

export default function CalendarScreen({ user, data, refreshData }) {
  const [selectedUser, setSelectedUser] = useState(user);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [calendarMode, setCalendarMode] = useState('week'); // 'week' | 'month'
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('School');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:30');
  const [recurrence, setRecurrence] = useState('none');
  const [recurrenceUntil, setRecurrenceUntil] = useState('');
  const [editingEvent, setEditingEvent] = useState(null);
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

  // Family members come from the API; empty until the first successful load.
  const members = data?.users || [];

  const events = data?.events || [];

  const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  // Day strip: today + 6 upcoming days using the *local* date.
  const dayOptions = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    date.setHours(0, 0, 0, 0);
    return {
      offset: index,
      dayNum: date.getDate(),
      dayName: WEEKDAYS_SHORT[date.getDay()],
      dateString: toLocalDateKey(date),
      date,
    };
  });

  const activeDay = {
    date: selectedDate,
    dateString: toLocalDateKey(selectedDate),
    dayNum: selectedDate.getDate(),
    dayName: WEEKDAYS_SHORT[selectedDate.getDay()],
  };

  // Show events belonging to the selected member that occur on the active day
  // (including every occurrence of a recurring series).
  const filteredEvents = events.filter(
    (evt) => evt.user_id === selectedUser.id && eventOccursOn(evt, activeDay.date)
  );

  const monthCells = monthMatrix(monthCursor.getFullYear(), monthCursor.getMonth());
  const monthHeading = monthTitle(monthCursor.getFullYear(), monthCursor.getMonth());

  const hasEventOn = (date) =>
    events.some(
      (evt) => evt.user_id === selectedUser.id && eventOccursOn(evt, date)
    );

  const switchMode = (mode) => {
    setCalendarMode(mode);
    if (mode === 'month') {
      setMonthCursor(startOfMonth(selectedDate));
    }
  };

  const shiftMonth = (delta) => {
    const next = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + delta, 1);
    setMonthCursor(next);
    setSelectedDate(next);
  };

  const handleAddEvent = async () => {
    if (!title) {
      showAlert('Ошибка', 'Введите название события');
      return;
    }
    
    const newEvent = {
      title,
      description: "",
      start_time: toUtcIso(activeDay.dateString, startTime),
      end_time: toUtcIso(activeDay.dateString, endTime),
      category,
      recurrence,
      recurrence_day:
        recurrence === 'weekly'
          ? isoWeekday(activeDay.date)
          : recurrence === 'monthly'
          ? activeDay.date.getDate()
          : null,
      recurrence_until: recurrence !== 'none' && recurrenceUntil ? recurrenceUntil : null,
      user_id: user.id,
      family_id: user.family_id,
    };

    if (recurrenceUntil && !/^\d{4}-\d{2}-\d{2}$/.test(recurrenceUntil)) {
      setErrorMsg('Дата окончания должна быть в формате ГГГГ-ММ-ДД');
      return;
    }
    if (
      recurrence !== 'none' &&
      recurrenceUntil &&
      recurrenceUntil < activeDay.dateString
    ) {
      setErrorMsg('Дата окончания не может быть раньше даты события');
      return;
    }

    if (newEvent.end_time <= newEvent.start_time) {
      setErrorMsg('Время окончания должно быть позже времени начала');
      return;
    }

    try {
      await api.post('/events', newEvent);
      setTitle('');
      setErrorMsg('');
      setRecurrence('none');
      setRecurrenceUntil('');
      showAlert('Успешно', 'Событие сохранено!');
      refreshData();
    } catch (err) {
      setErrorMsg(err.message || 'Не удалось сохранить событие');
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
          await api.delete(`/events/${eventId}`);
          refreshData();
        } catch (err) {
          showAlert('Ошибка', err.message || 'Не удалось удалить событие');
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
                <Text style={styles.avatarText}>{member.avatar || member.name[0]}</Text>
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

      {/* Week / Month switch */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, calendarMode === 'week' && styles.modeBtnActive]}
          onPress={() => switchMode('week')}
        >
          <Text style={[styles.modeText, calendarMode === 'week' && styles.modeTextActive]}>
            Неделя
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, calendarMode === 'month' && styles.modeBtnActive]}
          onPress={() => switchMode('month')}
        >
          <Text style={[styles.modeText, calendarMode === 'month' && styles.modeTextActive]}>
            Месяц
          </Text>
        </TouchableOpacity>
      </View>

      {calendarMode === 'week' ? (
        <View style={styles.daySelectorContainer}>
          {dayOptions.map((day) => {
            const active = isSameDay(day.date, selectedDate);
            return (
              <TouchableOpacity
                key={day.offset}
                style={[styles.dayTab, active && styles.dayTabActive]}
                onPress={() => setSelectedDate(day.date)}
              >
                <Text style={[styles.dayLabel, active && styles.dayTextActive]}>
                  {day.dayName}
                </Text>
                <Text style={[styles.dayNumber, active && styles.dayTextActive]}>
                  {day.dayNum}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.monthCard}>
          <View style={styles.monthHeader}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthArrowBtn}>
              <Text style={styles.monthArrow}>◀</Text>
            </TouchableOpacity>
            <Text style={styles.monthTitleText}>{monthHeading}</Text>
            <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthArrowBtn}>
              <Text style={styles.monthArrow}>▶</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.weekHeader}>
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((label) => (
              <Text key={label} style={styles.weekHeaderText}>
                {label}
              </Text>
            ))}
          </View>
          <View style={styles.monthGrid}>
            {monthCells.map((cell, index) => {
              const selected = isSameDay(cell, selectedDate);
              const inMonth = cell.getMonth() === monthCursor.getMonth();
              return (
                <TouchableOpacity
                  key={`${toLocalDateKey(cell)}-${index}`}
                  style={[styles.monthCell, selected && styles.monthCellSelected]}
                  onPress={() => {
                    setSelectedDate(cell);
                    if (!inMonth) setMonthCursor(startOfMonth(cell));
                  }}
                >
                  <Text
                    style={[
                      styles.monthCellText,
                      !inMonth && styles.monthCellTextMuted,
                      selected && styles.monthCellTextSelected,
                    ]}
                  >
                    {cell.getDate()}
                  </Text>
                  {hasEventOn(cell) ? (
                    <View style={[styles.eventDot, selected && styles.eventDotSelected]} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Расписание на {activeDay.dayNum} ({activeDay.dayName})</Text>
      
      <View style={styles.calendarContainer}>
        {filteredEvents.map((evt) => {
          const sTime = formatTime(evt.start_time);
          const eTime = formatTime(evt.end_time);
          const isOwner = evt.user_id === user.id;
          const canEdit = isOwner || user.role === 'Parent';
          const recurrenceTag = recurrenceLabel(evt.recurrence);
          return (
            <TouchableOpacity
              key={evt.id}
              activeOpacity={canEdit ? 0.7 : 1}
              onPress={() => {
                if (canEdit) setEditingEvent(evt);
              }}
              style={[styles.eventCard, { backgroundColor: getCategoryColor(evt.category) }]}
            >
              <View style={styles.eventInfoRow}>
                <Text style={styles.eventTime}>{sTime} - {eTime}</Text>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  {recurrenceTag ? (
                    <Text style={styles.recurringTag}>🔄 {recurrenceTag}</Text>
                  ) : null}
                  {isOwner && (
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
              {canEdit ? (
                <Text style={styles.editHint}>✏️ Нажмите, чтобы изменить</Text>
              ) : null}
            </TouchableOpacity>
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
            {RECURRENCE_OPTIONS.map((option) => {
              const active = recurrence === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.recurrenceBtn, active && styles.recurrenceBtnActive]}
                  onPress={() => setRecurrence(option.value)}
                >
                  <Text style={[styles.recurrenceBtnText, active && styles.recurrenceBtnTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {recurrence !== 'none' ? (
            <>
              <Text style={styles.label}>Повторять до (необязательно, ГГГГ-ММ-ДД)</Text>
              <TextInput
                style={styles.input}
                placeholder="2026-12-31"
                autoCapitalize="none"
                value={recurrenceUntil}
                onChangeText={setRecurrenceUntil}
              />
            </>
          ) : null}

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

      <EventEditModal
        visible={!!editingEvent}
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        onSaved={refreshData}
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
  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: 3,
    marginBottom: THEME.spacing.sm,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: THEME.roundness.sm,
  },
  modeBtnActive: {
    backgroundColor: THEME.colors.primary,
  },
  modeText: {
    fontSize: 12,
    color: THEME.colors.textLight,
  },
  modeTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  daySelectorContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.md,
  },
  monthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.sm,
    marginBottom: THEME.spacing.md,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.sm,
  },
  monthArrowBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  monthArrow: {
    fontSize: 16,
    color: THEME.colors.primary,
    fontWeight: 'bold',
  },
  monthTitleText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: THEME.colors.text,
    textTransform: 'capitalize',
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekHeaderText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    color: THEME.colors.textLight,
    fontWeight: 'bold',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: THEME.roundness.sm,
  },
  monthCellSelected: {
    backgroundColor: THEME.colors.primary,
  },
  monthCellText: {
    fontSize: 12,
    color: THEME.colors.text,
  },
  monthCellTextMuted: {
    color: '#C9BFB8',
  },
  monthCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: THEME.colors.primary,
    marginTop: 2,
  },
  eventDotSelected: {
    backgroundColor: '#FFFFFF',
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
  editHint: {
    fontSize: 9,
    color: THEME.colors.textLight,
    marginTop: 6,
    fontStyle: 'italic',
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
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.md,
  },
  recurrenceBtn: {
    flexBasis: '48%',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.roundness.sm,
    alignItems: 'center',
    marginBottom: 6,
    backgroundColor: '#FAF8F5',
  },
  recurrenceBtnActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  recurrenceBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  recurrenceBtnTextActive: {
    color: '#FFFFFF',
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
