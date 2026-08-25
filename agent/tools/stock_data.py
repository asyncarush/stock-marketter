from functools import lru_cache
from typing import Any

import yfinance as yf
from curl_cffi import requests as curl_requests
from langchain_core.tools import tool
from tenacity import retry, stop_after_attempt, wait_exponential

from .schema import Source, ToolResult

# ============================================================
# HTTP SESSION
# ============================================================

_session = curl_requests.Session(
    impersonate="chrome"
)


# ============================================================
# YFINANCE HELPERS
# ============================================================

@lru_cache(maxsize=64)
def _ticker(symbol: str) -> yf.Ticker:
    """
    Return a cached yfinance ticker object.

    Caching avoids repeatedly creating ticker objects for
    the same symbol during a single agent execution.
    """

    return yf.Ticker(
        symbol,
        session=_session,
    )


@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(
        min=1,
        max=4,
    ),
)
def _info(symbol: str) -> dict:
    """
    Fetch company information from Yahoo Finance.

    Retries transient failures up to two times.
    """

    return _ticker(symbol).info


def _normalize_symbol(symbol: str) -> str:
    """
    Normalize a stock ticker symbol.

    Example:
        aapl -> AAPL
        aapl.ns -> AAPL.NS
        TATASTEEL.ns -> TATASTEEL.NS
    """

    return symbol.strip().upper()


def _is_indian_symbol(symbol: str) -> bool:
    """
    Check whether a symbol is an Indian exchange listing
    (NSE or BSE), which Yahoo Finance reports in raw INR
    and which we want to present in crore for readability
    and to avoid LLM mental-math errors.
    """

    return symbol.endswith(".NS") or symbol.endswith(".BO")


# ============================================================
# UNIT CONVERSION
# ============================================================

# 1 crore = 1,00,00,000 = 1e7
_CRORE = 1e7


def _to_crore(value: Any) -> Any:
    """
    Convert a raw currency amount into INR crore.

    Non-numeric values (NaN, strings, None) are passed
    through unchanged so this is safe to map across a
    mixed-type DataFrame.
    """

    if value is None:
        return None

    if isinstance(value, bool):
        # bool is a subclass of int in Python; explicitly
        # exclude it so we never "convert" True/False.
        return value

    if isinstance(value, (int, float)):
        try:
            if value != value:  # NaN check without importing math/numpy
                return value
        except Exception:
            pass
        return round(value / _CRORE, 2)

    return value


def _df_to_text(
    df: Any,
    *,
    in_crore: bool = False,
    max_rows: int | None = None,
) -> str:
    """
    Convert a pandas DataFrame into a compact text representation.

    Args:
        df: The DataFrame to render.
        in_crore: If True, rescale all numeric cells into INR
            crore before rendering. Only apply this to raw
            rupee-denominated financial statement data — never
            to per-share figures (EPS), ratios, or percentages.
        max_rows: If provided, limit the rendered output to the
            first N rows (useful for things like analyst
            recommendation history where only recent rows matter).
    """

    if df is None or df.empty:
        return "No data available."

    if in_crore:
        df = df.apply(lambda col: col.map(_to_crore))

    if max_rows is not None:
        df = df.head(max_rows)

    return df.to_string()


# ============================================================
# TOOL RESULT HELPERS
# ============================================================

def _success(
    data: dict[str, Any],
    *,
    source_name: str = "Yahoo Finance",
    source_type: str = "finance",
    source_url: str | None = None,
) -> ToolResult:
    """
    Create a successful ToolResult.
    """

    return ToolResult(
        success=True,
        data=data,
        sources=[
            Source(
                type=source_type,
                name=source_name,
                url=source_url,
            )
        ],
    )


def _failure(
    error: str,
) -> ToolResult:
    """
    Create a failed ToolResult.

    Failed tools should return a structured failure instead
    of returning an error string as if it were valid data.
    """

    return ToolResult(
        success=False,
        data={},
        sources=[],
        error=error,
    )


# ============================================================
# STOCK QUOTE
# ============================================================

