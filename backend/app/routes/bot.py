from fastapi import APIRouter, BackgroundTasks
import logging

from app.schemas.bot import BotStateChange
from app.services.price_stream import MultiSymbolPriceStream
from app.services.strategies import StrategyEngine
from app.services.notifications import NotificationService
from app.services.device_store import device_store
from app.core.config import get_settings

router = APIRouter(prefix="/bot", tags=["Bot Control"])
settings = get_settings()
logger = logging.getLogger(__name__)

# Instâncias globais
price_stream = MultiSymbolPriceStream()
strategy_engine = StrategyEngine()
notification_service = NotificationService(settings.fcm_credentials_path)


async def on_price_update(symbol: str, price: float):
    """Callback chamado quando recebe novo preço via WebSocket."""
    # Processar preço na estratégia de cruzamento de médias
    signal = strategy_engine.process_price(symbol, price)
    
    if signal:
        # Se detectou cruzamento, enviar notificação
        devices = list(device_store.all())
        if devices:
            await notification_service.send_trade_alert(
                devices,
                {
                    "symbol": signal.symbol,
                    "action": signal.action,
                    "confidence": signal.confidence,
                    "strategy": signal.strategy,
                },
            )
            logger.info(f"📨 Notificação enviada: {signal.action} {signal.symbol}")


# Registrar callback
price_stream.add_callback(on_price_update)


@router.post("/state")
async def change_state(body: BotStateChange):
    """
    Inicia ou para o monitoramento de preços via WebSocket.
    Quando ativo, analisa cruzamento de médias EMA 9/21 em tempo real.
    """
    if body.desired_state == "start":
        price_stream.start()
        return {
            "status": "started",
            "symbols": price_stream.symbols,
            "strategy": "EMA Crossover (9/21)"
        }
    elif body.desired_state == "stop":
        await price_stream.stop()
        return {"status": "stopped"}


@router.get("/status")
async def get_status():
    """Retorna status atual do bot."""
    is_running = price_stream._task is not None and not price_stream._stop.is_set()
    return {
        "running": is_running,
        "symbols": price_stream.symbols,
        "strategy": "EMA Crossover (9/21)",
        "detectors_active": len(strategy_engine.detectors)
    }


@router.get("/symbols")
async def list_symbols():
    """Lista todas as criptomoedas disponíveis para trading."""
    return {
        "available": MultiSymbolPriceStream.AVAILABLE_SYMBOLS,
        "currently_monitoring": price_stream.symbols
    }


@router.get("/positions")
async def get_positions():
    """Retorna posições abertas no paper trading."""
    from app.services.paper_trading import paper_trading
    
    positions = paper_trading.get_positions()
    return positions


@router.post("/symbols")
async def update_symbols(symbols: list[str]):
    """Atualiza lista de moedas monitoradas (requer restart do bot)."""
    # Validar símbolos
    invalid = [s for s in symbols if s not in MultiSymbolPriceStream.AVAILABLE_SYMBOLS]
    if invalid:
        return {"error": f"Símbolos inválidos: {invalid}"}
    
    # Atualizar símbolos (requer restart se bot estiver rodando)
    is_running = price_stream._task is not None
    if is_running:
        await price_stream.stop()
    
    price_stream.symbols = symbols
    streams = "/".join([f"{s.lower()}@trade" for s in symbols])
    price_stream.endpoint = f"wss://stream.binance.com:9443/stream?streams={streams}"
    
    if is_running:
        price_stream.start()
    
    return {
        "status": "updated",
        "symbols": price_stream.symbols,
        "bot_restarted": is_running
    }
