import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';

interface AccountOverview {
  paper_trading: {
    balance: Record<string, number>;
    pnl: {
      initial_balance: number;
      current_value: number;
      pnl: number;
      pnl_percentage: number;
    };
  };
  exchanges: {
    connected: string[];
    count: number;
  };
}

interface Exchange {
  id: string;
  name: string;
}

export default function AccountScreen() {
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [supportedExchanges, setSupportedExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accountType, setAccountType] = useState<'paper' | 'real'>('paper');
  const [positions, setPositions] = useState<any[]>([]);
  const [openSymbol, setOpenSymbol] = useState<string>('BTCUSDT');
  const [openNotional, setOpenNotional] = useState<string>('1000');
  const [openLeverage, setOpenLeverage] = useState<number>(1);
  
  // Modal de conexão
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState<string>('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadData();
    loadSupportedExchanges();
    loadPositions();
  }, []);

  const loadData = async () => {
    try {
      const response = await api.get('/account/overview');
      setOverview(response.data);
    } catch (error) {
      console.error('Error loading account data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSupportedExchanges = async () => {
    try {
      const response = await api.get('/account/exchanges/supported');
      setSupportedExchanges(response.data.exchanges);
    } catch (error) {
      console.error('Error loading exchanges:', error);
    }
  };

  const loadPositions = async () => {
    try {
      const resp = await api.get('/account/paper/positions');
      setPositions(resp.data.positions || []);
    } catch (error) {
      console.error('Error loading positions', error);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleConnectExchange = async () => {
    if (!selectedExchange || !apiKey || !apiSecret) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }

    setConnecting(true);

    try {
      const response = await api.post('/account/exchanges/connect', {
        exchange: selectedExchange,
        api_key: apiKey,
        api_secret: apiSecret,
        testnet: false,
      });

      if (response.data.success) {
        Alert.alert('Sucesso!', `Conectado à ${selectedExchange} com sucesso`);
        setShowConnectModal(false);
        setApiKey('');
        setApiSecret('');
        setSelectedExchange('');
        loadData();
      }
    } catch (error: any) {
      Alert.alert('Erro', error.response?.data?.detail || 'Erro ao conectar exchange');
    } finally {
      setConnecting(false);
    }
  };

  const handleResetPaperAccount = async () => {
    Alert.alert(
      'Resetar Conta Paper Trading',
      'Isso vai resetar seu saldo para $10,000 e apagar todo o histórico. Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resetar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post('/account/paper/reset');
              Alert.alert('Sucesso', 'Conta resetada para $10,000');
                  loadData();
                  loadPositions();
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível resetar a conta');
            }
          },
        },
      ]
    );
  };

  const handleOpenPosition = async () => {
    try {
      const payload = {
        symbol: openSymbol,
        side: 'BUY',
        notional_usd: parseFloat(openNotional),
        leverage: openLeverage
      };
      const resp = await api.post('/account/paper/position', payload);
      if (resp.data && resp.data.success) {
        Alert.alert('Posição aberta', `Posição em ${openSymbol} aberta com ${openLeverage}x`);
        loadData();
        loadPositions();
      }
    } catch (error: any) {
      Alert.alert('Erro ao abrir posição', error.response?.data || String(error));
    }
  };

  const handleClosePosition = async (id: string) => {
    try {
      const resp = await api.post(`/account/paper/positions/${id}/close`, {});
      if (resp.data && resp.data.success) {
        Alert.alert('Fechado', 'Posição fechada com sucesso');
        loadData();
        loadPositions();
      }
    } catch (error: any) {
      Alert.alert('Erro ao fechar posição', error.response?.data || String(error));
    }
  };

  const handleGetReport = async (id: string) => {
    try {
      const resp = await api.get(`/account/paper/positions/${id}/report`);
      if (resp.data && resp.data.success) {
        Alert.alert('Relatório', JSON.stringify(resp.data.report, null, 2));
      }
    } catch (error: any) {
      Alert.alert('Erro ao gerar relatório', error.response?.data || String(error));
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Carregando conta...</Text>
      </View>
    );
  }

  if (!overview) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Erro ao carregar dados</Text>
      </View>
    );
  }

  const isPaper = accountType === 'paper';
  const pnl = overview.paper_trading.pnl;
  const isProfitable = pnl.pnl >= 0;

  return (
    <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>💰 Minha Conta</Text>
          <Text style={styles.subtitle}>Gerencie suas contas e conexões</Text>
        </View>

        {/* Seletor de Tipo de Conta */}
        <View style={styles.accountTypeSelector}>
          <TouchableOpacity
            style={[styles.typeButton, isPaper && styles.typeButtonActive]}
            onPress={() => setAccountType('paper')}
          >
            <MaterialCommunityIcons
              name="file-document-edit-outline"
              size={20}
              color={isPaper ? '#fff' : '#64748b'}
            />
            <Text style={[styles.typeButtonText, isPaper && styles.typeButtonTextActive]}>
              Paper Trading
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.typeButton, !isPaper && styles.typeButtonActive]}
            onPress={() => setAccountType('real')}
          >
            <MaterialCommunityIcons
              name="bank"
              size={20}
              color={!isPaper ? '#fff' : '#64748b'}
            />
            <Text style={[styles.typeButtonText, !isPaper && styles.typeButtonTextActive]}>
              Exchange Real
            </Text>
          </TouchableOpacity>
        </View>

        {/* PAPER TRADING */}
        {isPaper && (
          <>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>💵 Saldo Virtual</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>SIMULAÇÃO</Text>
                </View>
              </View>

              <Text style={styles.balanceValue}>
                {formatCurrency(pnl.current_value)}
              </Text>

              <View style={styles.pnlContainer}>
                <MaterialCommunityIcons
                  name={isProfitable ? 'trending-up' : 'trending-down'}
                  size={20}
                  color={isProfitable ? '#10b981' : '#ef4444'}
                />
                <Text
                  style={[
                    styles.pnlText,
                    { color: isProfitable ? '#10b981' : '#ef4444' },
                  ]}
                >
                  {formatCurrency(Math.abs(pnl.pnl))} (
                  {isProfitable ? '+' : '-'}
                  {Math.abs(pnl.pnl_percentage).toFixed(2)}%)
                </Text>
              </View>

              <Text style={styles.initialBalance}>
                Investimento inicial: {formatCurrency(pnl.initial_balance)}
              </Text>
            </View>

            {/* Ativos */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📊 Ativos</Text>
              {Object.entries(overview.paper_trading.balance).map(([asset, amount]) => (
                <View key={asset} style={styles.assetRow}>
                  <View style={styles.assetInfo}>
                    <Text style={styles.assetSymbol}>{asset}</Text>
                    <Text style={styles.assetName}>
                      {asset === 'USDT' ? 'Tether USD' : asset}
                    </Text>
                  </View>
                  <Text style={styles.assetAmount}>
                    {amount > 0.01 ? amount.toFixed(2) : amount.toFixed(8)}
                  </Text>
                </View>
              ))}
            </View>

            {/* Ações */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>⚙️ Ações</Text>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleResetPaperAccount}
              >
                <MaterialCommunityIcons name="refresh" size={20} color="#f59e0b" />
                <Text style={styles.actionButtonText}>Resetar Conta</Text>
              </TouchableOpacity>

              {/* Open Position Form */}
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Abrir Posição (Simulação)</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[styles.exchangeChip, openSymbol === 'BTCUSDT' && styles.exchangeChipSelected]} onPress={() => setOpenSymbol('BTCUSDT')}>
                    <Text style={[styles.exchangeChipText, openSymbol === 'BTCUSDT' && styles.exchangeChipTextSelected]}>BTC</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.exchangeChip, openSymbol === 'ETHUSDT' && styles.exchangeChipSelected]} onPress={() => setOpenSymbol('ETHUSDT')}>
                    <Text style={[styles.exchangeChipText, openSymbol === 'ETHUSDT' && styles.exchangeChipTextSelected]}>ETH</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.exchangeChip, openSymbol === 'SOLUSDT' && styles.exchangeChipSelected]} onPress={() => setOpenSymbol('SOLUSDT')}>
                    <Text style={[styles.exchangeChipText, openSymbol === 'SOLUSDT' && styles.exchangeChipTextSelected]}>SOL</Text>
                  </TouchableOpacity>
                </View>

                <TextInput style={styles.input} keyboardType="numeric" value={openNotional} onChangeText={setOpenNotional} />
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <TouchableOpacity style={[styles.exchangeChip, openLeverage === 1 && styles.exchangeChipSelected]} onPress={() => setOpenLeverage(1)}><Text style={[styles.exchangeChipText, openLeverage === 1 && styles.exchangeChipTextSelected]}>1x</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.exchangeChip, openLeverage === 2 && styles.exchangeChipSelected]} onPress={() => setOpenLeverage(2)}><Text style={[styles.exchangeChipText, openLeverage === 2 && styles.exchangeChipTextSelected]}>2x</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.exchangeChip, openLeverage === 5 && styles.exchangeChipSelected]} onPress={() => setOpenLeverage(5)}><Text style={[styles.exchangeChipText, openLeverage === 5 && styles.exchangeChipTextSelected]}>5x</Text></TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.submitButton} onPress={handleOpenPosition}>
                  <MaterialCommunityIcons name="rocket-launch" size={18} color="#fff" />
                  <Text style={styles.submitButtonText}>Abrir Posição</Text>
                </TouchableOpacity>
              </View>

              {/* Positions List */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.cardTitle}>Posições Abertas</Text>
                {positions.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhuma posição aberta</Text>
                ) : (
                  positions.map((p) => (
                    <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }}>
                      <View>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{p.symbol} • {p.side}</Text>
                        <Text style={{ color: '#94a3b8' }}>Notional: ${p.notional_usd} • Lev: {p.leverage}x • Status: {p.status}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity style={[styles.connectButton, { paddingVertical: 8 }]} onPress={() => handleClosePosition(p.id)}>
                          <Text style={styles.connectButtonText}>Fechar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.connectButton, { backgroundColor: '#10b981', paddingVertical: 8 }]} onPress={() => handleGetReport(p.id)}>
                          <Text style={styles.connectButtonText}>Relatório</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
          </>
        )}

        {/* EXCHANGE REAL */}
        {!isPaper && (
          <>
            {overview.exchanges.count === 0 ? (
              <View style={styles.card}>
                <MaterialCommunityIcons name="link-off" size={48} color="#64748b" />
                <Text style={styles.emptyTitle}>Nenhuma Exchange Conectada</Text>
                <Text style={styles.emptyText}>
                  Conecte sua exchange favorita para começar a operar com dinheiro real
                </Text>
                <TouchableOpacity
                  style={styles.connectButton}
                  onPress={() => setShowConnectModal(true)}
                >
                  <MaterialCommunityIcons name="link" size={20} color="#fff" />
                  <Text style={styles.connectButtonText}>Conectar Exchange</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>🔗 Exchanges Conectadas</Text>
                  {overview.exchanges.connected.map((exchange) => (
                    <View key={exchange} style={styles.exchangeRow}>
                      <MaterialCommunityIcons name="check-circle" size={20} color="#10b981" />
                      <Text style={styles.exchangeName}>
                        {exchange.charAt(0).toUpperCase() + exchange.slice(1)}
                      </Text>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[styles.connectButton, { marginTop: 12 }]}
                    onPress={() => setShowConnectModal(true)}
                  >
                    <MaterialCommunityIcons name="plus" size={20} color="#fff" />
                    <Text style={styles.connectButtonText}>Adicionar Exchange</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modal de Conexão */}
      <Modal
        visible={showConnectModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowConnectModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Conectar Exchange</Text>
              <TouchableOpacity onPress={() => setShowConnectModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Selecione a exchange e cole suas chaves de API
            </Text>

            <Text style={styles.inputLabel}>Exchange</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.exchangeList}>
              {supportedExchanges.map((exchange) => (
                <TouchableOpacity
                  key={exchange.id}
                  style={[
                    styles.exchangeChip,
                    selectedExchange === exchange.id && styles.exchangeChipSelected,
                  ]}
                  onPress={() => setSelectedExchange(exchange.id)}
                >
                  <Text
                    style={[
                      styles.exchangeChipText,
                      selectedExchange === exchange.id && styles.exchangeChipTextSelected,
                    ]}
                  >
                    {exchange.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>API Key</Text>
            <TextInput
              style={styles.input}
              placeholder="Cole sua API Key aqui"
              placeholderTextColor="#64748b"
              value={apiKey}
              onChangeText={setApiKey}
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>API Secret</Text>
            <TextInput
              style={styles.input}
              placeholder="Cole sua API Secret aqui"
              placeholderTextColor="#64748b"
              value={apiSecret}
              onChangeText={setApiSecret}
              autoCapitalize="none"
              secureTextEntry={true}
            />

            <TouchableOpacity
              style={[styles.submitButton, connecting && styles.submitButtonDisabled]}
              onPress={handleConnectExchange}
              disabled={connecting}
            >
              {connecting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons name="link" size={20} color="#fff" />
                  <Text style={styles.submitButtonText}>Conectar</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.helpButton}
              onPress={() => Alert.alert('Tutorial', 'Em breve: tutorial passo-a-passo')}
            >
              <MaterialCommunityIcons name="help-circle-outline" size={20} color="#3b82f6" />
              <Text style={styles.helpButtonText}>Como gerar chaves de API?</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingTop: 50,
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
  accountTypeSelector: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    gap: 12,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#334155',
  },
  typeButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  badge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  balanceValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  pnlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pnlText: {
    fontSize: 18,
    fontWeight: '600',
  },
  initialBalance: {
    fontSize: 14,
    color: '#64748b',
  },
  assetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  assetInfo: {
    flex: 1,
  },
  assetSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  assetName: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  assetAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  actionButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 12,
  },
  connectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  exchangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  exchangeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
  },
  exchangeList: {
    marginBottom: 20,
  },
  exchangeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#0f172a',
    borderWidth: 2,
    borderColor: '#334155',
    marginRight: 8,
  },
  exchangeChipSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  exchangeChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  exchangeChipTextSelected: {
    color: '#fff',
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 14,
    color: '#fff',
    fontSize: 14,
    marginBottom: 16,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  helpButtonText: {
    fontSize: 14,
    color: '#3b82f6',
  },
});
