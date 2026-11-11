import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Calendar, CheckSquare, Home, MapPin, DollarSign } from 'lucide-react-native';

import AuthScreen from './screens/AuthScreen';
import CalendarScreen from './screens/CalendarScreen';
import KanbanScreen from './screens/KanbanScreen';
import KidsScreen from './screens/KidsScreen';
import LocatorScreen from './screens/LocatorScreen';
import FinanceScreen from './screens/FinanceScreen';
import { api, setAuthToken, setUnauthorizedHandler } from './api';
import { clearToken, loadToken, saveToken } from './storage';
import useFamilyRealtime from './useFamilyRealtime';
import { THEME } from './theme';

const Tab = createBottomTabNavigator();

// WebSocket delivers updates instantly; polling is only a safety net
// (e.g. a missed message while the app was in the background).
const POLL_INTERVAL_MS = 30000;

// ---- Main App ----
export default function App() {
  const [booting, setBooting] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [familyOverview, setFamilyOverview] = useState(null);

  const handleLogout = useCallback(() => {
    setAuthToken(null);
    setCurrentUser(null);
    setFamilyOverview(null);
    clearToken().catch(() => {});
  }, []);

  const fetchFamilyData = useCallback(async () => {
    const familyId = currentUser?.family_id;
    if (!familyId) return;
    try {
      const data = await api.get(`/families/${familyId}/overview`);
      setFamilyOverview(data);
      const dbUser = data.users.find((member) => member.id === currentUser.id);
      if (dbUser) {
        setCurrentUser((prev) => (prev ? { ...prev, ...dbUser } : prev));
      }
    } catch (err) {
      // A 401 already triggers the global unauthorized handler (logout).
      if (err.status !== 401) {
        console.warn('Не удалось обновить данные семьи:', err.message);
      }
    }
  }, [currentUser?.family_id, currentUser?.id]);

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

  // Live updates + slow polling fallback.
  useFamilyRealtime(currentUser?.family_id, fetchFamilyData);

  useEffect(() => {
    if (!currentUser?.family_id) return undefined;
    fetchFamilyData();
    const interval = setInterval(fetchFamilyData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [currentUser?.family_id, fetchFamilyData]);

  const handleLoginSuccess = (auth) => {
    setAuthToken(auth?.access_token);
    saveToken(auth?.access_token).catch(() => {});
    setCurrentUser(auth);
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
            headerRight: () => (
              <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16 }}>
                <Text style={{ color: THEME.colors.danger, fontSize: 12 }}>Выйти</Text>
              </TouchableOpacity>
            ),
          })}
        >
          <Tab.Screen name="Календарь">
            {props => <CalendarScreen {...props} user={currentUser} refreshData={fetchFamilyData} data={familyOverview} />}
          </Tab.Screen>
          <Tab.Screen name="Задачи">
            {props => <KanbanScreen {...props} user={currentUser} refreshData={fetchFamilyData} data={familyOverview} />}
          </Tab.Screen>
          <Tab.Screen name="Мой Дом">
            {props => <KidsScreen {...props} user={currentUser} refreshData={fetchFamilyData} />}
          </Tab.Screen>
          <Tab.Screen name="Локатор">
            {props => <LocatorScreen {...props} user={currentUser} refreshData={fetchFamilyData} data={familyOverview} />}
          </Tab.Screen>
          <Tab.Screen name="Финансы">
            {props => <FinanceScreen {...props} user={currentUser} refreshData={fetchFamilyData} data={familyOverview} />}
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
