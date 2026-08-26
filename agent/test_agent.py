import os
from langchain.agents import create_agent

from services import LLMService
from config import LLMConfig
from prompts import SYSTEM_PROMPT
from tools import (
    search_web,
    get_stock_quote,
    get_company_overview,
    get_balance_sheet,
    get_income_statement,
    get_cash_flow,
)

llm = LLMService(config=LLMConfig()).get_client()

DATABASE_URL = os.environ["DATABASE_URL"]

TOOLS = [
    search_web,
    get_stock_quote,
    get_company_overview,
    get_balance_sheet,
    get_income_statement,
    get_cash_flow,
]

agent = create_agent(
    model=llm,
    tools=TOOLS,
    system_prompt=SYSTEM_PROMPT,
)

def ask(question: str) -> dict:
    """
    Non-streaming path. Now conversation-aware: pass the SAME chat_id on
    every call for a given conversation and the agent will have full
    context of everything said before, without you resending history.
    """
    result = agent.invoke(
        {"messages": [{"role": "user", "content": question}]}
    )

    messages = result.get("messages", [])
    tools_used = []
    for message in messages:
        if hasattr(message, "tool_calls") and message.tool_calls:
            for tool_call in message.tool_calls:
                tools_used.append({"name": tool_call["name"], "args": tool_call["args"]})

    answer = ""
    for message in reversed(messages):
        if message.__class__.__name__ == "AIMessage":
            content = message.content
            if isinstance(content, str):
                answer = content
                break
            if isinstance(content, list):
                texts = [
                    item["text"]
                    for item in content
                    if isinstance(item, dict) and item.get("type") == "text"
                ]
                if texts:
                    answer = "\n".join(texts)
                    break

    return {"answer": answer, "tools_used": tools_used}


import asyncio

async def test_stream():

    async for chunk, metadata in agent.astream(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "What is the current stock price of Apple?"
                }
            ]
        },
        stream_mode="messages",
    ):
        print("CHUNK:", chunk)
        print("METADATA:", metadata)


if __name__ == "__main__":
    asyncio.run(test_stream())
