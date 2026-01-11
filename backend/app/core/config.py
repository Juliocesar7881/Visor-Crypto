from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "TradeBot AI Backend"
    api_prefix: str = "/api"
    debug: bool = True
    database_url: str = "postgresql+asyncpg://tradebot:tradebot@localhost:5432/tradebot"
    redis_url: str = "redis://localhost:6379/0"
    fcm_credentials_path: str | None = None
    binance_ws_endpoint: str = "wss://stream.binance.com:9443/ws/btcusdt@trade"
    cryptopanic_api_key: str = "a9a68f7c2deb41fd426935995e3324df210bcba5"
    coingecko_api_key: str = "CG-iDkKAPFHhbA3v3nKW3ph87SL"
    allowed_origins: list[str] = [
        "*",  # Permitir todas as origens (desenvolvimento)
    ]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
