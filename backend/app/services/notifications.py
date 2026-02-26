"""
═══════════════════════════════════════════════════════════════
VISOR CRYPTO — FCM NOTIFICATION SERVICE V2
═══════════════════════════════════════════════════════════════

Server-side push notifications via Firebase Cloud Messaging.
Replaces local Capacitor notifications so alerts fire even
when the app is in background or killed by the OS.

Features:
  - Configurable confidence threshold per user (70–100%)
  - Probability-based triggers (only sends when calibrated score ≥ threshold)
  - Multiple notification types: SETUP_CONFIRMED, REGIME_CHANGE, SCORE_JUMP,
    KILL_SWITCH, SYSTEMIC_RISK, OCO_FILL
  - High-priority Android/APNS delivery
  - Token management (register, unregister, cleanup stale)
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Dict, Iterable, List, Optional

try:
    import firebase_admin
    from firebase_admin import credentials, messaging
except ModuleNotFoundError:
    firebase_admin = None
    credentials = None
    messaging = None

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════

MIN_CONFIDENCE_THRESHOLD = 70   # absolute minimum
MAX_CONFIDENCE_THRESHOLD = 100
DEFAULT_CONFIDENCE_THRESHOLD = 75
USER_PREFS_FILE = Path(__file__).parent / ".notification_prefs.json"

# ═══════════════════════════════════════════════════
# USER PREFERENCE STORAGE
# ═══════════════════════════════════════════════════

_user_prefs: Dict[str, dict] = {}
_registered_tokens: Dict[str, dict] = {}  # token → {user_id, device_name, registered_at}


def _load_prefs():
    global _user_prefs, _registered_tokens
    if USER_PREFS_FILE.exists():
        try:
            with open(USER_PREFS_FILE) as f:
                data = json.load(f)
            _user_prefs = data.get("prefs", {})
            _registered_tokens = data.get("tokens", {})
            logger.info(f"[Notif] Loaded prefs for {len(_user_prefs)} users, {len(_registered_tokens)} tokens")
        except Exception as e:
            logger.error(f"[Notif] Failed to load prefs: {e}")


def _save_prefs():
    try:
        with open(USER_PREFS_FILE, "w") as f:
            json.dump({"prefs": _user_prefs, "tokens": _registered_tokens}, f)
    except Exception as e:
        logger.error(f"[Notif] Failed to save prefs: {e}")


def set_user_notification_prefs(user_id: str, prefs: dict) -> dict:
    """
    Set notification preferences for a user.
    
    prefs = {
        "enabled": true,
        "confidenceThreshold": 75,   # 70–100
        "notifySetupConfirmed": true,
        "notifyRegimeChange": false,
        "notifyScoreJump": false,
        "notifyKillSwitch": true,
        "notifySystemicRisk": true,
        "notifyOcoFill": true,
        "symbols": ["BTCUSDT", "ETHUSDT"]  # empty = all
    }
    """
    threshold = prefs.get("confidenceThreshold", DEFAULT_CONFIDENCE_THRESHOLD)
    threshold = max(MIN_CONFIDENCE_THRESHOLD, min(MAX_CONFIDENCE_THRESHOLD, int(threshold)))
    prefs["confidenceThreshold"] = threshold
    prefs["updatedAt"] = int(time.time() * 1000)
    _user_prefs[user_id] = prefs
    _save_prefs()
    return {"success": True, "prefs": prefs, "message": f"Threshold set to {threshold}%"}


def get_user_notification_prefs(user_id: str) -> dict:
    return _user_prefs.get(user_id, {
        "enabled": False,
        "confidenceThreshold": DEFAULT_CONFIDENCE_THRESHOLD,
        "notifySetupConfirmed": True,
        "notifyRegimeChange": False,
        "notifyScoreJump": False,
        "notifyKillSwitch": True,
        "notifySystemicRisk": True,
        "notifyOcoFill": True,
        "symbols": [],
    })


def register_fcm_token(user_id: str, token: str, device_name: str = "unknown") -> dict:
    """Register a device FCM token for push delivery."""
    _registered_tokens[token] = {
        "user_id": user_id,
        "device_name": device_name,
        "registered_at": int(time.time() * 1000),
    }
    _save_prefs()
    return {"success": True, "message": "Token registered for push notifications"}


def unregister_fcm_token(token: str) -> dict:
    if token in _registered_tokens:
        del _registered_tokens[token]
        _save_prefs()
        return {"success": True, "message": "Token unregistered"}
    return {"success": False, "error": "Token not found"}


def get_tokens_for_user(user_id: str) -> List[str]:
    return [tok for tok, info in _registered_tokens.items() if info.get("user_id") == user_id]


# ═══════════════════════════════════════════════════
# NOTIFICATION SERVICE
# ═══════════════════════════════════════════════════

class NotificationService:
    def __init__(self, credentials_path: str | None = None):
        self._app = None
        _load_prefs()
        if firebase_admin and credentials_path:
            cred = credentials.Certificate(credentials_path)
            self._app = firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin initialized")
        elif not firebase_admin:
            logger.warning("firebase_admin not installed; push delivery disabled")
        else:
            logger.warning("FCM credentials path not provided; push delivery disabled")

    def _should_notify(self, user_id: str, symbol: str, notif_type: str, confidence: float = 0) -> bool:
        """Check if this notification should be sent based on user prefs."""
        prefs = get_user_notification_prefs(user_id)
        if not prefs.get("enabled"):
            return False
        # Symbol filter
        allowed_symbols = prefs.get("symbols", [])
        if allowed_symbols and symbol not in allowed_symbols:
            return False
        # Type filter
        type_map = {
            "SETUP_CONFIRMED": "notifySetupConfirmed",
            "REGIME_CHANGE": "notifyRegimeChange",
            "SCORE_JUMP": "notifyScoreJump",
            "KILL_SWITCH": "notifyKillSwitch",
            "SYSTEMIC_RISK": "notifySystemicRisk",
            "OCO_FILL": "notifyOcoFill",
        }
        pref_key = type_map.get(notif_type)
        if pref_key and not prefs.get(pref_key, True):
            return False
        # Confidence threshold (70–100)
        threshold = prefs.get("confidenceThreshold", DEFAULT_CONFIDENCE_THRESHOLD)
        if notif_type == "SETUP_CONFIRMED" and confidence < threshold:
            logger.debug(f"[Notif] Skipping {symbol} for {user_id}: confidence {confidence}% < threshold {threshold}%")
            return False
        return True

    async def send_trade_alert(self, devices: Iterable, payload: dict) -> None:
        """Legacy method — send to device list."""
        if not firebase_admin or not self._app:
            logger.debug("Skipping push (service disabled)")
            return
        messages = []
        for device in devices:
            token = device.token if hasattr(device, 'token') else device.get('token', '')
            if not token:
                continue
            messages.append(messaging.Message(
                token=token,
                data={"type": "TRADE_ALERT", **{k: str(v) for k, v in payload.items()}},
                notification=messaging.Notification(
                    title="Sinal TradeBot",
                    body=f"{payload.get('action')} {payload.get('symbol')}"
                ),
                android=messaging.AndroidConfig(priority="high"),
                apns=messaging.APNSConfig(headers={"apns-priority": "10"}),
            ))
        if messages:
            response = messaging.send_each(messages)
            logger.info("Push enviado", extra={"success": response.success_count, "failure": response.failure_count})

    async def send_signal_notification(self, symbol: str, analysis: dict) -> int:
        """
        Send push notification to ALL users whose confidence threshold is met.
        Called by analysis_worker when a CONFIRMED signal is detected.
        Returns count of notifications sent.
        """
        if not firebase_admin or not self._app:
            return 0

        signal = analysis.get("v4Signal", "")
        confidence = analysis.get("v4Confidence", 0)
        probability = analysis.get("v4Probability", 50)
        gate_score = analysis.get("v4GateScore", 0)
        gates_passed = analysis.get("v4GatesPassed", 0)
        gates_total = analysis.get("v4GatesTotal", 9)
        regime = analysis.get("v4RegimeKey", "UNKNOWN")

        notif_type = "SETUP_CONFIRMED" if "CONFIRMED" in signal else "SCORE_JUMP"
        sent = 0

        # Group tokens by user
        user_tokens: Dict[str, List[str]] = {}
        for token, info in _registered_tokens.items():
            uid = info.get("user_id", "anonymous")
            if uid not in user_tokens:
                user_tokens[uid] = []
            user_tokens[uid].append(token)

        messages = []
        for user_id, tokens in user_tokens.items():
            if not self._should_notify(user_id, symbol, notif_type, confidence):
                continue
            threshold = get_user_notification_prefs(user_id).get("confidenceThreshold", DEFAULT_CONFIDENCE_THRESHOLD)
            direction = "LONG" if "LONG" in signal else "SHORT" if "SHORT" in signal else ""
            title = f"🎯 {symbol} — {direction} CONFIRMADO ({confidence}%)"
            body = (
                f"Confiança: {confidence}% (seu mín: {threshold}%)\n"
                f"Gates: {gates_passed}/{gates_total} | Score: {gate_score:.0f}%\n"
                f"Regime: {regime} | Prob: {probability}%"
            )
            for token in tokens:
                messages.append(messaging.Message(
                    token=token,
                    data={
                        "type": notif_type, "symbol": symbol, "signal": signal,
                        "confidence": str(confidence), "probability": str(probability),
                        "gateScore": str(gate_score), "regime": regime,
                    },
                    notification=messaging.Notification(title=title, body=body),
                    android=messaging.AndroidConfig(priority="high"),
                    apns=messaging.APNSConfig(headers={"apns-priority": "10"}),
                ))
                sent += 1

        if messages:
            try:
                stale_tokens = []
                response = messaging.send_each(messages)
                # Cleanup stale tokens
                for i, send_response in enumerate(response.responses):
                    if send_response.exception and "NOT_FOUND" in str(send_response.exception):
                        stale_tokens.append(messages[i].token)
                for tok in stale_tokens:
                    if tok in _registered_tokens:
                        del _registered_tokens[tok]
                if stale_tokens:
                    _save_prefs()
                    logger.info(f"[Notif] Cleaned {len(stale_tokens)} stale tokens")
                logger.info(f"[Notif] Sent {response.success_count}/{len(messages)} notifications for {symbol}")
            except Exception as e:
                logger.error(f"[Notif] FCM send error: {e}")

        return sent

    async def send_oco_notification(self, user_id: str, symbol: str, event: str, details: dict) -> None:
        """Send OCO fill notification (SL/TP hit)."""
        if not firebase_admin or not self._app:
            return
        if not self._should_notify(user_id, symbol, "OCO_FILL"):
            return
        tokens = get_tokens_for_user(user_id)
        if not tokens:
            return
        emoji = "🟢" if event == "TP_HIT" else "🔴"
        title = f"{emoji} {symbol} — {event.replace('_', ' ')}"
        body = f"Preço: ${details.get('price', '?')} | P&L: {details.get('pnl', '?')}"
        messages = [
            messaging.Message(
                token=tok,
                data={"type": "OCO_FILL", "symbol": symbol, "event": event, **{k: str(v) for k, v in details.items()}},
                notification=messaging.Notification(title=title, body=body),
                android=messaging.AndroidConfig(priority="high"),
                apns=messaging.APNSConfig(headers={"apns-priority": "10"}),
            )
            for tok in tokens
        ]
        try:
            messaging.send_each(messages)
        except Exception as e:
            logger.error(f"[Notif] OCO notification error: {e}")

    async def send_systemic_risk_alert(self, risk_data: dict) -> int:
        """Send systemic risk alert to all users who enabled it."""
        if not firebase_admin or not self._app:
            return 0
        sent = 0
        user_tokens: Dict[str, List[str]] = {}
        for token, info in _registered_tokens.items():
            uid = info.get("user_id", "anonymous")
            if uid not in user_tokens:
                user_tokens[uid] = []
            user_tokens[uid].append(token)

        messages = []
        for user_id, tokens in user_tokens.items():
            if not self._should_notify(user_id, "", "SYSTEMIC_RISK"):
                continue
            level = risk_data.get("riskLevel", "UNKNOWN")
            title = f"🚨 Risco Sistêmico: {level}"
            body = f"Correlação: {risk_data.get('avgCorrelation', 0):.2f} | BTC: {risk_data.get('btcChange', 0):.1f}%"
            for tok in tokens:
                messages.append(messaging.Message(
                    token=tok,
                    data={"type": "SYSTEMIC_RISK", **{k: str(v) for k, v in risk_data.items()}},
                    notification=messaging.Notification(title=title, body=body),
                    android=messaging.AndroidConfig(priority="high"),
                    apns=messaging.APNSConfig(headers={"apns-priority": "10"}),
                ))
                sent += 1
        if messages:
            try:
                messaging.send_each(messages)
            except Exception as e:
                logger.error(f"[Notif] Systemic risk alert error: {e}")
        return sent
