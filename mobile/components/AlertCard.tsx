import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface AlertCardProps {
  alert: {
    id: string;
    symbol: string;
    action: 'BUY' | 'SELL';
    confidence?: number;
    timestamp: number;
  };
}

export default function AlertCard({ alert }: AlertCardProps) {
  const actionColor = alert.action === 'BUY' ? '#10B981' : '#EF4444';
  const date = new Date(alert.timestamp).toLocaleString('pt-BR');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.action, { color: actionColor }]}>{alert.action}</Text>
        <Text style={styles.symbol}>{alert.symbol}</Text>
      </View>
      <Text style={styles.timestamp}>{date}</Text>
      {alert.confidence !== undefined && (
        <Text style={styles.confidence}>Confiança: {(alert.confidence * 100).toFixed(0)}%</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    marginVertical: 6,
    marginHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  action: {
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 12,
  },
  symbol: {
    fontSize: 16,
    color: '#CBD5E1',
  },
  timestamp: {
    fontSize: 12,
    color: '#94A3B8',
  },
  confidence: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
});
