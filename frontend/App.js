import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  Calendar,
  CheckSquare,
  DollarSign,
  Home,
  MapPin,
  User as UserIcon,
} from 'lucide-react-native';

import AuthScreen from './screens/AuthScreen';
import CalendarScreen from './screens/CalendarScreen';
import KanbanScreen from './screens/KanbanScreen';
import KidsScreen from './screens/KidsScreen';
import LocatorScreen from './screens/LocatorScreen';
import FinanceScreen from './screens/FinanceScreen';
import ProfileScreen from './screens/ProfileScreen';
import { api, setAuthToken, setUnauthorizedHandler } from './api';
import {
  clearToken,
  loadNotificationsEnabled,
  loadPushToken,
  loadToken,
  saveToken,
  saveUserId,
} from './storage';
import { cancelEventReminders, scheduleEventReminders } from './notifications';
import { stopBackgroundTracking } from './backgroundLocation';
import useFamilyRealtime from './useFamilyRealtime';
import { THEME } from './theme';

const Tab = createBottomTabNavigator();

// WebSocket delivers updates instantly; a slow poll is only a safety net.
const POLL_INTERVAL_MS = 60000;

const EMPTY_REFRESH_KEYS = {
  events: 0,
  tasks: 0,
  expenses: 0,
  budgets: 0,
  members: 0,
};

