import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, StatusBar, ScrollView, TouchableOpacity, Image, BackHandler, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
// import * as Notifications from 'expo-notifications';
// import { notificationService } from '../services/notifications';
import { apiService } from '../services/api';
import { biometricService } from '../services/biometric';
import { useAppStore, TradeAlert } from '../store/appStore';
import AlertCard from '../components/AlertCard';
import Button from '../components/Button';

interface CryptoAsset {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  image?: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const { botRunning, alerts, addAlert, setBotRunning } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [cryptoAssets, setCryptoAssets] = useState<CryptoAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  // Handle Android back button - exit app if on home screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // On home screen, let the default back behavior happen (exit app)
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => subscription.remove();
    }, [])
  );

  useEffect(() => {
    authenticateUser();
    // registerForPushNotifications(); // Disabled for Expo Go
    loadAvailableSymbols();
    loadCryptoAssets();

    // Notifications disabled for Expo Go compatibility
    // notificationListener.current = notificationService.addNotificationReceivedListener((notification) => {
    //   const data = notification.request.content.data;
    //   if (data.type === 'TRADE_ALERT') {
    //     const alert: TradeAlert = {
    //       id: `${Date.now()}-${Math.random()}`,
    //       type: data.type as string,
    //       symbol: data.symbol as string,
    //       action: data.action as 'BUY' | 'SELL',
    //       confidence: data.confidence ? parseFloat(data.confidence as string) : undefined,
    //       timestamp: Date.now(),
    //     };
    //     addAlert(alert);
    //   }
    // });

    // responseListener.current = notificationService.addNotificationResponseListener((response) => {
    //   console.log('Notificação tocada:', response);
    // });

    return () => {
      // if (notificationListener.current) {
      //   Notifications.removeNotificationSubscription(notificationListener.current);
      // }
      // if (responseListener.current) {
      //   Notifications.removeNotificationSubscription(responseListener.current);
      // }
    };
  }, []);

  const loadCryptoAssets = async () => {
    setLoadingAssets(true);
    try {
      // Fetch top cryptocurrencies from CoinGecko with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false',
        { 
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          }
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0) {
        setCryptoAssets(data.map((coin: any) => ({
          id: coin.id,
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          current_price: coin.current_price || 0,
          price_change_percentage_24h: coin.price_change_percentage_24h || 0,
          image: coin.image,
        })));
      } else {
        throw new Error('No data received');
      }
    } catch (error) {
      console.error('Erro ao carregar ativos:', error);
      // Fallback com dados reais aproximados
      setCryptoAssets([
        { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', current_price: 97500, price_change_percentage_24h: 1.2, image: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png' },
        { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', current_price: 3450, price_change_percentage_24h: 2.1, image: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
        { id: 'binancecoin', symbol: 'BNB', name: 'BNB', current_price: 710, price_change_percentage_24h: 0.8, image: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png' },
        { id: 'solana', symbol: 'SOL', name: 'Solana', current_price: 215, price_change_percentage_24h: 3.5, image: 'https://assets.coingecko.com/coins/images/4128/small/solana.png' },
        { id: 'ripple', symbol: 'XRP', name: 'XRP', current_price: 2.35, price_change_percentage_24h: -0.5, image: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png' },
        { id: 'cardano', symbol: 'ADA', name: 'Cardano', current_price: 1.05, price_change_percentage_24h: 1.8, image: 'https://assets.coingecko.com/coins/images/975/small/cardano.png' },
        { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', current_price: 0.38, price_change_percentage_24h: 4.2, image: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png' },
        { id: 'polkadot', symbol: 'DOT', name: 'Polkadot', current_price: 7.85, price_change_percentage_24h: 2.3, image: 'https://assets.coingecko.com/coins/images/12171/small/polkadot.png' },
      ]);
    } finally {
      setLoadingAssets(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCryptoAssets();
    loadAvailableSymbols();
  };

  const openChartDetail = (asset: CryptoAsset) => {
    router.push({
      pathname: '/chartDetail',
      params: { symbol: `${asset.symbol}USDT` },
    });
  };

  const authenticateUser = async () => {
    const available = await biometricService.isAvailable();
    if (available) {
      const success = await biometricService.authenticate('Desbloqueie para ver sua carteira');
      setAuthenticated(success);
    } else {
      setAuthenticated(true);
    }
  };

  // const registerForPushNotifications = async () => {
  //   await notificationService.requestPermissionsAndRegister();
  // };

  const loadAvailableSymbols = async () => {
    try {
      const response = await fetch('http://192.168.1.7:8000/api/bot/symbols');
      const data = await response.json();
      setAvailableSymbols(data.available || []);
      setSelectedSymbols(data.currently_monitoring || []);
    } catch (error) {
      console.error('Erro ao carregar símbolos:', error);
    }
  };

  const toggleSymbol = (symbol: string) => {
    setSelectedSymbols(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  };

  const saveSymbols = async () => {
    if (selectedSymbols.length === 0) {
      alert('Selecione pelo menos 1 criptomoeda');
      return;
    }
    
    try {
      await fetch('http://192.168.1.7:8000/api/bot/symbols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedSymbols),
      });
      setShowSymbolPicker(false);
    } catch (error) {
      alert('Erro ao salvar símbolos');
    }
  };

  const toggleBot = async () => {
    setLoading(true);
    try {
      const newState = botRunning ? 'stop' : 'start';
      await apiService.changeState(newState);
      setBotRunning(!botRunning);
    } catch (error) {
      console.error('Erro ao mudar estado do bot:', error);
      alert('Falha ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <View style={styles.lockedContainer}>
        <Text style={styles.lockedText}>🔒 Autentique-se</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      {/* Header with Logo */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image 
            source={require('../assets/icon.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>TradeBot AI</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: botRunning ? '#10B981' : '#64748B' }]}>
          <Text style={styles.statusText}>{botRunning ? 'ATIVO' : 'PARADO'}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {/* Crypto Assets Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Criptomoedas</Text>
          <Text style={styles.sectionSubtitle}>Toque para ver o gráfico</Text>
          
          {loadingAssets ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.loadingText}>Carregando...</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.assetsScroll}>
              {cryptoAssets.map((asset) => (
                <TouchableOpacity
                  key={asset.id}
                  style={styles.assetCard}
                  onPress={() => openChartDetail(asset)}
                  activeOpacity={0.7}
                >
                  <View style={styles.assetHeader}>
                    {asset.image ? (
                      <Image source={{ uri: asset.image }} style={styles.assetIcon} />
                    ) : (
                      <View style={styles.assetIconPlaceholder}>
                        <Text style={styles.assetIconText}>{asset.symbol.charAt(0)}</Text>
                      </View>
                    )}
                    <Text style={styles.assetSymbol}>{asset.symbol}</Text>
                  </View>
                  <Text style={styles.assetPrice}>
                    ${asset.current_price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </Text>
                  <View style={[
                    styles.assetChange,
                    { backgroundColor: asset.price_change_percentage_24h >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)' }
                  ]}>
                    <Text style={[
                      styles.assetChangeText,
                      { color: asset.price_change_percentage_24h >= 0 ? '#10B981' : '#EF4444' }
                    ]}>
                      {asset.price_change_percentage_24h >= 0 ? '↑' : '↓'} {Math.abs(asset.price_change_percentage_24h).toFixed(2)}%
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Bot Controls */}
        <View style={styles.controls}>
          <Button
            title={botRunning ? 'Parar Bot' : 'Iniciar Bot'}
            onPress={toggleBot}
            variant={botRunning ? 'danger' : 'primary'}
            loading={loading}
            style={styles.mainButton}
          />
          
          <TouchableOpacity 
            style={styles.symbolButton}
            onPress={() => setShowSymbolPicker(!showSymbolPicker)}
          >
            <Text style={styles.symbolButtonText}>
              ⚙️ Moedas ({selectedSymbols.length}/10)
            </Text>
          </TouchableOpacity>

          {showSymbolPicker && (
            <View style={styles.symbolPicker}>
              <Text style={styles.pickerTitle}>Selecione as Criptomoedas:</Text>
              {availableSymbols.map(symbol => (
                <TouchableOpacity
                  key={symbol}
                  style={[
                    styles.symbolOption,
                    selectedSymbols.includes(symbol) && styles.symbolOptionSelected
                  ]}
                  onPress={() => toggleSymbol(symbol)}
                >
                  <Text style={styles.symbolOptionText}>{symbol}</Text>
                  {selectedSymbols.includes(symbol) && <Text>✓</Text>}
                </TouchableOpacity>
              ))}
              <Button title="Salvar" onPress={saveSymbols} style={styles.saveButton} />
            </View>
          )}
        </View>

        {/* Recent Alerts */}
        <View style={styles.alertsHeader}>
          <Text style={styles.alertsTitle}>Alertas Recentes</Text>
          <Text style={styles.alertsCount}>{alerts.length}</Text>
        </View>

        {alerts.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum alerta ainda. Inicie o bot para começar!</Text>
        ) : (
          alerts.map((item) => <AlertCard key={item.id} alert={item} />)
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 51,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 35,
    height: 35,
    borderRadius: 9,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 10,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 14,
  },
  assetsScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  assetCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    width: 130,
    borderWidth: 1,
    borderColor: '#334155',
  },
  assetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  assetIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  assetIconPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assetIconText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  assetSymbol: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  assetPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 8,
  },
  assetChange: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  assetChangeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  controls: {
    padding: 20,
  },
  mainButton: {
    width: '100%',
  },
  alertsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  alertsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  alertsCount: {
    fontSize: 14,
    color: '#64748B',
  },
  list: {
    paddingBottom: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 14,
    marginTop: 20,
    paddingHorizontal: 40,
  },
  lockedContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedText: {
    fontSize: 20,
    color: '#F1F5F9',
  },
  symbolButton: {
    marginTop: 12,
    padding: 14,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  symbolButtonText: {
    color: '#F1F5F9',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
  symbolPicker: {
    marginTop: 16,
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pickerTitle: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  symbolOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  symbolOptionSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#60A5FA',
  },
  symbolOptionText: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    marginTop: 12,
  },
});
