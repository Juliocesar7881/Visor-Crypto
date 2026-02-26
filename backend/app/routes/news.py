"""
News Routes V7.1 — AI-Filtered Institutional-Grade News Feed
=============================================================
Endpoints:
  GET /news/filtered          → Main feed (≥80 score by default)
  GET /news/essential         → Top 5 critical (regulacao, fluxo, risco)
  GET /news/impact             → Price-impact analysis for top articles
  GET /news/category/{cat}    → By category
  GET /news/all               → All classified (including noise)
  GET /news/daily-report      → Performance accountability report
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from app.services.news_intelligence import get_filtered_news, generate_daily_report, analyze_price_impact

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/filtered")
async def get_filtered(
    min_score: int = Query(80, ge=0, le=100, description="Minimum relevance score"),
    category: Optional[str] = Query(None, description="REGULACAO|FLUXO_CAPITAL|INSTITUCIONAL|RISCO_SISTEMICO|MACRO|RUIDO"),
    limit: int = Query(50, ge=1, le=200),
    refresh: bool = Query(False, description="Force refresh from sources"),
):
    """Main filtered news feed. Default: only articles with relevance ≥ 80."""
    return await get_filtered_news(min_score=min_score, category=category, limit=limit, force_refresh=refresh)


@router.get("/essential")
async def get_essential():
    """Top 5 essential: REGULACAO, FLUXO_CAPITAL, RISCO_SISTEMICO ≥ 80."""
    result = await get_filtered_news(min_score=80, limit=100)
    essential_cats = {'REGULACAO', 'FLUXO_CAPITAL', 'RISCO_SISTEMICO'}
    essential = [a for a in result['articles'] if a.get('category') in essential_cats][:5]
    return {'articles': essential, 'total': len(essential)}


@router.get("/category/{category}")
async def get_by_category(category: str, limit: int = Query(30, ge=1, le=100)):
    """News by category: REGULACAO, FLUXO_CAPITAL, INSTITUCIONAL, RISCO_SISTEMICO, MACRO, RUIDO"""
    valid = {'REGULACAO', 'FLUXO_CAPITAL', 'INSTITUCIONAL', 'RISCO_SISTEMICO', 'MACRO', 'RUIDO'}
    cat = category.upper()
    if cat not in valid:
        return {'error': f'Invalid. Valid: {", ".join(valid)}', 'articles': []}
    return await get_filtered_news(min_score=0, category=cat, limit=limit)


@router.get("/all")
async def get_all_classified(limit: int = Query(100, ge=1, le=500)):
    """All news classified (including noise), sorted by relevance."""
    return await get_filtered_news(min_score=0, limit=limit)


@router.get("/daily-report")
async def get_daily_report_endpoint():
    """Daily performance report — setups, wins, losses, protection events."""
    return await generate_daily_report()


@router.get("/impact")
async def get_impact_analysis(
    title: str = Query(..., description="News article title"),
    body: str = Query("", description="News article body/description"),
):
    """Analyze potential price impact of a news article using AI."""
    result = await analyze_price_impact(title, body)
    if not result:
        raise HTTPException(status_code=500, detail="Impact analysis unavailable")
    return result


# ─── Legacy backward-compatible endpoints ───

@router.get("/")
async def get_news(currencies: Optional[str] = None, filter: Optional[str] = None, kind: str = "all"):
    """Legacy — returns all classified news."""
    return await get_filtered_news(min_score=0, limit=100)


@router.get("/rising")
async def get_rising_news():
    """Legacy rising — returns filtered news ≥ 60."""
    return await get_filtered_news(min_score=60, limit=50)


@router.get("/hot")
async def get_hot_news():
    """Legacy hot — returns filtered news ≥ 70."""
    return await get_filtered_news(min_score=70, limit=30)


@router.get("/bullish")
async def get_bullish_news():
    """Legacy bullish — returns FLUXO_CAPITAL + INSTITUCIONAL."""
    return await get_filtered_news(min_score=50, category='FLUXO_CAPITAL', limit=30)


@router.get("/bearish")
async def get_bearish_news():
    """Legacy bearish — returns RISCO_SISTEMICO."""
    return await get_filtered_news(min_score=50, category='RISCO_SISTEMICO', limit=30)


@router.get("/important")
async def get_important_news():
    """Legacy important — returns REGULACAO + RISCO_SISTEMICO ≥ 75."""
    result = await get_filtered_news(min_score=75, limit=100)
    important = [a for a in result['articles'] if a.get('category') in {'REGULACAO', 'RISCO_SISTEMICO'}][:30]
    return {'articles': important, 'total': len(important)}
