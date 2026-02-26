"""
News Intelligence Service — V7.1
AI-powered news filtering, classification, deduplication, and relevance scoring.
Uses Groq (Llama) for institutional-grade news analysis.

Categories:
  🏛️ REGULACAO       - SEC, leis, bans, ETFs, bancos centrais
  🐋 FLUXO_CAPITAL   - Baleias, fundos, ETFs, movimentos on-chain
  🏦 INSTITUCIONAL    - Bancos integrando crypto, custódia, Layer 2
  ⚠️ RISCO_SISTEMICO  - Hacks, insolvência, stablecoin problems
  🌍 MACRO            - Juros, dólar, liquidez global, geopolítica real
  🗑️ RUIDO            - Opiniões, previsões de preço, clickbait

Score: 0-100 — only ≥80 shown as "relevant" in main feed (v7.1: elevated from 70)
"""
import asyncio
import hashlib
import json
import re
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

import httpx

from app.core.config import get_settings

settings = get_settings()

# ── In-memory caches ──
_news_cache: list[dict] = []
_news_cache_ts: float = 0
_NEWS_CACHE_TTL = 180  # 3 min
_classified_cache: dict[str, dict] = {}  # url_hash -> classification
_MAX_CLASSIFIED_CACHE = 2000
_impact_cache: dict[str, dict] = {}  # url_hash -> price impact analysis

# ── Dedup similarity threshold ──
_DEDUP_TITLE_SIMILARITY = 0.65  # Jaccard similarity threshold

# ── Source rate limiting (v7.1: quality control) ──
_SOURCE_HISTORY: dict[str, list[float]] = defaultdict(list)  # source -> [timestamps]
_MAX_PER_SOURCE_PER_DAY = 4
_MIN_SOURCE_INTERVAL = 1800  # 30 minutes between same source

# ── Groq rate limiter ──
_last_groq_call: float = 0
_GROQ_MIN_INTERVAL = 2.0  # seconds between calls (avoid rate limit)


# ═══════════════════════════════════════════════════════════════
# FAST KEYWORD FILTER (pre-AI, zero cost)
# ═══════════════════════════════════════════════════════════════

