import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  BackHandler,
  Modal,
  PanResponder,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

interface PriceData {
  timestamp: number;
  price: number;
}

interface CryptoInfo {
  name: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
}

type PeriodKey = '1D' | '5D' | '1M' | '6M' | '1Y' | '5Y';

const PERIODS: { key: PeriodKey; label: string; days: string }[] = [
  { key: '1D', label: '1D', days: '1' },
  { key: '5D', label: '5D', days: '5' },
  { key: '1M', label: '1M', days: '30' },
  { key: '6M', label: '6M', days: '180' },
  { key: '1Y', label: '1A', days: '365' },
  { key: '5Y', label: '5A', days: '1825' },
];

const CRYPTO_IDS: { [key: string]: string } = {
  'BTCUSDT': 'bitcoin',
  'BTC': 'bitcoin',
  'ETHUSDT': 'ethereum',
  'ETH': 'ethereum',
  'BNBUSDT': 'binancecoin',
  'BNB': 'binancecoin',
  'SOLUSDT': 'solana',
  'SOL': 'solana',
  'XRPUSDT': 'ripple',
  'XRP': 'ripple',
  'ADAUSDT': 'cardano',
  'ADA': 'cardano',
  'DOGEUSDT': 'dogecoin',
  'DOGE': 'dogecoin',
  'DOTUSDT': 'polkadot',
  'DOT': 'polkadot',
  'MATICUSDT': 'matic-network',
  'MATIC': 'matic-network',
  'LINKUSDT': 'chainlink',
  'LINK': 'chainlink',
};

