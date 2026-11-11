import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { THEME } from '../theme';

const AVATARS = ['🙂', '😀', '🦊', '🐱', '🐼', '🦁', '🐧', '🚀', '🌸', '⚽', '🎨', '🎮'];

export default function ProfileScreen({ user, data, refreshData, onLogout }) {
  const [name, setName] = useState(user.name || '');
  const [avatar, setAvatar] = useState(user.avatar || '🙂');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const saveProfile = async () => {
    if (!name.trim()) {
      showAlert('Ошибка', 'Имя не может быть пустым');
      return;
    }
    setSavingProfile(true);
    try {
      await api.patch(`/users/${user.id}`, { name: name.trim(), avatar });
      await refreshData();
      showAlert('Сохранено', 'Профиль обновлён');
    } catch (err) {
      showAlert('Ошибка', err.message || 'Не удалось сохранить профиль');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      showAlert('Ошибка', 'Заполните текущий и новый пароль');
      return;
    }
    if (newPassword.length < 6) {
      showAlert('Ошибка', 'Новый пароль должен быть не короче 6 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('Ошибка', 'Новые пароли не совпадают');
      return;
    }

    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showAlert('Готово', 'Пароль изменён');
    } catch (err) {
      showAlert('Ошибка', err.message || 'Не удалось изменить пароль');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroAvatar}>{avatar}</Text>
        <Text style={styles.heroName}>{name || user.name}</Text>
        <Text style={styles.heroRole}>
          {user.role === 'Parent' ? 'Родитель' : 'Ребёнок'}
          {data?.name ? ` · ${data.name}` : ''}
        </Text>
        {user.email ? <Text style={styles.heroEmail}>{user.email}</Text> : null}
      </View>

      <Text style={styles.sectionTitle}>Аватар</Text>
      <View style={styles.avatarGrid}>
        {AVATARS.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.avatarChip, avatar === item && styles.avatarChipActive]}
            onPress={() => setAvatar(item)}
          >
            <Text style={styles.avatarEmoji}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Имя</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />
      <TouchableOpacity
        style={[styles.primaryButton, savingProfile && styles.disabled]}
        onPress={saveProfile}
        disabled={savingProfile}
      >
        {savingProfile ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>Сохранить профиль</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Семья</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Название</Text>
          <Text style={styles.rowValue}>{data?.name || '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Код приглашения</Text>
          <Text style={styles.joinCode}>{data?.join_code || '—'}</Text>
        </View>
        <Text style={styles.hint}>
          Передайте код близким — они введут его при регистрации и попадут в вашу семью.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Безопасность</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Текущий пароль"
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="Новый пароль"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="Повторите новый пароль"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        <TouchableOpacity
          style={[styles.secondaryButton, changingPassword && styles.disabled]}
          onPress={changePassword}
          disabled={changingPassword}
        >
          {changingPassword ? (
            <ActivityIndicator color={THEME.colors.primary} />
          ) : (
            <Text style={styles.secondaryButtonText}>Изменить пароль</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
        <Text style={styles.logoutText}>Выйти из аккаунта</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    padding: THEME.spacing.md,
  },
  hero: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    padding: THEME.spacing.lg,
    marginBottom: THEME.spacing.md,
  },
  heroAvatar: {
    fontSize: 56,
    marginBottom: 8,
  },
  heroName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  heroRole: {
    fontSize: 12,
    color: THEME.colors.primary,
    fontWeight: 'bold',
    marginTop: 2,
  },
  heroEmail: {
    fontSize: 11,
    color: THEME.colors.textLight,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: THEME.colors.text,
    marginVertical: THEME.spacing.sm,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: THEME.spacing.sm,
  },
  avatarChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 8,
  },
  avatarChipActive: {
    borderColor: THEME.colors.primary,
    borderWidth: 2,
    backgroundColor: '#EEF5EF',
  },
  avatarEmoji: {
    fontSize: 22,
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.md,
    marginBottom: THEME.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowLabel: {
    fontSize: 12,
    color: THEME.colors.textLight,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  joinCode: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 2,
    color: THEME.colors.primary,
  },
  hint: {
    fontSize: 10,
    color: THEME.colors.textLight,
    fontStyle: 'italic',
    marginTop: THEME.spacing.sm,
  },
  primaryButton: {
    backgroundColor: THEME.colors.primary,
    paddingVertical: 12,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: THEME.colors.primary,
    paddingVertical: 12,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: THEME.colors.primary,
    fontWeight: 'bold',
  },
  logoutButton: {
    marginTop: THEME.spacing.lg,
    marginBottom: THEME.spacing.xl,
    paddingVertical: 12,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.danger,
    backgroundColor: '#FDECEE',
  },
  logoutText: {
    color: THEME.colors.danger,
    fontWeight: 'bold',
  },
  disabled: {
    opacity: 0.7,
  },
});