TRASH_PATTERNS = [
    # Price predictions / targets
    r'\bprice prediction\b', r'\bprice forecast\b', r'\bprice target\b',
    r'\bcould reach\b', r'\bwill reach\b', r'\bmay reach\b', r'\bmight reach\b',
    r'\bcould hit\b', r'\bwill hit\b', r'\bmay hit\b', r'\bmight hit\b',
    r'\bto \$\d', r'\btowards \$', r'\btarget \$', r'\beyes \$',
    r'\bbreakout to\b', r'\bsurge to\b', r'\brally to\b', r'\bpump to\b',
    r'\bprediction:', r'\bforecast:', r'\bprice analysis\b',
    r'\btechnical analysis\b', r'\bprice outlook\b',
    r'\bmoonshot\b', r'\bskyrocket\b',
    r'\bcan reach\b', r'\bset to reach\b', r'\bpoised to\b',
    r'\bIA prev[eê]\b', r'\banalista acredita\b', r'\banalista acha\b',
    r'\bpode romper resist[eê]ncia\b', r'\bsinaliza tend[eê]ncia\b',
    r'\bempresa v[eê] oportunidade\b', r'\btoken sobe \d+%\b',
    r'\b\d+% (up|down|gain|drop)\b', r'\bbreaks (above|below)\b',
    r'\bcrypto.*(rally|pump|surge|soar|plunge|crash)\b',
    r'\b(heads|heading) (for|towards?)\b', r'\bon track to\b',
    r'\b100x\b', r'\b1000x\b', r'\bto the moon\b', r'\bmoon\b(?!.*lunar)',
    r'\bwill (pump|dump|soar|plunge)\b', r'\babout to (explode|moon|pump)\b',
    # Clickbait / engagement bait
    r'\byou won\'t believe\b', r'\bshocking\b', r'\bsecret\b',
    r'\bmust.?see\b', r'\bhuge news\b', r'\bgame.?changer\b',
    r'\bthis is why\b', r'\bhere\'?s why\b', r'\bfind out\b',
    r'\binsider\b', r'\bexclusive\b', r'\burgent\b',
    r'\bbreaking:\b', r'\bjust in:\b', r'\balert:\b',
    r'\bmassive\b', r'\bhuge\b', r'\binsane\b', r'\bcrazy\b',
    r'\bunbelievable\b', r'\bincredible\b', r'\bhistoric\b',
    r'\buntil you see\b', r'\bwhat .* means for\b',
    r'\bbombshell\b', r'\binsane gains\b', r'\bmassive pump\b',
    r'\bdon\'t miss\b', r'\blast chance\b', r'\bhurry\b',
    r'\blife.?changing\b', r'\bfinancial freedom\b',
    # Filler / low-value content
    r'\bbest crypto to buy\b', r'\btop \d+ crypto', r'\btop \d+ altcoin',
    r'\bbest altcoin', r'\bnext 100x\b', r'\bnext big\b',
    r'\bbull run\b', r'\bbear market over\b',
    r'\bshould you buy\b', r'\bshould i buy\b', r'\bworth buying\b',
    r'\bhidden gem\b', r'\bundervalued\b', r'\bunderrated\b',
    r'\bmeme coin\b', r'\bmemecoin\b', r'\bshitcoin\b',
    r'\bairdrop\b', r'\bfree token\b', r'\bfree crypto\b',
    r'\bhow to (buy|stake|mine|earn)\b',
    r'\bpassive income\b', r'\bearn .* daily\b',
    r'\bpresale\b', r'\bico\b', r'\bieo\b', r'\bido\b',
    r'\bnft drop\b', r'\bnft mint\b', r'\bfree mint\b',
    r'\bgiveaway\b', r'\bwin \$', r'\bfree \$',
    r'\bbeginner\'?s? guide\b', r'\bexplained\b', r'\bwhat is\b',
    r'\bstep.by.step\b', r'\btutorial\b',
    r'\bbest.*(exchange|wallet|platform)\b',
    r'\bwhitelist\b', r'\bmint\b(?!.*central)',
    # Opinion filler
    r'\baccording to .* analyst\b', r'\bexpert says\b', r'\bexpert believes\b',
    r'\btrader says\b', r'\bwhale alert:\b', r'\bcommunity thinks\b',
    r'\bsentiment turns\b', r'\bbullish signal\b', r'\bbearish signal\b',
    r'\b(he|she|they) (think|believe|expect|predict)\b',
    r'\boptimistic about\b', r'\bpessimistic about\b',
    r'\bcrypto twitter\b', r'\bcrypto community\b',
    r'\bmarket sentiment\b', r'\bfear and greed\b',
    r'\b(buy|sell) signal\b', r'\b(long|short) signal\b',
    r'\banalyst believes\b', r'\baccording to source\b',
    # Sponsored / promo
    r'\bsponsored\b', r'\bpress release\b', r'\badvertorial\b', r'\bpaid content\b',
    r'\bpartner content\b', r'\bin partnership with\b',
    r'\bpromo code\b', r'\bdiscount\b', r'\bbonus\b', r'\breferral\b',
    # Low-cap / obscure tokens (unless major news)
    r'\b(shib|doge|pepe|floki|bonk|wif|mog|brett|wojak)\b(?!.*sec|.*etf|.*ban)',
    r'\bnew token\b', r'\bnew coin\b', r'\btoken launch\b',
    r'\blisted on\b(?!.*binance|.*coinbase)', r'\bdex listing\b',
    r'\brug pull\b',
]
_trash_regex = re.compile('|'.join(TRASH_PATTERNS), re.IGNORECASE)

