"""
News Routes - CryptoPanic Integration
"""
from fastapi import APIRouter, HTTPException
from typing import Optional, List
from app.core.config import get_settings
from app.services.cryptopanic import CryptoPanicService

router = APIRouter(prefix="/news", tags=["news"])
settings = get_settings()

# Inicializar serviço (será None se API key não configurada)
cryptopanic_service = None
if hasattr(settings, 'cryptopanic_api_key') and settings.cryptopanic_api_key:
    cryptopanic_service = CryptoPanicService(settings.cryptopanic_api_key)


@router.get("/")
async def get_news(
    currencies: Optional[str] = None,
    filter: Optional[str] = None,
    kind: str = "all"
):
    """
    Buscar notícias gerais
    
    - currencies: Lista separada por vírgula (ex: BTC,ETH,SOL)
    - filter: rising, hot, bullish, bearish, important
    - kind: news, media, all
    """
    # Sempre usar dados mock por enquanto (API tem problemas)
    return {
        "results": _get_mock_news(),
        "next": None,
        "previous": None,
        "message": "Usando dados simulados (API CryptoPanic temporariamente offline)"
    }
    
    # Código original comentado para quando API funcionar
    # if not cryptopanic_service:
    #     return {
    #         "results": _get_mock_news(),
    #         "next": None,
    #         "previous": None,
    #         "message": "CryptoPanic API não configurada. Usando dados simulados."
    #     }
    # 
    # try:
    #     currency_list = currencies.split(',') if currencies else None
    #     response = await cryptopanic_service.get_news(
    #         currencies=currency_list,
    #         filter=filter,
    #         kind=kind
    #     )
    #     return response
    # except Exception as e:
    #     # Fallback para dados mock
    #     return {
    #         "results": _get_mock_news(),
    #         "next": None,
    #         "previous": None,
    #         "message": f"Usando dados simulados (erro na API: {str(e)})"
    #     }


@router.get("/rising")
async def get_rising_news(currencies: Optional[str] = None):
    """Notícias em alta (trending agora)"""
    return {"results": _get_mock_news(), "message": "Usando dados simulados"}


@router.get("/hot")
async def get_hot_news(currencies: Optional[str] = None):
    """Notícias quentes (mais engajamento)"""
    return {"results": _get_mock_news(), "message": "Usando dados simulados"}


@router.get("/bullish")
async def get_bullish_news(currencies: Optional[str] = None):
    """Notícias com sentimento POSITIVO (alta expectativa)"""
    return {"results": _get_mock_news(sentiment='positive'), "message": "Usando dados simulados"}


@router.get("/bearish")
async def get_bearish_news(currencies: Optional[str] = None):
    """Notícias com sentimento NEGATIVO (baixa expectativa)"""
    return {"results": _get_mock_news(sentiment='negative'), "message": "Usando dados simulados"}


@router.get("/important")
async def get_important_news(currencies: Optional[str] = None):
    """Notícias IMPORTANTES (alto impacto no mercado)"""
    return {"results": _get_mock_news(impact='high'), "message": "Usando dados simulados"}


