"""Web search tool using multiple backends.

1. Tavily (if TAVILY_API_KEY is set) — best quality
2. DuckDuckGo instant answer API (no API key required, built-in requests)
3. DuckDuckGo HTML scraping fallback
"""

from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from typing import Any

from langchain_core.tools import tool


@tool
def web_search(query: str) -> str:
    """Search the web for information.

    Uses Tavily for high-quality search results (requires TAVILY_API_KEY).
    Falls back to DuckDuckGo if Tavily is not configured.

    Args:
        query: The search query.

    Returns:
        Search result summaries.
    """
    tavily_key = os.getenv("TAVILY_API_KEY", "")
    if tavily_key:
        return _tavily_search(query, tavily_key)
    return _ddg_instant(query)


# ── Tavily ────────────────────────────────────────────────────────


def _tavily_search(query: str, api_key: str) -> str:
    try:
        from tavily import TavilyClient

        client = TavilyClient(api_key)
        response = client.search(query=query, search_depth="advanced")
        results = response.get("results", [])
        if not results:
            return "No results found."
        lines = [f"🔍 **{query}**\n"]
        for r in results[:6]:
            title = r.get("title", "")
            url = r.get("url", "")
            snippet = r.get("content", "")[:200]
            lines.append(f"  • **{title}**")
            if snippet:
                lines.append(f"    {snippet}")
            if url:
                lines.append(f"    _{url}_")
        return "\n".join(lines)
    except ImportError:
        return _ddg_instant(query)  # fallback if tavily package missing
    except Exception as e:
        return f"Tavily search error: {e}"


# ── DuckDuckGo instant answer API (no external deps) ──────────────


def _ddg_instant(query: str) -> str:
    """Query the DuckDuckGo Instant Answer API (free, no key)."""
    try:
        url = (
            "https://api.duckduckgo.com/"
            f"?q={urllib.parse.quote(query)}"
            "&format=json&no_html=1&skip_disambig=1"
        )
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "SynthMind/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data: dict[str, Any] = json.loads(resp.read().decode())

        lines = [f"🔍 **{query}**\n"]
        abstract = data.get("AbstractText", "")
        source = data.get("AbstractSource", "")
        if abstract:
            lines.append(f"  {abstract[:500]}")
            if source:
                lines.append(f"  _Source: {source}_")
            lines.append("")

        # Related topics
        topics = data.get("RelatedTopics", [])
        if topics:
            for t in topics[:5]:
                if "Text" in t:
                    text = t.get("Text", "")
                    url = t.get("FirstURL", "")
                    if text:
                        lines.append(f"  • **{text[:120]}**")
                        if url:
                            lines.append(f"    _{url}_")
                elif "Topics" in t:
                    for sub in t["Topics"][:3]:
                        text = sub.get("Text", "")
                        if text:
                            lines.append(f"  • {text[:120]}")

        # Results section
        results = data.get("Results", [])
        for r in results[:3]:
            text = r.get("Text", "")
            url = r.get("FirstURL", "")
            if text:
                lines.append(f"  • **{text[:200]}**")
                if url:
                    lines.append(f"    _{url}_")

        if len(lines) <= 1:
            return _ddg_html(query)  # fallback to HTML scrape

        return "\n".join(lines)

    except Exception as e:
        return _ddg_html(query, fallback_error=str(e))


# ── DuckDuckGo HTML scraping fallback ─────────────────────────────


def _ddg_html(query: str, fallback_error: str = "") -> str:
    """Scrape DuckDuckGo HTML results (no API key needed)."""
    try:
        url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode()

        lines = [f"🔍 **{query}**\n"]

        # Extract result snippets from DuckDuckGo HTML
        # Pattern: <a rel="nofollow" href="URL" class="result__a">TITLE</a>
        #          <a class="result__snippet">SNIPPET</a>
        titles = re.findall(
            r'<a[^>]+class="result__a"[^>]*>(.*?)</a>', html, re.DOTALL
        )
        snippets = re.findall(
            r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>', html, re.DOTALL
        )
        urls = re.findall(
            r'<a[^>]+class="result__url"[^>]*>(.*?)</a>', html, re.DOTALL
        )

        count = min(len(titles), 8)
        for i in range(count):
            title = re.sub(r"<[^>]+>", "", titles[i]).strip()
            snippet = (
                re.sub(r"<[^>]+>", "", snippets[i]).strip()
                if i < len(snippets)
                else ""
            )
            result_url = (
                re.sub(r"<[^>]+>", "", urls[i]).strip()
                if i < len(urls)
                else ""
            )
            lines.append(f"  • **{title[:150]}**")
            if snippet:
                lines.append(f"    {snippet[:200]}")
            if result_url:
                lines.append(f"    _{result_url}_")

        if len(lines) <= 1:
            msg = "No search results found."
            if fallback_error:
                msg += f" (API error: {fallback_error})"
            return msg

        return "\n".join(lines)

    except Exception as e:
        msg = "Web search is currently unavailable."
        if fallback_error:
            msg += f" Instant-answer API error: {fallback_error}."
        msg += f" HTML scrape error: {e}."
        msg += (
            "\n\nTo enable web search, set the TAVILY_API_KEY environment"
            " variable or install langchain-community (`pip install"
            " langchain-community duckduckgo-search`)."
        )
        return msg