HIGH_IMPACT_KEYWORDS = {
    'REGULACAO': [
        'sec ', 'securities and exchange', 'cftc', 'regulat', 'ban ', 'banned',
        'legal', 'lawsuit', 'court', 'judge', 'ruling', 'etf approv', 'etf reject',
        'central bank', 'cbdc', 'legislation', 'congress', 'senate', 'executive order',
        'enforcement', 'sanction', 'european union', 'mica ', 'fca ',
    ],
    'FLUXO_CAPITAL': [
        'whale', 'baleia', 'fund ', 'billion', 'million inflow', 'million outflow',
        'etf flow', 'etf inflow', 'etf outflow', 'grayscale', 'blackrock',
        'fidelity', 'on-chain', 'exchange outflow', 'exchange inflow',
        'treasury', 'microstrategy', 'saylor', 'accumul', 'dump',
    ],
    'INSTITUCIONAL': [
        'bank ', 'banking', 'custody', 'mastercard', 'visa', 'paypal',
        'stripe', 'swift', 'layer 2', 'layer-2', 'stablecoin',
        'jpmorgan', 'goldman', 'morgan stanley', 'citi', 'hsbc',
        'standard chartered', 'partnership', 'integration',
    ],
    'RISCO_SISTEMICO': [
        'hack', 'exploit', 'breach', 'insolvenc', 'bankrupt', 'collapse',
        'depeg', 'de-peg', 'rug pull', 'fraud', 'scam', 'ponzi',
        'ftx', 'terra luna', 'celsius', 'voyager', 'three arrows',
        'attack', 'vulnerability', 'emergency',
    ],
    'MACRO': [
        'fed ', 'federal reserve', 'interest rate', 'inflation', 'cpi',
        'gdp', 'employment', 'unemployment', 'treasury yield', 'bond',
        'dollar index', 'dxy', 'quantitative', 'tariff', 'trade war',
        'geopoliti', 'conflict', 'sanction', 'oil price', 'recession',
    ],
}


def _is_trash(title: str) -> bool:
    """Fast regex check for clickbait/noise."""
    return bool(_trash_regex.search(title))


def _keyword_classify(title: str, body: str = '') -> tuple[str, int]:
    """Fast keyword-based pre-classification. Returns (category, base_score)."""
    text = (title + ' ' + body).lower()
    scores = {}
    for cat, keywords in HIGH_IMPACT_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in text)
        if hits > 0:
            scores[cat] = hits
    if not scores:
        return 'RUIDO', 20
    best_cat = max(scores, key=scores.get)
    base_score = min(40 + scores[best_cat] * 15, 85)
    return best_cat, base_score


# ═══════════════════════════════════════════════════════════════
# DEDUPLICATION
# ═══════════════════════════════════════════════════════════════

def _normalize_title(title: str) -> set[str]:
    """Tokenize and normalize for Jaccard similarity."""
    words = re.sub(r'[^\w\s]', '', title.lower()).split()
    return set(w for w in words if len(w) > 2)


def _jaccard_similarity(a: set, b: set) -> float:
    if not a or not b:
        return 0
    return len(a & b) / len(a | b)


def _url_hash(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:12]


def deduplicate_news(news_list: list[dict]) -> list[dict]:
    """
    Remove duplicate/near-duplicate news.
    Keeps the OLDEST article (first posted) for each cluster.
    """
    if not news_list:
        return []

    # Sort by published date ascending (oldest first)
    sorted_news = sorted(news_list, key=lambda n: n.get('published_at', ''))

    unique = []
    seen_titles: list[tuple[set, dict]] = []

    for item in sorted_news:
        title_tokens = _normalize_title(item.get('title', ''))
        is_dup = False
        for existing_tokens, existing_item in seen_titles:
            sim = _jaccard_similarity(title_tokens, existing_tokens)
            if sim >= _DEDUP_TITLE_SIMILARITY:
                is_dup = True
                break
        if not is_dup:
            unique.append(item)
            seen_titles.append((title_tokens, item))

    return unique


