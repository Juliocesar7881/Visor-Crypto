"""
CoinGecko API Service
Dados de mercado, preços, market cap, heatmaps e estatísticas
"""
from typing import List, Dict, Optional
import aiohttp
from datetime import datetime, timedelta

class CoinGeckoService:
    def __init__(self, api_key: str):
        self.base_url = "https://api.coingecko.com/api/v3"
        self.api_key = api_key
        
    async def _make_request(self, endpoint: str, params: Dict = None) -> Dict:
        """Fazer requisição à API do CoinGecko"""
        if params is None:
            params = {}
        
        params['x_cg_demo_api_key'] = self.api_key
        
        url = f"{self.base_url}{endpoint}"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        response_text = await response.text()
                        print(f"❌ CoinGecko Error {response.status}: {response_text}")
                        raise Exception(f"CoinGecko: Erro {response.status}")
        except aiohttp.ClientError as e:
            print(f"❌ CoinGecko Connection Error: {str(e)}")
            raise Exception(f"CoinGecko: Erro de conexão - {str(e)}")
    
    async def get_price(self, coin_ids: List[str], vs_currencies: str = "usd", include_24h_change: bool = True) -> Dict:
        """
        Buscar preços de múltiplas moedas
        
        Args:
            coin_ids: Lista de IDs (ex: ["bitcoin", "ethereum", "solana"])
            vs_currencies: Moeda de comparação (usd, eur, brl)
            include_24h_change: Incluir variação 24h
        """
        params = {
            'ids': ','.join(coin_ids),
            'vs_currencies': vs_currencies,
        }
        
        if include_24h_change:
            params['include_24hr_change'] = 'true'
            params['include_market_cap'] = 'true'
            params['include_24hr_vol'] = 'true'
        
        return await self._make_request('/simple/price', params)
    
    async def get_top_coins(self, limit: int = 100, vs_currency: str = "usd") -> List[Dict]:
        """
        Buscar top moedas por market cap
        
        Args:
            limit: Quantas moedas retornar (max 250)
            vs_currency: Moeda de comparação
        """
        params = {
            'vs_currency': vs_currency,
            'order': 'market_cap_desc',
            'per_page': limit,
            'page': 1,
            'sparkline': 'false',
            'price_change_percentage': '24h,7d',
        }
        
        return await self._make_request('/coins/markets', params)
    
    async def get_market_overview(self) -> Dict:
        """Visão geral do mercado cripto"""
        data = await self._make_request('/global', {})
        
        if 'data' not in data:
            return {}
        
        global_data = data['data']
        
        return {
            'total_market_cap_usd': global_data.get('total_market_cap', {}).get('usd', 0),
            'total_volume_24h_usd': global_data.get('total_volume', {}).get('usd', 0),
            'bitcoin_dominance': global_data.get('market_cap_percentage', {}).get('btc', 0),
            'ethereum_dominance': global_data.get('market_cap_percentage', {}).get('eth', 0),
            'active_cryptocurrencies': global_data.get('active_cryptocurrencies', 0),
            'markets': global_data.get('markets', 0),
            'market_cap_change_24h': global_data.get('market_cap_change_percentage_24h_usd', 0),
        }
    
    async def get_trending(self) -> List[Dict]:
        """Moedas em alta (trending)"""
        data = await self._make_request('/search/trending', {})
        
        if 'coins' not in data:
            return []
        
        trending_coins = []
        for item in data['coins'][:10]:
            coin = item.get('item', {})
            trending_coins.append({
                'id': coin.get('id'),
                'symbol': coin.get('symbol'),
                'name': coin.get('name'),
                'market_cap_rank': coin.get('market_cap_rank'),
                'price_btc': coin.get('price_btc'),
                'thumb': coin.get('thumb'),
                'score': coin.get('score', 0),
            })
        
        return trending_coins
    
    async def get_coin_details(self, coin_id: str) -> Dict:
        """Detalhes completos de uma moeda"""
        params = {
            'localization': 'false',
            'tickers': 'false',
            'community_data': 'true',
            'developer_data': 'true',
        }
        
        data = await self._make_request(f'/coins/{coin_id}', params)
        
        return {
            'id': data.get('id'),
            'symbol': data.get('symbol', '').upper(),
            'name': data.get('name'),
            'description': data.get('description', {}).get('en', '')[:200] + '...',
            'image': data.get('image', {}).get('large'),
            'market_cap_rank': data.get('market_cap_rank'),
            'current_price': data.get('market_data', {}).get('current_price', {}).get('usd'),
            'market_cap': data.get('market_data', {}).get('market_cap', {}).get('usd'),
            'total_volume': data.get('market_data', {}).get('total_volume', {}).get('usd'),
            'high_24h': data.get('market_data', {}).get('high_24h', {}).get('usd'),
            'low_24h': data.get('market_data', {}).get('low_24h', {}).get('usd'),
            'price_change_24h': data.get('market_data', {}).get('price_change_percentage_24h'),
            'price_change_7d': data.get('market_data', {}).get('price_change_percentage_7d'),
            'price_change_30d': data.get('market_data', {}).get('price_change_percentage_30d'),
            'ath': data.get('market_data', {}).get('ath', {}).get('usd'),
            'atl': data.get('market_data', {}).get('atl', {}).get('usd'),
        }
    
    async def get_heatmap_data(self, limit: int = 50) -> List[Dict]:
        """
        Dados para heatmap (top moedas com variação 24h)
        """
        coins = await self.get_top_coins(limit=limit)
        
        heatmap_data = []
        for coin in coins:
            heatmap_data.append({
                'id': coin.get('id'),
                'symbol': coin.get('symbol', '').upper(),
                'name': coin.get('name'),
                'price': coin.get('current_price'),
                'market_cap': coin.get('market_cap'),
                'change_24h': coin.get('price_change_percentage_24h', 0),
                'change_7d': coin.get('price_change_percentage_7d_in_currency', 0),
                'volume_24h': coin.get('total_volume'),
                'image': coin.get('image'),
            })
        
        return heatmap_data
    
    async def get_fear_and_greed_index(self) -> Dict:
        """
        Índice Fear & Greed (usa API alternative.me - não requer chave)
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get('https://api.alternative.me/fng/', timeout=aiohttp.ClientTimeout(total=10)) as response:
                    if response.status == 200:
                        data = await response.json()
                        fng_data = data['data'][0]
                        
                        value = int(fng_data['value'])
                        classification = fng_data['value_classification']
                        
                        return {
                            'value': value,
                            'classification': classification,
                            'sentiment': self._classify_fng(value),
                            'timestamp': fng_data['timestamp'],
                            'emoji': self._get_fng_emoji(value),
                        }
        except Exception as e:
            print(f"❌ Fear & Greed Error: {str(e)}")
            return {
                'value': 50,
                'classification': 'Neutral',
                'sentiment': 'neutral',
                'emoji': '😐',
            }
    
    def _classify_fng(self, value: int) -> str:
        """Classificar sentimento do Fear & Greed Index"""
        if value >= 75:
            return 'extreme_greed'
        elif value >= 55:
            return 'greed'
        elif value >= 45:
            return 'neutral'
        elif value >= 25:
            return 'fear'
        else:
            return 'extreme_fear'
    
    def _get_fng_emoji(self, value: int) -> str:
        """Emoji para Fear & Greed Index"""
        if value >= 75:
            return '🤑'
        elif value >= 55:
            return '😊'
        elif value >= 45:
            return '😐'
        elif value >= 25:
            return '😰'
        else:
            return '😱'
    
    async def get_market_report(self) -> Dict:
        """
        Relatório completo do mercado para aba de relatórios
        """
        # Buscar dados em paralelo
        overview = await self.get_market_overview()
        trending = await self.get_trending()
        fng = await self.get_fear_and_greed_index()
        top_gainers = await self.get_top_coins(limit=10)
        
        # Top gainers e losers
        sorted_by_change = sorted(top_gainers, key=lambda x: x.get('price_change_percentage_24h', 0), reverse=True)
        gainers = sorted_by_change[:5]
        losers = sorted_by_change[-5:]
        
        return {
            'overview': overview,
            'fear_and_greed': fng,
            'trending': trending[:5],
            'top_gainers': [
                {
                    'symbol': c.get('symbol', '').upper(),
                    'name': c.get('name'),
                    'price': c.get('current_price'),
                    'change_24h': c.get('price_change_percentage_24h'),
                }
                for c in gainers
            ],
            'top_losers': [
                {
                    'symbol': c.get('symbol', '').upper(),
                    'name': c.get('name'),
                    'price': c.get('current_price'),
                    'change_24h': c.get('price_change_percentage_24h'),
                }
                for c in losers
            ],
            'timestamp': datetime.now().isoformat(),
        }
