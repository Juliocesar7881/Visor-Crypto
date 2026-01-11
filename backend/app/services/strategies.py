from __future__ import annotations

import logging
from collections import deque
from dataclasses import dataclass
from typing import Dict

from app.schemas.signal import SignalPayload

logger = logging.getLogger(__name__)


@dataclass
class StrategyResult:
    should_execute: bool
    reason: str
    amount: float = 0.0


class EMACalculator:
    """Calcula Exponential Moving Average (EMA)."""
    
    def __init__(self, period: int):
        self.period = period
        self.multiplier = 2 / (period + 1)
        self.ema = None
    
    def update(self, price: float) -> float:
        if self.ema is None:
            self.ema = price
        else:
            self.ema = (price - self.ema) * self.multiplier + self.ema
        return self.ema


class CrossoverDetector:
    """Detecta cruzamento de médias móveis (Golden Cross / Death Cross)."""
    
    def __init__(self, fast_period: int = 9, slow_period: int = 21):
        self.fast_ema = EMACalculator(fast_period)
        self.slow_ema = EMACalculator(slow_period)
        self.prev_fast = None
        self.prev_slow = None
        self.prices = deque(maxlen=100)
    
    def update(self, price: float) -> tuple[str | None, float]:
        """Retorna ('BUY'|'SELL'|None, confidence)."""
        self.prices.append(price)
        
        fast = self.fast_ema.update(price)
        slow = self.slow_ema.update(price)
        
        signal = None
        confidence = 0.0
        
        if self.prev_fast is not None and self.prev_slow is not None:
            # Golden Cross: EMA rápida cruza a lenta de baixo para cima
            if self.prev_fast <= self.prev_slow and fast > slow:
                signal = 'BUY'
                confidence = min(0.95, (fast - slow) / slow * 10)
            
            # Death Cross: EMA rápida cruza a lenta de cima para baixo
            elif self.prev_fast >= self.prev_slow and fast < slow:
                signal = 'SELL'
                confidence = min(0.95, (slow - fast) / fast * 10)
        
        self.prev_fast = fast
        self.prev_slow = slow
        
        return signal, confidence


class StrategyEngine:
    """Motor de estratégias com suporte a múltiplas moedas."""
    
    def __init__(self):
        self.detectors: Dict[str, CrossoverDetector] = {}
    
    def get_detector(self, symbol: str) -> CrossoverDetector:
        if symbol not in self.detectors:
            self.detectors[symbol] = CrossoverDetector()
        return self.detectors[symbol]
    
    def process_price(self, symbol: str, price: float) -> SignalPayload | None:
        """Processa novo preço e retorna sinal se houver cruzamento."""
        detector = self.get_detector(symbol)
        action, confidence = detector.update(price)
        
        if action:
            logger.info(f"🎯 Sinal detectado: {action} {symbol} (confiança: {confidence:.2%})")
            return SignalPayload(
                source="manual",
                symbol=symbol,
                action=action,
                confidence=confidence,
                strategy="ema_9_21",
                mode="notification"
            )
        return None
    
    def evaluate(self, signal: SignalPayload) -> StrategyResult:
        """Avalia se deve executar ordem baseado no sinal."""
        logger.debug("Avaliando sinal", extra=signal.model_dump())
        
        if signal.confidence >= 0.5:
            return StrategyResult(
                should_execute=True, 
                reason="ema_crossover_confirmed", 
                amount=0.001
            )
        return StrategyResult(should_execute=False, reason="low_confidence")
