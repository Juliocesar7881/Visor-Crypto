from typing import Literal
from pydantic import BaseModel, Field


class SignalPayload(BaseModel):
    source: Literal["tradingview", "n8n", "manual"] = "tradingview"
    symbol: str = Field(..., example="BTCUSDT")
    action: Literal["BUY", "SELL"]
    confidence: float = Field(default=0.5, ge=0, le=1)
    strategy: str = Field(default="ema-cross")
    mode: Literal["auto", "notification"] = "notification"


class SignalResponse(BaseModel):
    status: Literal["queued", "executed"]
    action: str
    symbol: str
    mode: str
