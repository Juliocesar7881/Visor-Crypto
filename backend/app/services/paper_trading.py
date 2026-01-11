"""
Paper Trading Service - Conta virtual para testes sem risco
Simula trading real com saldo fake de $10,000 USDT
"""

from datetime import datetime
import asyncio
import threading
import aiohttp
import statistics
from typing import Any
from typing import Dict, List, Optional
import uuid
from dataclasses import dataclass, field
from . import learning_store
from ..core.config import get_settings
from .coingecko import CoinGeckoService
from .cryptopanic import CryptoPanicService

class PaperTradingAccount:
    """Conta de paper trading individual"""
    
    def __init__(self, user_id: str, initial_balance: float = 10000.0):
        self.user_id = user_id
        self.balances = {
            'USDT': initial_balance,
            'BTC': 0.0,
            'ETH': 0.0,
            'BNB': 0.0,
            'SOL': 0.0,
            'XRP': 0.0,
            'ADA': 0.0,
            'DOGE': 0.0,
        }
        self.trades: List[Dict] = []
        # positions keyed by id
        self.positions: Dict[str, Dict] = {}
        # helper mapping symbol -> position id (only one open per symbol)
        self.open_by_symbol: Dict[str, str] = {}
        self.created_at = datetime.utcnow()
        self.total_trades = 0
        self.winning_trades = 0
        self.losing_trades = 0
        self.initial_balance = initial_balance
    def get_balance(self, asset: str = 'USDT') -> float:
        """Retorna saldo de um ativo"""
        return self.balances.get(asset.upper(), 0.0)
    
    def get_all_balances(self) -> Dict[str, float]:
        """Retorna todos os saldos"""
        return {k: v for k, v in self.balances.items() if v > 0}
    
    def execute_trade(
        self,
        symbol: str,  # ex: BTCUSDT
        side: str,    # BUY ou SELL
        amount: float,
        price: float,
        strategy: str = 'manual'
    ) -> Dict:
        """Executa um trade virtual"""
        
        # Extrai base e quote (BTC/USDT -> BTC, USDT)
        base = symbol.replace('USDT', '').replace('BUSD', '')
        quote = 'USDT'
        
        trade_value = amount * price
        
        if side.upper() == 'BUY':
            # Compra: precisa ter USDT suficiente
            if self.balances.get(quote, 0) < trade_value:
                return {
                    'success': False,
                    'error': f'Saldo insuficiente. Necessário: {trade_value} USDT'
                }
            
            # Executa compra
            self.balances[quote] -= trade_value
            self.balances[base] = self.balances.get(base, 0) + amount
            
        else:  # SELL
            # Venda: precisa ter o ativo
            if self.balances.get(base, 0) < amount:
                return {
                    'success': False,
                    'error': f'Saldo insuficiente. Necessário: {amount} {base}'
                }
            
            # Executa venda
            self.balances[base] -= amount
            self.balances[quote] = self.balances.get(quote, 0) + trade_value
        
        # Registra trade
        trade = {
            'id': str(uuid.uuid4()),
            'symbol': symbol,
            'side': side.upper(),
            'amount': amount,
            'price': price,
            'value': trade_value,
            'strategy': strategy,
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'filled'
        }
        
        self.trades.append(trade)
        self.total_trades += 1
        
        return {
            'success': True,
            'trade': trade,
            'balances': self.get_all_balances()
        }
    
    # ----------------- Positions / Leverage -----------------
    def open_position(self, symbol: str, side: str, notional_usd: float, leverage: int = 1) -> Dict:
        """Abre uma posição alavancada: deduz margem (notional/leverage) do saldo USDT."""
        symbol = symbol.upper()
        if not symbol.endswith('USDT'):
            return {'success': False, 'error': 'Apenas pares com USDT são suportados.'}

        # limit leverage per symbol
        max_leverage_by_symbol = {
            'BTCUSDT': 5,
            'ETHUSDT': 5,
            'SOLUSDT': 5
        }
        max_leverage = max_leverage_by_symbol.get(symbol, 1)
        if leverage < 1 or leverage > max_leverage:
            return {'success': False, 'error': f'Leverage inválido. Máx para {symbol}: {max_leverage}x'}

        # check existing open position for symbol
        if symbol in self.open_by_symbol:
            return {'success': False, 'error': f'Já existe uma posição aberta para {symbol}'}

        margin_required = notional_usd / leverage
        if self.balances.get('USDT', 0) < margin_required:
            return {'success': False, 'error': f'Saldo insuficiente para margem. Necessário: {margin_required} USDT'}

        # simulate entry price using a provided market price lookup will be done externally; here we store notional and margin
        entry_price = None
        # Deduz margem
        self.balances['USDT'] -= margin_required

        position_id = str(uuid.uuid4())
        position = {
            'id': position_id,
            'symbol': symbol,
            'side': side.upper(),
            'notional_usd': notional_usd,
            'leverage': leverage,
            'margin': margin_required,
            'entry_price': entry_price,
            'qty': None,
            'status': 'open',
            'opened_at': datetime.utcnow().isoformat(),
            'closed_at': None,
            'pnl': 0.0,
            'pnl_percentage': 0.0
        }

        self.positions[position_id] = position
        self.open_by_symbol[symbol] = position_id

        return {'success': True, 'position': position, 'balances': self.get_all_balances()}

    def close_position(self, position_id: str, exit_price: float) -> Dict:
        pos = self.positions.get(position_id)
        if not pos:
            return {'success': False, 'error': 'Posição não encontrada'}
        if pos['status'] != 'open':
            return {'success': False, 'error': 'Posição já está fechada'}

        # compute qty if entry_price known; fallback: qty = notional / exit_price
        entry_price = pos.get('entry_price')
        if entry_price:
            qty = pos['notional_usd'] / entry_price
        else:
            qty = pos['notional_usd'] / exit_price

        # realized pnl (notional * (exit/entry -1)) for long; inverse for short
        if entry_price:
            pnl = 0.0
            if pos['side'] == 'BUY':
                pnl = qty * (exit_price - entry_price)
            else:
                pnl = qty * (entry_price - exit_price)
        else:
            # approximate pnl from notional change
            if pos['side'] == 'BUY':
                pnl = pos['notional_usd'] * (exit_price / exit_price - 1)
            else:
                pnl = 0.0

        # release margin + pnl back to USDT
        self.balances['USDT'] += pos['margin'] + pnl

        pos['status'] = 'closed'
        pos['closed_at'] = datetime.utcnow().isoformat()
        pos['pnl'] = pnl
        pos['pnl_percentage'] = (pnl / pos['margin']) * 100 if pos['margin'] else 0.0

        # remove open_by_symbol mapping
        if pos['symbol'] in self.open_by_symbol:
            del self.open_by_symbol[pos['symbol']]

        # Generate and persist learning report in a background thread (fire-and-forget)
        def _bg_report_runner(pos_id: str):
            try:
                report = self.generate_learning_report(pos_id)
                if report and report.get('success') and report.get('report'):
                    try:
                        learning_store.save_report(report['report'])
                    except Exception as e:
                        print('Failed to save learning report:', e)
            except Exception as e:
                print('Error generating learning report in background:', e)

        thread = threading.Thread(target=_bg_report_runner, args=(position_id,), daemon=True)
        thread.start()

        return {'success': True, 'position': pos, 'balances': self.get_all_balances()}

    def liquidate_position(self, position_id: str) -> Dict:
        pos = self.positions.get(position_id)
        if not pos:
            return {'success': False, 'error': 'Posição não encontrada'}
        if pos['status'] != 'open':
            return {'success': False, 'error': 'Posição não está aberta'}

        # margin is lost
        pos['status'] = 'liquidated'
        pos['closed_at'] = datetime.utcnow().isoformat()
        pos['pnl'] = -pos['margin']
        pos['pnl_percentage'] = -100.0

        if pos['symbol'] in self.open_by_symbol:
            del self.open_by_symbol[pos['symbol']]

        return {'success': True, 'position': pos, 'balances': self.get_all_balances()}

    def get_positions(self) -> List[Dict]:
        return list(self.positions.values())

    def reset_account(self, initial_balance: float = None):
        """Reseta a conta: fecha todas posições e volta ao saldo inicial"""
        initial = initial_balance if initial_balance is not None else self.initial_balance
        self.balances = {k: 0.0 for k in self.balances}
        self.balances['USDT'] = initial
        self.trades = []
        self.positions = {}
        self.open_by_symbol = {}
        self.total_trades = 0
        self.winning_trades = 0
        self.losing_trades = 0
        self.created_at = datetime.utcnow()

    def generate_learning_report(self, position_id: str) -> Dict:
        """Gera relatório de aprendizado para uma posição.

        Coleta dados multi-timeframe (Binance klines), calcula RSI, MAs, volume spikes,
        agrega notícias via CryptoPanic e dados de mercado via CoinGecko.
        Retorna dicionário com 'success' e 'report'.
        """
        pos = self.positions.get(position_id)
        if not pos:
            return {'success': False, 'error': 'Posição não encontrada'}

        settings = get_settings()

        # helper: map symbol to coin id and base symbol
        def map_symbol(sym: str) -> tuple[str, str]:
            base = sym.replace('USDT', '')
            mapping = {
                'BTC': 'bitcoin',
                'ETH': 'ethereum',
                'SOL': 'solana',
                'BNB': 'binancecoin',
                'ADA': 'cardano',
            }
            return mapping.get(base, base.lower()), base

        coin_id, base = map_symbol(pos['symbol'])

        async def collect() -> Dict[str, Any]:
            report: Dict[str, Any] = {}
            report['position_id'] = position_id
            report['symbol'] = pos['symbol']
            report['side'] = pos['side']
            report['notional_usd'] = pos['notional_usd']
            report['leverage'] = pos['leverage']
            report['status'] = pos['status']
            report['pnl'] = pos.get('pnl', 0.0)
            report['opened_at'] = pos.get('opened_at')
            report['closed_at'] = pos.get('closed_at')

            # fetch multi-timeframe klines from Binance public API
            intervals = ['1h', '4h', '1d']
            klines_data = {}
            async with aiohttp.ClientSession() as session:
                for interval in intervals:
                    try:
                        url = 'https://api.binance.com/api/v3/klines'
                        params = {'symbol': pos['symbol'], 'interval': interval, 'limit': 200}
                        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                            if resp.status == 200:
                                data = await resp.json()
                                # data: list of candlesticks
                                closes = [float(item[4]) for item in data]
                                volumes = [float(item[5]) for item in data]
                                klines_data[interval] = {
                                    'closes': closes,
                                    'volumes': volumes,
                                    'raw': data
                                }
                            else:
                                klines_data[interval] = {'closes': [], 'volumes': [], 'raw': []}
                    except Exception as e:
                        klines_data[interval] = {'closes': [], 'volumes': [], 'raw': []}

            # simple indicators
            def sma(series, period):
                if not series or len(series) < period:
                    return None
                return sum(series[-period:]) / period

            def compute_rsi(series, period=14):
                if not series or len(series) < period + 1:
                    return None
                deltas = [series[i] - series[i-1] for i in range(1, len(series))]
                gains = [d for d in deltas if d > 0]
                losses = [-d for d in deltas if d < 0]
                avg_gain = sum(gains[-period:]) / period if len(gains) >= period else (sum(gains) / period if gains else 0)
                avg_loss = sum(losses[-period:]) / period if len(losses) >= period else (sum(losses) / period if losses else 0)
                if avg_loss == 0:
                    return 100.0 if avg_gain > 0 else 50.0
                rs = avg_gain / avg_loss
                rsi = 100 - (100 / (1 + rs))
                return rsi

            indicators = {}
            for interval, d in klines_data.items():
                closes = d.get('closes', [])
                volumes = d.get('volumes', [])
                indicators[interval] = {
                    'sma_fast': sma(closes, 9),
                    'sma_slow': sma(closes, 21),
                    'rsi_14': compute_rsi(closes, 14),
                    'last_close': closes[-1] if closes else None,
                    'avg_volume': statistics.mean(volumes) if volumes else None,
                    'last_volume': volumes[-1] if volumes else None,
                }

            report['indicators'] = indicators

            # detect volume spikes / whale movement heuristic
            whale_alerts = []
            for interval, d in klines_data.items():
                vols = d.get('volumes', [])
                if vols and len(vols) > 5:
                    avg = statistics.mean(vols[:-1]) if len(vols) > 1 else vols[-1]
                    last = vols[-1]
                    if avg and last > avg * 3:
                        whale_alerts.append({'interval': interval, 'factor': last / (avg or 1), 'last_volume': last})
            report['whale_alerts'] = whale_alerts

            # support/resistance naive detection: recent local highs/lows
            sr = {'supports': [], 'resistances': []}
            # use daily closes for SR detection
            dcloses = klines_data.get('1d', {}).get('closes', [])
            if dcloses and len(dcloses) > 10:
                window = dcloses
                highs = sorted(window)[-3:]
                lows = sorted(window)[:3]
                sr['resistances'] = highs
                sr['supports'] = lows
            report['support_resistance'] = sr

            # gather market context via CoinGecko and CryptoPanic
            cg = CoinGeckoService(settings.coingecko_api_key)
            cp = CryptoPanicService(settings.cryptopanic_api_key)

            try:
                cg_details = await cg.get_coin_details(coin_id)
            except Exception:
                cg_details = {}

            try:
                news = await cp.get_important_news(currencies=[base])
            except Exception:
                news = []

            # heatmap snapshot (top coins)
            try:
                heatmap = await cg.get_heatmap_data(limit=30)
            except Exception:
                heatmap = []

            # fear & greed
            try:
                fng = await cg.get_fear_and_greed_index()
            except Exception:
                fng = {}

            report['market'] = {
                'coingecko': cg_details,
                'news': news,
                'heatmap': heatmap,
                'fear_and_greed': fng,
            }

            # basic conclusions / suggestions
            suggestions = []
            insights = []

            # RSI-based simple signal
            rsi_1h = indicators.get('1h', {}).get('rsi_14')
            if rsi_1h is not None:
                if rsi_1h < 30:
                    insights.append('RSI 1h below 30 — possible long opportunity (oversold)')
                elif rsi_1h > 70:
                    insights.append('RSI 1h above 70 — possible short opportunity (overbought)')

            # MA cross check
            sma_f = indicators.get('1h', {}).get('sma_fast')
            sma_s = indicators.get('1h', {}).get('sma_slow')
            if sma_f and sma_s:
                if sma_f > sma_s:
                    insights.append('Fast MA above slow MA (bullish bias)')
                else:
                    insights.append('Fast MA below slow MA (bearish bias)')

            # news impact
            high_impact_news = [n for n in news if n.get('impact') == 'high']
            if high_impact_news:
                insights.append(f'{len(high_impact_news)} high-impact news items found around this trade')
                suggestions.append('Consider filtering trades around high-impact news')

            # whale alerts
            if whale_alerts:
                insights.append('Large volume spikes detected (whale activity)')
                suggestions.append('Avoid opening high-leverage positions during whale spikes')

            report['insights'] = insights
            report['suggestions'] = suggestions

            # metadata
            report['generated_at'] = datetime.utcnow().isoformat()

            return {'success': True, 'report': report}

        # run async collector
        try:
            result = asyncio.run(collect())
        except Exception as e:
            print('Error during async collection for learning report:', e)
            return {'success': False, 'error': str(e)}

        return result

    
    def calculate_pnl(self, current_prices: Dict[str, float]) -> Dict:
        """Calcula Profit & Loss atual"""
        total_value_usdt = self.balances.get('USDT', 0)
        
        # Converte todos os ativos para USDT
        for asset, amount in self.balances.items():
            if asset != 'USDT' and amount > 0:
                symbol = f"{asset}USDT"
                price = current_prices.get(symbol, 0)
                total_value_usdt += amount * price
        
        initial_balance = 10000.0
        pnl = total_value_usdt - initial_balance
        pnl_percentage = (pnl / initial_balance) * 100
        
        return {
            'initial_balance': initial_balance,
            'current_value': total_value_usdt,
            'pnl': pnl,
            'pnl_percentage': pnl_percentage,
            'total_trades': self.total_trades,
            'winning_trades': self.winning_trades,
            'losing_trades': self.losing_trades
        }
    
    def get_trade_history(self, limit: int = 50) -> List[Dict]:
        """Retorna histórico de trades"""
        return sorted(self.trades, key=lambda x: x['timestamp'], reverse=True)[:limit]


class PaperTradingService:
    """Serviço de gerenciamento de contas paper trading"""
    
    def __init__(self):
        self.accounts: Dict[str, PaperTradingAccount] = {}
    
    def create_account(self, user_id: str, initial_balance: float = 10000.0) -> PaperTradingAccount:
        """Cria uma nova conta paper trading"""
        if user_id in self.accounts:
            return self.accounts[user_id]
        
        account = PaperTradingAccount(user_id, initial_balance)
        self.accounts[user_id] = account
        return account
    
    def get_account(self, user_id: str) -> Optional[PaperTradingAccount]:
        """Retorna conta do usuário"""
        return self.accounts.get(user_id)
    
    def get_or_create_account(self, user_id: str) -> PaperTradingAccount:
        """Retorna conta existente ou cria nova"""
        if user_id not in self.accounts:
            return self.create_account(user_id)
        return self.accounts[user_id]


# Instância global
paper_trading_service = PaperTradingService()
