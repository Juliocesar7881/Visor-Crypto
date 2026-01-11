from __future__ import annotations

import asyncio
import json
import logging
from typing import Callable, List

try:
    import websockets
except ImportError:
    websockets = None

logger = logging.getLogger(__name__)


class MultiSymbolPriceStream:
    """Stream de preços em tempo real para múltiplas criptomoedas via Binance WebSocket."""
    
    AVAILABLE_SYMBOLS = [
        "BTCUSDT",   # Bitcoin
        "ETHUSDT",   # Ethereum
        "BNBUSDT",   # Binance Coin
        "SOLUSDT",   # Solana
        "XRPUSDT",   # Ripple
        "ADAUSDT",   # Cardano
        "DOGEUSDT",  # Dogecoin
        "MATICUSDT", # Polygon
        "DOTUSDT",   # Polkadot
        "LTCUSDT",   # Litecoin
    ]
    
    def __init__(self, symbols: List[str] | None = None):
        self.symbols = symbols or self.AVAILABLE_SYMBOLS
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._callbacks: List[Callable] = []
        
        # Criar URL do WebSocket com múltiplos streams
        streams = "/".join([f"{s.lower()}@trade" for s in self.symbols])
        self.endpoint = f"wss://stream.binance.com:9443/stream?streams={streams}"
        
        logger.info(f"📡 Configurado para monitorar: {', '.join(self.symbols)}")
    
    def add_callback(self, callback: Callable) -> None:
        """Adiciona callback para receber atualizações de preço."""
        self._callbacks.append(callback)
    
    async def _consume(self) -> None:
        """Consome stream do WebSocket e notifica callbacks."""
        if not websockets:
            logger.error("websockets não instalado!")
            return
        
        while not self._stop.is_set():
            try:
                async with websockets.connect(self.endpoint) as ws:
                    logger.info("✅ Conectado ao Binance WebSocket")
                    
                    async for raw_message in ws:
                        if self._stop.is_set():
                            break
                        
                        try:
                            message = json.loads(raw_message)
                            
                            # Estrutura: {"stream": "btcusdt@trade", "data": {...}}
                            if "data" in message:
                                data = message["data"]
                                symbol = data.get("s")  # Ex: "BTCUSDT"
                                price = float(data.get("p"))  # Preço
                                
                                # Notificar todos os callbacks
                                for callback in self._callbacks:
                                    try:
                                        await callback(symbol, price)
                                    except Exception as e:
                                        logger.error(f"Erro no callback: {e}")
                        
                        except json.JSONDecodeError:
                            continue
                        
            except Exception as exc:
                if not self._stop.is_set():
                    logger.warning(f"⚠️ Stream caiu, reconectando em 5s: {exc}")
                    await asyncio.sleep(5)
    
    def start(self) -> None:
        """Inicia o monitoramento de preços."""
        if self._task:
            logger.warning("Stream já está rodando")
            return
        
        self._stop.clear()
        loop = asyncio.get_event_loop()
        self._task = loop.create_task(self._consume())
        logger.info("🚀 Stream de preços iniciado")
    
    async def stop(self) -> None:
        """Para o monitoramento."""
        logger.info("⏹️ Parando stream de preços...")
        self._stop.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("✅ Stream parado")


# Alias para compatibilidade
PriceStream = MultiSymbolPriceStream

# Instância global
price_stream_service = MultiSymbolPriceStream()
