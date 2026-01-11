from __future__ import annotations

import logging
from typing import Iterable

try:
    import firebase_admin
    from firebase_admin import credentials, messaging
except ModuleNotFoundError:  # pragma: no cover - optional dependency during local dev
    firebase_admin = None
    credentials = None
    messaging = None

from app.schemas.device import DeviceMetadata

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, credentials_path: str | None = None):
        self._app = None
        if firebase_admin and credentials_path:
            cred = credentials.Certificate(credentials_path)
            self._app = firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin initialized")
        elif not firebase_admin:
            logger.warning("firebase_admin not installed; push delivery disabled")
        else:
            logger.warning("FCM credentials path not provided; push delivery disabled")

    async def send_trade_alert(self, devices: Iterable[DeviceMetadata], payload: dict) -> None:
        if not firebase_admin or not self._app:
            logger.debug("Skipping push (service disabled)")
            return

        messages = [
            messaging.Message(
                token=device.token,
                data={"type": "TRADE_ALERT", **{k: str(v) for k, v in payload.items()}},
                notification=messaging.Notification(
                    title="Sinal TradeBot",
                    body=f"{payload.get('action')} {payload.get('symbol')}"
                ),
                android=messaging.AndroidConfig(priority="high"),
                apns=messaging.APNSConfig(headers={"apns-priority": "10"}),
            )
            for device in devices
        ]

        response = messaging.send_all(messages)
        logger.info("Push enviado", extra={"success": response.success_count, "failure": response.failure_count})
