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