# ═══════════════════════════════════════════════════════════════
# AI CLASSIFICATION (Groq / Llama)
# ═══════════════════════════════════════════════════════════════

CLASSIFICATION_PROMPT = """You are an institutional-grade crypto news filter for professional traders.
Score this article 0-100 based on whether a professional crypto trader would find it actionable.
Only regulatory news, institutional flows, macro events, systemic risks, and on-chain anomalies score above 80.
Price predictions, opinions, meme content, and clickbait score 0-20.

Classify into EXACTLY ONE category:
- REGULACAO: SEC decisions, laws, bans, ETF approvals, central bank actions
- FLUXO_CAPITAL: Whale movements, fund flows, ETF inflows/outflows, on-chain data
- INSTITUCIONAL: Banks integrating crypto, custody, stablecoins, Layer 2 adoption
- RISCO_SISTEMICO: Hacks, exploits, insolvency, stablecoin depeg, fraud
- MACRO: Interest rates, inflation, GDP, dollar, geopolitics affecting crypto
- RUIDO: Price predictions, analyst opinions, clickbait, "could/might/may" speculation

Scoring rules:
- 80-100: Actionable institutional-grade news (confirmed events, real data, official announcements)
- 60-79: Potentially important but unconfirmed or secondary source
- 30-59: General news, low actionability
- 0-29: Pure noise, predictions, opinions

Respond with ONLY this JSON (no markdown, no explanation):
{"category": "CATEGORY", "score": NUMBER, "summary_pt": "One-sentence Portuguese summary of market impact"}

Title: {title}
Body: {body}"""


async def _classify_with_ai(title: str, body: str = '') -> Optional[dict]:
    """Classify a single article using Groq AI."""
    global _last_groq_call

    if not settings.groq_api_key:
        return None

    # Rate limiting
    now = time.time()
    elapsed = now - _last_groq_call
    if elapsed < _GROQ_MIN_INTERVAL:
        await asyncio.sleep(_GROQ_MIN_INTERVAL - elapsed)

    _last_groq_call = time.time()

    prompt = CLASSIFICATION_PROMPT.replace('{title}', title).replace('{body}', (body or '')[:500])

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                'https://api.groq.com/openai/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {settings.groq_api_key}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': 'llama-3.3-70b-versatile',
                    'messages': [
                        {'role': 'system', 'content': 'You are a JSON-only crypto news classifier. Output valid JSON only.'},
                        {'role': 'user', 'content': prompt},
                    ],
                    'temperature': 0.1,
                    'max_tokens': 200,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                content = data['choices'][0]['message']['content'].strip()
                # Parse JSON from response
                # Handle potential markdown wrapping
                if content.startswith('```'):
                    content = content.split('\n', 1)[1].rsplit('```', 1)[0].strip()
                result = json.loads(content)
                return {
                    'category': result.get('category', 'RUIDO'),
                    'score': min(max(int(result.get('score', 20)), 0), 100),
                    'summary_pt': result.get('summary_pt', ''),
                    'ai_classified': True,
                }
            elif resp.status_code == 429:
                # Rate limited — wait and return None
                await asyncio.sleep(5)
                return None
    except (json.JSONDecodeError, KeyError, httpx.TimeoutException):
        pass
    return None


