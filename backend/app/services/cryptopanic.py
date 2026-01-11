"""
CryptoPanic API Service
Integração completa com notícias e sentimento de mercado
"""
from typing import List, Dict, Optional
import aiohttp
from datetime import datetime

class CryptoPanicService:
    def __init__(self, api_token: str):
        self.base_url = "https://cryptopanic.com/api/v1"  # API v1 é mais estável
        self.api_token = api_token
        
    async def _make_request(self, endpoint: str, params: Dict = None) -> Dict:
        """Fazer requisição à API do CryptoPanic"""
        if params is None:
            params = {}
        
        params['auth_token'] = self.api_token
        params['public'] = 'true'  # Modo público para uso geral
        
        url = f"{self.base_url}{endpoint}"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as response:
                    response_text = await response.text()
                    
                    if response.status == 200:
                        return await response.json()
                    elif response.status == 401:
                        raise Exception("CryptoPanic: Token inválido")
                    elif response.status == 403:
                        raise Exception("CryptoPanic: Limite de taxa excedido")
                    elif response.status == 429:
                        raise Exception("CryptoPanic: Muitas requisições")
                    else:
                        print(f"❌ CryptoPanic Error {response.status}: {response_text}")
                        raise Exception(f"CryptoPanic: Erro {response.status}")
        except aiohttp.ClientError as e:
            print(f"❌ CryptoPanic Connection Error: {str(e)}")
            raise Exception(f"CryptoPanic: Erro de conexão - {str(e)}")
    
    async def get_news(
        self,
        currencies: Optional[List[str]] = None,
        filter: Optional[str] = None,
        kind: str = "all",
        regions: str = "en"
    ) -> Dict:
        """
        Buscar notícias
        
        Args:
            currencies: Lista de códigos (ex: ["BTC", "ETH"])
            filter: rising, hot, bullish, bearish, important, saved, lol
            kind: news, media, all
            regions: en, es, pt, etc
        """
        params = {
            'kind': kind,
            'regions': regions
        }
        
        if currencies:
            params['currencies'] = ','.join(currencies)
        
        if filter:
            params['filter'] = filter
        
        return await self._make_request('/posts/', params)
    
    async def get_rising_news(self, currencies: Optional[List[str]] = None) -> List[Dict]:
        """Notícias em alta"""
        response = await self.get_news(currencies=currencies, filter='rising')
        return self._parse_news(response)
    
    async def get_hot_news(self, currencies: Optional[List[str]] = None) -> List[Dict]:
        """Notícias quentes (trending)"""
        response = await self.get_news(currencies=currencies, filter='hot')
        return self._parse_news(response)
    
    async def get_bullish_news(self, currencies: Optional[List[str]] = None) -> List[Dict]:
        """Notícias com sentimento positivo"""
        response = await self.get_news(currencies=currencies, filter='bullish')
        return self._parse_news(response)
    
    async def get_bearish_news(self, currencies: Optional[List[str]] = None) -> List[Dict]:
        """Notícias com sentimento negativo"""
        response = await self.get_news(currencies=currencies, filter='bearish')
        return self._parse_news(response)
    
    async def get_important_news(self, currencies: Optional[List[str]] = None) -> List[Dict]:
        """Notícias importantes (high impact)"""
        response = await self.get_news(currencies=currencies, filter='important')
        return self._parse_news(response)
    
    def _parse_news(self, response: Dict) -> List[Dict]:
        """Parsear resposta da API em formato limpo"""
        if not response or 'results' not in response:
            return []
        
        parsed_news = []
        for item in response['results']:
            news_item = {
                'id': item.get('id'),
                'title': item.get('title'),
                'description': item.get('description', ''),
                'url': item.get('url'),
                'original_url': item.get('original_url'),
                'published_at': item.get('published_at'),
                'source': {
                    'title': item.get('source', {}).get('title'),
                    'domain': item.get('source', {}).get('domain'),
                },
                'kind': item.get('kind'),
                'image': item.get('image'),
                'currencies': [
                    {
                        'code': curr.get('code'),
                        'title': curr.get('title'),
                        'price_usd': curr.get('price_in_usd')
                    }
                    for curr in item.get('currencies', [])
                ],
                'votes': {
                    'positive': item.get('votes', {}).get('positive', 0),
                    'negative': item.get('votes', {}).get('negative', 0),
                    'important': item.get('votes', {}).get('important', 0),
                    'liked': item.get('votes', {}).get('liked', 0),
                    'disliked': item.get('votes', {}).get('disliked', 0),
                    'comments': item.get('votes', {}).get('comments', 0),
                },
                # Determinar sentimento baseado nos votos
                'sentiment': self._calculate_sentiment(item.get('votes', {})),
                # Determinar impacto
                'impact': self._calculate_impact(item.get('votes', {})),
            }
            parsed_news.append(news_item)
        
        return parsed_news
    
    def _calculate_sentiment(self, votes: Dict) -> str:
        """Calcular sentimento: positive, negative, neutral"""
        positive = votes.get('positive', 0) + votes.get('liked', 0)
        negative = votes.get('negative', 0) + votes.get('disliked', 0)
        
        if positive > negative * 1.5:
            return 'positive'
        elif negative > positive * 1.5:
            return 'negative'
        else:
            return 'neutral'
    
    def _calculate_impact(self, votes: Dict) -> str:
        """Calcular impacto: high, medium, low"""
        important = votes.get('important', 0)
        total_engagement = (
            votes.get('positive', 0) +
            votes.get('negative', 0) +
            votes.get('liked', 0) +
            votes.get('disliked', 0) +
            votes.get('comments', 0)
        )
        
        if important > 50 or total_engagement > 100:
            return 'high'
        elif important > 20 or total_engagement > 50:
            return 'medium'
        else:
            return 'low'
    
    async def get_portfolio(self) -> Dict:
        """Buscar portfólio (apenas para planos Growth/Enterprise)"""
        try:
            return await self._make_request('/portfolio/')
        except Exception as e:
            # Developer plan não tem acesso
            return {'error': str(e), 'message': 'Portfolio endpoint requer plano Growth ou Enterprise'}
    
    def get_sentiment_emoji(self, sentiment: str) -> str:
        """Retornar emoji baseado no sentimento"""
        emojis = {
            'positive': '📈',
            'negative': '📉',
            'neutral': '➖'
        }
        return emojis.get(sentiment, '➖')
    
    def get_impact_emoji(self, impact: str) -> str:
        """Retornar emoji baseado no impacto"""
        emojis = {
            'high': '🔥',
            'medium': '⚡',
            'low': '📌'
        }
        return emojis.get(impact, '📌')
