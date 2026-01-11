import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🤖 TradeBot AI</Text>
      <Text style={styles.subtitle}>Sistema de Trading Inteligente</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>✅ Backend Conectado</Text>
        <Text style={styles.cardText}>http://192.168.1.3:8000</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 Features Ativas</Text>
        <Text style={styles.cardText}>• Paper Trading</Text>
        <Text style={styles.cardText}>• Learning Reports</Text>
        <Text style={styles.cardText}>• Multi-timeframe Analysis</Text>
        <Text style={styles.cardText}>• RSI + Volume + MA</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 40,
  },
  card: {
    backgroundColor: '#1E293B',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 10,
  },
  cardText: {
    fontSize: 14,
    color: '#CBD5E1',
    marginBottom: 5,
  },
});