async def classify_news_batch(articles: list[dict], max_ai: int = 10) -> list[dict]:
    """
    Classify a batch of articles. Uses fast keyword filter first,
    then AI for ambiguous/high-potential articles (up to max_ai).
    """
    results = []
    ai_candidates = []

    for article in articles:
        title = article.get('title', '')
        body = article.get('body', article.get('description', ''))
        url = article.get('url', article.get('original_url', ''))
        uh = _url_hash(url)

        # Check classification cache
        if uh in _classified_cache:
            article.update(_classified_cache[uh])
            results.append(article)
            continue

        # Step 1: Trash filter
        if _is_trash(title):
            classification = {
                'category': 'RUIDO',
                'relevance_score': 10,
                'summary_pt': '',
                'ai_classified': False,
            }
            article.update(classification)
            _classified_cache[uh] = classification
            results.append(article)
            continue

        # Step 2: Keyword pre-classification
        cat, base_score = _keyword_classify(title, body or '')
        classification = {
            'category': cat,
            'relevance_score': base_score,
            'summary_pt': '',
            'ai_classified': False,
        }

        if cat != 'RUIDO' and base_score >= 40:
            # Potential high-impact — candidate for AI refinement
            ai_candidates.append((article, uh, classification))
        else:
            article.update(classification)
            _classified_cache[uh] = classification
            results.append(article)

    # Step 3: AI classification for top candidates (limited to save API calls)
    ai_batch = ai_candidates[:max_ai]
    for article, uh, fallback_class in ai_batch:
        ai_result = await _classify_with_ai(
            article.get('title', ''),
            article.get('body', article.get('description', ''))
        )
        if ai_result:
            classification = {
                'category': ai_result['category'],
                'relevance_score': ai_result['score'],
                'summary_pt': ai_result.get('summary_pt', ''),
                'ai_classified': True,
            }
        else:
            classification = fallback_class
        article.update(classification)
        _classified_cache[uh] = classification
        results.append(article)

    # Remaining non-AI candidates
    for article, uh, fallback_class in ai_candidates[max_ai:]:
        article.update(fallback_class)
        _classified_cache[uh] = fallback_class
        results.append(article)

    # Trim cache
    if len(_classified_cache) > _MAX_CLASSIFIED_CACHE:
        keys = list(_classified_cache.keys())
        for k in keys[:len(keys) // 2]:
            del _classified_cache[k]

    return results


# ═══════════════════════════════════════════════════════════════
# SOURCE RATE LIMITING (v7.1: feed quality)
# ═══════════════════════════════════════════════════════════════

def _check_source_limit(source: str) -> bool:
    """Returns True if source is within rate limits."""
    now = time.time()
    history = _SOURCE_HISTORY[source]
    # Clean entries older than 24h
    _SOURCE_HISTORY[source] = [ts for ts in history if now - ts < 86400]
    history = _SOURCE_HISTORY[source]

    # Max per day
    if len(history) >= _MAX_PER_SOURCE_PER_DAY:
        return False
    # Min interval
    if history and now - history[-1] < _MIN_SOURCE_INTERVAL:
        return False
    return True


def _record_source(source: str):
    _SOURCE_HISTORY[source].append(time.time())


def _apply_source_diversity(articles: list[dict]) -> list[dict]:
    """Ensure source diversity: limit per source + ensure variety in top results."""
    source_counts: dict[str, int] = defaultdict(int)
    result = []
    for article in articles:
        source = article.get('source', 'unknown')
        if source_counts[source] < _MAX_PER_SOURCE_PER_DAY:
            result.append(article)
            source_counts[source] += 1
    return result


# ═══════════════════════════════════════════════════════════════
# PRICE IMPACT ANALYSIS (v7.1: AI-powered for TA panel)
# ═══════════════════════════════════════════════════════════════

IMPACT_PROMPT = """Analyze this news article and determine:
1) Price impact direction (BULLISH/BEARISH/NEUTRAL) for crypto markets
2) Confidence 0-100%
3) Primary assets affected

Only mark BULLISH/BEARISH if confidence > 60%.

Response in JSON only:
{"direction": "BULLISH|BEARISH|NEUTRAL", "confidence": NUMBER, "assets": ["BTC", "ETH"], "reason_one_sentence": "Brief reason"}

Title: {title}
Body: {body}"""


async def analyze_price_impact(title: str, body: str = '') -> Optional[dict]:
    """Analyze price impact direction using Groq AI."""
    global _last_groq_call

    if not settings.groq_api_key:
        return None

    now = time.time()
    elapsed = now - _last_groq_call
    if elapsed < _GROQ_MIN_INTERVAL:
        await asyncio.sleep(_GROQ_MIN_INTERVAL - elapsed)

    _last_groq_call = time.time()

    prompt = IMPACT_PROMPT.replace('{title}', title).replace('{body}', (body or '')[:500])

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                'https://api.groq.com/openai/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {settings.groq_api_key}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': 'llama-3.3-70b-versatile',
                    'messages': [
                        {'role': 'system', 'content': 'You are a JSON-only crypto market analyst. Output valid JSON only.'},
                        {'role': 'user', 'content': prompt},
                    ],
                    'temperature': 0.1,
                    'max_tokens': 150,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                content = data['choices'][0]['message']['content'].strip()
                if content.startswith('```'):
                    content = content.split('\n', 1)[1].rsplit('```', 1)[0].strip()
                result = json.loads(content)
                return {
                    'direction': result.get('direction', 'NEUTRAL'),
                    'confidence': min(max(int(result.get('confidence', 50)), 0), 100),
                    'assets': result.get('assets', []),
                    'reason': result.get('reason_one_sentence', ''),
                }
    except Exception:
        pass
    return None


# ═══════════════════════════════════════════════════════════════
# COMPOSITE NEWS FETCHER (CryptoCompare + CryptoPanic + RSS)
# ═══════════════════════════════════════════════════════════════

async def fetch_all_news_sources() -> list[dict]:
    """Fetch from multiple sources and unify format."""
    all_news = []

    async with httpx.AsyncClient(timeout=15) as client:
        tasks = []

        # Source 1: CryptoCompare
        tasks.append(_fetch_cryptocompare(client))

        # Source 2: CryptoPanic (if API key available)
        if settings.cryptopanic_api_key:
            tasks.append(_fetch_cryptopanic(client))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, list):
                all_news.extend(result)

    return all_news


