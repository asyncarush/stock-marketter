from functools import lru_cache
import os

from tavily.tavily import TavilyClient
from langchain_core.tools import tool
from tenacity import retry, stop_after_attempt, wait_exponential

from .schema import Source, ToolResult


@lru_cache(maxsize=1)
def _client() -> TavilyClient:
    api_key = os.getenv("TAVILY_API_KEY")

    if not api_key:
        raise ValueError(
            "TAVILY_API_KEY is not configured."
        )

    return TavilyClient(api_key=api_key)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(min=1, max=8),
)
def _search(**kwargs):
    return _client().search(**kwargs)


@tool
def search_web(query: str) -> ToolResult:
    """
    Search the web for current and general information using advanced search.

    Use this tool for recent news, company developments,
    industry information, business events, regulatory changes,
    competitive information, and other information requiring
    external web sources.

    The search is optimized for business/financial topics and returns
    the most relevant and recent results available.

    if user want to get breif about any stock then this tools to
    gather current information about the stock.

    Do not use this tool for current stock prices or financial
    statements when a dedicated stock-data tool is available.
    """

    try:
        query = query.strip()

        if not query:
            return ToolResult(
                success=False,
                error="Search query cannot be empty.",
            )

        results = _search(
            query=query,
            include_answer="basic",
            search_depth="advanced",
            max_results=5,
            topic="business",
        )

        raw_results = results.get("results", [])

        if not raw_results:
            return ToolResult(
                success=False,
                error=f"No search results found for: {query}",
            )

        sources = []
        search_results = []

        for index, result in enumerate(raw_results, start=1):
            source_id = f"search_{index}"

            title = result.get("title", "Untitled")
            url = result.get("url")
            content = result.get("content", "")[:1000]

            sources.append(
                Source(
                    id=source_id,
                    type="web",
                    name=title,
                    url=url,
                    content=content,
                )
            )

            search_results.append(
                {
                    "source_id": source_id,
                    "title": title,
                    "url": url,
                    "content": content,
                }
            )

        return ToolResult(
            success=True,
            data={
                "query": query,
                "results": search_results,
            },
            sources=sources,
        )

    except Exception as e:
        return ToolResult(
            success=False,
            error=f"Web search failed: {type(e).__name__}: {e}",
        )