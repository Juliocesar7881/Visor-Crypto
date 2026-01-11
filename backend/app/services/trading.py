from __future__ import annotations

import logging
from typing import Literal

try:  # pragma: no cover
    import ccxt.async_support as ccxt
except ModuleNotFoundError:  # pragma: no cover - optional in scaffolding
    ccxt = None

logger = logging.getLogger(__name__)


class TradingService:
    def __init__(self, exchange: str = "binance"):
        self.exchange_id = exchange
        self._client = None

    async def _ensure_client(self) -> None:
        if self._client or not ccxt:
            return
        exchange_class = getattr(ccxt, self.exchange_id)
        self._client = exchange_class({"enableRateLimit": True})

    async def place_order(
        self,
        symbol: str,
        side: Literal["BUY", "SELL"],
        amount: float,
        price: float | None = None,
    ) -> dict:
        await self._ensure_client()
        logger.info("Executando ordem", extra={"symbol": symbol, "side": side, "amount": amount})
        if not self._client:
            return {"status": "simulated", "symbol": symbol, "side": side}

        order = await self._client.create_order(
            symbol=symbol,
            type="market" if price is None else "limit",
            side=side.lower(),
            amount=amount,
            price=price,
        )
        return order

    async def close(self) -> None:
        if self._client:
            await self._client.close()
            self._client = None
