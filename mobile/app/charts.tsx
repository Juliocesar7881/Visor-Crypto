import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar, TouchableOpacity, Dimensions, BackHandler } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

const { width } = Dimensions.get('window');

interface ChartData {
  symbol: string;
  price: number;
  ema9: number;
  ema21: number;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;
  change24h: number;
}

export default function ChartsScreen() {
  const router = useRouter();
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [chartData, setChartData] = useState<ChartData>({
    symbol: 'BTCUSDT',
    price: 43250.50,
    ema9: 43100.25,
    ema21: 42950.80,
    signal: 'BUY',
    confidence: 0.78,
    change24h: 3.2,
  });

  const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];

  // Handle Android back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // On main charts screen, let default behavior happen
        return false;
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
    }, [])
  );

  const openChartDetail = (symbol: string) => {
    router.push({
      pathname: '/chartDetail',
      params: { symbol },
    });
  };

  useEffect(() => {
    // Simular atualização de dados
    const interval = setInterval(() => {
      setChartData(prev => ({
        ...prev,
        price: prev.price + (Math.random() - 0.5) * 100,
        ema9: prev.ema9 + (Math.random() - 0.5) * 50,
        ema21: prev.ema21 + (Math.random() - 0.5) * 30,
        change24h: prev.change24h + (Math.random() - 0.5) * 0.5,
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const renderMiniChart = () => {
    // Gerar pontos para gráfico simplificado
    const points = Array.from({ length: 20 }, (_, i) => {
      const basePrice = chartData.price;
      const variation = Math.sin(i * 0.5) * 200;
      return basePrice + variation;
    });

    const max = Math.max(...points);
    const min = Math.min(...points);
    const range = max - min;

    return (
      <View style={styles.chartContainer}>
        <View style={styles.chartGrid}>
          {[0, 1, 2, 3, 4].map(i => (
            <View key={i} style={styles.gridLine} />
          ))}
        </View>
        <View style={styles.chartArea}>
          {points.map((point, index) => {
            const height = ((point - min) / range) * 120;
            const isLast = index === points.length - 1;
            return (
              <View
                key={index}
                style={[
                  styles.chartBar,
                  {
                    height: height,
                    backgroundColor: isLast ? '#3B82F6' : '#334155',
                  },
                ]}
              />
            );
          })}
        </View>
        
        {/* Linha EMA 9 */}
        <View style={[styles.emaLine, { top: 60, backgroundColor: '#10B981' }]} />
        <View style={[styles.emaLabel, { top: 55 }]}>
          <Text style={[styles.emaLabelText, { color: '#10B981' }]}>EMA 9</Text>
        </View>
        
        {/* Linha EMA 21 */}
        <View style={[styles.emaLine, { top: 90, backgroundColor: '#EF4444' }]} />
        <View style={[styles.emaLabel, { top: 85 }]}>
          <Text style={[styles.emaLabelText, { color: '#EF4444' }]}>EMA 21</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      
      <View style={styles.header}>
        <Text style={styles.title}>📊 Análise Gráfica</Text>
        <Text style={styles.subtitle}>Cruzamento de Médias (EMA)</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Seletor de moeda */}
        <View style={styles.symbolSelector}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {symbols.map((symbol) => (
              <TouchableOpacity
                key={symbol}
                style={[
                  styles.symbolChip,
                  selectedSymbol === symbol && styles.symbolChipActive,
                ]}
                onPress={() => setSelectedSymbol(symbol)}
                onLongPress={() => openChartDetail(symbol)}
              >
                <Text style={[
                  styles.symbolChipText,
                  selectedSymbol === symbol && styles.symbolChipTextActive,
                ]}>
                  {symbol.replace('USDT', '')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.hintText}>Segure pressionado para abrir gráfico detalhado</Text>
        </View>

        {/* Card de preço */}
        <View style={styles.priceCard}>
          <View style={styles.priceHeader}>
            <Text style={styles.symbolTitle}>{chartData.symbol}</Text>
            <View style={[
              styles.changeBadge,
              { backgroundColor: chartData.change24h >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)' }
            ]}>
              <Text style={[
                styles.changeText,
                { color: chartData.change24h >= 0 ? '#10B981' : '#EF4444' }
              ]}>
                {chartData.change24h >= 0 ? '↑' : '↓'} {Math.abs(chartData.change24h).toFixed(2)}%
              </Text>
            </View>
          </View>
          
          <Text style={styles.price}>${chartData.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
          
          <View style={styles.emaValues}>
            <View style={styles.emaItem}>
              <View style={[styles.emaDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.emaText}>EMA 9: ${chartData.ema9.toFixed(2)}</Text>
            </View>
            <View style={styles.emaItem}>
              <View style={[styles.emaDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.emaText}>EMA 21: ${chartData.ema21.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Gráfico */}
        <View style={styles.chartCard}>
          <Text style={styles.cardTitle}>📈 Gráfico de Preço</Text>
          {renderMiniChart()}
        </View>

        {/* Sinal atual */}
        <View style={[
          styles.signalCard,
          { borderLeftColor: chartData.signal === 'BUY' ? '#10B981' : chartData.signal === 'SELL' ? '#EF4444' : '#64748B' }
        ]}>
          <View style={styles.signalHeader}>
            <Text style={styles.signalLabel}>Sinal Atual</Text>
            <View style={[
              styles.signalBadge,
              { backgroundColor: chartData.signal === 'BUY' ? '#10B981' : chartData.signal === 'SELL' ? '#EF4444' : '#64748B' }
            ]}>
              <Text style={styles.signalBadgeText}>
                {chartData.signal === 'BUY' ? '📈 COMPRA' : chartData.signal === 'SELL' ? '📉 VENDA' : '➖ NEUTRO'}
              </Text>
            </View>
          </View>
          
          <Text style={styles.signalDescription}>
            {chartData.signal === 'BUY' 
              ? '🎯 EMA 9 cruzou acima da EMA 21 - Golden Cross detectado!'
              : chartData.signal === 'SELL'
              ? '⚠️ EMA 9 cruzou abaixo da EMA 21 - Death Cross detectado!'
              : 'Aguardando cruzamento de médias...'}
          </Text>
          
          <View style={styles.confidenceBar}>
            <Text style={styles.confidenceLabel}>Confiança: {(chartData.confidence * 100).toFixed(0)}%</Text>
            <View style={styles.confidenceBarBg}>
              <View style={[
                styles.confidenceBarFill,
                { 
                  width: `${chartData.confidence * 100}%`,
                  backgroundColor: chartData.signal === 'BUY' ? '#10B981' : '#EF4444'
                }
              ]} />
            </View>
          </View>
        </View>

        {/* Explicação da estratégia */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>💡 Como funciona?</Text>
          <Text style={styles.infoText}>
            <Text style={styles.infoBold}>EMA (Exponential Moving Average)</Text> é uma média móvel que dá mais peso aos preços recentes.
          </Text>
          <Text style={styles.infoText}>
            • <Text style={styles.infoBold}>Golden Cross (Compra):</Text> EMA 9 cruza acima da EMA 21
          </Text>
          <Text style={styles.infoText}>
            • <Text style={styles.infoBold}>Death Cross (Venda):</Text> EMA 9 cruza abaixo da EMA 21
          </Text>
          <Text style={styles.infoText}>
            Quanto maior a confiança, mais forte é o sinal!
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
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  symbolSelector: {
    marginBottom: 16,
  },
  hintText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 8,
    textAlign: 'center',
  },
  symbolChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  symbolChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#60A5FA',
  },
  symbolChipText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  symbolChipTextActive: {
    color: '#F1F5F9',
  },
  priceCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  priceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  symbolTitle: {
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: '600',
  },
  changeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  changeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  price: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 16,
  },
  emaValues: {
    flexDirection: 'row',
    gap: 16,
  },
  emaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emaDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  emaText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  chartCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F1F5F9',
    marginBottom: 16,
  },
  chartContainer: {
    height: 160,
    position: 'relative',
  },
  chartGrid: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
  },
  gridLine: {
    height: 1,
    backgroundColor: '#334155',
    opacity: 0.3,
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '100%',
    paddingTop: 20,
  },
  chartBar: {
    width: (width - 80) / 20 - 2,
    borderRadius: 2,
  },
  emaLine: {
    position: 'absolute',
    height: 2,
    width: '100%',
    opacity: 0.7,
  },
  emaLabel: {
    position: 'absolute',
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#0F172A',
    borderRadius: 4,
  },
  emaLabelText: {
    fontSize: 10,
    fontWeight: '700',
  },
  signalCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
    borderLeftWidth: 4,
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  signalLabel: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '600',
  },
  signalBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  signalBadgeText: {
    color: '#F1F5F9',
    fontSize: 12,
    fontWeight: '700',
  },
  signalDescription: {
    fontSize: 15,
    color: '#F1F5F9',
    lineHeight: 22,
    marginBottom: 16,
  },
  confidenceBar: {
    gap: 8,
  },
  confidenceLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  confidenceBarBg: {
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
  },
  confidenceBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  infoCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#60A5FA',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 22,
    marginBottom: 8,
  },
  infoBold: {
    fontWeight: '700',
    color: '#F1F5F9',
  },
});
