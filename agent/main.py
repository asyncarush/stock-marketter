import re

from langchain.agents import create_agent

from agent.services import LLMService
from agent.config import LLMConfig
from agent.tools import search_web, get_stock_quote, get_company_overview, get_balance_sheet, get_income_statement, get_cash_flow

llm = LLMService(config=LLMConfig()).get_client()

SYSTEM_PROMPT = """
You are an Experienced Stock Financial Analyst that can answer questions and provide information. 
Do not depend on your pretrained knowledge. Always Use these tools to get current 
information and provide accurate and relevant information to the user.

IMPORTANT: When using the search_web tool, always search for the MOST CURRENT and recent information.
- Include current date context in your searches (e.g., "2026", "August 2026", "latest", "current", "recent")
- Never search for old time periods like "2024-25" unless the user specifically requests historical data
- For financial data, always search for the latest available information  
- Prioritize recent news, current financial reports, and latest developments
- Be specific and precise in your search queries to get accurate results
- Financial statement figures from these tools are already in the unit stated in their unit field - never rescale them yourself.

RESPONSE FORMATTING (follow this exactly):
- Whenever you present financial figures across multiple periods, companies, or 
  categories (revenue, EPS, balance sheet items, stock comparisons, etc.), you MUST 
  format them as a GitHub-flavored Markdown table using pipes and a header 
  separator row. Never align columns with tabs or spaces.
- Correct format, exactly like this:

  | Metric | FY 2025-26 | FY 2024-25 |
  | --- | --- | --- |
  | Revenue | 230,293 | 216,840 |
  | Net Income | 10,794 | 3,420 |

- Incorrect (never do this): "Metric    FY 2025-26    FY 2024-25" as plain 
  aligned text.
- When comparing two or more stocks (e.g. "X vs Y"), put the comparable metrics 
  in a single table with one column per stock, not separate paragraphs.
- Use markdown headings (##, ###) to organize sections, and bold (**text**) for 
  key takeaways or recommendations - not for entire sentences.
- Keep prose sections concise; prefer a table or bullet list over a paragraph 
  whenever you're listing more than 2-3 comparable data points.
"""

agent = create_agent(
    model=llm,
    tools=[search_web, get_stock_quote, get_company_overview, get_balance_sheet, get_income_statement, get_cash_flow],
    system_prompt=SYSTEM_PROMPT,
    )



def ask(question: str) -> dict:
    """
    Ask the agent a question and return the final answer
    along with the tools used during execution.
    """

    result = agent.invoke({
        "messages": [
            {
                "role": "user",
                "content": question
            }
        ]
    })

    messages = result.get("messages", [])

    tools_used = []

    # Extract tool calls
    for message in messages:
        if hasattr(message, "tool_calls") and message.tool_calls:
            for tool_call in message.tool_calls:
                tools_used.append({
                    "name": tool_call["name"],
                    "args": tool_call["args"],
                })

    # Get final AI response
    answer = ""

    for message in reversed(messages):
        if message.__class__.__name__ == "AIMessage":
            content = message.content

            if isinstance(content, str):
                answer = content
                break

            # Handle structured content
            if isinstance(content, list):
                texts = [
                    item["text"]
                    for item in content
                    if isinstance(item, dict)
                    and item.get("type") == "text"
                ]

                if texts:
                    answer = "\n".join(texts)
                    break

    return {
        "answer": answer,
        "tools_used": tools_used,
    }


# if __name__ == "__main__":
#     response = ask("tata energy vs adani energy, which stock you would Pick for me to invest in this current month?")
#     print(response["answer"])
#     print(response["tools_used"])