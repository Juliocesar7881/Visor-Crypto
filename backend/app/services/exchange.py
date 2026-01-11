"""
Exchange Service - Integração com exchanges reais usando CCXT
Suporta: Binance, Coinbase, Kraken, Bybit, OKX e mais 100+ exchanges
"""

from typing import Dict, List, Optional, Any
import ccxt
from datetime import datetime
import asyncio

class ExchangeConnection:
    """Conexão com uma exchange específica"""
    
    def __init__(
        self,
        user_id: str,
        exchange_name: str,
        api_key: str,
        api_secret: str,
        testnet: bool = False
    ):
        self.user_id = user_id
        self.exchange_name = exchange_name.lower()
        self.testnet = testnet
        
        # Inicializa exchange via CCXT
        exchange_class = getattr(ccxt, self.exchange_name)
        
        config = {
            'apiKey': api_key,
            'secret': api_secret,
            'enableRateLimit': True,
        }
        
        # Se for testnet
        if testnet:
            config['options'] = {'defaultType': 'future'}
        
        self.exchange = exchange_class(config)
        self.connected_at = datetime.utcnow()
    
    async def test_connection(self) -> Dict:
        """Testa se as credenciais estão válidas"""
        try:
            balance = await self.get_balance()
            return {
                'success': True,
                'exchange': self.exchange_name,
                'message': 'Conexão estabelecida com sucesso',
                'has_balance': len(balance) > 0
            }
        except Exception as e:
            return {
                'success': False,
                'exchange': self.exchange_name,
                'error': str(e)
            }
    
    async def get_balance(self) -> Dict[str, float]:
        """Retorna saldos da conta"""
        try:
            balance = self.exchange.fetch_balance()
            # Retorna apenas ativos com saldo > 0
            return {
                asset: amount
                for asset, amount in balance['total'].items()
                if amount > 0
            }
        except Exception as e:
            raise Exception(f"Erro ao buscar saldo: {str(e)}")
    
    async def create_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        amount: float,
        price: Optional[float] = None
    ) -> Dict:
        """Cria uma ordem (BUY/SELL)"""
        try:
            if order_type.lower() == 'market':
                order = self.exchange.create_market_order(symbol, side, amount)
            elif order_type.lower() == 'limit':
                if not price:
                    raise ValueError("Preço é obrigatório para ordem limit")
                order = self.exchange.create_limit_order(symbol, side, amount, price)
            else:
                raise ValueError(f"Tipo de ordem inválido: {order_type}")
            
            return {
                'success': True,
                'order': {
                    'id': order['id'],
                    'symbol': order['symbol'],
                    'side': order['side'],
                    'type': order['type'],
                    'amount': order['amount'],
                    'price': order.get('price'),
                    'status': order['status'],
                    'timestamp': order['timestamp']
                }
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    async def get_open_orders(self, symbol: Optional[str] = None) -> List[Dict]:
        """Retorna ordens abertas"""
        try:
            orders = self.exchange.fetch_open_orders(symbol)
            return [
                {
                    'id': order['id'],
                    'symbol': order['symbol'],
                    'side': order['side'],
                    'type': order['type'],
                    'amount': order['amount'],
                    'price': order.get('price'),
                    'status': order['status'],
                    'timestamp': order['timestamp']
                }
                for order in orders
            ]
        except Exception as e:
            raise Exception(f"Erro ao buscar ordens: {str(e)}")
    
    async def get_trade_history(self, symbol: Optional[str] = None, limit: int = 50) -> List[Dict]:
        """Retorna histórico de trades"""
        try:
            trades = self.exchange.fetch_my_trades(symbol, limit=limit)
            return [
                {
                    'id': trade['id'],
                    'symbol': trade['symbol'],
                    'side': trade['side'],
                    'amount': trade['amount'],
                    'price': trade['price'],
                    'cost': trade['cost'],
                    'fee': trade.get('fee'),
                    'timestamp': trade['timestamp']
                }
                for trade in trades
            ]
        except Exception as e:
            raise Exception(f"Erro ao buscar histórico: {str(e)}")
    
    async def cancel_order(self, order_id: str, symbol: str) -> Dict:
        """Cancela uma ordem"""
        try:
            result = self.exchange.cancel_order(order_id, symbol)
            return {
                'success': True,
                'message': 'Ordem cancelada com sucesso',
                'order_id': order_id
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }


class ExchangeService:
    """Serviço de gerenciamento de conexões com exchanges"""
    
    # Exchanges suportadas com nomes amigáveis
    SUPPORTED_EXCHANGES = {
        'binance': 'Binance',
        'coinbase': 'Coinbase',
        'kraken': 'Kraken',
        'bybit': 'Bybit',
        'okx': 'OKX',
        'kucoin': 'KuCoin',
        'bitfinex': 'Bitfinex',
        'huobi': 'Huobi',
        'gateio': 'Gate.io',
        'mexc': 'MEXC'
    }
    
    def __init__(self):
        self.connections: Dict[str, ExchangeConnection] = {}
    
    def get_supported_exchanges(self) -> List[Dict[str, str]]:
        """Lista exchanges suportadas"""
        return [
            {'id': id, 'name': name}
            for id, name in self.SUPPORTED_EXCHANGES.items()
        ]
    
    async def connect_exchange(
        self,
        user_id: str,
        exchange_name: str,
        api_key: str,
        api_secret: str,
        testnet: bool = False
    ) -> Dict:
        """Conecta usuário a uma exchange"""
        
        if exchange_name not in self.SUPPORTED_EXCHANGES:
            return {
                'success': False,
                'error': f'Exchange não suportada: {exchange_name}'
            }
        
        try:
            # Cria conexão
            connection = ExchangeConnection(
                user_id=user_id,
                exchange_name=exchange_name,
                api_key=api_key,
                api_secret=api_secret,
                testnet=testnet
            )
            
            # Testa conexão
            test_result = await connection.test_connection()
            
            if not test_result['success']:
                return test_result
            
            # Salva conexão
            connection_key = f"{user_id}:{exchange_name}"
            self.connections[connection_key] = connection
            
            return {
                'success': True,
                'message': f'Conectado à {self.SUPPORTED_EXCHANGES[exchange_name]} com sucesso',
                'exchange': exchange_name
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Erro ao conectar: {str(e)}'
            }
    
    def get_connection(self, user_id: str, exchange_name: str) -> Optional[ExchangeConnection]:
        """Retorna conexão do usuário com exchange"""
        connection_key = f"{user_id}:{exchange_name}"
        return self.connections.get(connection_key)
    
    def disconnect_exchange(self, user_id: str, exchange_name: str) -> Dict:
        """Desconecta usuário de uma exchange"""
        connection_key = f"{user_id}:{exchange_name}"
        
        if connection_key in self.connections:
            del self.connections[connection_key]
            return {
                'success': True,
                'message': 'Desconectado com sucesso'
            }
        
        return {
            'success': False,
            'error': 'Conexão não encontrada'
        }
    
    def get_user_exchanges(self, user_id: str) -> List[str]:
        """Lista exchanges conectadas do usuário"""
        return [
            key.split(':')[1]
            for key in self.connections.keys()
            if key.startswith(f"{user_id}:")
        ]


# Instância global
exchange_service = ExchangeService()
