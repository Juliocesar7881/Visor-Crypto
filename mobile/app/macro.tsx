import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

interface MacroEvent {
  id: string;
  title: string;
  date: string;
  country: string;
  impact: 'high' | 'medium' | 'low';
  actual?: string;
  forecast?: string;
  previous?: string;
  category: string;
}

interface FedData {
  meeting_date: string;
  rate_probability: {
    no_change: number;
    cut_25bp: number;
    cut_50bp: number;
    hike_25bp: number;
  };
  current_rate: string;
}

interface MarketIndicator {
  name: string;
  value: string;
  change: number;
  changePercent: number;
  icon: string;
}

export default function MacroScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fedData, setFedData] = useState<FedData | null>(null);
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [indicators, setIndicators] = useState<MarketIndicator[]>([]);
  const [activeTab, setActiveTab] = useState<'fed' | 'calendar' | 'indicators'>('fed');

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
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Try to fetch real data from APIs
      await Promise.all([
        loadFedData(),
        loadEconomicCalendar(),
        loadMarketIndicators(),
      ]);
    } catch (error) {
      console.error('Error loading macro data:', error);
      // Use mock data
      loadMockData();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadFedData = async () => {
    // Mock FED data - in production, connect to CME FedWatch API
    setFedData({
      meeting_date: '2026-01-29',
      rate_probability: {
        no_change: 45.2,
        cut_25bp: 42.8,
        cut_50bp: 8.5,
        hike_25bp: 3.5,
      },
      current_rate: '4.50% - 4.75%',
    });
  };

  const loadEconomicCalendar = async () => {
    // Mock economic calendar events
    const mockEvents: MacroEvent[] = [
      {
        id: '1',
        title: 'Decisão de Taxa de Juros do Fed',
        date: '2026-01-29T19:00:00Z',
        country: 'EUA',
        impact: 'high',
        forecast: '4.50%',
        previous: '4.75%',
        category: 'Política Monetária',
      },
      {
        id: '2',
        title: 'PIB dos EUA (Q4)',
        date: '2026-01-30T13:30:00Z',
        country: 'EUA',
        impact: 'high',
        forecast: '2.8%',
        previous: '3.1%',
        category: 'Crescimento',
      },
      {
        id: '3',
        title: 'Inflação CPI (YoY)',
        date: '2026-02-12T13:30:00Z',
        country: 'EUA',
        impact: 'high',
        forecast: '2.9%',
        previous: '3.0%',
        category: 'Inflação',
      },
      {
        id: '4',
        title: 'Taxa de Desemprego',
        date: '2026-02-07T13:30:00Z',
        country: 'EUA',
        impact: 'medium',
        forecast: '4.2%',
        previous: '4.1%',
        category: 'Emprego',
      },
      {
        id: '5',
        title: 'Decisão BCE',
        date: '2026-02-06T13:45:00Z',
        country: 'EUR',
        impact: 'high',
        forecast: '3.75%',
        previous: '4.00%',
        category: 'Política Monetária',
      },
      {
        id: '6',
        title: 'PMI Manufatura',
        date: '2026-02-03T15:00:00Z',
        country: 'EUA',
        impact: 'medium',
        forecast: '49.5',
        previous: '49.2',
        category: 'Atividade Econômica',
      },
      {
        id: '7',
        title: 'Vendas no Varejo',
        date: '2026-02-14T13:30:00Z',
        country: 'EUA',
        impact: 'medium',
        forecast: '0.4%',
        previous: '0.3%',
        category: 'Consumo',
      },
      {
        id: '8',
        title: 'Balança Comercial China',
        date: '2026-02-07T03:00:00Z',
        country: 'CHN',
        impact: 'medium',
        forecast: '$75.5B',
        previous: '$72.3B',
        category: 'Comércio',
      },
    ];
    setEvents(mockEvents);
  };

  const loadMarketIndicators = async () => {
    // Mock market indicators
    const mockIndicators: MarketIndicator[] = [
      { name: 'DXY (Índice Dólar)', value: '103.45', change: -0.32, changePercent: -0.31, icon: '💵' },
      { name: 'US 10Y Treasury', value: '4.28%', change: 0.05, changePercent: 1.18, icon: '📜' },
      { name: 'VIX (Volatilidade)', value: '14.52', change: -0.85, changePercent: -5.52, icon: '📊' },
      { name: 'Ouro (XAU/USD)', value: '$2,048.50', change: 12.30, changePercent: 0.60, icon: '🥇' },
      { name: 'Petróleo WTI', value: '$75.82', change: -1.24, changePercent: -1.61, icon: '🛢️' },
      { name: 'S&P 500', value: '4,892.50', change: 28.45, changePercent: 0.58, icon: '📈' },
    ];
    setIndicators(mockIndicators);
  };

  const loadMockData = () => {
    loadFedData();
    loadEconomicCalendar();
    loadMarketIndicators();
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return '#EF4444';
      case 'medium': return '#F59E0B';
      default: return '#64748B';
    }
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      default: return '🔵';
    }
  };

  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatMeetingDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const renderFedTab = () => (
    <View>
      {/* FED Rate Probabilities */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>🏛️ Fed Watch - Probabilidades</Text>
          <Text style={styles.cardSubtitle}>Próxima reunião: {formatMeetingDate(fedData?.meeting_date || '')}</Text>
        </View>

        <View style={styles.currentRate}>
          <Text style={styles.currentRateLabel}>Taxa Atual:</Text>
          <Text style={styles.currentRateValue}>{fedData?.current_rate}</Text>
        </View>

        <View style={styles.probabilities}>
          <View style={styles.probabilityItem}>
            <View style={styles.probabilityBar}>
              <View style={[styles.probabilityFill, { width: `${fedData?.rate_probability.cut_25bp || 0}%`, backgroundColor: '#10B981' }]} />
            </View>
            <View style={styles.probabilityInfo}>
              <Text style={styles.probabilityLabel}>Corte 25bp</Text>
              <Text style={[styles.probabilityValue, { color: '#10B981' }]}>{fedData?.rate_probability.cut_25bp.toFixed(1)}%</Text>
            </View>
          </View>

          <View style={styles.probabilityItem}>
            <View style={styles.probabilityBar}>
              <View style={[styles.probabilityFill, { width: `${fedData?.rate_probability.no_change || 0}%`, backgroundColor: '#64748B' }]} />
            </View>
            <View style={styles.probabilityInfo}>
              <Text style={styles.probabilityLabel}>Sem Mudança</Text>
              <Text style={[styles.probabilityValue, { color: '#64748B' }]}>{fedData?.rate_probability.no_change.toFixed(1)}%</Text>
            </View>
          </View>

          <View style={styles.probabilityItem}>
            <View style={styles.probabilityBar}>
              <View style={[styles.probabilityFill, { width: `${fedData?.rate_probability.cut_50bp || 0}%`, backgroundColor: '#3B82F6' }]} />
            </View>
            <View style={styles.probabilityInfo}>
              <Text style={styles.probabilityLabel}>Corte 50bp</Text>
              <Text style={[styles.probabilityValue, { color: '#3B82F6' }]}>{fedData?.rate_probability.cut_50bp.toFixed(1)}%</Text>
            </View>
          </View>

          <View style={styles.probabilityItem}>
            <View style={styles.probabilityBar}>
              <View style={[styles.probabilityFill, { width: `${fedData?.rate_probability.hike_25bp || 0}%`, backgroundColor: '#EF4444' }]} />
            </View>
            <View style={styles.probabilityInfo}>
              <Text style={styles.probabilityLabel}>Alta 25bp</Text>
              <Text style={[styles.probabilityValue, { color: '#EF4444' }]}>{fedData?.rate_probability.hike_25bp.toFixed(1)}%</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 Baseado em futuros de Fed Funds. Um corte de juros geralmente é positivo para ativos de risco como cripto.
          </Text>
        </View>
      </View>
    </View>
  );

  const renderCalendarTab = () => (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📅 Calendário Econômico</Text>
        <Text style={styles.cardSubtitle}>Próximos eventos importantes</Text>

        {events.map((event) => (
          <View key={event.id} style={styles.eventItem}>
            <View style={styles.eventLeft}>
              <Text style={styles.eventImpact}>{getImpactIcon(event.impact)}</Text>
              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventMeta}>{event.country} • {event.category}</Text>
                <Text style={styles.eventDate}>{formatEventDate(event.date)}</Text>
              </View>
            </View>
            <View style={styles.eventRight}>
              {event.forecast && (
                <View style={styles.eventStat}>
                  <Text style={styles.eventStatLabel}>Prev.</Text>
                  <Text style={styles.eventStatValue}>{event.forecast}</Text>
                </View>
              )}
              {event.previous && (
                <View style={styles.eventStat}>
                  <Text style={styles.eventStatLabel}>Ant.</Text>
                  <Text style={styles.eventStatValueOld}>{event.previous}</Text>
                </View>
              )}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.legendCard}>
        <Text style={styles.legendTitle}>Legenda de Impacto:</Text>
        <View style={styles.legendRow}>
          <Text style={styles.legendItem}>🔴 Alto</Text>
          <Text style={styles.legendItem}>🟡 Médio</Text>
          <Text style={styles.legendItem}>🔵 Baixo</Text>
        </View>
      </View>
    </View>
  );

  const renderIndicatorsTab = () => (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 Indicadores de Mercado</Text>
        <Text style={styles.cardSubtitle}>Dados em tempo real</Text>

        {indicators.map((indicator, index) => (
          <View key={index} style={styles.indicatorItem}>
            <View style={styles.indicatorLeft}>
              <Text style={styles.indicatorIcon}>{indicator.icon}</Text>
              <Text style={styles.indicatorName}>{indicator.name}</Text>
            </View>
            <View style={styles.indicatorRight}>
              <Text style={styles.indicatorValue}>{indicator.value}</Text>
              <Text style={[
                styles.indicatorChange,
                { color: indicator.change >= 0 ? '#10B981' : '#EF4444' }
              ]}>
                {indicator.change >= 0 ? '↑' : '↓'} {Math.abs(indicator.changePercent).toFixed(2)}%
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>💡 Por que isso importa?</Text>
        <Text style={styles.infoText}>
          • <Text style={styles.infoBold}>DXY alto</Text> = Pressão negativa em cripto{'\n'}
          • <Text style={styles.infoBold}>VIX baixo</Text> = Mercado menos volátil, favorável a risco{'\n'}
          • <Text style={styles.infoBold}>Treasury yields altos</Text> = Competição por capital{'\n'}
          • <Text style={styles.infoBold}>Ouro em alta</Text> = Flight to safety, pode beneficiar BTC
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Carregando dados macroeconômicos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      <View style={styles.header}>
        <Text style={styles.title}>📈 Dados Macro</Text>
        <Text style={styles.subtitle}>Indicadores macroeconômicos</Text>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'fed' && styles.tabActive]}
          onPress={() => setActiveTab('fed')}
        >
          <Ionicons name="business" size={18} color={activeTab === 'fed' ? '#F1F5F9' : '#64748B'} />
          <Text style={[styles.tabText, activeTab === 'fed' && styles.tabTextActive]}>Fed</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'calendar' && styles.tabActive]}
          onPress={() => setActiveTab('calendar')}
        >
          <Ionicons name="calendar" size={18} color={activeTab === 'calendar' ? '#F1F5F9' : '#64748B'} />
          <Text style={[styles.tabText, activeTab === 'calendar' && styles.tabTextActive]}>Calendário</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'indicators' && styles.tabActive]}
          onPress={() => setActiveTab('indicators')}
        >
          <Ionicons name="stats-chart" size={18} color={activeTab === 'indicators' ? '#F1F5F9' : '#64748B'} />
          <Text style={[styles.tabText, activeTab === 'indicators' && styles.tabTextActive]}>Indicadores</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {activeTab === 'fed' && renderFedTab()}
        {activeTab === 'calendar' && renderCalendarTab()}
        {activeTab === 'indicators' && renderIndicatorsTab()}

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
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  tabActive: {
    backgroundColor: '#3B82F6',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#F1F5F9',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  currentRate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  currentRateLabel: {
    fontSize: 14,
    color: '#94A3B8',
  },
  currentRateValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  probabilities: {
    gap: 12,
  },
  probabilityItem: {
    gap: 8,
  },
  probabilityBar: {
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
  },
  probabilityFill: {
    height: '100%',
    borderRadius: 4,
  },
  probabilityInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  probabilityLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  probabilityValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  infoText: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 20,
  },
  eventItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  eventLeft: {
    flexDirection: 'row',
    flex: 1,
    gap: 10,
  },
  eventImpact: {
    fontSize: 16,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F5F9',
    marginBottom: 4,
  },
  eventMeta: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 2,
  },
  eventDate: {
    fontSize: 12,
    color: '#3B82F6',
  },
  eventRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  eventStat: {
    alignItems: 'flex-end',
  },
  eventStatLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  eventStatValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#10B981',
  },
  eventStatValueOld: {
    fontSize: 13,
    color: '#94A3B8',
  },
  legendCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  legendTitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
  },
  legendItem: {
    fontSize: 13,
    color: '#94A3B8',
  },
  indicatorItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  indicatorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  indicatorIcon: {
    fontSize: 20,
  },
  indicatorName: {
    fontSize: 14,
    color: '#F1F5F9',
    fontWeight: '500',
  },
  indicatorRight: {
    alignItems: 'flex-end',
  },
  indicatorValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  indicatorChange: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#60A5FA',
    marginBottom: 12,
  },
  infoBold: {
    fontWeight: '700',
    color: '#F1F5F9',
  },
});
