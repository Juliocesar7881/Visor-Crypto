from fastapi import APIRouter, Depends, HTTPException

from app.schemas.device import DeviceRegistrationRequest, DeviceRegistrationResponse, DeviceMetadata
from app.services.device_store import device_store

router = APIRouter(prefix="/devices", tags=["Devices"])


@router.post("/register", response_model=DeviceRegistrationResponse)
async def register_device(body: DeviceRegistrationRequest):
    """
    Registra token FCM/Expo do dispositivo para receber notificações push.
    """
    metadata = DeviceMetadata(
        token=body.device_token,
        platform=body.platform,
        language=body.language,
        app_version=body.app_version,
    )
    device_store.register(metadata)
    return DeviceRegistrationResponse(device_token=body.device_token)


@router.delete("/unregister/{token}")
async def unregister_device(token: str):
    """Remove device token."""
    device_store.remove(token)
    return {"status": "unregistered"}
