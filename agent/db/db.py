import json
import os
from pathlib import Path
from uuid import UUID

import asyncpg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

_pool: asyncpg.Pool | None = None

async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    return _pool


async def init_db():
    """Run once at startup. Creates tables if they don't exist yet (idempotent)."""
    pool = await get_pool()
    schema_path = Path(__file__).parent / "schema.sql"
    async with pool.acquire() as conn:
        await conn.execute(schema_path.read_text())


async def close_db():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def chat_exists(chat_id: str) -> bool:
    pool = await get_pool()
    row = await pool.fetchrow("SELECT 1 FROM chats WHERE id = $1", UUID(chat_id))
    return row is not None


async def create_chat(chat_id: str, title: str):
    pool = await get_pool()
    await pool.execute(
        "INSERT INTO chats (id, title) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
        UUID(chat_id),
        title,
    )


async def list_chats() -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT c.id, c.title, c.created_at, COUNT(m.id) AS message_count
        FROM chats c
        LEFT JOIN messages m ON m.chat_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
        """
    )
    return [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "createdAt": r["created_at"].isoformat(),
            "messageCount": r["message_count"],
        }
        for r in rows
    ]


async def get_messages(chat_id: str) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT id, role, content, tool_calls, created_at
        FROM messages
        WHERE chat_id = $1
        ORDER BY created_at ASC
        """,
        UUID(chat_id),
    )
    return [
        {
            "id": str(r["id"]),
            "role": r["role"],
            "content": r["content"],
            "toolCalls": json.loads(r["tool_calls"]) if isinstance(r["tool_calls"], str) else r["tool_calls"],
            "timestamp": r["created_at"].isoformat(),
        }
        for r in rows
    ]


async def save_message(chat_id: str, role: str, content: str, tool_calls: list | None = None) -> str:
    pool = await get_pool()
    msg_id = await pool.fetchval(
        """
        INSERT INTO messages (chat_id, role, content, tool_calls)
        VALUES ($1, $2, $3, $4::jsonb)
        RETURNING id
        """,
        UUID(chat_id),
        role,
        content,
        json.dumps(tool_calls or []),
    )
    return str(msg_id)


async def delete_chat(chat_id: str):
    pool = await get_pool()
    await pool.execute("DELETE FROM chats WHERE id = $1", UUID(chat_id))