export default function ChartDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('1D');
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [cryptoInfo, setCryptoInfo] = useState<CryptoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreenMode, setFullscreenMode] = useState(false);
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const [zoomLevel, setZoomLevel] = useState(1);
  const scaleValue = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);

  // Pan responder for pinch-to-zoom in fullscreen
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        scaleValue.setOffset(lastScale.current);
        scaleValue.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Simple pinch detection using number of touches
        if (gestureState.numberActiveTouches === 2) {
          const scale = Math.max(0.5, Math.min(3, lastScale.current + gestureState.dy * -0.005));
          scaleValue.setValue(scale - lastScale.current);
        }
      },
      onPanResponderRelease: () => {
        scaleValue.flattenOffset();
        scaleValue.addListener(({ value }) => {
          lastScale.current = Math.max(0.5, Math.min(3, value));
          setZoomLevel(lastScale.current);
        });
      },
    })
  ).current;

  // Open fullscreen landscape mode (simulated rotation via CSS transform)
  const openFullscreen = async () => {
    setFullscreenMode(true);
  };

  // Close fullscreen and return to portrait
  const closeFullscreen = async () => {
    setFullscreenMode(false);
    setZoomLevel(1);
    lastScale.current = 1;
    scaleValue.setValue(1);
  };

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (fullscreenMode) {
          closeFullscreen();
          return true;
        }
        router.back();
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => subscription.remove();
    }, [router, fullscreenMode])
  );

  useEffect(() => {
    loadChartData();
  }, [symbol, selectedPeriod]);

  const getCryptoId = (sym: string): string => {
    const cleanSymbol = sym?.replace('USDT', '').toUpperCase() || 'BTC';
    return CRYPTO_IDS[cleanSymbol] || CRYPTO_IDS[sym || ''] || 'bitcoin';
  };

  const loadChartData = async () => {
    setLoading(true);
    const cryptoId = getCryptoId(symbol || 'BTCUSDT');
    const period = PERIODS.find(p => p.key === selectedPeriod) || PERIODS[0];

    try {
      // Fetch price history from CoinGecko
      const chartResponse = await fetch(
        `https://api.coingecko.com/api/v3/coins/${cryptoId}/market_chart?vs_currency=usd&days=${period.days}`
      );
      const chartData = await chartResponse.json();

      if (chartData.prices) {
        const formattedData: PriceData[] = chartData.prices.map((item: [number, number]) => ({
          timestamp: item[0],
          price: item[1],
        }));
        setPriceData(formattedData);
      }

      // Fetch current info
      const infoResponse = await fetch(
        `https://api.coingecko.com/api/v3/coins/${cryptoId}?localization=false&tickers=false&community_data=false&developer_data=false`
      );
      const infoData = await infoResponse.json();

      if (infoData) {
        setCryptoInfo({
          name: infoData.name,
          symbol: infoData.symbol?.toUpperCase(),
          current_price: infoData.market_data?.current_price?.usd || 0,
          price_change_percentage_24h: infoData.market_data?.price_change_percentage_24h || 0,
          market_cap: infoData.market_data?.market_cap?.usd || 0,
          total_volume: infoData.market_data?.total_volume?.usd || 0,
          high_24h: infoData.market_data?.high_24h?.usd || 0,
          low_24h: infoData.market_data?.low_24h?.usd || 0,
        });
      }
    } catch (error) {
      console.error('Error loading chart data:', error);
      // Generate mock data
      generateMockData();
    } finally {
      setLoading(false);
    }
  };

  const generateMockData = () => {
    const now = Date.now();
    const period = PERIODS.find(p => p.key === selectedPeriod) || PERIODS[0];
    const days = parseInt(period.days);
    const dataPoints = days <= 5 ? days * 24 : days;
    const interval = (days * 24 * 60 * 60 * 1000) / dataPoints;

    const basePrice = symbol?.includes('BTC') ? 45000 : symbol?.includes('ETH') ? 3200 : 100;
    const mockData: PriceData[] = [];

    for (let i = 0; i < dataPoints; i++) {
      const variation = Math.sin(i * 0.1) * (basePrice * 0.05) + (Math.random() - 0.5) * (basePrice * 0.02);
      mockData.push({
        timestamp: now - (dataPoints - i) * interval,
        price: basePrice + variation,
      });
    }

    setPriceData(mockData);
    setCryptoInfo({
      name: symbol?.replace('USDT', '') || 'Bitcoin',
      symbol: symbol?.replace('USDT', '') || 'BTC',
      current_price: mockData[mockData.length - 1]?.price || basePrice,
      price_change_percentage_24h: 2.5,
      market_cap: 850000000000,
      total_volume: 25000000000,
      high_24h: basePrice * 1.05,
      low_24h: basePrice * 0.95,
    });
  };

  const renderChart = () => {
    if (priceData.length === 0) {
      return (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartPlaceholderText}>Sem dados disponíveis</Text>
        </View>
      );
    }

    const prices = priceData.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const chartHeight = 200;
    const chartWidth = width - 40;
    const dataPoints = Math.min(priceData.length, 100);
    const step = Math.floor(priceData.length / dataPoints);
    const sampledData = priceData.filter((_, i) => i % step === 0).slice(0, dataPoints);

    const isPositive = sampledData.length >= 2 && 
      sampledData[sampledData.length - 1].price >= sampledData[0].price;

    const chartColor = isPositive ? '#10B981' : '#EF4444';

    return (
      <View style={styles.chartWrapper}>
        <View style={[styles.chart, { height: chartHeight }]}>
          {/* Price labels */}
          <View style={styles.priceLabels}>
            <Text style={styles.priceLabel}>${maxPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
            <Text style={styles.priceLabel}>${((maxPrice + minPrice) / 2).toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
            <Text style={styles.priceLabel}>${minPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
          </View>

          {/* Chart area */}
          <View style={styles.chartArea}>
            {/* Grid lines */}
            <View style={styles.gridLines}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.gridLine} />
              ))}
            </View>

            {/* Bars */}
            <View style={styles.barsContainer}>
              {sampledData.map((data, index) => {
                const height = ((data.price - minPrice) / priceRange) * (chartHeight - 20);
                return (
                  <View
                    key={index}
                    style={[
                      styles.bar,
                      {
                        height: Math.max(height, 2),
                        backgroundColor: chartColor,
                        width: (chartWidth - 60) / sampledData.length - 1,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        </View>

        {/* Period change indicator */}
        <View style={styles.periodChange}>
          <Text style={[styles.periodChangeText, { color: chartColor }]}>
            {isPositive ? '↑' : '↓'} {Math.abs(((sampledData[sampledData.length - 1]?.price || 0) - (sampledData[0]?.price || 0)) / (sampledData[0]?.price || 1) * 100).toFixed(2)}% no período
          </Text>
        </View>
      </View>
    );
  };

  // Fullscreen chart render with more data points and candle support
  const renderFullscreenChart = () => {
    if (priceData.length === 0) {
      return (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartPlaceholderText}>Sem dados disponíveis</Text>
        </View>
      );
    }

    const prices = priceData.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const screenDimensions = Dimensions.get('window');
    const chartHeight = screenDimensions.height - 160;
    const chartWidth = screenDimensions.width - 80;
    const dataPoints = Math.min(priceData.length, 200); // More data points in fullscreen
    const step = Math.max(1, Math.floor(priceData.length / dataPoints));
    const sampledData = priceData.filter((_, i) => i % step === 0).slice(0, dataPoints);

    const isPositive = sampledData.length >= 2 && 
      sampledData[sampledData.length - 1].price >= sampledData[0].price;

    const chartColor = isPositive ? '#10B981' : '#EF4444';

    if (chartType === 'candle') {
      // Render candlestick chart
      const candleWidth = Math.max(2, (chartWidth - 60) / sampledData.length - 2);
      
      return (
        <View style={styles.fullscreenChartWrapper}>
          <View style={[styles.chart, { height: chartHeight }]}>
            {/* Price labels */}
            <View style={styles.fullscreenPriceLabels}>
              <Text style={styles.fullscreenPriceLabel}>${maxPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
              <Text style={styles.fullscreenPriceLabel}>${((maxPrice * 3 + minPrice) / 4).toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
              <Text style={styles.fullscreenPriceLabel}>${((maxPrice + minPrice) / 2).toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
              <Text style={styles.fullscreenPriceLabel}>${((maxPrice + minPrice * 3) / 4).toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
              <Text style={styles.fullscreenPriceLabel}>${minPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
            </View>

            {/* Candlestick Chart area */}
            <View style={styles.chartArea}>
              <View style={styles.gridLines}>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <View key={i} style={styles.gridLine} />
                ))}
              </View>

              <View style={styles.candlesContainer}>
                {sampledData.map((data, index) => {
                  const prevPrice = index > 0 ? sampledData[index - 1].price : data.price;
                  const isGreen = data.price >= prevPrice;
                  const high = Math.max(data.price, prevPrice);
                  const low = Math.min(data.price, prevPrice);
                  const bodyTop = ((maxPrice - high) / priceRange) * (chartHeight - 40);
                  const bodyHeight = Math.max(((high - low) / priceRange) * (chartHeight - 40), 3);
                  
                  return (
                    <View
                      key={index}
                      style={[
                        styles.candle,
                        {
                          width: candleWidth,
                          height: bodyHeight,
                          marginTop: bodyTop,
                          backgroundColor: isGreen ? '#10B981' : '#EF4444',
                        },
                      ]}
                    >
                      <View style={[
                        styles.candleWick,
                        { backgroundColor: isGreen ? '#10B981' : '#EF4444' }
                      ]} />
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      );
    }

    // Render line/bar chart (default)
    return (
      <View style={styles.fullscreenChartWrapper}>
        <View style={[styles.chart, { height: chartHeight }]}>
          {/* Price labels */}
          <View style={styles.fullscreenPriceLabels}>
            <Text style={styles.fullscreenPriceLabel}>${maxPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
            <Text style={styles.fullscreenPriceLabel}>${((maxPrice * 3 + minPrice) / 4).toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
            <Text style={styles.fullscreenPriceLabel}>${((maxPrice + minPrice) / 2).toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
            <Text style={styles.fullscreenPriceLabel}>${((maxPrice + minPrice * 3) / 4).toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
            <Text style={styles.fullscreenPriceLabel}>${minPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</Text>
          </View>

          {/* Chart area */}
          <View style={styles.chartArea}>
            <View style={styles.gridLines}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <View key={i} style={styles.gridLine} />
              ))}
            </View>

            <View style={styles.barsContainer}>
              {sampledData.map((data, index) => {
                const barHeight = ((data.price - minPrice) / priceRange) * (chartHeight - 40);
                return (
                  <View
                    key={index}
                    style={[
                      styles.bar,
                      {
                        height: Math.max(barHeight, 2),
                        backgroundColor: chartColor,
                        width: Math.max(1, (chartWidth - 70) / sampledData.length - 1),
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const formatLargeNumber = (num: number): string => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#F1F5F9" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{cryptoInfo?.name || symbol?.replace('USDT', '')}</Text>
          <Text style={styles.headerSymbol}>{cryptoInfo?.symbol || symbol?.replace('USDT', '')}</Text>
        </View>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Carregando gráfico...</Text>
          </View>
        ) : (
          <>
            {/* Current Price Card */}
            <View style={styles.priceCard}>
              <Text style={styles.currentPrice}>
                ${cryptoInfo?.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <View style={[
                styles.changeBadge,
                { backgroundColor: (cryptoInfo?.price_change_percentage_24h || 0) >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)' }
              ]}>
                <Text style={[
                  styles.changeText,
                  { color: (cryptoInfo?.price_change_percentage_24h || 0) >= 0 ? '#10B981' : '#EF4444' }
                ]}>
                  {(cryptoInfo?.price_change_percentage_24h || 0) >= 0 ? '↑' : '↓'} {Math.abs(cryptoInfo?.price_change_percentage_24h || 0).toFixed(2)}% (24h)
                </Text>
              </View>
            </View>

            {/* Period Selector */}
            <View style={styles.periodSelector}>
              {PERIODS.map((period) => (
                <TouchableOpacity
                  key={period.key}
                  style={[
                    styles.periodButton,
                    selectedPeriod === period.key && styles.periodButtonActive,
                  ]}
                  onPress={() => setSelectedPeriod(period.key)}
                >
                  <Text style={[
                    styles.periodButtonText,
                    selectedPeriod === period.key && styles.periodButtonTextActive,
                  ]}>
                    {period.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Chart */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View style={styles.chartTypeSelector}>
                  <TouchableOpacity
                    style={[styles.chartTypeButton, chartType === 'line' && styles.chartTypeButtonActive]}
                    onPress={() => setChartType('line')}
                  >
                    <Ionicons name="analytics" size={18} color={chartType === 'line' ? '#F1F5F9' : '#64748B'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chartTypeButton, chartType === 'candle' && styles.chartTypeButtonActive]}
                    onPress={() => setChartType('candle')}
                  >
                    <Ionicons name="bar-chart" size={18} color={chartType === 'candle' ? '#F1F5F9' : '#64748B'} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.fullscreenButton} onPress={openFullscreen}>
                  <Ionicons name="expand" size={20} color="#3B82F6" />
                  <Text style={styles.fullscreenButtonText}>Tela Cheia</Text>
                </TouchableOpacity>
              </View>
              {renderChart()}
            </View>

            {/* Fullscreen Modal */}
            <Modal
              visible={fullscreenMode}
              animationType="fade"
              statusBarTranslucent
              supportedOrientations={['portrait', 'landscape']}
              onRequestClose={closeFullscreen}
            >
              <View style={styles.fullscreenContainer}>
                <StatusBar hidden />
                
                {/* Rotated Landscape View */}
                <View style={styles.rotatedLandscapeView}>
                  {/* Fullscreen Header */}
                  <View style={styles.fullscreenHeader}>
                    <TouchableOpacity style={styles.fullscreenBackButton} onPress={closeFullscreen}>
                      <Ionicons name="arrow-back" size={24} color="#F1F5F9" />
                    </TouchableOpacity>
                    <View style={styles.fullscreenInfo}>
                      <Text style={styles.fullscreenTitle}>{cryptoInfo?.symbol || symbol?.replace('USDT', '')}</Text>
                      <Text style={styles.fullscreenPrice}>
                        ${cryptoInfo?.current_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={styles.fullscreenControls}>
                      <View style={styles.fullscreenChartType}>
                        <TouchableOpacity
                          style={[styles.chartTypeButton, chartType === 'line' && styles.chartTypeButtonActive]}
                          onPress={() => setChartType('line')}
                        >
                          <Ionicons name="analytics" size={16} color={chartType === 'line' ? '#F1F5F9' : '#64748B'} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.chartTypeButton, chartType === 'candle' && styles.chartTypeButtonActive]}
                          onPress={() => setChartType('candle')}
                        >
                          <Ionicons name="bar-chart" size={16} color={chartType === 'candle' ? '#F1F5F9' : '#64748B'} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.zoomIndicator}>Zoom: {(zoomLevel * 100).toFixed(0)}%</Text>
                    </View>
                  </View>

                  {/* Fullscreen Period Selector */}
                  <View style={styles.fullscreenPeriodSelector}>
                    {PERIODS.map((period) => (
                      <TouchableOpacity
                        key={period.key}
                        style={[
                          styles.fullscreenPeriodButton,
                          selectedPeriod === period.key && styles.fullscreenPeriodButtonActive,
                        ]}
                        onPress={() => setSelectedPeriod(period.key)}
                      >
                        <Text style={[
                          styles.fullscreenPeriodText,
                          selectedPeriod === period.key && styles.fullscreenPeriodTextActive,
                        ]}>
                          {period.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Fullscreen Chart with Pinch-to-Zoom */}
                  <Animated.View 
                    style={[styles.fullscreenChartArea, { transform: [{ scale: scaleValue }] }]}
                    {...panResponder.panHandlers}
                  >
                    {renderFullscreenChart()}
                  </Animated.View>

                  <Text style={styles.zoomHint}>Use dois dedos para dar zoom no gráfico</Text>
                </View>
              </View>
            </Modal>

            {/* Stats */}
            <View style={styles.statsCard}>
              <Text style={styles.statsTitle}>📊 Estatísticas</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Market Cap</Text>
                  <Text style={styles.statValue}>{formatLargeNumber(cryptoInfo?.market_cap || 0)}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Volume 24h</Text>
                  <Text style={styles.statValue}>{formatLargeNumber(cryptoInfo?.total_volume || 0)}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Máx 24h</Text>
                  <Text style={[styles.statValue, { color: '#10B981' }]}>
                    ${cryptoInfo?.high_24h?.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0'}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Mín 24h</Text>
                  <Text style={[styles.statValue, { color: '#EF4444' }]}>
                    ${cryptoInfo?.low_24h?.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0'}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  headerInfo: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  headerSymbol: {
    fontSize: 14,
    color: '#64748B',
  },
  headerPlaceholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    color: '#64748B',
    marginTop: 12,
    fontSize: 16,
  },
  priceCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  currentPrice: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 8,
  },
  changeBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  changeText: {
    fontSize: 16,
    fontWeight: '700',
  },
  periodSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodButtonActive: {
    backgroundColor: '#3B82F6',
  },
  periodButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  periodButtonTextActive: {
    color: '#F1F5F9',
  },
  chartCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chartWrapper: {
    alignItems: 'center',
  },
  chart: {
    flexDirection: 'row',
    width: '100%',
  },
  priceLabels: {
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginRight: 8,
    width: 60,
  },
  priceLabel: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'right',
  },
  chartArea: {
    flex: 1,
    position: 'relative',
  },
  gridLines: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
  },
  gridLine: {
    height: 1,
    backgroundColor: '#334155',
    opacity: 0.5,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
    paddingTop: 10,
  },
  bar: {
    marginHorizontal: 0.5,
    borderRadius: 1,
  },
  periodChange: {
    marginTop: 12,
  },
  periodChangeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  chartPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartPlaceholderText: {
    color: '#64748B',
    fontSize: 16,
  },
  statsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 12,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  // Chart header styles
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartTypeSelector: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 4,
  },
  chartTypeButton: {
    padding: 8,
    borderRadius: 6,
  },
  chartTypeButtonActive: {
    backgroundColor: '#3B82F6',
  },
  fullscreenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  fullscreenButtonText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '600',
  },
  // Fullscreen modal styles
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  rotatedLandscapeView: {
    flex: 1,
    transform: [{ rotate: '90deg' }],
    width: height,
    height: width,
    position: 'absolute',
    top: (height - width) / 2,
    left: -(height - width) / 2,
  },
  fullscreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  fullscreenBackButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  fullscreenInfo: {
    alignItems: 'center',
  },
  fullscreenTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  fullscreenPrice: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
  },
  fullscreenControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fullscreenChartType: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 4,
  },
  zoomIndicator: {
    color: '#64748B',
    fontSize: 12,
  },
  fullscreenPeriodSelector: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  fullscreenPeriodButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  fullscreenPeriodButtonActive: {
    backgroundColor: '#3B82F6',
  },
  fullscreenPeriodText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  fullscreenPeriodTextActive: {
    color: '#F1F5F9',
  },
  fullscreenChartArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  fullscreenChartWrapper: {
    flex: 1,
  },
  fullscreenPriceLabels: {
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginRight: 12,
    width: 70,
  },
  fullscreenPriceLabel: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'right',
  },
  zoomHint: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    paddingBottom: 8,
  },
  // Candlestick styles
  candlesContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    height: '100%',
    paddingTop: 10,
  },
  candle: {
    marginHorizontal: 1,
    borderRadius: 1,
    position: 'relative',
  },
  candleWick: {
    position: 'absolute',
    width: 1,
    height: '150%',
    left: '50%',
    top: '-25%',
  },
});
