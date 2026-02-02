import React, { useState, useEffect, useCallback, useRef } from 'react';
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

// Importa o serviço de API Macro
import {
  fetchEconomicCalendar,
  fetchFedData,
  fetchMarketIndicators,
  fetchIndicatorsRealtime,
  clearMacroCache,
  getLastUpdateTime,
  MacroEvent,
  FedData,
  MarketIndicator,
} from '../services/macroApi';

// Intervalo de atualização em tempo real dos indicadores (30 segundos)
const REALTIME_UPDATE_INTERVAL = 30 * 1000;

export default function MacroScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fedData, setFedData] = useState<FedData | null>(null);
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [indicators, setIndicators] = useState<MarketIndicator[]>([]);
  const [activeTab, setActiveTab] = useState<'fed' | 'calendar' | 'indicators'>('fed');
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const realtimeInterval = useRef<NodeJS.Timeout | null>(null);

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
    
    // Inicia atualização em tempo real dos indicadores
    startRealtimeUpdates();
    
    // Cleanup ao desmontar
    return () => {
      if (realtimeInterval.current) {
        clearInterval(realtimeInterval.current);
      }
    };
  }, []);

  // Atualização em tempo real apenas dos indicadores (a cada 30s)
  const startRealtimeUpdates = () => {
    realtimeInterval.current = setInterval(async () => {
      try {
        const realtimeData = await fetchIndicatorsRealtime();
        if (realtimeData && realtimeData.length > 0) {
          setIndicators(realtimeData);
          setLastUpdate(new Date().toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }));
        }
      } catch (error) {
        console.error('Realtime update error:', error);
      }
    }, REALTIME_UPDATE_INTERVAL);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Busca dados das APIs em paralelo
      const [fedResult, eventsResult, indicatorsResult] = await Promise.all([
        fetchFedData(),
        fetchEconomicCalendar(),
        fetchMarketIndicators(),
      ]);

      setFedData(fedResult);
      setEvents(eventsResult);
      setIndicators(indicatorsResult);

      // Atualiza timestamp
      setLastUpdate(new Date().toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }));
    } catch (error) {
      console.error('Error loading macro data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Limpa cache para forçar atualização
    await clearMacroCache();
    await loadData();
  };

  // Navega para detalhes do indicador
  const openIndicatorDetail = (indicatorId: string) => {
    router.push({
      pathname: '/indicatorDetail',
      params: { indicatorId },
    });
  };

  // Mapa de nome para ID do indicador
  const getIndicatorId = (name: string): string => {
    if (name.includes('DXY')) return 'DXY';
    if (name.includes('Treasury') || name.includes('10Y')) return 'TREASURY';
    if (name.includes('VIX')) return 'VIX';
    if (name.includes('Ouro') || name.includes('Gold') || name.includes('XAU')) return 'GOLD';
    if (name.includes('Petróleo') || name.includes('Oil') || name.includes('WTI')) return 'OIL';
    if (name.includes('S&P') || name.includes('500')) return 'SP500';
    return 'DXY'; // fallback
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

  const renderFedTab = () => {
    // Verificar se fedData está disponível e válido
    if (!fedData || !fedData.rate_probability) {
      return (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>🏛️ Fed Watch - Probabilidades</Text>
            <Text style={styles.cardSubtitle}>Carregando dados...</Text>
          </View>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.loadingBoxText}>Buscando dados do Fed...</Text>
          </View>
        </View>
      );
    }

    return (
    <View>
      {/* FED Rate Probabilities */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>🏛️ Fed Watch - Probabilidades</Text>
          <Text style={styles.cardSubtitle}>Próxima reunião: {formatMeetingDate(fedData.meeting_date || '')}</Text>
        </View>

        <View style={styles.currentRate}>
          <Text style={styles.currentRateLabel}>Taxa Atual:</Text>
          <Text style={styles.currentRateValue}>{fedData.current_rate || 'N/A'}</Text>
        </View>

        <View style={styles.probabilities}>
          <View style={styles.probabilityItem}>
            <View style={styles.probabilityBar}>
              <View style={[styles.probabilityFill, { width: `${fedData.rate_probability?.cut_25bp || 0}%`, backgroundColor: '#10B981' }]} />
            </View>
            <View style={styles.probabilityInfo}>
              <Text style={styles.probabilityLabel}>Corte 25bp</Text>
              <Text style={[styles.probabilityValue, { color: '#10B981' }]}>{(fedData.rate_probability?.cut_25bp || 0).toFixed(1)}%</Text>
            </View>
          </View>

          <View style={styles.probabilityItem}>
            <View style={styles.probabilityBar}>
              <View style={[styles.probabilityFill, { width: `${fedData.rate_probability?.no_change || 0}%`, backgroundColor: '#64748B' }]} />
            </View>
            <View style={styles.probabilityInfo}>
              <Text style={styles.probabilityLabel}>Sem Mudança</Text>
              <Text style={[styles.probabilityValue, { color: '#64748B' }]}>{(fedData.rate_probability?.no_change || 0).toFixed(1)}%</Text>
            </View>
          </View>

          <View style={styles.probabilityItem}>
            <View style={styles.probabilityBar}>
              <View style={[styles.probabilityFill, { width: `${fedData.rate_probability?.cut_50bp || 0}%`, backgroundColor: '#3B82F6' }]} />
            </View>
            <View style={styles.probabilityInfo}>
              <Text style={styles.probabilityLabel}>Corte 50bp</Text>
              <Text style={[styles.probabilityValue, { color: '#3B82F6' }]}>{(fedData.rate_probability?.cut_50bp || 0).toFixed(1)}%</Text>
            </View>
          </View>

          <View style={styles.probabilityItem}>
            <View style={styles.probabilityBar}>
              <View style={[styles.probabilityFill, { width: `${fedData.rate_probability?.hike_25bp || 0}%`, backgroundColor: '#EF4444' }]} />
            </View>
            <View style={styles.probabilityInfo}>
              <Text style={styles.probabilityLabel}>Alta 25bp</Text>
              <Text style={[styles.probabilityValue, { color: '#EF4444' }]}>{(fedData.rate_probability?.hike_25bp || 0).toFixed(1)}%</Text>
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
  };

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
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>📊 Indicadores de Mercado</Text>
          <View style={styles.realtimeBadge}>
            <View style={styles.realtimeDot} />
            <Text style={styles.realtimeText}>Tempo Real</Text>
          </View>
        </View>
        <Text style={styles.cardSubtitle}>Toque para ver gráfico • Atualiza a cada 30s</Text>

        {indicators.map((indicator, index) => (
          <TouchableOpacity 
            key={index} 
            style={styles.indicatorItem}
            onPress={() => openIndicatorDetail(getIndicatorId(indicator.name))}
            activeOpacity={0.7}
          >
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
            <Ionicons name="chevron-forward" size={18} color="#64748B" style={styles.indicatorArrow} />
          </TouchableOpacity>
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
        <View style={styles.headerRow}>
          <Text style={styles.subtitle}>Indicadores macroeconômicos</Text>
          {lastUpdate && (
            <Text style={styles.lastUpdate}>🔄 {lastUpdate}</Text>
          )}
        </View>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  lastUpdate: {
    fontSize: 11,
    color: '#3B82F6',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F1F5F9',
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
    flex: 1,
  },
  indicatorRight: {
    alignItems: 'flex-end',
    marginRight: 8,
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
  indicatorArrow: {
    marginLeft: 4,
  },
  realtimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  realtimeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  realtimeText: {
    fontSize: 10,
    color: '#10B981',
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
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  loadingBoxText: {
    color: '#64748B',
    fontSize: 14,
  },
});