@tool
def get_stock_quote(symbol: str) -> ToolResult:
    """
    Get the latest market data for a publicly traded stock.

    USE THIS TOOL when the user asks about:

    - current stock price
    - latest stock price
    - today's price
    - current market price
    - day high / day low
    - 52-week high / low
    - trading volume
    - market capitalization
    - current quote
    - current stock market data

    Examples:

    - "What is Apple's current stock price?"
    - "How much is TCS trading at?"
    - "What's the current price of Tata Steel?"
    - "What is Microsoft's market cap?"

    DO NOT use this tool for:

    - company business overview
    - company description
    - financial statements
    - P/E or other financial ratios
    - analyst recommendations
    - recent company news
    - general web research

    IMPORTANT:

    The symbol must be a Yahoo Finance ticker.

    Indian NSE stocks normally use the .NS suffix.

    Examples:

    - AAPL
    - MSFT
    - AMZN
    - TCS.NS
    - TATASTEEL.NS
    - RELIANCE.NS
    - INFY.NS

    The tool returns a failure result if current quote
    information cannot be reliably retrieved.
    """

    symbol = _normalize_symbol(symbol)
    is_indian = _is_indian_symbol(symbol)

    try:
        info = _ticker(symbol).fast_info

        market_cap_raw = info.get("market_cap")

        data = {
            "symbol": symbol,
            "last_price": info.get("last_price"),
            "day_low": info.get("day_low"),
            "day_high": info.get("day_high"),
            "year_low": info.get("year_low"),
            "year_high": info.get("year_high"),
            "volume": info.get("last_volume"),
            "market_cap": (
                _to_crore(market_cap_raw) if is_indian else market_cap_raw
            ),
            "market_cap_unit": "INR crore" if is_indian else info.get("currency"),
            "currency": info.get("currency"),
        }

        # A stock quote without a current price is not
        # considered a successful result.
        if data["last_price"] is None:
            return _failure(
                f"Unable to retrieve the current stock price for {symbol}."
            )

        return _success(
            data,
            source_name="Yahoo Finance",
            source_type="finance",
        )

    except Exception as e:
        return _failure(
            f"Unable to retrieve stock quote for {symbol}: {str(e)}"
        )


# ============================================================
# COMPANY OVERVIEW
# ============================================================

