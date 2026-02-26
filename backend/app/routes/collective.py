"""
Collective Intelligence Routes — Visor Crypto V4

Endpoints for the network-effect learning system:
- POST /collective/submit-trades → clients send anonymous trades
- POST /collective/update-outcomes → clients report trade outcomes
- GET  /collective/global-stats → aggregated statistics
- GET  /collective/model-weights → learned model weights
- GET  /collective/performance → public auditable performance
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid

from app.services.collective import collective_service

router = APIRouter(prefix="/collective", tags=["collective"])


# ── REQUEST/RESPONSE SCHEMAS ──

class TradeSubmission(BaseModel):
    ts: int = Field(description="Timestamp ms")
    sym: str = Field(description="Symbol e.g. BTCUSDT")
    sig: str = Field(description="Signal: LONG_CONFIRMED, SHORT_CONFIRMED, AGUARDAR_LONG, etc.")
    conf: int = Field(default=0, ge=0, le=100, description="Confidence 0-100")
    gs: float = Field(default=0, ge=0, le=150, description="Gate score 0-150 (session multiplied)")
    gates: int = Field(default=0, ge=0, le=9, description="Gates passed 0-9")
    v3sig: str = Field(default="NEUTRO", description="V3 signal")
    v3conf: int = Field(default=0, ge=0, le=100, description="V3 confidence")
    score: float = Field(default=0, description="Non-linear compressed score")
    regime: str = Field(default="UNKNOWN", description="Market regime")
    vol: str = Field(default="NORMAL", description="Volatility regime")
    session: str = Field(default="UNKNOWN", description="Trading session (KILL_ZONE, ASIAN, etc.)")
    entry: float = Field(default=0, description="Entry price")
    sl: float = Field(default=0, description="Stop loss price")
    tp1: float = Field(default=0, description="Take profit 1 price")
    outcome: Optional[str] = Field(default=None, description="Trade outcome after evaluation")
    # V4.1 Reputation fields
    dh: Optional[str] = Field(default=None, description="Device hash for reputation scoring")
    lwr: Optional[float] = Field(default=None, description="Local win rate of submitting device")
    ltc: Optional[int] = Field(default=None, description="Local trade count of submitting device")


class SubmitTradesRequest(BaseModel):
    trades: List[TradeSubmission] = Field(description="List of anonymous trades")
    sessionId: Optional[str] = Field(default=None, description="Anonymous session UUID")
    deviceHash: Optional[str] = Field(default=None, description="Anonymous persistent device hash for reputation")


class OutcomeUpdate(BaseModel):
    ts: int
    outcome: str
    exitPrice: float = 0
    pnlPercent: float = 0
    durationHours: float = 0


class UpdateOutcomesRequest(BaseModel):
    symbol: str
    outcomes: List[OutcomeUpdate]


# ── ENDPOINTS ──

@router.post("/submit-trades")
async def submit_trades(request: SubmitTradesRequest):
    """
    Submit anonymous trades to collective intelligence system.
    Privacy: No user IDs or IPs stored. Only signal metadata.
    """
    session_id = request.sessionId or str(uuid.uuid4())
    device_hash = request.deviceHash
    trades_data = [t.model_dump() for t in request.trades]

    result = collective_service.submit_trades(trades_data, session_id, device_hash)
    return {
        "status": "ok",
        "submitted": result['submitted'],
        "totalInDatabase": result['totalInDatabase'],
        "uniqueSessions": result['uniqueSessions'],
        "sessionId": session_id
    }


@router.post("/update-outcomes")
async def update_outcomes(request: UpdateOutcomesRequest):
    """
    Update trade outcomes after virtual trades are evaluated.
    Used to compute win rates and improve model weights.
    """
    outcomes_data = [o.model_dump() for o in request.outcomes]
    updated = collective_service.update_outcomes(request.symbol, outcomes_data)
    return {
        "status": "ok",
        "updated": updated
    }


@router.get("/global-stats")
async def get_global_stats(symbol: Optional[str] = None):
    """
    Get global statistics computed from all users' trades.
    Includes: win rate, consensus signal, best regime, score analysis.
    """
    stats = collective_service.get_global_stats(symbol)
    return stats


@router.get("/model-weights")
async def get_model_weights():
    """
    Get learned model weights from collective trade data.
    Used by V4 engine to adjust confidence and gate thresholds.
    """
    weights = collective_service.get_model_weights()
    return weights


@router.get("/performance")
async def get_public_performance():
    """
    Public, auditable performance data.
    "Score ≥ 10 has X% win rate over Y trades"
    Transparency builds trust and reference status.
    """
    return collective_service.get_public_performance()


@router.get("/health")
async def collective_health():
    """Health check for the collective intelligence system."""
    return {
        "status": "healthy",
        "totalTrades": sum(len(v) for v in collective_service.trades.values()),
        "uniqueSessions": len(collective_service.unique_sessions),
        "modelWeightsAvailable": bool(collective_service.model_weights)
    }
