from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import asyncio

from app.core.config import get_settings
from app.routes import devices, signals, bot, news, market, account, orderbook, technical_analysis, collective, analysis
from app.services.analysis_worker import start_worker
from app.services.ws_antispoof import start_ws_spoof_detector, stop_ws_spoof_detector
from app.services.auto_execution import restore_exchanges, start_reconciliation_loop, stop_reconciliation_loop

settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(devices.router, prefix=settings.api_prefix)
app.include_router(signals.router, prefix=settings.api_prefix)
app.include_router(bot.router, prefix=settings.api_prefix)
app.include_router(news.router, prefix=settings.api_prefix)
app.include_router(market.router, prefix=settings.api_prefix)
app.include_router(orderbook.router, prefix=settings.api_prefix)
app.include_router(technical_analysis.router, prefix=settings.api_prefix)
app.include_router(collective.router, prefix=settings.api_prefix)
app.include_router(analysis.router, prefix=settings.api_prefix)
app.include_router(account.router)  # Account já tem prefix /api/account


@app.on_event("startup")
async def startup_event():
    """Start all background services on application startup."""
    # Restore encrypted exchange connections from disk
    restore_exchanges()

    # Start background services
    asyncio.create_task(start_worker())
    asyncio.create_task(start_ws_spoof_detector())

    # Load dynamic threshold distributions
    try:
        from app.services.dynamic_thresholds import load_distributions
        load_distributions()
    except Exception:
        pass

    # Start reconciliation loop (orphan position safety net)
    asyncio.create_task(start_reconciliation_loop())


@app.on_event("shutdown")
async def shutdown_event():
    """Gracefully stop background services."""
    await stop_ws_spoof_detector()
    await stop_reconciliation_loop()


@app.get("/")
async def root():
    return {
        "app": settings.app_name,
        "version": "7.0.0",
        "status": "running",
        "features": [
            "OCO orders + order lifecycle",
            "AES-256-GCM encrypted API keys",
            "FCM push notifications (configurable threshold 70-100%)",
            "Dynamic percentile-based thresholds per asset",
            "Candle-close synchronized worker",
            "Macro regime detection (EXPANSION/CHOP/RISK_OFF)",
            "Systemic market risk correlation",
            "Centralized backtesting + setup history DB",
            "Logistic calibration layer",
            "Redundancy penalization (7 pairs)",
            "Entry/Continuation score split with dynamic R:R",
            "Macro Liquidity Index (MODULE 27)",
            "AI-powered news classification (Groq + Jaccard dedup)",
            "Global fingerprint DB with Bayesian beta updates",
            "Expectancy metric (WR × AvgWin - (1-WR) × AvgLoss)",
        ],
        "message": "Visor Crypto Backend V7.0 — Full System Active"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "backend": "operational"
    }

# Servir arquivos estáticos (dashboard)
try:
    dashboard_path = Path(__file__).parent.parent.parent
    if (dashboard_path / "dashboard.html").exists():
        app.mount("/static", StaticFiles(directory=str(dashboard_path)), name="static")
except Exception as e:
    print(f"Could not mount static files: {e}")
