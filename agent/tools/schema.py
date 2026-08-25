from typing import Any

from pydantic import BaseModel, Field

from datetime import datetime, timezone

class Source(BaseModel):
    """
    Represents the source of information returned by a tool.
    """

    type: str
    name: str
    url: str | None = None



class ToolResult(BaseModel):
    success: bool
    data: dict[str, Any] = Field(default_factory=dict)
    sources: list[Source] = Field(default_factory=list)
    error: str | None = None

    retrieved_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )