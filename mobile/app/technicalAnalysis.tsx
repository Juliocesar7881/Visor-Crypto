/**
 * Technical Analysis Screen
 * 
 * Tela completa de análise técnica com confluência institucional
 * Inclui: Score, Fluxo, Estrutura, Segurança, Recomendação IA
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
  RefreshControl,
  Animated,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
  performTechnicalAnalysis,
  TechnicalAnalysisResult,
  CACHE_DURATION,
} from '../services/technicalAnalysis';

const { width } = Dimensions.get('window');

// Componente de Score Circular Animado
const CircularScore = ({ score, bias }: { score: number; bias: string }) => {
  const animatedValue = new Animated.Value(0);
  const size = 160;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: score,
      duration: 1500,
      useNativeDriver: false,
    }).start();
  }, [score]);
  
  const getBiasColor = () => {
    if (bias === 'LONG') return '#10B981';
    if (bias === 'SHORT') return '#EF4444';
    return '#F59E0B';
  };
  
  const strokeDashoffset = circumference - (score / 100) * circumference;
  
  return (
    <View style={styles.circularScoreContainer}>
      <View style={[styles.circularScore, { width: size, height: size }]}>
        <View style={styles.circularBg}>
          <Text style={[styles.scoreValue, { color: getBiasColor() }]}>{score}</Text>
          <Text style={styles.scoreLabel}>CONFLUÊNCIA</Text>
        </View>
        <View style={[styles.circularRing, { borderColor: getBiasColor() }]} />
      </View>
      <View style={[styles.biasBadge, { backgroundColor: getBiasColor() }]}>
        <Text style={styles.biasText}>{bias}</Text>
      </View>
    </View>
  );
};

// Componente de Barra de Progresso
const ProgressBar = ({ value, label, color, icon }: { value: number; label: string; color: string; icon: string }) => (
  <View style={styles.progressItem}>
    <View style={styles.progressHeader}>
      <View style={styles.progressLabelContainer}>
        <Ionicons name={icon as any} size={16} color={color} />
        <Text style={styles.progressLabel}>{label}</Text>
      </View>
      <Text style={[styles.progressValue, { color }]}>{value}%</Text>
    </View>
    <View style={styles.progressBarBg}>
      <View style={[styles.progressBarFill, { width: `${value}%`, backgroundColor: color }]} />
    </View>
  </View>
);

// Componente de Card de Dados
const DataCard = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
  <View style={styles.dataCard}>
    <View style={styles.dataCardHeader}>
      <Ionicons name={icon as any} size={20} color="#3B82F6" />
      <Text style={styles.dataCardTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

// Componente de Item de Dado
const DataItem = ({ label, value, color, subtext }: { label: string; value: string; color?: string; subtext?: string }) => (
  <View style={styles.dataItem}>
    <Text style={styles.dataItemLabel}>{label}</Text>
    <View style={styles.dataItemValueContainer}>
      <Text style={[styles.dataItemValue, color ? { color } : null]}>{value}</Text>
      {subtext && <Text style={styles.dataItemSubtext}>{subtext}</Text>}
    </View>
  </View>
);

export default function TechnicalAnalysisScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<TechnicalAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<string>('');

  const loadAnalysis = async (forceRefresh: boolean = false) => {
    try {
      setError(null);
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      
      const result = await performTechnicalAnalysis(symbol || 'BTCUSDT', forceRefresh);
      setAnalysis(result);
      
      // Calcular tempo restante do cache
      const remainingMs = result.cacheExpiry - Date.now();
      const remainingMin = Math.max(0, Math.floor(remainingMs / 60000));
      setCacheInfo(`Atualiza em ${remainingMin} min`);
      
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.message || 'Erro ao carregar análise');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnalysis();
    
    // Auto-refresh a cada 15 minutos
    const interval = setInterval(() => {
      loadAnalysis(true);
    }, CACHE_DURATION);
    
    return () => clearInterval(interval);
  }, [symbol]);

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // Tentar voltar, se não funcionar, voltar para chartDetail
        try {
          if (router.canGoBack()) {
            router.back();
          } else {
            // Fallback: navegar para chartDetail com o mesmo symbol
            router.replace({
              pathname: '/chartDetail',
              params: { symbol: symbol || 'BTCUSDT' }
            });
          }
        } catch (e) {
          console.log('Back navigation error:', e);
          router.replace({
            pathname: '/chartDetail',
            params: { symbol: symbol || 'BTCUSDT' }
          });
        }
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [router, symbol])
  );

  // Função para voltar (usada pelo botão visual também)
  const handleGoBack = () => {
    try {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace({
          pathname: '/chartDetail',
          params: { symbol: symbol || 'BTCUSDT' }
        });
      }
    } catch (e) {
      console.log('Back navigation error:', e);
      router.replace({
        pathname: '/chartDetail',
        params: { symbol: symbol || 'BTCUSDT' }
      });
    }
  };

  const onRefresh = () => {
    loadAnalysis(true);
  };

  const getActionColor = (action: string) => {
    if (action.includes('LONG')) return '#10B981';
    if (action.includes('SHORT')) return '#EF4444';
    return '#F59E0B';
  };

  const getActionIcon = (action: string) => {
    if (action.includes('LONG')) return 'trending-up';
    if (action.includes('SHORT')) return 'trending-down';
    return 'pause-circle';
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    if (price >= 1) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'bullish' || trend === 'increasing' || trend === 'above' || trend === 'uptrend') 
      return { name: 'arrow-up-circle', color: '#10B981' };
    if (trend === 'bearish' || trend === 'decreasing' || trend === 'below' || trend === 'downtrend') 
      return { name: 'arrow-down-circle', color: '#EF4444' };
    return { name: 'remove-circle', color: '#F59E0B' };
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Analisando mercado...</Text>
          <Text style={styles.loadingSubtext}>Calculando confluência institucional</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <Ionicons name="arrow-back" size={24} color="#F1F5F9" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Análise Técnica</Text>
          <View style={styles.headerPlaceholder} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadAnalysis()}>
            <Text style={styles.retryButtonText}>Tentar Novamente</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!analysis) return null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
          <Ionicons name="arrow-back" size={24} color="#F1F5F9" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{symbol?.replace('USDT', '')}</Text>
          <Text style={styles.headerSubtitle}>Análise Técnica</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={22} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor="#3B82F6"
            colors={['#3B82F6']}
          />
        }
      >
        {/* Cache Info */}
        <View style={styles.cacheInfo}>
          <Ionicons name="time-outline" size={14} color="#64748B" />
          <Text style={styles.cacheInfoText}>{cacheInfo}</Text>
        </View>

        {/* Preço Atual */}
        <View style={styles.priceCard}>
          <Text style={styles.currentPrice}>{formatPrice(analysis.currentPrice)}</Text>
          <View style={[styles.biasBadgeSmall, { backgroundColor: getActionColor(analysis.confluence.bias) }]}>
            <Text style={styles.biasTextSmall}>{analysis.confluence.bias}</Text>
          </View>
        </View>

        {/* Score Principal */}
        <View style={styles.scoreSection}>
          <CircularScore score={analysis.confluence.total} bias={analysis.confluence.bias} />
          
          <View style={styles.probabilityCard}>
            <Text style={styles.probabilityLabel}>Probabilidade</Text>
            <Text style={styles.probabilityValue}>{analysis.confluence.probability}%</Text>
          </View>
        </View>

        {/* Barras de Score */}
        <View style={styles.scoresCard}>
          <ProgressBar 
            value={analysis.confluence.flowScore} 
            label="Fluxo (3x)" 
            color="#8B5CF6"
            icon="analytics"
          />
          <ProgressBar 
            value={analysis.confluence.structureScore} 
            label="Estrutura (2x)" 
            color="#3B82F6"
            icon="git-network"
          />
          <ProgressBar 
            value={analysis.confluence.safetyScore} 
            label="Segurança (1x)" 
            color="#10B981"
            icon="shield-checkmark"
          />
          {/* Barra de Notícias - só aparece se houver impacto */}
          {analysis.confluence.newsScore !== undefined && (
            <ProgressBar 
              value={analysis.confluence.newsScore} 
              label="Notícias (dinâmico)" 
              color={analysis.confluence.newsScore > 50 ? '#10B981' : analysis.confluence.newsScore < 50 ? '#EF4444' : '#F59E0B'}
              icon="newspaper"
            />
          )}
        </View>

        {/* Card de Impacto das Notícias */}
        {analysis.safety.newsImpact && analysis.safety.newsImpact.score !== 0 && (
          <DataCard title="📰 Impacto de Notícias (X)" icon="newspaper">
            <View style={styles.newsImpactContainer}>
              <View style={styles.newsImpactHeader}>
                <Text style={[
                  styles.newsImpactLabel,
                  { color: analysis.safety.newsImpact.score > 0 ? '#10B981' : '#EF4444' }
                ]}>
                  {analysis.safety.newsImpact.label}
                </Text>
                <Text style={[
                  styles.newsImpactScore,
                  { color: analysis.safety.newsImpact.score > 0 ? '#10B981' : '#EF4444' }
                ]}>
                  {analysis.safety.newsImpact.score > 0 ? '+' : ''}{analysis.safety.newsImpact.score}
                </Text>
              </View>
              <Text style={styles.newsImpactReasoning}>
                {analysis.safety.newsImpact.reasoning}
              </Text>
              <Text style={styles.newsImpactSource}>
                Fonte: @DeItaone, @Tier10k, @FirstSquawk e outros
              </Text>
            </View>
          </DataCard>
        )}

        {/* Recomendação IA */}
        <View style={[styles.recommendationCard, { borderColor: getActionColor(analysis.aiRecommendation.action) }]}>
          <View style={styles.recommendationHeader}>
            <View style={[styles.actionBadge, { backgroundColor: getActionColor(analysis.aiRecommendation.action) }]}>
              <Ionicons name={getActionIcon(analysis.aiRecommendation.action) as any} size={20} color="#FFF" />
              <Text style={styles.actionText}>
                {analysis.aiRecommendation.action.replace('_', ' ')}
              </Text>
            </View>
            <Text style={styles.confidenceText}>
              Confiança: {analysis.aiRecommendation.confidence}%
            </Text>
          </View>
          
          <Text style={styles.reasoningText}>{analysis.aiRecommendation.reasoning}</Text>
          
          {analysis.aiRecommendation.action !== 'NAO_OPERAR' && (
            <View style={styles.tradeDetails}>
              <View style={styles.tradeRow}>
                <View style={styles.tradeItem}>
                  <Text style={styles.tradeLabel}>📍 Entrada</Text>
                  <Text style={styles.tradeValue}>{formatPrice(analysis.aiRecommendation.entry || 0)}</Text>
                </View>
                <View style={styles.tradeItem}>
                  <Text style={styles.tradeLabel}>🛑 Stop Loss</Text>
                  <Text style={[styles.tradeValue, { color: '#EF4444' }]}>
                    {formatPrice(analysis.aiRecommendation.stopLoss || 0)}
                  </Text>
                </View>
              </View>
              
              <View style={styles.takeProfitSection}>
                <Text style={styles.tradeLabel}>🎯 Take Profits</Text>
                <View style={styles.takeProfitList}>
                  {analysis.aiRecommendation.takeProfit?.map((tp, i) => (
                    <View key={i} style={styles.takeProfitItem}>
                      <Text style={styles.takeProfitLabel}>TP{i + 1}</Text>
                      <Text style={[styles.takeProfitValue, { color: '#10B981' }]}>
                        {formatPrice(tp)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
              
              <View style={styles.tradeFooter}>
                <View style={styles.tradeFooterItem}>
                  <Text style={styles.tradeFooterLabel}>R/R Ratio</Text>
                  <Text style={styles.tradeFooterValue}>
                    1:{analysis.aiRecommendation.riskRewardRatio}
                  </Text>
                </View>
                <View style={styles.tradeFooterItem}>
                  <Text style={styles.tradeFooterLabel}>Timeframe</Text>
                  <Text style={styles.tradeFooterValue}>
                    {analysis.aiRecommendation.timeframe}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Análise de Fluxo */}
        <DataCard title="Análise de Fluxo" icon="pulse">
          <View style={styles.dataGrid}>
            <DataItem 
              label="CVD Proxy" 
              value={analysis.flow.cvdTrend.toUpperCase()}
              color={getTrendIcon(analysis.flow.cvdTrend).color}
            />
            <DataItem 
              label="Volume Ratio" 
              value={analysis.flow.volumeRatio.toFixed(2)}
              color={analysis.flow.volumeRatio > 1 ? '#10B981' : '#EF4444'}
              subtext={analysis.flow.volumeRatio > 1 ? 'Compradores' : 'Vendedores'}
            />
            <DataItem 
              label="Open Interest" 
              value={analysis.flow.oiTrend.toUpperCase()}
              color={getTrendIcon(analysis.flow.oiTrend).color}
            />
            <DataItem 
              label="OI 24h" 
              value={`${analysis.flow.oiChange24h > 0 ? '+' : ''}${analysis.flow.oiChange24h.toFixed(1)}%`}
              color={analysis.flow.oiChange24h > 0 ? '#10B981' : '#EF4444'}
            />
          </View>
        </DataCard>

        {/* Análise de Estrutura */}
        <DataCard title="Análise de Estrutura" icon="git-network">
          <View style={styles.dataGrid}>
            <DataItem 
              label="vs EMA200 (1H)" 
              value={analysis.structure.priceVsEma200_1h.toUpperCase()}
              color={getTrendIcon(analysis.structure.priceVsEma200_1h).color}
            />
            <DataItem 
              label="vs EMA200 (4H)" 
              value={analysis.structure.priceVsEma200_4h.toUpperCase()}
              color={getTrendIcon(analysis.structure.priceVsEma200_4h).color}
            />
            <DataItem 
              label="vs VWAP" 
              value={analysis.structure.priceVsVwap.toUpperCase()}
              color={getTrendIcon(analysis.structure.priceVsVwap).color}
            />
            <DataItem 
              label="Tendência" 
              value={analysis.structure.trend.toUpperCase()}
              color={getTrendIcon(analysis.structure.trend).color}
            />
          </View>
        </DataCard>

        {/* Filtros de Segurança */}
        <DataCard title="Filtros de Segurança" icon="shield-checkmark">
          <View style={styles.dataGrid}>
            <DataItem 
              label="RSI (14)" 
              value={analysis.safety.rsi14.toFixed(1)}
              color={analysis.safety.rsi14 > 70 ? '#EF4444' : analysis.safety.rsi14 < 30 ? '#10B981' : '#F59E0B'}
              subtext={analysis.safety.rsi14 > 70 ? 'Sobrecomprado' : analysis.safety.rsi14 < 30 ? 'Sobrevendido' : 'Neutro'}
            />
            <DataItem 
              label="Divergência RSI" 
              value={analysis.safety.rsiDivergence.toUpperCase()}
              color={analysis.safety.rsiDivergence === 'bullish' ? '#10B981' : 
                     analysis.safety.rsiDivergence === 'bearish' ? '#EF4444' : '#64748B'}
            />
            <DataItem 
              label="ADX (14)" 
              value={analysis.safety.adx14?.toFixed(1) || '25'}
              color={(analysis.safety.adx14 || 0) > 25 ? '#10B981' : '#F59E0B'}
              subtext={analysis.safety.trendStrength || 'moderate'}
            />
            <DataItem 
              label="Fear & Greed" 
              value={analysis.safety.fearGreedIndex != null && !isNaN(analysis.safety.fearGreedIndex) 
                ? analysis.safety.fearGreedIndex.toString() 
                : '50'}
              color={(analysis.safety.fearGreedIndex || 50) < 30 ? '#EF4444' : 
                     (analysis.safety.fearGreedIndex || 50) > 70 ? '#10B981' : '#F59E0B'}
              subtext={analysis.safety.fearGreedLabel || 'Neutral'}
            />
            <DataItem 
              label="BTC Dominance" 
              value={`${analysis.safety.btcDominance.toFixed(1)}%`}
              color="#64748B"
            />
            <DataItem 
              label="BTC.D 24h" 
              value={`${analysis.safety.btcDominanceChange > 0 ? '+' : ''}${analysis.safety.btcDominanceChange.toFixed(2)}%`}
              color={analysis.safety.btcDominanceChange > 0 ? '#10B981' : '#EF4444'}
            />
          </View>
        </DataCard>

        {/* Níveis Chave */}
        <DataCard title="Níveis Chave" icon="layers">
          <View style={styles.levelsContainer}>
            <View style={styles.levelSection}>
              <Text style={styles.levelSectionTitle}>🔴 Resistências Fortes</Text>
              {analysis.keyLevels.strongResistances.map((level, i) => (
                <Text key={i} style={[styles.levelValue, { color: '#EF4444' }]}>
                  {formatPrice(level)}
                </Text>
              ))}
            </View>
            <View style={styles.levelSection}>
              <Text style={styles.levelSectionTitle}>🟢 Suportes Fortes</Text>
              {analysis.keyLevels.strongSupports.map((level, i) => (
                <Text key={i} style={[styles.levelValue, { color: '#10B981' }]}>
                  {formatPrice(level)}
                </Text>
              ))}
            </View>
          </View>
          
          <View style={styles.liquidationSection}>
            <Text style={styles.levelSectionTitle}>⚡ Zonas de Liquidação</Text>
            {analysis.keyLevels.liquidationZones.map((zone, i) => (
              <View key={i} style={styles.liquidationItem}>
                <View style={[
                  styles.liquidationBadge, 
                  { backgroundColor: zone.type === 'long' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)' }
                ]}>
                  <Text style={[
                    styles.liquidationText,
                    { color: zone.type === 'long' ? '#EF4444' : '#10B981' }
                  ]}>
                    {zone.type.toUpperCase()} @ {formatPrice(zone.price)}
                  </Text>
                </View>
                <View style={styles.liquidationMagnitude}>
                  <View style={[styles.magnitudeBar, { width: `${zone.magnitude}%` }]} />
                </View>
              </View>
            ))}
          </View>
        </DataCard>

        {/* Indicadores de Momentum */}
        {analysis.momentum && (
          <DataCard title="Indicadores de Momentum" icon="speedometer">
            <View style={styles.dataGrid}>
              <DataItem 
                label="MACD" 
                value={analysis.momentum.macd.histogram > 0 ? 'BULLISH' : 'BEARISH'}
                color={analysis.momentum.macd.histogram > 0 ? '#10B981' : '#EF4444'}
                subtext={`Hist: ${analysis.momentum.macd.histogram.toFixed(2)}`}
              />
              <DataItem 
                label="Stochastic %K" 
                value={analysis.momentum.stochastic.k.toFixed(1)}
                color={analysis.momentum.stochastic.k > 80 ? '#EF4444' : 
                       analysis.momentum.stochastic.k < 20 ? '#10B981' : '#F59E0B'}
                subtext={analysis.momentum.stochastic.k > 80 ? 'Sobrecomprado' : 
                         analysis.momentum.stochastic.k < 20 ? 'Sobrevendido' : 'Neutro'}
              />
              <DataItem 
                label="Stochastic %D" 
                value={analysis.momentum.stochastic.d.toFixed(1)}
                color={analysis.momentum.stochastic.d > 80 ? '#EF4444' : 
                       analysis.momentum.stochastic.d < 20 ? '#10B981' : '#F59E0B'}
              />
              <DataItem 
                label="Momentum (10)" 
                value={`${analysis.momentum.momentum > 0 ? '+' : ''}${analysis.momentum.momentum.toFixed(2)}%`}
                color={analysis.momentum.momentum > 0 ? '#10B981' : '#EF4444'}
                subtext={analysis.momentum.momentum > 2 ? 'Forte' : 
                         analysis.momentum.momentum < -2 ? 'Fraco' : 'Moderado'}
              />
            </View>
          </DataCard>
        )}

        {/* Recomendação da IA (Groq/Llama) */}
        {analysis.aiTextRecommendation && (
          <View style={styles.aiRecommendationCard}>
            <View style={styles.aiRecommendationHeader}>
              <Ionicons name="bulb" size={24} color="#8B5CF6" />
              <Text style={styles.aiRecommendationTitle}>🤖 Análise da IA</Text>
            </View>
            <Text style={styles.aiRecommendationText}>
              {analysis.aiTextRecommendation}
            </Text>
            <View style={styles.aiPoweredBy}>
              <Text style={styles.aiPoweredByText}>Powered by Llama 3.3 70B</Text>
            </View>
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Ionicons name="warning" size={16} color="#F59E0B" />
          <Text style={styles.disclaimerText}>
            Esta análise é apenas informativa. Sempre faça sua própria pesquisa (DYOR) antes de operar.
          </Text>
        </View>
        
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  headerPlaceholder: {
    width: 40,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#F1F5F9',
    fontSize: 18,
    marginTop: 16,
    fontWeight: '600',
  },
  loadingSubtext: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 4,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cacheInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 12,
  },
  cacheInfoText: {
    color: '#64748B',
    fontSize: 12,
  },
  priceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  currentPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#F1F5F9',
  },
  biasBadgeSmall: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  biasTextSmall: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  scoreSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  circularScoreContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  circularScore: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  circularBg: {
    position: 'absolute',
    alignItems: 'center',
  },
  circularRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 12,
    opacity: 0.3,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  scoreLabel: {
    fontSize: 12,
    color: '#64748B',
    letterSpacing: 2,
  },
  biasBadge: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 12,
  },
  biasText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  probabilityCard: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  probabilityLabel: {
    color: '#64748B',
    fontSize: 12,
  },
  probabilityValue: {
    color: '#F1F5F9',
    fontSize: 24,
    fontWeight: 'bold',
  },
  scoresCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  progressItem: {
    gap: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressLabel: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  progressValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#0F172A',
    borderRadius: 4,
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
  },
  recommendationCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
  },
  recommendationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  actionText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  confidenceText: {
    color: '#64748B',
    fontSize: 12,
  },
  reasoningText: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  tradeDetails: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
  },
  tradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  tradeItem: {
    flex: 1,
  },
  tradeLabel: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 4,
  },
  tradeValue: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '600',
  },
  takeProfitSection: {
    marginBottom: 12,
  },
  takeProfitList: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  takeProfitItem: {
    flex: 1,
    backgroundColor: '#1E293B',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  takeProfitLabel: {
    color: '#64748B',
    fontSize: 10,
  },
  takeProfitValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  tradeFooter: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 12,
  },
  tradeFooterItem: {
    flex: 1,
    alignItems: 'center',
  },
  tradeFooterLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  tradeFooterValue: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '600',
  },
  dataCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dataCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dataCardTitle: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: 'bold',
  },
  dataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dataItem: {
    width: '48%',
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
  },
  dataItemLabel: {
    color: '#64748B',
    fontSize: 11,
    marginBottom: 4,
  },
  dataItemValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  dataItemValue: {
    color: '#F1F5F9',
    fontSize: 16,
    fontWeight: '600',
  },
  dataItemSubtext: {
    color: '#64748B',
    fontSize: 10,
  },
  levelsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  levelSection: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
  },
  levelSectionTitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600',
  },
  levelValue: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  liquidationSection: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 10,
  },
  liquidationItem: {
    marginBottom: 8,
  },
  liquidationBadge: {
    padding: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  liquidationText: {
    fontSize: 12,
    fontWeight: '600',
  },
  liquidationMagnitude: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
  },
  magnitudeBar: {
    height: 4,
    backgroundColor: '#8B5CF6',
    borderRadius: 2,
  },
  // AI Recommendation Card
  aiRecommendationCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#8B5CF6',
  },
  aiRecommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  aiRecommendationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8B5CF6',
  },
  aiRecommendationText: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  aiPoweredBy: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    alignItems: 'center',
  },
  aiPoweredByText: {
    color: '#64748B',
    fontSize: 11,
    fontStyle: 'italic',
  },
  newsImpactContainer: {
    padding: 12,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 10,
  },
  newsImpactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  newsImpactLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  newsImpactScore: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  newsImpactReasoning: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  newsImpactSource: {
    color: '#64748B',
    fontSize: 11,
    fontStyle: 'italic',
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
  },
  disclaimerText: {
    flex: 1,
    color: '#F59E0B',
    fontSize: 12,
    lineHeight: 18,
  },
});
