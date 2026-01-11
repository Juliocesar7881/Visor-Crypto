from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable

from app.schemas.device import DeviceMetadata


@dataclass
class DeviceStore:
    """In-memory fallback store for device tokens (replace with DB/Redis in prod)."""

    _devices: Dict[str, DeviceMetadata] = field(default_factory=dict)

    def register(self, metadata: DeviceMetadata) -> None:
        self._devices[metadata.token] = metadata

    def remove(self, token: str) -> None:
        self._devices.pop(token, None)

    def all(self) -> Iterable[DeviceMetadata]:
        return self._devices.values()


device_store = DeviceStore()
