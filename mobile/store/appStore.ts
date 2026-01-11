import { create } from 'zustand';
import * as Notifications from 'expo-notifications';

export interface TradeAlert {
  id: string;
  type: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  confidence?: number;
  timestamp: number;
}

interface AppState {
  botRunning: boolean;
  alerts: TradeAlert[];
  addAlert: (alert: TradeAlert) => void;
  setBotRunning: (running: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  botRunning: false,
  alerts: [],
  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 100), // Mantém últimas 100
    })),
  setBotRunning: (running) => set({ botRunning: running }),
}));
