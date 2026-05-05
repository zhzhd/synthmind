"""Web search tool using Tavily (primary) with DuckDuckGo fallback."""

import os

from langchain_core.tools import tool


@tool
def web_search(query: str) -> str:
    """Search the web for information.

    Uses Tavily for high-quality search results.  Falls back to
    DuckDuckGo if Tavily is not configured.

    Args:
        query: The search query.

    Returns:
        Search result summaries.
    """
    tavily_key = os.getenv("TAVILY_API_KEY", "")
    if tavily_key:
        return _tavily_search(query, tavily_key)
    return _ddg_search(query)


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
        return "Tavily not installed. Run: pip install tavily"
    except Exception as e:
        return f"Tavily search error: {e}"


def _ddg_search(query: str) -> str:
    try:
        from langchain_community.tools import DuckDuckGoSearchResults
        return DuckDuckGoSearchResults(num_results=5).run(query)
    except ImportError:
        return "No search engine available. Install langchain-community or tavily."
    except Exception as e:
        return f"Search failed: {e}"
