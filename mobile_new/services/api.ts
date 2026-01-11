import axios from 'axios';

// Use o IP da sua máquina na rede local
const API_BASE_URL = 'http://192.168.1.3:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiService = {
  // Account
  getBalance: () => api.get('/account/balance'),
  getPositions: () => api.get('/account/paper/positions'),
  
  // Market Data
  getMarketData: (symbol: string) => api.get(`/market/crypto/${symbol}`),
  
  // Trading
  openPosition: (data: any) => api.post('/bot/paper/open', data),
  closePosition: (positionId: string) => api.post('/bot/paper/close', { position_id: positionId }),
  
  // News
  getNews: () => api.get('/news'),
  
  // Signals
  getSignals: () => api.get('/signals'),
  
  // Reports
  getReports: () => api.get('/bot/paper/reports'),
};

export default api;
