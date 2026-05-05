"""Current time tool."""

import datetime
from langchain_core.tools import tool


@tool
def get_current_time(timezone: str = "UTC") -> str:
    """Get the current date and time.

    Args:
        timezone: e.g. "UTC", "Asia/Shanghai", "America/New_York".

    Returns:
        Current date and time string.
    """
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(timezone) if timezone != "UTC" else datetime.timezone.utc
        return datetime.datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S %Z")
    except Exception:
        return f"{datetime.datetime.utcnow().isoformat()} UTC"
