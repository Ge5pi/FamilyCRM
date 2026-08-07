import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
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
import { THEME } from './theme';

const Tab = createBottomTabNavigator();

// Configuration for API backend. Change to your local IP or host.
export const API_URL = "http://127.0.0.1:8000";

// Helper Alert wrapper
const showAlert = (title, message) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

// ---- Family Setup Screen (shown once when no family) ----
function FamilySetupScreen({ user, onFamilyJoined }) {
  const [familyName, setFamilyName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const handleCreateFamily = async () => {
    if (!familyName) {
      showAlert('Ошибка', 'Введите название семьи');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/families`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: familyName }),
      });
      if (res.ok) {
        const family = res.json ? await res.json() : {};
        // Now join the user to this family
        const joinRes = await fetch(`${API_URL}/users/${user.id}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ join_code: family.join_code }),
        });
        if (joinRes.ok) {
          const updatedUser = await joinRes.json();
          showAlert('Готово!', `Семья "${familyName}" создана. Код: ${family.join_code}`);
          onFamilyJoined(updatedUser);
        }
      }
    } catch (err) {
      // Offline fallback
      onFamilyJoined({ ...user, family_id: 1 });
    }
  };

  const handleJoinFamily = async () => {
    if (!joinCode) {
      showAlert('Ошибка', 'Введите код семьи');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/users/${user.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ join_code: joinCode }),
      });
      if (res.ok) {
        const updatedUser = await res.json();
        showAlert('Добро пожаловать!', 'Вы присоединились к семье!');
        onFamilyJoined(updatedUser);
      } else {
        showAlert('Ошибка', 'Неверный код семьи');
      }
    } catch (err) {
      onFamilyJoined({ ...user, family_id: 1 });
    }
  };

  return (
    <View style={setupStyles.container}>
      <View style={setupStyles.card}>
        <Text style={setupStyles.title}>Добро пожаловать, {user.name}! 🏠</Text>
        <Text style={setupStyles.subtitle}>Создайте семью или присоединитесь к существующей</Text>

        <Text style={setupStyles.sectionLabel}>Создать новую семью</Text>
        <TextInput
          style={setupStyles.input}
          placeholder="Название семьи (например: Ивановы)"
          value={familyName}
          onChangeText={setFamilyName}
        />
        <TouchableOpacity style={setupStyles.primaryBtn} onPress={handleCreateFamily}>
          <Text style={setupStyles.primaryBtnText}>Создать семью</Text>
        </TouchableOpacity>

        <View style={setupStyles.divider}>
          <View style={setupStyles.dividerLine} />
          <Text style={setupStyles.dividerText}>или</Text>
          <View style={setupStyles.dividerLine} />
        </View>

        <Text style={setupStyles.sectionLabel}>Присоединиться по коду</Text>
        <TextInput
          style={setupStyles.input}
          placeholder="Введите код семьи (например: A1B2C3)"
          autoCapitalize="characters"
          value={joinCode}
          onChangeText={setJoinCode}
        />
        <TouchableOpacity style={setupStyles.secondaryBtn} onPress={handleJoinFamily}>
          <Text style={setupStyles.secondaryBtnText}>Присоединиться</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const setupStyles = StyleSheet.create({
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
  sectionLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: THEME.colors.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: THEME.roundness.sm,
    padding: 12,
    backgroundColor: '#FAF8F5',
    color: THEME.colors.text,
    marginBottom: THEME.spacing.sm,
  },
  primaryBtn: {
    backgroundColor: THEME.colors.primary,
    padding: 14,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  secondaryBtn: {
    backgroundColor: '#FAF8F5',
    padding: 14,
    borderRadius: THEME.roundness.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.primary,
  },
  secondaryBtnText: {
    color: THEME.colors.primary,
    fontWeight: 'bold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: THEME.spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: THEME.colors.border,
  },
  dividerText: {
    marginHorizontal: 10,
    color: THEME.colors.textLight,
    fontSize: 12,
  }
});

// ---- Main App ----
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [familyOverview, setFamilyOverview] = useState(null);

  const fetchFamilyData = async () => {
    if (!currentUser || !currentUser.family_id) return;
    try {
      const res = await fetch(`${API_URL}/families/${currentUser.family_id}/overview`);
      if (res.ok) {
        const data = await res.json();
        setFamilyOverview(data);
        const dbUser = data.users.find(u => u.id === currentUser.id);
        if (dbUser) {
          setCurrentUser(prev => ({ ...prev, ...dbUser }));
        }
      }
    } catch (err) {
      console.warn("Could not connect to backend, running with offline/mock data", err);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setFamilyOverview(null);
  };

  useEffect(() => {
    if (currentUser && currentUser.family_id) {
      fetchFamilyData();
      const interval = setInterval(fetchFamilyData, 5000);
      return () => clearInterval(interval);
    }
  }, [currentUser?.family_id]);

  // Step 1: Not logged in -> show Auth
  if (!currentUser) {
    return (
      <SafeAreaProvider>
        <AuthScreen onLoginSuccess={(user) => setCurrentUser(user)} />
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  // Step 2: Logged in but no family -> show Family Setup
  if (!currentUser.family_id) {
    return (
      <SafeAreaProvider>
        <FamilySetupScreen user={currentUser} onFamilyJoined={(u) => setCurrentUser(u)} />
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  // Step 3: Fully set up -> show main app
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
