import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { THEME } from '../theme';
import { API_URL } from '../App';

export default function KidsScreen({ user, refreshData }) {
  const [purchasedItems, setPurchasedItems] = useState(['Обои', 'Коврик']);
  const [localCoins, setLocalCoins] = useState(user.coins || 0);

  // Keep local coins in sync with backend user prop
  useEffect(() => {
    setLocalCoins(user.coins || 0);
  }, [user.coins]);

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

  const shopItems = [
    { name: 'Кровать супергероя', cost: 40, icon: '🛏️' },
    { name: 'Игровой ПК', cost: 80, icon: '🖥️' },
    { name: 'Кот Рыжик', cost: 60, icon: '🐈' },
    { name: 'Полка с комиксами', cost: 25, icon: '📚' },
    { name: 'Ящик для игрушек', cost: 20, icon: '📦' },
    { name: 'Торшер', cost: 15, icon: '💡' },
    { name: 'Плакат Супергероев', cost: 10, icon: '🖼️' },
    { name: 'Аквариум', cost: 50, icon: '🐠' },
  ];

  const buyItem = (item) => {
    if (purchasedItems.includes(item.name)) {
      showAlert('Уже куплено', 'Этот предмет уже есть в твоей комнате!');
      return;
    }
    if (localCoins < item.cost) {
      showAlert(
        'Недостаточно коинов 😔',
        `Нужно ${item.cost} 🪙, а у тебя ${localCoins} 🪙.\nВыполняй задачи в разделе "Задачи", чтобы заработать!`
      );
      return;
    }

    showConfirm(
      'Подтвердить покупку?',
      `Купить "${item.name}" за ${item.cost} 🪙?`,
      () => {
        setLocalCoins(prev => prev - item.cost);
        setPurchasedItems(prev => [...prev, item.name]);
        showAlert('Ура! 🎉', `Ты купил ${item.name} для своей виртуальной комнаты!`);
      }
    );
  };

  const getEmojiRepresentation = (name) => {
    const item = shopItems.find(i => i.name === name);
    if (item) return item.icon;
    switch (name) {
      case 'Обои': return '🎨';
      case 'Коврик': return '🧹';
      default: return '❓';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Домик {user.name} 🏠</Text>
        <View style={styles.coinBadge}>
          <Text style={styles.coinText}>🪙 {localCoins}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Твоя комната</Text>
      <View style={styles.roomCanvas}>
        <View style={styles.grid}>
          {purchasedItems.map((item, idx) => (
            <View key={idx} style={styles.placedItem}>
              <Text style={styles.itemEmoji}>{getEmojiRepresentation(item)}</Text>
              <Text style={styles.itemName}>{item}</Text>
            </View>
          ))}
          {purchasedItems.length === 0 && (
            <Text style={styles.emptyRoomText}>Здесь пусто... Купи что-нибудь в магазине!</Text>
          )}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Магазин мебели и питомцев 🛒</Text>
      <Text style={styles.shopHint}>Зарабатывай коины, выполняя семейные задачи!</Text>
      <View style={styles.shopGrid}>
        {shopItems.map((item, idx) => {
          const isOwned = purchasedItems.includes(item.name);
          const canAfford = localCoins >= item.cost;
          return (
            <TouchableOpacity 
              key={idx} 
              style={[
                styles.shopCard, 
                isOwned && styles.shopCardOwned,
                !isOwned && !canAfford && styles.shopCardLocked
              ]}
              onPress={() => buyItem(item)}
            >
              <Text style={styles.shopEmoji}>{item.icon}</Text>
              <Text style={styles.shopName}>{item.name}</Text>
              {isOwned ? (
                <Text style={styles.ownedTag}>✅ Есть</Text>
              ) : (
                <Text style={[styles.shopCost, !canAfford && styles.shopCostLocked]}>
                  🪙 {item.cost}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    padding: THEME.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: THEME.spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: THEME.colors.text,
  },
  coinBadge: {
    backgroundColor: '#FFF2CC',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    borderColor: '#FFD9C0',
  },
  coinText: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#D97706',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME.colors.text,
    marginVertical: THEME.spacing.sm,
  },
  shopHint: {
    fontSize: 11,
    color: THEME.colors.textLight,
    marginBottom: THEME.spacing.sm,
    fontStyle: 'italic',
  },
  roomCanvas: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.lg,
    padding: THEME.spacing.md,
    minHeight: 160,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    justifyContent: 'center',
    marginBottom: THEME.spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  placedItem: {
    alignItems: 'center',
    margin: 8,
    width: 60,
  },
  itemEmoji: {
    fontSize: 32,
  },
  itemName: {
    fontSize: 9,
    textAlign: 'center',
    color: THEME.colors.textLight,
  },
  emptyRoomText: {
    color: THEME.colors.textLight,
    fontStyle: 'italic',
  },
  shopGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.xl,
  },
  shopCard: {
    backgroundColor: '#FFFFFF',
    width: '48%',
    borderRadius: THEME.roundness.md,
    padding: THEME.spacing.md,
    alignItems: 'center',
    marginBottom: THEME.spacing.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  shopCardOwned: {
    opacity: 0.6,
    backgroundColor: '#EADBC8',
  },
  shopCardLocked: {
    opacity: 0.75,
  },
  shopEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  shopName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: THEME.colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  shopCost: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#D97706',
  },
  shopCostLocked: {
    color: THEME.colors.danger,
  },
  ownedTag: {
    fontSize: 10,
    fontWeight: 'bold',
    color: THEME.colors.primary,
  }
});
