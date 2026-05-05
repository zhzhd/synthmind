"""Tool definitions for the SynthMind agent.

Each tool is a LangChain @tool-decorated function. Add your own
tools here and register them in core.py's TOOLS list.
"""

from __future__ import annotations

import datetime
import json
import math
from typing import Any

from langchain_core.tools import tool


# ── Built-in tools ─────────────────────────────────────────────────

@tool
def calculator(expression: str) -> str:
    """Evaluate a mathematical expression.

    Accepts Python math syntax. Supports: +, -, *, /, **, //, %,
    and functions from the math module (sin, cos, sqrt, log, etc.).

    Args:
        expression: A mathematical expression string, e.g. "2 ** 10" or "sqrt(144)".

    Returns:
        The computed result as a string.
    """
    allowed_names = {k: v for k, v in math.__dict__.items() if not k.startswith("_")}
    allowed_names["__builtins__"] = {}
    try:
        result = eval(expression, allowed_names, {})
        return str(result)
    except Exception as e:
        return f"Error evaluating expression: {e}"


@tool
def get_current_time(timezone: str = "UTC") -> str:
    """Get the current date and time.

    Args:
        timezone: Timezone name (e.g. "UTC", "Asia/Shanghai", "America/New_York").

    Returns:
        Current date and time string.
    """
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(timezone) if timezone != "UTC" else datetime.timezone.utc
        now = datetime.datetime.now(tz)
        return now.strftime("%Y-%m-%d %H:%M:%S %Z")
    except Exception as e:
        now = datetime.datetime.utcnow()
        return f"{now.isoformat()} UTC (timezone '{timezone}' not found, using UTC)"


@tool
def read_file(path: str) -> str:
    """Read the contents of a text file.

    Args:
        path: Absolute path to the file.

    Returns:
        File contents as a string.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {e}"


@tool
def web_search(query: str) -> str:
    """Search the web for information.

    Uses DuckDuckGo (no API key required). For production, swap
    with a paid search API like Tavily or SerpAPI.

    Args:
        query: The search query string.

    Returns:
        Search result summaries.
    """
    try:
        from langchain_community.tools import DuckDuckGoSearchResults
        search = DuckDuckGoSearchResults(num_results=5)
        return search.run(query)
    except ImportError:
        return (
            "DuckDuckGo search requires langchain-community.\n"
            "Install it with: pip install langchain-community"
        )
    except Exception as e:
        return f"Search failed: {e}"


# ── Tool registry ──────────────────────────────────────────────────

# All tools the agent can use are registered here.
# Add new tools to this list to make them available to the agent.
TOOLS: list = [
    calculator,
    get_current_time,
    read_file,
    web_search,
]


def get_tools() -> list:
    """Return the full list of tools (wrapped for LangGraph if needed)."""
    return TOOLS


# ── Sensitive tools (require human approval) ──────────────────────

# Tools listed here will pause agent execution and ask the user for
# approval before running.  The value is a dict of extra options
# (currently unused — reserved for future conditions).
SENSITIVE_TOOLS: dict[str, dict] = {
    "web_search": {},     # accessing the network
    "read_file": {},      # reading local files
}
# calculator and get_current_time are considered safe — no approval needed.
