import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = 'http://192.168.1.3:8000/api';

export default function AccountScreen() {
  const [balance, setBalance] = useState(10000);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    loadBalance();
    loadPositions();
  }, []);

  const loadBalance = async () => {
    try {
      const response = await axios.get(`${API_URL}/account/balance`);
      setBalance(response.data.balance_usd || 10000);
    } catch (error) {
      console.error('Erro ao carregar saldo:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPositions = async () => {
    try {
      const response = await axios.get(`${API_URL}/account/paper/positions`);
      setPositions(response.data.positions || []);
    } catch (error) {
      console.error('Erro ao carregar posições:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size={'large' as 'large'} color={'#3b82f6'} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <MaterialCommunityIcons name="wallet" size={40} color="#3B82F6" />
          <Text style={styles.title}>Conta Paper Trading</Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Saldo Total</Text>
          <Text style={styles.balanceValue}>${balance.toFixed(2)}</Text>
          <Text style={styles.balanceSubtext}>USDT (Simulado)</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Posições Abertas</Text>
          {positions.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="information-outline" size={40} color="#64748B" />
              <Text style={styles.emptyText}>Nenhuma posição aberta</Text>
              <Text style={styles.emptySubtext}>Abra uma posição para começar a testar</Text>
            </View>
          ) : (
            positions.map((pos) => (
              <View key={pos.id} style={styles.positionCard}>
                <Text style={styles.positionSymbol}>{pos.symbol}</Text>
                <Text style={styles.positionSide}>{pos.side}</Text>
                <Text style={styles.positionValue}>
                  ${pos.notional_usd} ({pos.leverage}x)
                </Text>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity style={styles.actionButton}>
          <MaterialCommunityIcons name="plus-circle" size={24} color="#fff" />
          <Text style={styles.actionButtonText}>Abrir Posição</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 12,
  },
  balanceCard: {
    backgroundColor: '#1E293B',
    padding: 24,
    borderRadius: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 4,
  },
  balanceSubtext: {
    fontSize: 12,
    color: '#64748B',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: '#1E293B',
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#CBD5E1',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748B',
  },
  positionCard: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  positionSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  positionSide: {
    fontSize: 14,
    color: '#3B82F6',
    marginTop: 4,
  },
  positionValue: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 4,
  },
  actionButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
