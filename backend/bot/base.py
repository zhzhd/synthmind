"""Bot adapter base class."""

from __future__ import annotations

from typing import Any


class BotAdapter:
    """Base class for IM bot adapters."""

    async def start(self) -> None:
        raise NotImplementedError

    async def stop(self) -> None:
        pass

    async def handle_message(self, message: dict[str, Any]) -> str | None:
        raise NotImplementedError

    async def handle_approval(self, approval: dict[str, Any]) -> None:
        raise NotImplementedError
