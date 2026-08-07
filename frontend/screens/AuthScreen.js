import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';
import { THEME } from '../theme';
import { API_URL } from '../App';

export default function AuthScreen({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('Parent'); // Default role Parent
  const [familyChoice, setFamilyChoice] = useState('create'); // 'create' or 'join'
  const [createFamilyName, setCreateFamilyName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // Cross-platform Alert wrapper
  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSubmit = async () => {
    if (!email || !password || (isRegister && !name)) {
      showAlert('Ошибка', 'Пожалуйста, заполните все поля');
      return;
    }

    const endpoint = isRegister ? '/auth/register' : '/auth/login';
    const payload = isRegister 
      ? { 
          email, 
          password, 
          name, 
          role,
          ...(familyChoice === 'create' && createFamilyName ? { create_family_name: createFamilyName } : {}),
          ...(familyChoice === 'join' && joinCode ? { join_code: joinCode } : {})
        }
      : { email, password };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const user = await res.json();
        showAlert('Успех', isRegister ? 'Регистрация успешна!' : 'С возвращением!');
        onLoginSuccess(user);
      } else {
        const err = await res.json();
        showAlert('Ошибка', err.detail || 'Не удалось выполнить действие');
      }
    } catch (e) {
      // Local demo fallback if backend is offline
      showAlert(
        'Офлайн режим',
        'Вход выполнен в демонстрационном режиме (без сервера)'
      );
      onLoginSuccess({
        id: 99,
        name: name || 'Демо Пользователь',
        role: role,
        email: email,
        coins: 100,
        family_id: 1,
      });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>FamilyCRM 🏠</Text>
        <Text style={styles.subtitle}>
          {isRegister ? 'Создайте семейный профиль' : 'Войдите в свою семью'}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Пароль"
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
        />

        {isRegister && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Имя"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Ваша роль:</Text>
            <View style={styles.roleRow}>
              {['Parent', 'Child'].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.roleBtn,
                    role === r && styles.roleBtnActive
                  ]}
                  onPress={() => setRole(r)}
                >
                  <Text style={styles.roleBtnText}>
                    {r === 'Parent' ? 'Родитель 👨‍👩‍👧' : 'Ребенок 🧒'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.familyChoiceContainer}>
              <TouchableOpacity
                style={[styles.familyChoiceBtn, familyChoice === 'create' && styles.familyChoiceBtnActive]}
                onPress={() => setFamilyChoice('create')}
              >
                <Text style={[styles.familyChoiceText, familyChoice === 'create' && styles.familyChoiceTextActive]}>
                  Создать семью
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.familyChoiceBtn, familyChoice === 'join' && styles.familyChoiceBtnActive]}
                onPress={() => setFamilyChoice('join')}
              >
                <Text style={[styles.familyChoiceText, familyChoice === 'join' && styles.familyChoiceTextActive]}>
                  Присоединиться
                </Text>
              </TouchableOpacity>
            </View>

            {familyChoice === 'create' ? (
              <TextInput
                style={styles.input}
                placeholder="Название новой семьи"
                value={createFamilyName}
                onChangeText={setCreateFamilyName}
              />
            ) : (
              <TextInput
                style={styles.input}
                placeholder="Код семьи (например, A1B2C3)"
                autoCapitalize="characters"
                value={joinCode}
                onChangeText={setJoinCode}
              />
            )}
          </>
        )}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitBtnText}>
            {isRegister ? 'Зарегистрироваться' : 'Войти'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.toggleBtn} 
          onPress={() => setIsRegister(prev => !prev)}
        >
          <Text style={styles.toggleBtnText}>
            {isRegister 
              ? 'Уже есть аккаунт? Войти' 
              : 'Нет аккаунта? Зарегистрироваться'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    justifyContent: 'center',
    padding: THEME.spacing.lg,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.lg,
    padding: THEME.spacing.lg,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME.colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: THEME.colors.textLight,
    textAlign: 'center',
    marginBottom: THEME.spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.roundness.sm,
    padding: 12,
    backgroundColor: '#FAF8F5',
    color: THEME.colors.text,
    marginBottom: THEME.spacing.md,
  },
  label: {
    fontSize: 12,
    color: THEME.colors.textLight,
    marginBottom: 6,
  },
  roleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.lg,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: THEME.roundness.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    marginHorizontal: 4,
    backgroundColor: '#FAF8F5',
  },
  roleBtnActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  roleBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  familyChoiceContainer: {
    flexDirection: 'row',
    marginBottom: THEME.spacing.sm,
    backgroundColor: '#FAF8F5',
    borderRadius: THEME.roundness.sm,
    padding: 4,
  },
  familyChoiceBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: THEME.roundness.sm,
  },
  familyChoiceBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  familyChoiceText: {
    fontSize: 12,
    color: THEME.colors.textLight,
  },
  familyChoiceTextActive: {
    color: THEME.colors.text,
    fontWeight: 'bold',
  },
  submitBtn: {
    backgroundColor: THEME.colors.primary,
    padding: 14,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
    marginTop: THEME.spacing.sm,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  toggleBtn: {
    alignItems: 'center',
    marginTop: THEME.spacing.md,
  },
  toggleBtnText: {
    color: THEME.colors.textLight,
    fontSize: 12,
    textDecorationLine: 'underline',
  }
});
