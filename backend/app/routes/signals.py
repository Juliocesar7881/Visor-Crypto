from fastapi import APIRouter, BackgroundTasks
import logging

from app.schemas.signal import SignalPayload, SignalResponse
from app.services.device_store import device_store
from app.services.notifications import NotificationService
from app.services.strategies import StrategyEngine
from app.services.trading import TradingService
from app.core.config import get_settings

router = APIRouter(prefix="/signals", tags=["Signals"])
logger = logging.getLogger(__name__)

settings = get_settings()
notification_service = NotificationService(settings.fcm_credentials_path)
trading_service = TradingService()
strategy_engine = StrategyEngine()


async def _process_signal(signal: SignalPayload) -> None:
    result = strategy_engine.evaluate(signal)

    if not result.should_execute:
        logger.info("Sinal rejeitado", extra={"reason": result.reason})
        return

    if signal.mode == "auto":
        await trading_service.place_order(
            symbol=signal.symbol,
            side=signal.action,
            amount=result.amount,
        )
    else:  # notification
        devices = list(device_store.all())
        await notification_service.send_trade_alert(
            devices,
            {
                "symbol": signal.symbol,
                "action": signal.action,
                "confidence": signal.confidence,
                "strategy": signal.strategy,
            },
        )


@router.post("/webhook", response_model=SignalResponse)
async def receive_signal(signal: SignalPayload, background_tasks: BackgroundTasks):
    """
    Recebe sinal de TradingView/n8n e dispara push ou ordem.
    """
    background_tasks.add_task(_process_signal, signal)
    return SignalResponse(
        status="queued",
        action=signal.action,
        symbol=signal.symbol,
        mode=signal.mode,
    )
