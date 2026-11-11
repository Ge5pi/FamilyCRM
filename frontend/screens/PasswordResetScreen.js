import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '../api';
import { THEME } from '../theme';

export default function PasswordResetScreen({ onBack, onDone }) {
  const [step, setStep] = useState('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const requestCode = async () => {
    if (!email.trim()) {
      setError('Введите email');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await api.post('/auth/forgot-password', {
        email: email.trim(),
      });
      if (result?.dev_code) {
        setCode(result.dev_code);
        showAlert(
          'Тестовый режим',
          `Код: ${result.dev_code}\n\nВ production он придёт на email.`
        );
      } else {
        showAlert('Готово', 'Если email зарегистрирован, код отправлен.');
      }
      setStep('confirm');
    } catch (err) {
      setError(err.message || 'Не удалось отправить код');
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    if (!code.trim() || !newPassword) {
      setError('Введите код и новый пароль');
      return;
    }
    if (newPassword.length < 6) {
      setError('Пароль должен быть не короче 6 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await api.post('/auth/reset-password', {
        code: code.trim(),
        new_password: newPassword,
      });
      showAlert('Готово', 'Пароль изменён. Войдите с новым паролем.');
      onDone?.();
    } catch (err) {
      setError(err.message || 'Не удалось сбросить пароль');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Восстановление пароля 🔑</Text>
        <Text style={styles.subtitle}>
          {step === 'request'
            ? 'Укажите email — мы отправим код подтверждения'
            : 'Введите код из письма и новый пароль'}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {step === 'request' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.disabled]}
              onPress={requestCode}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>Отправить код</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Код из письма"
              autoCapitalize="characters"
              value={code}
              onChangeText={setCode}
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
              style={[styles.submitBtn, submitting && styles.disabled]}
              onPress={resetPassword}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>Сбросить пароль</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => setStep('request')}
            >
              <Text style={styles.linkText}>Отправить код ещё раз</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>← Вернуться ко входу</Text>
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
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: THEME.colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textLight,
    textAlign: 'center',
    marginBottom: THEME.spacing.lg,
  },
  error: {
    color: THEME.colors.danger,
    fontSize: 12,
    marginBottom: THEME.spacing.sm,
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
  submitBtn: {
    backgroundColor: THEME.colors.primary,
    padding: 14,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
  },
  submitText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  linkBtn: {
    alignItems: 'center',
    marginTop: THEME.spacing.md,
  },
  linkText: {
    color: THEME.colors.textLight,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  backBtn: {
    alignItems: 'center',
    marginTop: THEME.spacing.lg,
  },
  backText: {
    color: THEME.colors.primary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  disabled: {
    opacity: 0.7,
  },
});