// ---- Main App ----
export default function App() {
  const [booting, setBooting] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [family, setFamily] = useState(null);
  const [members, setMembers] = useState([]);
  const [refreshKeys, setRefreshKeys] = useState(EMPTY_REFRESH_KEYS);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const lastReminderSignature = useRef('');

  const handleLogout = useCallback(() => {
    const userId = currentUser?.id;
    if (userId) {
      loadPushToken()
        .then((token) => {
          if (!token) return;
          const query = `?token=${encodeURIComponent(token)}`;
          return api.delete(`/users/${userId}/push-subscriptions${query}`);
        })
        .catch(() => {});
    }

    setAuthToken(null);
    setCurrentUser(null);
    setFamily(null);
    setMembers([]);
    setRefreshKeys(EMPTY_REFRESH_KEYS);
    lastReminderSignature.current = '';
    cancelEventReminders().catch(() => {});
    stopBackgroundTracking().catch(() => {});
    saveUserId(null).catch(() => {});
    clearToken().catch(() => {});
  }, [currentUser?.id]);

  const handleNotificationsChanged = useCallback((enabled) => {
    lastReminderSignature.current = '';
    setNotificationsEnabled(enabled);
  }, []);

  const bumpRefreshKeys = useCallback((types) => {
    setRefreshKeys((previous) => {
      const next = { ...previous };
      types.forEach((type) => {
        next[type] = (next[type] || 0) + 1;
      });
      return next;
    });
  }, []);

  // Small, frequently-needed family metadata (name, join code, members).
  const refreshFamilyMeta = useCallback(async () => {
    const familyId = currentUser?.family_id;
    if (!familyId) return;
    try {
      const [familyData, memberList] = await Promise.all([
        api.get(`/families/${familyId}`),
        api.get(`/families/${familyId}/members`),
      ]);
      setFamily(familyData);
      setMembers(memberList || []);
      const me = (memberList || []).find(
        (member) => member.id === currentUser.id
      );
      if (me) {
        setCurrentUser((prev) => (prev ? { ...prev, ...me } : prev));
      }
    } catch (err) {
      if (err.status !== 401) {
        console.warn('Не удалось обновить данные семьи:', err.message);
      }
    }
  }, [currentUser?.family_id, currentUser?.id]);

  // Restore notification preference.
  useEffect(() => {
    loadNotificationsEnabled()
      .then(setNotificationsEnabled)
      .catch(() => {});
  }, []);

  // Re-register the stored push token (e.g. after a backend reset or relogin).
  useEffect(() => {
    if (!currentUser?.id) return;
    loadPushToken()
      .then((token) => {
        if (!token) return;
        return api.post(`/users/${currentUser.id}/push-subscriptions`, {
          token,
          platform: Platform.OS,
        });
      })
      .catch(() => {});
  }, [currentUser?.id]);

  // Restore the saved session on app launch.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await loadToken();
        if (!token) return;
        setAuthToken(token);
        const me = await api.me();
        if (!cancelled) {
          setCurrentUser({ ...me, access_token: token });
          saveUserId(me.id).catch(() => {});
        }
      } catch (err) {
        setAuthToken(null);
        await clearToken();
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Any 401 from the API means the token is no longer valid: sign out.
  useEffect(() => {
    setUnauthorizedHandler(handleLogout);
    return () => setUnauthorizedHandler(null);
  }, [handleLogout]);

  // Live updates bump only the resources that actually changed.
  useFamilyRealtime(currentUser?.family_id, (message) => {
    switch (message?.type) {
      case 'events':
        bumpRefreshKeys(['events']);
        break;
      case 'tasks':
        // Task completion changes the coin balance shown in the family meta.
        bumpRefreshKeys(['tasks', 'members']);
        break;
      case 'expenses':
        bumpRefreshKeys(['expenses']);
        break;
      case 'budgets':
        bumpRefreshKeys(['budgets']);
        break;
      case 'room':
      case 'location':
      case 'family':
        bumpRefreshKeys(['members']);
        break;
      default:
        bumpRefreshKeys(['events', 'tasks', 'expenses', 'budgets', 'members']);
    }
  });

  useEffect(() => {
    if (!currentUser?.family_id) return undefined;
    const interval = setInterval(
      () => bumpRefreshKeys(['events', 'tasks', 'expenses', 'budgets', 'members']),
      POLL_INTERVAL_MS
    );
    return () => clearInterval(interval);
  }, [currentUser?.family_id, bumpRefreshKeys]);

  useEffect(() => {
    if (currentUser?.family_id) {
      refreshFamilyMeta();
    }
  }, [currentUser?.family_id, refreshKeys.members, refreshFamilyMeta]);

  // Local reminders use only the current user's events (small targeted call).
  useEffect(() => {
    if (!currentUser?.id) return undefined;

    if (!notificationsEnabled) {
      lastReminderSignature.current = '';
      cancelEventReminders().catch(() => {});
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const events = await api.get(`/users/${currentUser.id}/events`);
        if (cancelled) return;

        const signature = (events || [])
          .map(
            (event) =>
              `${event.id}:${event.start_time}:${event.end_time}:${event.recurrence}:${event.recurrence_day}:${event.recurrence_until}`
          )
          .join('|');

        if (signature === lastReminderSignature.current) return;
        lastReminderSignature.current = signature;
        await scheduleEventReminders(events, currentUser.id);
      } catch (err) {
        if (err.status !== 401) {
          console.warn('Не удалось обновить напоминания:', err.message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, notificationsEnabled, refreshKeys.events]);

  const handleLoginSuccess = (auth) => {
    setAuthToken(auth?.access_token);
    saveToken(auth?.access_token).catch(() => {});
    setCurrentUser(auth);
    saveUserId(auth?.id).catch(() => {});
    setRefreshKeys(EMPTY_REFRESH_KEYS);
  };

  // Step 0: restoring the session
  if (booting) {
    return (
      <SafeAreaProvider>
        <View style={styles.splash}>
          <Text style={styles.splashTitle}>FamilyCRM 🏠</Text>
          <ActivityIndicator size="large" color={THEME.colors.primary} />
        </View>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  // Step 1: Not logged in -> show Auth
  if (!currentUser) {
    return (
      <SafeAreaProvider>
        <AuthScreen onLoginSuccess={handleLoginSuccess} />
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  // Step 2: Fully set up -> show main app
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ color, size }) => {
              if (route.name === 'Календарь') {
                return <Calendar color={color} size={size} />;
              } else if (route.name === 'Задачи') {
                return <CheckSquare color={color} size={size} />;
              } else if (route.name === 'Мой Дом') {
                return <Home color={color} size={size} />;
              } else if (route.name === 'Локатор') {
                return <MapPin color={color} size={size} />;
              } else if (route.name === 'Финансы') {
                return <DollarSign color={color} size={size} />;
              } else if (route.name === 'Профиль') {
                return <UserIcon color={color} size={size} />;
              }
              return null;
            },
            tabBarActiveTintColor: THEME.colors.primary,
            tabBarInactiveTintColor: THEME.colors.textLight,
            tabBarStyle: {
              backgroundColor: '#FFFFFF',
              borderTopColor: THEME.colors.border,
              borderTopWidth: 1,
              paddingBottom: 5,
              paddingTop: 5,
              height: 60,
            },
            tabBarLabelStyle: {
              fontSize: 9,
            },
            headerStyle: {
              backgroundColor: THEME.colors.background,
              shadowColor: 'transparent',
              elevation: 0,
            },
            headerTitleStyle: {
              color: THEME.colors.text,
              fontSize: 20,
              fontWeight: 'bold',
            },
          })}
        >
          <Tab.Screen name="Календарь">
            {(props) => (
              <CalendarScreen
                {...props}
                user={currentUser}
                members={members}
                refreshKey={refreshKeys.events}
              />
            )}
          </Tab.Screen>
          <Tab.Screen name="Задачи">
            {(props) => (
              <KanbanScreen
                {...props}
                user={currentUser}
                members={members}
                refreshKey={refreshKeys.tasks}
                refreshData={refreshFamilyMeta}
              />
            )}
          </Tab.Screen>
          <Tab.Screen name="Мой Дом">
            {(props) => (
              <KidsScreen
                {...props}
                user={currentUser}
                refreshKey={refreshKeys.members}
                refreshData={refreshFamilyMeta}
              />
            )}
          </Tab.Screen>
          <Tab.Screen name="Локатор">
            {(props) => (
              <LocatorScreen
                {...props}
                user={currentUser}
                members={members}
                family={family}
                refreshKey={refreshKeys.members}
                refreshData={refreshFamilyMeta}
              />
            )}
          </Tab.Screen>
          <Tab.Screen name="Финансы">
            {(props) => (
              <FinanceScreen
                {...props}
                user={currentUser}
                refreshKey={refreshKeys.expenses}
                budgetsRefreshKey={refreshKeys.budgets}
                refreshData={refreshFamilyMeta}
              />
            )}
          </Tab.Screen>
          <Tab.Screen name="Профиль">
            {(props) => (
              <ProfileScreen
                {...props}
                user={currentUser}
                family={family}
                refreshData={refreshFamilyMeta}
                onLogout={handleLogout}
                onAuthUpdated={handleLoginSuccess}
                notificationsEnabled={notificationsEnabled}
                onNotificationsChanged={handleNotificationsChanged}
              />
            )}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME.colors.text,
    marginBottom: 20,
  },
});
