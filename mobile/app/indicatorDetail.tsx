import React, { useEffect, useState, useCallback } from 'react';
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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';

const { width } = Dimensions.get('window');
const FMP_API_KEY = 'yTzpl8eGbfIStxlI6xBjQoiHycAb4PhZ';

interface PricePoint {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
}

interface IndicatorInfo {
  name: string;
  symbol: string;
  value: number;
  change: number;
  changePercent: number;
  icon: string;
  description: string;
}

// Mapeamento de indicadores para símbolos da API
const INDICATOR_SYMBOLS: { [key: string]: { fmpSymbol: string; name: string; icon: string; description: string } } = {
  'DXY': {
    fmpSymbol: 'DX-Y.NYB',
    name: 'Índice Dólar (DXY)',
    icon: '💵',
    description: 'Mede o valor do dólar americano em relação a uma cesta de moedas estrangeiras. DXY alto = pressão negativa em cripto.',
  },
  'TREASURY': {
    fmpSymbol: '^TNX',
    name: 'US Treasury 10Y',
    icon: '📜',
    description: 'Rendimento dos títulos do Tesouro americano de 10 anos. Yields altos competem com ativos de risco.',
  },
  'VIX': {
    fmpSymbol: '^VIX',
    name: 'VIX (Volatilidade)',
    icon: '📊',
    description: 'Índice de volatilidade do S&P 500. VIX baixo = mercado calmo, favorável a risco.',
  },
  'GOLD': {
    fmpSymbol: 'GCUSD',
    name: 'Ouro (XAU/USD)',
    icon: '🥇',
    description: 'Preço do ouro em dólares. Ouro em alta pode indicar flight to safety.',
  },
  'OIL': {
    fmpSymbol: 'CLUSD',
    name: 'Petróleo WTI',
    icon: '🛢️',
    description: 'Preço do petróleo bruto WTI. Indicador de inflação e atividade econômica.',
  },
  'SP500': {
    fmpSymbol: '^GSPC',
    name: 'S&P 500',
    icon: '📈',
    description: 'Índice das 500 maiores empresas dos EUA. Termômetro do mercado acionário global.',
  },
};

type PeriodKey = '1D' | '5D' | '1M' | '3M' | '1Y';

const PERIODS: { key: PeriodKey; label: string; days: number }[] = [
  { key: '1D', label: '1D', days: 1 },
  { key: '5D', label: '5D', days: 5 },
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: '1Y', label: '1A', days: 365 },
];

