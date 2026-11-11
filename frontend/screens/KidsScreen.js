import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../api';
import { formatDate } from '../datetime';
import { THEME } from '../theme';

export default function KidsScreen({ user, refreshData }) {
  const [room, setRoom] = useState(null);
  const [shopItems, setShopItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

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
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    } else {
      Alert.alert(title, message, [
        { text: 'Отмена', style: 'cancel' },
        { text: 'ОК', onPress: onConfirm, style: 'destructive' },
      ]);
    }
  };

  const loadRoom = useCallback(async () => {
    try {
      const [roomData, items] = await Promise.all([
        api.get(`/users/${user.id}/room`),
        api.get('/shop/items'),
      ]);
      setRoom(roomData);
      setShopItems(items || []);
      setErrorMsg('');
    } catch (err) {
      setErrorMsg(err.message || 'Не удалось загрузить комнату');
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  // Reload when the profile changes or when the coin balance is updated by
  // another screen (task completed, reward revoked, purchase).
  useEffect(() => {
    loadRoom();
  }, [loadRoom, user.coins]);

  const coins = room ? room.coins : user.coins || 0;
  const purchasedKeys = (room?.purchases || []).map((purchase) => purchase.item_key);

  const buyItem = (item) => {
    if (busyKey) return;
    if (purchasedKeys.includes(item.key)) {
      showAlert('Уже куплено', 'Этот предмет уже есть в твоей комнате!');
      return;
    }
    if (coins < item.price) {
      showAlert(
        'Недостаточно коинов 😔',
        `Нужно ${item.price} 🪙, а у тебя ${coins} 🪙.\n` +
          'Выполняй задачи в разделе "Задачи", чтобы заработать!'
      );
      return;
    }

    showConfirm(
      'Подтвердить покупку?',
      `Купить "${item.name}" за ${item.price} 🪙?`,
      async () => {
        setBusyKey(item.key);
        try {
          await api.post('/shop/purchases', { item_key: item.key });
          await loadRoom();
          refreshData?.();
          showAlert('Ура! 🎉', `Ты купил ${item.name} для своей виртуальной комнаты!`);
        } catch (err) {
          showAlert('Ошибка', err.message || 'Не удалось совершить покупку');
        } finally {
          setBusyKey(null);
        }
      }
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={THEME.colors.primary} />
        <Text style={styles.loadingText}>Загружаем комнату…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Домик {user.name} 🏠</Text>
        <View style={styles.coinBadge}>
          <Text style={styles.coinText}>🪙 {coins}</Text>
        </View>
      </View>

      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

      <Text style={styles.sectionTitle}>Твоя комната</Text>
      <View style={styles.roomCanvas}>
        <View style={styles.grid}>
          {(room?.purchases || []).map((purchase) => (
            <View key={purchase.id} style={styles.placedItem}>
              <Text style={styles.itemEmoji}>
                {shopItems.find((item) => item.key === purchase.item_key)?.emoji || '🎁'}
              </Text>
              <Text style={styles.itemName}>{purchase.item_name}</Text>
            </View>
          ))}
          {(room?.purchases || []).length === 0 && (
            <Text style={styles.emptyRoomText}>
              Здесь пусто... Купи что-нибудь в магазине!
            </Text>
          )}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Магазин мебели и питомцев 🛒</Text>
      <Text style={styles.shopHint}>Зарабатывай коины, выполняя семейные задачи!</Text>
      <View style={styles.shopGrid}>
        {shopItems.map((item) => {
          const isOwned = purchasedKeys.includes(item.key);
          const canAfford = coins >= item.price;
          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.shopCard,
                isOwned && styles.shopCardOwned,
                !isOwned && !canAfford && styles.shopCardLocked,
              ]}
              onPress={() => buyItem(item)}
              disabled={busyKey === item.key}
            >
              <Text style={styles.shopEmoji}>{item.emoji}</Text>
              <Text style={styles.shopName}>{item.name}</Text>
              {isOwned ? (
                <Text style={styles.ownedTag}>✅ Есть</Text>
              ) : (
                <Text style={[styles.shopCost, !canAfford && styles.shopCostLocked]}>
                  🪙 {item.price}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>История покупок</Text>
      <View style={styles.historyList}>
        {(room?.purchases || []).map((purchase) => (
          <View key={`history-${purchase.id}`} style={styles.historyRow}>
            <Text style={styles.historyTitle}>{purchase.item_name}</Text>
            <Text style={styles.historyMeta}>
              −{purchase.price} 🪙 · {formatDate(purchase.created_at)}
            </Text>
          </View>
        ))}
        {(room?.purchases || []).length === 0 && (
          <Text style={styles.emptyRoomText}>Покупок пока нет.</Text>
        )}
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.background,
  },
  loadingText: {
    marginTop: 8,
    color: THEME.colors.textLight,
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
  errorText: {
    color: THEME.colors.danger,
    fontSize: 12,
    marginBottom: THEME.spacing.sm,
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
    marginBottom: THEME.spacing.md,
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
  },
  historyList: {
    backgroundColor: '#FFFFFF',
    borderRadius: THEME.roundness.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.sm,
    marginBottom: THEME.spacing.xl,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5EFE6',
  },
  historyTitle: {
    fontSize: 12,
    color: THEME.colors.text,
  },
  historyMeta: {
    fontSize: 10,
    color: THEME.colors.textLight,
  },
});
