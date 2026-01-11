from typing import Literal
from pydantic import BaseModel, Field


class DeviceRegistrationRequest(BaseModel):
    device_token: str = Field(..., min_length=10)
    platform: Literal["ios", "android"]
    language: str | None = Field(default=None, min_length=2, max_length=5)
    app_version: str | None = None


class DeviceRegistrationResponse(BaseModel):
    status: str = "registered"
    device_token: str


class DeviceMetadata(BaseModel):
    token: str
    platform: Literal["ios", "android"]
    language: str | None = None
    app_version: str | None = None