async def _fetch_cryptocompare(client: httpx.AsyncClient) -> list[dict]:
    """Fetch from CryptoCompare free API."""
    try:
        resp = await client.get('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest')
        if resp.status_code == 200:
            data = resp.json()
            articles = data.get('Data', [])[:80]
            return [{
                'title': a['title'],
                'body': (a.get('body') or '')[:500],
                'url': a['url'],
                'source': a.get('source_info', {}).get('name', a.get('source', 'CryptoCompare')),
                'published_at': datetime.fromtimestamp(a['published_on']).isoformat(),
                'image': a.get('imageurl'),
                'source_api': 'cryptocompare',
            } for a in articles]
    except Exception:
        pass
    return []


async def _fetch_cryptopanic(client: httpx.AsyncClient) -> list[dict]:
    """Fetch from CryptoPanic API."""
    try:
        resp = await client.get(
            f'https://cryptopanic.com/api/v1/posts/?auth_token={settings.cryptopanic_api_key}&kind=news&public=true'
        )
        if resp.status_code == 200:
            data = resp.json()
            articles = data.get('results', [])[:60]
            return [{
                'title': a['title'],
                'body': '',
                'url': a.get('url', ''),
                'source': a.get('source', {}).get('title', 'CryptoPanic'),
                'published_at': a.get('published_at', datetime.now().isoformat()),
                'image': None,
                'source_api': 'cryptopanic',
                'votes': a.get('votes', {}),
            } for a in articles]
    except Exception:
        pass
    return []


# ═══════════════════════════════════════════════════════════════
# MAIN PIPELINE: Fetch → Dedup → Classify → Sort → Return
# ═══════════════════════════════════════════════════════════════