@tool
def get_company_overview(symbol: str) -> ToolResult:
    """
    Get fundamental information and business details about
    a publicly traded company.

    USE THIS TOOL when the user wants to understand:

    - what a company does
    - company business
    - company profile
    - sector
    - industry
    - number of employees
    - business description
    - company valuation overview
    - P/E
    - forward P/E
    - beta
    - dividend yield
    - market capitalization

    Examples:

    - "What does Tata Steel do?"
    - "Tell me about Apple as a company."
    - "What industry does Microsoft operate in?"
    - "Give me an overview of Reliance Industries."

    DO NOT use this tool for:

    - current stock price
    - historical stock prices
    - recent news
    - balance sheet
    - income statement
    - cash flow statement

    This tool provides company fundamentals and business
    information, not current market movements.
    """

    symbol = _normalize_symbol(symbol)
    is_indian = _is_indian_symbol(symbol)

    try:
        info = _info(symbol)

        market_cap_raw = info.get("marketCap")

        data = {
            "symbol": symbol,
            "company_name": info.get("longName"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "employees": info.get("fullTimeEmployees"),
            "trailing_pe": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "beta": info.get("beta"),
            "dividend_yield": info.get("dividendYield"),
            "market_cap": (
                _to_crore(market_cap_raw) if is_indian else market_cap_raw
            ),
            "market_cap_unit": "INR crore" if is_indian else info.get("currency"),
            "business_summary": info.get("longBusinessSummary"),
        }

        # Remove unavailable fields.
        data = {
            key: value
            for key, value in data.items()
            if value is not None
        }

        if not data:
            return _failure(
                f"No company overview data available for {symbol}."
            )

        return _success(
            data,
            source_name="Yahoo Finance",
            source_type="finance",
        )

    except Exception as e:
        return _failure(
            f"Unable to retrieve company overview for {symbol}: {str(e)}"
        )


# ============================================================
# BALANCE SHEET
# ============================================================

@tool
def get_balance_sheet(
    symbol: str,
    quarterly: bool = False,
) -> ToolResult:
    """
    Get the balance sheet of a publicly traded company.

    USE THIS TOOL when the user asks about:

    - assets
    - liabilities
    - shareholder equity
    - total assets
    - total liabilities
    - cash and equivalents
    - debt
    - balance sheet

    Set quarterly=True when the user specifically asks for:

    - quarterly balance sheet
    - latest quarter
    - last quarter
    - recent quarterly financials

    Examples:

    - "Show me Apple's balance sheet."
    - "What are Apple's total liabilities?"
    - "Show Microsoft's quarterly balance sheet."

    DO NOT use this tool for:

    - stock price
    - company news
    - revenue
    - profit
    - income statement
    - cash flow
    - analyst recommendations
    """

    symbol = _normalize_symbol(symbol)
    is_indian = _is_indian_symbol(symbol)

    try:
        ticker = _ticker(symbol)

        df = (
            ticker.quarterly_balance_sheet
            if quarterly
            else ticker.balance_sheet
        )

        if df is None or df.empty:
            return _failure(
                f"No balance sheet data available for {symbol}."
            )

        data = {
            "symbol": symbol,
            "quarterly": quarterly,
            "unit": "INR crore" if is_indian else "USD",
            "data": _df_to_text(df, in_crore=is_indian),
        }

        return _success(
            data,
            source_name="Yahoo Finance",
            source_type="financial_statement",
        )

    except Exception as e:
        return _failure(
            f"Unable to retrieve balance sheet for {symbol}: {str(e)}"
        )


# ============================================================
# INCOME STATEMENT
# ============================================================

@tool
def get_income_statement(
    symbol: str,
    quarterly: bool = False,
) -> ToolResult:
    """
    Get the income statement of a publicly traded company.

    USE THIS TOOL when the user asks about:

    - revenue
    - sales
    - expenses
    - operating income
    - net income
    - profit
    - earnings
    - income statement
    - EPS-related financial statement information

    Set quarterly=True when the user asks specifically about:

    - quarterly revenue
    - quarterly earnings
    - last quarter's financial results

    Examples:

    - "What is Apple's revenue?"
    - "Show me Tata Steel's income statement."
    - "How much profit did Microsoft make?"

    DO NOT use this tool for:

    - current stock price
    - balance sheet
    - cash flow
    - recent news
    - analyst recommendations

    NOTE ON UNITS: For Indian (.NS / .BO) symbols, all monetary
    line items in this statement are already expressed in INR
    crore (except EPS, which stays as a raw per-share rupee
    value). Do not re-scale these figures again — treat them
    as already in the unit stated in the "unit" field.
    """

    symbol = _normalize_symbol(symbol)
    is_indian = _is_indian_symbol(symbol)

    try:
        ticker = _ticker(symbol)

        df = (
            ticker.quarterly_income_stmt
            if quarterly
            else ticker.income_stmt
        )

        if df is None or df.empty:
            return _failure(
                f"No income statement data available for {symbol}."
            )

        # EPS-related rows must stay per-share, not be divided
        # into crore along with everything else.
        eps_rows = [
            idx for idx in df.index
            if "per share" in str(idx).lower() or str(idx).lower() == "eps"
            or "eps" in str(idx).lower()
        ]

        if is_indian and eps_rows:
            df_to_scale = df.drop(index=eps_rows)
            df_eps = df.loc[eps_rows]

            scaled_text = _df_to_text(df_to_scale, in_crore=True)
            eps_text = _df_to_text(df_eps, in_crore=False)

            combined_text = (
                f"{scaled_text}\n\n"
                f"Per-share figures (NOT in crore, raw currency units):\n"
                f"{eps_text}"
            )
        else:
            combined_text = _df_to_text(df, in_crore=is_indian)

        data = {
            "symbol": symbol,
            "quarterly": quarterly,
            "unit": "INR crore (except per-share figures)" if is_indian else "USD",
            "data": combined_text,
        }

        return _success(
            data,
            source_name="Yahoo Finance",
            source_type="financial_statement",
        )

    except Exception as e:
        return _failure(
            f"Unable to retrieve income statement for {symbol}: {str(e)}"
        )


# ============================================================
# CASH FLOW
# ============================================================

@tool
def get_cash_flow(
    symbol: str,
    quarterly: bool = False,
) -> ToolResult:
    """
    Get the cash flow statement of a publicly traded company.

    USE THIS TOOL when the user asks about:

    - operating cash flow
    - investing cash flow
    - financing cash flow
    - free cash flow
    - cash flow statement
    - cash generated by the company
    - cash used for investments
    - cash used for financing

    Set quarterly=True when the user specifically asks for
    quarterly cash flow information.

    Examples:

    - "How much operating cash flow does Apple generate?"
    - "Show me Tata Steel's cash flow."
    - "What was Microsoft's free cash flow?"

    DO NOT use this tool for:

    - current stock price
    - company overview
    - balance sheet
    - recent news
    """

    symbol = _normalize_symbol(symbol)
    is_indian = _is_indian_symbol(symbol)

    try:
        ticker = _ticker(symbol)

        df = (
            ticker.quarterly_cashflow
            if quarterly
            else ticker.cashflow
        )

        if df is None or df.empty:
            return _failure(
                f"No cash flow data available for {symbol}."
            )

        data = {
            "symbol": symbol,
            "quarterly": quarterly,
            "unit": "INR crore" if is_indian else "USD",
            "data": _df_to_text(df, in_crore=is_indian),
        }

        return _success(
            data,
            source_name="Yahoo Finance",
            source_type="financial_statement",
        )

    except Exception as e:
        return _failure(
            f"Unable to retrieve cash flow data for {symbol}: {str(e)}"
        )


# ============================================================
# FINANCIAL RATIOS
# ============================================================

@tool
def get_financial_ratios(symbol: str) -> ToolResult:
    """
    Get key financial ratios and profitability metrics for a stock.

    USE THIS TOOL when the user asks specifically about:

    - P/E ratio
    - price-to-earnings
    - forward P/E
    - P/B ratio
    - price-to-book
    - debt-to-equity
    - current ratio
    - return on equity
    - ROE
    - gross margin
    - operating margin
    - net margin
    - profitability ratios
    - valuation ratios

    Examples:

    - "What is Tata Steel's P/E ratio?"
    - "What is Apple's debt-to-equity ratio?"
    - "Show me Microsoft's ROE."
    - "How profitable is Reliance?"

    DO NOT use this tool for:

    - current stock price
    - company news
    - general company description
    - financial statements
    - analyst recommendations

    IMPORTANT:

    These metrics are retrieved from Yahoo Finance company
    data. They should not be interpreted as an investment
    recommendation by themselves. These are all ratios or
    percentages, never rescale them into crore.
    """

    symbol = _normalize_symbol(symbol)

    try:
        info = _info(symbol)

        data = {
            "symbol": symbol,
            "trailing_pe": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "price_to_book": info.get("priceToBook"),
            "debt_to_equity": info.get("debtToEquity"),
            "current_ratio": info.get("currentRatio"),
            "return_on_equity": info.get("returnOnEquity"),
            "gross_margin": info.get("grossMargins"),
            "operating_margin": info.get("operatingMargins"),
            "net_margin": info.get("profitMargins"),
        }

        data = {
            key: value
            for key, value in data.items()
            if value is not None
        }

        # Only symbol means that no actual ratio was returned.
        if len(data) <= 1:
            return _failure(
                f"No financial ratio data available for {symbol}."
            )

        return _success(
            data,
            source_name="Yahoo Finance",
            source_type="financial_metrics",
        )

    except Exception as e:
        return _failure(
            f"Unable to retrieve financial ratios for {symbol}: {str(e)}"
        )


# ============================================================
# ANALYST RECOMMENDATIONS
# ============================================================

@tool
def get_analyst_recommendations(
    symbol: str,
) -> ToolResult:
    """
    Get analyst recommendations and price targets for a publicly
    traded stock.

    USE THIS TOOL when the user asks about:

    - analyst recommendations
    - analyst consensus
    - buy / hold / sell ratings
    - Wall Street recommendations
    - analyst price targets
    - average analyst target
    - target price from analysts

    Examples:

    - "What do analysts think about Apple?"
    - "Is Tata Steel a buy according to analysts?"
    - "What is the analyst price target for Microsoft?"
    - "How many analysts recommend buying Reliance?"

    DO NOT use this tool for:

    - current stock price
    - company fundamentals
    - financial statements
    - recent news

    IMPORTANT:

    Analyst recommendations represent analyst opinions.
    They are not guaranteed predictions and are not
    investment advice.
    """

    symbol = _normalize_symbol(symbol)

    try:
        ticker = _ticker(symbol)

        recommendations = ticker.recommendations

        info = _info(symbol)

        target_price = info.get("targetMeanPrice")

        if (
            recommendations is None
            or recommendations.empty
        ) and target_price is None:
            return _failure(
                f"No analyst recommendation data available for {symbol}."
            )

        data = {
            "symbol": symbol,
            "recommendations": _df_to_text(
                recommendations,
                max_rows=6,
            ),
            "mean_analyst_price_target": target_price,
        }

        return _success(
            data,
            source_name="Yahoo Finance",
            source_type="analyst_data",
        )

    except Exception as e:
        return _failure(
            f"Unable to retrieve analyst recommendations "
            f"for {symbol}: {str(e)}"
        )