export default function IndicatorDetailScreen() {
  const { indicatorId } = useLocalSearchParams<{ indicatorId: string }>();
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('1M');
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [indicatorInfo, setIndicatorInfo] = useState<IndicatorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.back();
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [router])
  );

  useEffect(() => {
    loadData();
  }, [indicatorId, selectedPeriod]);

  const loadData = async () => {
    if (!indicatorId) return;

    setLoading(true);
    setError(null);

    try {
      const indicatorConfig = INDICATOR_SYMBOLS[indicatorId];
      if (!indicatorConfig) {
        setError('Indicador não encontrado');
        setLoading(false);
        return;
      }

      // Busca dados atuais e históricos em paralelo
      const [quoteResponse, historicalResponse] = await Promise.all([
        fetchCurrentQuote(indicatorConfig.fmpSymbol),
        fetchHistoricalData(indicatorConfig.fmpSymbol, selectedPeriod),
      ]);

      setIndicatorInfo({
        name: indicatorConfig.name,
        symbol: indicatorId,
        value: quoteResponse.price,
        change: quoteResponse.change,
        changePercent: quoteResponse.changePercent,
        icon: indicatorConfig.icon,
        description: indicatorConfig.description,
      });

      setPriceData(historicalResponse);
    } catch (err) {
      console.error('Error loading indicator data:', err);
      setError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentQuote = async (symbol: string) => {
    try {
      const response = await axios.get(
        `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${FMP_API_KEY}`,
        { timeout: 10000 }
      );

      if (response.data && response.data[0]) {
        return {
          price: response.data[0].price || 0,
          change: response.data[0].change || 0,
          changePercent: response.data[0].changesPercentage || 0,
        };
      }
    } catch (error) {
      console.error('Quote fetch error:', error);
    }

    // Fallback
    return { price: 0, change: 0, changePercent: 0 };
  };

  const fetchHistoricalData = async (symbol: string, period: PeriodKey): Promise<PricePoint[]> => {
    try {
      const days = PERIODS.find(p => p.key === period)?.days || 30;
      
      // Calcula datas
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(toDate.getDate() - days);

      const from = fromDate.toISOString().split('T')[0];
      const to = toDate.toISOString().split('T')[0];

      const response = await axios.get(
        `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?from=${from}&to=${to}&apikey=${FMP_API_KEY}`,
        { timeout: 10000 }
      );

      if (response.data?.historical) {
        return response.data.historical
          .map((item: any) => ({
            date: item.date,
            close: item.close,
            open: item.open,
            high: item.high,
            low: item.low,
          }))
          .reverse(); // Ordem cronológica
      }
    } catch (error) {
      console.error('Historical data fetch error:', error);
    }

    return [];
  };

  // Renderiza gráfico simples
  const renderChart = () => {
    if (priceData.length === 0) {
      return (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartPlaceholderText}>Sem dados disponíveis</Text>
        </View>
      );
    }

    const prices = priceData.map(d => d.close);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const chartHeight = 200;
    const chartWidth = width - 40;
    const pointSpacing = chartWidth / (priceData.length - 1 || 1);

    // Gera pontos do path SVG
    const points = priceData.map((point, index) => {
      const x = index * pointSpacing;
      const y = chartHeight - ((point.close - minPrice) / priceRange) * chartHeight;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    // Cor baseada em tendência
    const isPositive = priceData[priceData.length - 1]?.close >= priceData[0]?.close;
    const lineColor = isPositive ? '#10B981' : '#EF4444';

    return (
      <View style={styles.chartContainer}>
        <View style={[styles.chart, { height: chartHeight }]}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => (
            <View
              key={index}
              style={[
                styles.gridLine,
                { top: chartHeight * ratio }
              ]}
            />
          ))}

          {/* SVG Chart usando View com border */}
          <View style={styles.lineChart}>
            {priceData.map((point, index) => {
              if (index === 0) return null;
              const prevPoint = priceData[index - 1];
              
              const x1 = (index - 1) * pointSpacing;
              const y1 = chartHeight - ((prevPoint.close - minPrice) / priceRange) * chartHeight;
              const x2 = index * pointSpacing;
              const y2 = chartHeight - ((point.close - minPrice) / priceRange) * chartHeight;

              const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
              const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

              return (
                <View
                  key={index}
                  style={[
                    styles.chartLine,
                    {
                      width: length,
                      left: x1,
                      top: y1,
                      backgroundColor: lineColor,
                      transform: [{ rotate: `${angle}deg` }],
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>

        {/* Price labels */}
        <View style={styles.priceLabels}>
          <Text style={styles.priceLabel}>{formatValue(maxPrice)}</Text>
          <Text style={styles.priceLabel}>{formatValue((maxPrice + minPrice) / 2)}</Text>
          <Text style={styles.priceLabel}>{formatValue(minPrice)}</Text>
        </View>

        {/* Date labels */}
        <View style={styles.dateLabels}>
          <Text style={styles.dateLabel}>{formatDate(priceData[0]?.date)}</Text>
          <Text style={styles.dateLabel}>{formatDate(priceData[Math.floor(priceData.length / 2)]?.date)}</Text>
          <Text style={styles.dateLabel}>{formatDate(priceData[priceData.length - 1]?.date)}</Text>
        </View>
      </View>
    );
  };

  const formatValue = (value: number): string => {
    if (!value) return '-';
    if (value >= 1000) {
      return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    return value.toFixed(2);
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  // Estatísticas do período
  const renderStats = () => {
    if (priceData.length === 0) return null;

    const prices = priceData.map(d => d.close);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const first = prices[0];
    const last = prices[prices.length - 1];
    const change = ((last - first) / first) * 100;

    return (
      <View style={styles.statsContainer}>
        <View style={styles.statRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Máxima</Text>
            <Text style={styles.statValue}>{formatValue(high)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Mínima</Text>
            <Text style={styles.statValue}>{formatValue(low)}</Text>
          </View>
        </View>
        <View style={styles.statRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Abertura</Text>
            <Text style={styles.statValue}>{formatValue(first)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Variação</Text>
            <Text style={[styles.statValue, { color: change >= 0 ? '#10B981' : '#EF4444' }]}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Carregando dados...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="warning" size={48} color="#EF4444" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadData}>
          <Text style={styles.retryButtonText}>Tentar Novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#F1F5F9" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerIcon}>{indicatorInfo?.icon}</Text>
          <View>
            <Text style={styles.headerTitle}>{indicatorInfo?.name}</Text>
            <Text style={styles.headerSubtitle}>{indicatorId}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Current Value Card */}
        <View style={styles.valueCard}>
          <Text style={styles.currentValue}>{formatValue(indicatorInfo?.value || 0)}</Text>
          <View style={[
            styles.changeContainer,
            { backgroundColor: (indicatorInfo?.change || 0) >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)' }
          ]}>
            <Ionicons
              name={(indicatorInfo?.change || 0) >= 0 ? 'caret-up' : 'caret-down'}
              size={16}
              color={(indicatorInfo?.change || 0) >= 0 ? '#10B981' : '#EF4444'}
            />
            <Text style={[
              styles.changeText,
              { color: (indicatorInfo?.change || 0) >= 0 ? '#10B981' : '#EF4444' }
            ]}>
              {(indicatorInfo?.change || 0) >= 0 ? '+' : ''}{indicatorInfo?.changePercent?.toFixed(2)}%
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
                selectedPeriod === period.key && styles.periodButtonActive
              ]}
              onPress={() => setSelectedPeriod(period.key)}
            >
              <Text style={[
                styles.periodText,
                selectedPeriod === period.key && styles.periodTextActive
              ]}>
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Chart */}
        <View style={styles.chartCard}>
          {renderChart()}
        </View>

        {/* Stats */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>📊 Estatísticas do Período</Text>
          {renderStats()}
        </View>

        {/* Description */}
        <View style={styles.descriptionCard}>
          <Text style={styles.descriptionTitle}>💡 Sobre este indicador</Text>
          <Text style={styles.descriptionText}>{indicatorInfo?.description}</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  loadingText: {
    color: '#64748B',
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 20,
  },
  errorText: {
    color: '#EF4444',
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    fontSize: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  valueCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  currentValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  changeText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 4,
  },
  periodSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  periodButtonActive: {
    backgroundColor: '#3B82F6',
  },
  periodText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  periodTextActive: {
    color: '#F1F5F9',
  },
  chartCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  chartContainer: {
    position: 'relative',
  },
  chart: {
    position: 'relative',
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
  },
  lineChart: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  chartLine: {
    position: 'absolute',
    height: 2,
    transformOrigin: 'left center',
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
  priceLabels: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 40,
    justifyContent: 'space-between',
  },
  priceLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  dateLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  dateLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  statsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 16,
  },
  statsContainer: {
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
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
  descriptionCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  descriptionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#60A5FA',
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 22,
  },
});