async def get_filtered_news(
    min_score: int = 0,
    category: Optional[str] = None,
    limit: int = 50,
    force_refresh: bool = False,
) -> dict:
    """
    Main entry point. Returns filtered, classified, deduplicated news.
    """
    global _news_cache, _news_cache_ts

    now = time.time()
    if not force_refresh and _news_cache and (now - _news_cache_ts) < _NEWS_CACHE_TTL:
        filtered = _apply_filters(_news_cache, min_score, category, limit)
        return {
            'articles': filtered,
            'total_fetched': len(_news_cache),
            'total_filtered': len(filtered),
            'cached': True,
            'cache_age_seconds': int(now - _news_cache_ts),
        }

    # Fetch fresh news
    raw = await fetch_all_news_sources()

    # Deduplicate
    unique = deduplicate_news(raw)

    # Classify
    classified = await classify_news_batch(unique, max_ai=15)

    # Sort by relevance score desc, then by published_at desc
    classified.sort(key=lambda x: (
        -x.get('relevance_score', 0),
        x.get('published_at', '')
    ), reverse=False)
    classified.sort(key=lambda x: -x.get('relevance_score', 0))

    # v7.1: Apply source diversity limits
    classified = _apply_source_diversity(classified)

    # v7.1: Analyze price impact for top relevant articles
    relevant_articles = [a for a in classified if a.get('relevance_score', 0) >= 80]
    for article in relevant_articles[:5]:
        uh = _url_hash(article.get('url', ''))
        if uh not in _impact_cache:
            impact = await analyze_price_impact(
                article.get('title', ''),
                article.get('body', article.get('description', ''))
            )
            if impact:
                _impact_cache[uh] = impact
                article['price_impact'] = impact
        else:
            article['price_impact'] = _impact_cache[uh]

    # Update cache
    _news_cache = classified
    _news_cache_ts = now

    filtered = _apply_filters(classified, min_score, category, limit)
    return {
        'articles': filtered,
        'total_fetched': len(raw),
        'total_after_dedup': len(unique),
        'total_classified': len(classified),
        'total_filtered': len(filtered),
        'cached': False,
    }


def _apply_filters(articles: list[dict], min_score: int, category: Optional[str], limit: int) -> list[dict]:
    filtered = articles
    if min_score > 0:
        filtered = [a for a in filtered if a.get('relevance_score', 0) >= min_score]
    if category:
        filtered = [a for a in filtered if a.get('category') == category.upper()]
    return filtered[:limit]


# ═══════════════════════════════════════════════════════════════
# DAILY PERFORMANCE REPORT
# ═══════════════════════════════════════════════════════════════

async def generate_daily_report() -> dict:
    """
    Generates a performance accountability report.
    Called by scheduled job at 23:55 UTC.
    """
    try:
        # This would normally query the database for today's signals
        # For now, generate from in-memory data available via analysis worker
        report = {
            'date': datetime.utcnow().strftime('%Y-%m-%d'),
            'generated_at': datetime.utcnow().isoformat(),
            'summary': {
                'total_setups_detected': 0,
                'setups_filtered_out': 0,
                'trades_executed': 0,
                'wins': 0,
                'losses': 0,
                'win_rate': 0,
                'total_pnl_pct': 0,
            },
            'regime_summary': '',
            'protection_events': [],
            'narrative': '',
        }

        # TODO: When database is connected, populate from actual trade records
        # For now, return template structure
        report['narrative'] = (
            f"Relatório do dia {report['date']}. "
            f"O motor V7 monitorou o mercado continuamente. "
            f"Setups detectados: {report['summary']['total_setups_detected']}. "
            f"Filtrados por falta de estrutura ou risco: {report['summary']['setups_filtered_out']}. "
            f"O sistema protegeu seu capital ao rejeitar sinais de baixa qualidade."
        )

        return report
    except Exception as e:
        return {'error': str(e), 'date': datetime.utcnow().strftime('%Y-%m-%d')}
