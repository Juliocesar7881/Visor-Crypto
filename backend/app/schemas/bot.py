from typing import Literal
from pydantic import BaseModel


class BotStateChange(BaseModel):
    desired_state: Literal["start", "stop"]
