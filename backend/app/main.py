from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.core.config import get_settings
from app.routes import devices, signals, bot, news, market, account, orderbook

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
app.include_router(account.router)  # Account já tem prefix /api/account


@app.get("/")
async def root():
    return {
        "app": settings.app_name,
        "version": "1.0.0",
        "status": "running",
        "message": "TradeBot AI Backend is operational"
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
