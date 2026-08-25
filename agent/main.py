import os
from langchain.agents import create_agent
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from agent.services import LLMService
from agent.config import LLMConfig
from agent.prompts import SYSTEM_PROMPT
from agent.tools import (
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

_pool: AsyncConnectionPool | None = None
_checkpointer: AsyncPostgresSaver | None = None
agent = None 


async def init_agent():
    """
    Call once at app startup (see app.py's lifespan). Wires the agent to a
    Postgres-backed checkpointer so it remembers earlier turns in the SAME
    conversation. Memory is keyed by "thread_id" -> we use the chat's UUID
    as the thread_id, so every message sent with the same chat_id shares
    context automatically. No need to manually reconstruct and resend
    message history on each call — the checkpointer does that for you.

    NOTE: `create_agent(..., checkpointer=...)` matches the current
    LangChain/LangGraph agent-creation API. If your installed version
    doesn't accept `checkpointer` here, tell me the version and I'll adjust
    — this parameter has moved around across releases.
    """
    global _pool, _checkpointer, agent

    try:
        print("DEBUG: Starting agent initialization...")
        _pool = AsyncConnectionPool(
            conninfo=DATABASE_URL,
            max_size=10,
            kwargs={"autocommit": True, "prepare_threshold": 0},
        )
        await _pool.open()
        print("DEBUG: Connection pool opened")

        _checkpointer = AsyncPostgresSaver(_pool)
        await _checkpointer.setup()
        print("DEBUG: Checkpointer setup complete")

        agent = create_agent(
            model=llm,
            tools=TOOLS,
            system_prompt=SYSTEM_PROMPT,
            checkpointer=_checkpointer,
        )
        print("DEBUG: Agent created successfully")
    except Exception as e:
        print(f"ERROR: Agent initialization failed: {e}")
        import traceback
        traceback.print_exc()
        raise


async def close_agent():
    if _pool is not None:
        await _pool.close()


# for development purpose only
def ask(question: str, chat_id: str) -> dict:
    """
    Non-streaming path. Now conversation-aware: pass the SAME chat_id on
    every call for a given conversation and the agent will have full
    context of everything said before, without you resending history.
    """
    result = agent.invoke(
        {"messages": [{"role": "user", "content": question}]},
        config={"configurable": {"thread_id": chat_id}},
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