@router.get("/portfolio")
async def get_portfolio():
    """Buscar portfólio (requer plano Growth ou Enterprise)"""
    if not cryptopanic_service:
        raise HTTPException(status_code=503, detail="CryptoPanic API não configurada")
    
    try:
        portfolio = await cryptopanic_service.get_portfolio()
        return portfolio
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _get_mock_news(sentiment: str = 'neutral', impact: str = 'medium'):
    """Dados simulados para quando API não está configurada - até 200 notícias"""
    from datetime import datetime, timedelta
    import random
    
    news_templates = [
        {
            'title': 'Bitcoin ultrapassa $45.000 após decisão do Fed',
            'description': 'O Federal Reserve manteve as taxas de juros, impulsionando o mercado cripto.',
            'source': {'title': 'CoinDesk', 'domain': 'coindesk.com'},
            'currencies': [{'code': 'BTC', 'title': 'Bitcoin', 'price_usd': 45250.50}],
        },
        {
            'title': 'Ethereum 2.0 completa 90% das validações',
            'description': 'A rede Ethereum está cada vez mais próxima da transição completa para PoS.',
            'source': {'title': 'CryptoNews', 'domain': 'cryptonews.com'},
            'currencies': [{'code': 'ETH', 'title': 'Ethereum', 'price_usd': 3200.25}],
        },
        {
            'title': 'SEC anuncia novas regulações para exchanges',
            'description': 'Reguladores americanos estabelecem diretrizes mais rígidas.',
            'source': {'title': 'Bloomberg', 'domain': 'bloomberg.com'},
            'currencies': [{'code': 'BTC', 'title': 'Bitcoin'}, {'code': 'ETH', 'title': 'Ethereum'}],
        },
        {
            'title': 'Solana anuncia parceria com Visa',
            'description': 'Visa e Solana trabalharão juntas para pagamentos instantâneos.',
            'source': {'title': 'The Block', 'domain': 'theblock.co'},
            'currencies': [{'code': 'SOL', 'title': 'Solana', 'price_usd': 125.80}],
        },
        {
            'title': 'Volume de trading aumenta 120% em 24h',
            'description': 'Mercado cripto vê aumento significativo de volume.',
            'source': {'title': 'CoinTelegraph', 'domain': 'cointelegraph.com'},
            'currencies': [],
        },
        {
            'title': 'BlackRock aumenta participação em ETF de Bitcoin',
            'description': 'O maior gestor de ativos do mundo continua apostando em cripto.',
            'source': {'title': 'Reuters', 'domain': 'reuters.com'},
            'currencies': [{'code': 'BTC', 'title': 'Bitcoin'}],
        },
        {
            'title': 'Cardano lança atualização importante',
            'description': 'A nova atualização traz melhorias significativas de escalabilidade.',
            'source': {'title': 'CoinDesk', 'domain': 'coindesk.com'},
            'currencies': [{'code': 'ADA', 'title': 'Cardano'}],
        },
        {
            'title': 'Banco Central do Brasil discute CBDC',
            'description': 'Real Digital pode ser lançado ainda este ano.',
            'source': {'title': 'Valor Econômico', 'domain': 'valor.com.br'},
            'currencies': [],
        },
        {
            'title': 'Ripple vence batalha judicial contra SEC',
            'description': 'XRP não é considerado um valor mobiliário segundo decisão judicial.',
            'source': {'title': 'CoinDesk', 'domain': 'coindesk.com'},
            'currencies': [{'code': 'XRP', 'title': 'Ripple'}],
        },
        {
            'title': 'Binance expande operações na América Latina',
            'description': 'Exchange planeja novos produtos para o mercado brasileiro.',
            'source': {'title': 'InfoMoney', 'domain': 'infomoney.com.br'},
            'currencies': [{'code': 'BNB', 'title': 'Binance Coin'}],
        },
        {
            'title': 'Polygon atinge novo recorde de transações',
            'description': 'Rede Layer 2 processa mais de 2 milhões de transações por dia.',
            'source': {'title': 'The Block', 'domain': 'theblock.co'},
            'currencies': [{'code': 'MATIC', 'title': 'Polygon'}],
        },
        {
            'title': 'MicroStrategy compra mais 500 BTC',
            'description': 'Empresa continua acumulando Bitcoin em sua reserva corporativa.',
            'source': {'title': 'Bloomberg', 'domain': 'bloomberg.com'},
            'currencies': [{'code': 'BTC', 'title': 'Bitcoin'}],
        },
        {
            'title': 'Avalanche fecha parceria com Amazon Web Services',
            'description': 'AWS oferecerá suporte para validadores Avalanche.',
            'source': {'title': 'CoinTelegraph', 'domain': 'cointelegraph.com'},
            'currencies': [{'code': 'AVAX', 'title': 'Avalanche'}],
        },
        {
            'title': 'Dogecoin sobe 15% após post de Elon Musk',
            'description': 'Tweet do bilionário impulsiona preço da memecoin.',
            'source': {'title': 'CryptoNews', 'domain': 'cryptonews.com'},
            'currencies': [{'code': 'DOGE', 'title': 'Dogecoin'}],
        },
        {
            'title': 'Chainlink integra com mais 50 protocolos DeFi',
            'description': 'Oracle descentralizado expande sua rede de parcerias.',
            'source': {'title': 'DeFi Pulse', 'domain': 'defipulse.com'},
            'currencies': [{'code': 'LINK', 'title': 'Chainlink'}],
        },
        {
            'title': 'Uniswap V4 é anunciado com novas funcionalidades',
            'description': 'DEX líder prepara grande atualização para 2024.',
            'source': {'title': 'The Block', 'domain': 'theblock.co'},
            'currencies': [{'code': 'UNI', 'title': 'Uniswap'}],
        },
        {
            'title': 'El Salvador reporta lucro com reservas de Bitcoin',
            'description': 'País pioneiro em adoção de BTC vê retorno positivo.',
            'source': {'title': 'Reuters', 'domain': 'reuters.com'},
            'currencies': [{'code': 'BTC', 'title': 'Bitcoin'}],
        },
        {
            'title': 'Stablecoin USDC atinge market cap de $30 bilhões',
            'description': 'Circle expande presença no mercado de stablecoins.',
            'source': {'title': 'CoinDesk', 'domain': 'coindesk.com'},
            'currencies': [{'code': 'USDC', 'title': 'USD Coin'}],
        },
        {
            'title': 'Litecoin completa halving com sucesso',
            'description': 'Recompensa por bloco reduzida pela metade.',
            'source': {'title': 'CryptoNews', 'domain': 'cryptonews.com'},
            'currencies': [{'code': 'LTC', 'title': 'Litecoin'}],
        },
        {
            'title': 'NFTs de arte digital batem recorde em leilão',
            'description': 'Obra digital vendida por $5 milhões na Christies.',
            'source': {'title': 'Art News', 'domain': 'artnews.com'},
            'currencies': [{'code': 'ETH', 'title': 'Ethereum'}],
        },
    ]
    
    # Lista de sources para variar
    sources = [
        {'title': 'CoinDesk', 'domain': 'coindesk.com'},
        {'title': 'CryptoNews', 'domain': 'cryptonews.com'},
        {'title': 'The Block', 'domain': 'theblock.co'},
        {'title': 'CoinTelegraph', 'domain': 'cointelegraph.com'},
        {'title': 'Bloomberg', 'domain': 'bloomberg.com'},
        {'title': 'Reuters', 'domain': 'reuters.com'},
        {'title': 'InfoMoney', 'domain': 'infomoney.com.br'},
        {'title': 'Decrypt', 'domain': 'decrypt.co'},
    ]
    
    sentiments = ['positive', 'negative', 'neutral']
    impacts = ['high', 'medium', 'low']
    
    mock_news = []
    # Gerar 200 notícias cobrindo 15 dias
    for i in range(200):
        # Pegar um template e variar
        template = news_templates[i % len(news_templates)]
        # Calcular horas atrás (até 15 dias = 360 horas)
        hours_ago = int((i / 200) * 360)
        
        # Variar o sentimento e impacto se não foi especificado
        item_sentiment = sentiment if sentiment != 'neutral' else random.choice(sentiments)
        item_impact = impact if impact != 'medium' else random.choice(impacts)
        
        news_item = {
            'id': 1000 + i,
            'title': f"{template['title']} #{i+1}" if i >= len(news_templates) else template['title'],
            'description': template['description'],
            'url': f'https://cryptopanic.com/news/{1000+i}',
            'original_url': f'https://{template["source"]["domain"]}/article-{i}',
            'published_at': (datetime.now() - timedelta(hours=hours_ago)).isoformat(),
            'source': template['source'] if i < len(news_templates) else random.choice(sources),
            'kind': 'news',
            'image': None,
            'currencies': template['currencies'],
            'votes': {
                'positive': random.randint(10, 100) if item_sentiment == 'positive' else random.randint(5, 30),
                'negative': random.randint(10, 100) if item_sentiment == 'negative' else random.randint(5, 20),
                'important': random.randint(30, 100) if item_impact == 'high' else random.randint(10, 40),
                'liked': random.randint(10, 50),
                'disliked': random.randint(2, 15),
                'comments': random.randint(5, 30),
            },
            'sentiment': item_sentiment,
            'impact': item_impact,
        }
        mock_news.append(news_item)
    
    return mock_news
