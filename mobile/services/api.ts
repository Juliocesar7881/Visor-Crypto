import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Try to import expo-device, fallback if not available
let Device: any = null;
try {
  Device = require('expo-device');
} catch (error) {
  console.warn('expo-device not available');
}

// Use IP da rede local para que o celular possa acessar o backend
const API_BASE_URL = 'http://192.168.1.3:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface DeviceRegistration {
  device_token: string;
  platform: 'ios' | 'android';
  language?: string;
  app_version?: string;
}

export interface SignalPayload {
  source?: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  confidence?: number;
  strategy?: string;
  mode?: 'auto' | 'notification';
}

export interface BotState {
  desired_state: 'start' | 'stop';
}

export const apiService = {
  async registerDevice(token: string): Promise<void> {
    const platform = Device?.osName === 'iOS' ? 'ios' : Platform.OS === 'ios' ? 'ios' : 'android';
    const payload: DeviceRegistration = {
      device_token: token,
      platform,
      language: 'pt-BR',
      app_version: '1.0.0',
    };
    await api.post('/devices/register', payload);
    await SecureStore.setItemAsync('device_token', token);
  },

  async changeState(state: 'start' | 'stop'): Promise<any> {
    const response = await api.post('/bot/state', { desired_state: state } as BotState);
    return response.data;
  },

  async getStatus(): Promise<any> {
    const response = await api.get('/bot/status');
    return response.data;
  },

  async getSymbols(): Promise<any> {
    const response = await api.get('/bot/symbols');
    return response.data;
  },

  async updateSymbols(symbols: string[]): Promise<any> {
    const response = await api.post('/bot/symbols', symbols);
    return response.data;
  },

  async sendSignal(signal: SignalPayload): Promise<void> {
    await api.post('/signals/webhook', signal);
  },
};

export default api;
