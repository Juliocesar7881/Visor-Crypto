import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';

interface MarketReport {
  overview: {
    total_market_cap_usd: number;
    total_volume_usd: number;
    market_cap_percentage: {
      btc: number;
      eth: number;
    };
    market_cap_change_percentage_24h_usd: number;
  };
  fear_greed: {
    value: number;
    classification: string;
    sentiment: string;
  };
  trending: Array<{
    id: string;
    name: string;
    symbol: string;
    market_cap_rank: number;
  }>;
  top_gainers: Array<{
    name: string;
    symbol: string;
    change_24h: number;
    current_price: number;
  }>;
  top_losers: Array<{
    name: string;
    symbol: string;
    change_24h: number;
    current_price: number;
  }>;
}

interface HeatmapData {
  data: Array<{
    name: string;
    symbol: string;
    change_24h: number;
    market_cap: number;
    market_cap_rank: number;
  }>;
}

const { width } = Dimensions.get('window');

export default function ReportsScreen() {
  const [report, setReport] = useState<MarketReport | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [reportRes, heatmapRes] = await Promise.all([
        api.get('/market/report'),
        api.get('/market/heatmap?limit=20'),
      ]);
      
      setReport(reportRes.data);
      setHeatmap(heatmapRes.data);
    } catch (error) {
      console.error('Error loading market data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatLargeNumber = (num: number): string => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toFixed(2)}`;
  };

  const getFearGreedEmoji = (value: number) => {
    if (value <= 20) return '😱';
    if (value <= 40) return '😨';
    if (value <= 60) return '😐';
    if (value <= 80) return '😊';
    return '🤑';
  };

  const getFearGreedColor = (value: number) => {
    if (value <= 20) return '#ef4444';
    if (value <= 40) return '#f59e0b';
    if (value <= 60) return '#eab308';
    if (value <= 80) return '#84cc16';
    return '#10b981';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Carregando dados do mercado...</Text>
      </View>
    );
  }

  if (!report || !heatmap) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Erro ao carregar dados</Text>
      </View>
    );
  }

  return (
    <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>📊 Mercado Cripto</Text>
          <Text style={styles.subtitle}>Dados em tempo real</Text>
        </View>

        {/* Fear & Greed Index */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Fear & Greed Index</Text>
          <View style={styles.fearGreedContainer}>
            <Text style={styles.fearGreedEmoji}>
              {getFearGreedEmoji(report.fear_greed.value)}
            </Text>
            <View style={styles.fearGreedInfo}>
              <Text style={[styles.fearGreedValue, { color: getFearGreedColor(report.fear_greed.value) }]}>
                {report.fear_greed.value}
              </Text>
              <Text style={styles.fearGreedLabel}>{report.fear_greed.classification}</Text>
            </View>
          </View>
          <View style={styles.fearGreedBar}>
            <View
              style={[
                styles.fearGreedFill,
                {
                  width: `${report.fear_greed.value}%`,
                  backgroundColor: getFearGreedColor(report.fear_greed.value),
                },
              ]}
            />
          </View>
        </View>

        {/* Market Overview */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Visão Geral do Mercado</Text>
          <View style={styles.overviewGrid}>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>Market Cap Total</Text>
              <Text style={styles.overviewValue}>
                {formatLargeNumber(report.overview.total_market_cap_usd)}
              </Text>
              <Text style={[
                styles.overviewChange,
                { color: report.overview.market_cap_change_percentage_24h_usd >= 0 ? '#10b981' : '#ef4444' }
              ]}>
                {report.overview.market_cap_change_percentage_24h_usd >= 0 ? '↑' : '↓'} {Math.abs(report.overview.market_cap_change_percentage_24h_usd).toFixed(2)}%
              </Text>
            </View>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>Volume 24h</Text>
              <Text style={styles.overviewValue}>
                {formatLargeNumber(report.overview.total_volume_usd)}
              </Text>
            </View>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>BTC Dominance</Text>
              <Text style={styles.overviewValue}>
                {report.overview.market_cap_percentage.btc.toFixed(2)}%
              </Text>
            </View>
            <View style={styles.overviewItem}>
              <Text style={styles.overviewLabel}>ETH Dominance</Text>
              <Text style={styles.overviewValue}>
                {report.overview.market_cap_percentage.eth.toFixed(2)}%
              </Text>
            </View>
          </View>
        </View>

        {/* Top Gainers & Losers */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚀 Maiores Altas 24h</Text>
          {report.top_gainers.slice(0, 5).map((coin, index) => (
            <View key={index} style={styles.coinRow}>
              <View style={styles.coinInfo}>
                <Text style={styles.coinName}>{coin.name}</Text>
                <Text style={styles.coinSymbol}>{coin.symbol.toUpperCase()}</Text>
              </View>
              <View style={styles.coinRight}>
                <Text style={styles.coinPrice}>{formatLargeNumber(coin.current_price)}</Text>
                <Text style={[styles.coinChange, styles.coinChangeUp]}>
                  ↑ {coin.change_24h.toFixed(2)}%
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📉 Maiores Quedas 24h</Text>
          {report.top_losers.slice(0, 5).map((coin, index) => (
            <View key={index} style={styles.coinRow}>
              <View style={styles.coinInfo}>
                <Text style={styles.coinName}>{coin.name}</Text>
                <Text style={styles.coinSymbol}>{coin.symbol.toUpperCase()}</Text>
              </View>
              <View style={styles.coinRight}>
                <Text style={styles.coinPrice}>{formatLargeNumber(coin.current_price)}</Text>
                <Text style={[styles.coinChange, styles.coinChangeDown]}>
                  ↓ {Math.abs(coin.change_24h).toFixed(2)}%
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Heatmap */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🗺️ Heatmap Top 20</Text>
          <View style={styles.heatmapGrid}>
            {heatmap.data.map((coin, index) => (
              <View
                key={index}
                style={[
                  styles.heatmapCell,
                  {
                    backgroundColor:
                      coin.change_24h >= 5
                        ? '#10b98180'
                        : coin.change_24h >= 0
                        ? '#84cc1680'
                        : coin.change_24h >= -5
                        ? '#f59e0b80'
                        : '#ef444480',
                  },
                ]}
              >
                <Text style={styles.heatmapSymbol}>{coin.symbol.toUpperCase()}</Text>
                <Text style={styles.heatmapChange}>
                  {coin.change_24h >= 0 ? '+' : ''}{coin.change_24h.toFixed(1)}%
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  loadingText: {
    color: '#64748b',
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  fearGreedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
  },
  fearGreedEmoji: {
    fontSize: 48,
  },
  fearGreedInfo: {
    flex: 1,
  },
  fearGreedValue: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  fearGreedLabel: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 4,
  },
  fearGreedBar: {
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
  },
  fearGreedFill: {
    height: '100%',
    borderRadius: 4,
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  overviewItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 12,
  },
  overviewLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  overviewValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  overviewChange: {
    fontSize: 14,
    marginTop: 4,
    fontWeight: '600',
  },
  coinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  coinInfo: {
    flex: 1,
  },
  coinName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  coinSymbol: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  coinRight: {
    alignItems: 'flex-end',
  },
  coinPrice: {
    fontSize: 14,
    color: '#94a3b8',
  },
  coinChange: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  coinChangeUp: {
    color: '#10b981',
  },
  coinChangeDown: {
    color: '#ef4444',
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heatmapCell: {
    width: (width - 88) / 4,
    aspectRatio: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  heatmapSymbol: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  heatmapChange: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
});
