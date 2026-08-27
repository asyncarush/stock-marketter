import json
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    ToolMessage,
)
import agent.db.db as db
import agent.main as agent_module

from agent.utils import looks_like_table_row, normalize_table_block

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    await agent_module.init_agent()
    yield
    await agent_module.close_agent()
    await db.close_db()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QuestionRequest(BaseModel):
    question: str
    chat_id: str 


@app.get("/chats")
async def list_chats_endpoint():
    return await db.list_chats()


@app.get("/chats/{chat_id}/messages")
async def get_chat_messages_endpoint(chat_id: str):
    return await db.get_messages(chat_id)


@app.delete("/chats/{chat_id}")
async def delete_chat_endpoint(chat_id: str):
    await db.delete_chat(chat_id)
    return {"ok": True}


@app.post("/ask")
async def ask_endpoint(request: QuestionRequest):
    if not await db.chat_exists(request.chat_id):
        title = request.question[:30] + ("..." if len(request.question) > 30 else "")
        await db.create_chat(request.chat_id, title)

    await db.save_message(request.chat_id, "user", request.question)
    result = agent_module.ask(request.question, request.chat_id)
    await db.save_message(request.chat_id, "assistant", result["answer"], result["tools_used"])
    return result




# @app.post("/ask-stream")
# async def ask_stream_endpoint(request: QuestionRequest):
#     chat_id = request.chat_id

#     print("Coming here:::")

#     # First message of a new chat creates its row; subsequent messages
#     # reuse it. The title is set once, from the first question.
#     if not await db.chat_exists(chat_id):
#         title = request.question[:30] + ("..." if len(request.question) > 30 else "")
#         await db.create_chat(chat_id, title)

#     await db.save_message(chat_id, "user", request.question)

#     print("Coming here2:::")

#     async def generate():
#         line_buffer = ""
#         table_block: list[str] = []
#         saved_parts: list[str] = []       # accumulates the exact text sent to the client, for persistence
#         tool_calls_collected: list[dict] = []

#         def sse(payload: dict) -> str:
#             return f"data: {json.dumps(payload)}\n\n"

#         async def flush_table_block():
#             nonlocal table_block
#             if table_block:
#                 for line in normalize_table_block(table_block):
#                     text = line + "\n"
#                     saved_parts.append(text)
#                     yield sse({"type": "content", "content": text})
#                 table_block = []

#         try:
#             # config.configurable.thread_id is what gives the agent memory:
#             # the checkpointer looks up prior state for this chat_id and
#             # continues from there. We only ever send the NEW question here
#             # — no need to resend prior turns ourselves.
#             async for chunk, metadata in agent_module.agent.astream(
#                 {"messages": [{"role": "user", "content": request.question}]},
#                 config={"configurable": {"thread_id": chat_id}},
#                 stream_mode="messages",
#             ):
#                 print("CHUNKS", chunk)
#                 if isinstance(chunk, AIMessageChunk) and chunk.tool_calls:
#                     for tool_call in chunk.tool_calls:
#                         if tool_call.get("name"):
#                             name = tool_call["name"]
#                             args = tool_call.get("args", {})
#                             tool_calls_collected.append({"name": name, "args": args})
#                             yield sse({"type": "tool_call", "name": name, "args": args})
#                     continue

#                 if not isinstance(chunk, AIMessageChunk):
#                     continue

#                 text = chunk.content
#                 if isinstance(text, list):
#                     text = "".join(p.get("text", "") for p in text if isinstance(p, dict))
#                 if not text:
#                     continue

#                 line_buffer += text

#                 while "\n" in line_buffer:
#                     line, line_buffer = line_buffer.split("\n", 1)

#                     if looks_like_table_row(line):
#                         table_block.append(line)
#                         continue

#                     async for evt in flush_table_block():
#                         yield evt

#                     out = line + "\n"
#                     saved_parts.append(out)
#                     yield sse({"type": "content", "content": out})

#             async for evt in flush_table_block():
#                 yield evt
#             if line_buffer:
#                 saved_parts.append(line_buffer)
#                 yield sse({"type": "content", "content": line_buffer})

#             # Persist the assistant's full answer now that streaming is done.
#             full_answer = "".join(saved_parts)
#             await db.save_message(chat_id, "assistant", full_answer, tool_calls_collected)

#         except Exception as e:
#             yield sse({"type": "error", "error": str(e)})

#     return StreamingResponse(
#         generate(),
#         media_type="text/event-stream",
#         headers={
#             "Cache-Control": "no-cache",
#             "X-Accel-Buffering": "no",
#             "Connection": "keep-alive",
#         },
#     )

@app.post("/ask-stream")
async def ask_stream_endpoint(request: QuestionRequest):
    chat_id = request.chat_id

    # Create chat if it doesn't exist
    if not await db.chat_exists(chat_id):
        title = request.question[:30] + (
            "..." if len(request.question) > 30 else ""
        )
        await db.create_chat(chat_id, title)

    await db.save_message(
        chat_id,
        "user",
        request.question,
    )

    async def generate():
        line_buffer = ""
        table_block: list[str] = []
        saved_parts: list[str] = []
        tool_calls_collected: list[dict] = []

        def sse(payload: dict) -> str:
            return f"data: {json.dumps(payload)}\n\n"

        async def flush_table_block():
            nonlocal table_block

            if not table_block:
                return

            for line in normalize_table_block(table_block):
                text = line + "\n"

                saved_parts.append(text)

                yield sse({
                    "type": "content",
                    "content": text,
                })

            table_block = []

        try:
            async for chunk, metadata in agent_module.agent.astream(
                {
                    "messages": [
                        {
                            "role": "user",
                            "content": request.question,
                        }
                    ]
                },
                config={
                    "configurable": {
                        "thread_id": chat_id
                    }
                },
                stream_mode="messages",
            ):
                # =====================================================
                # 1. IGNORE TOOL OUTPUT
                # =====================================================
                #
                # ToolMessage contains things like:
                #
                # success=True
                # data={...}
                # sources=[...]
                # error=...
                #
                # We DO NOT want any of that going to the frontend.
                # =====================================================

                if isinstance(chunk, ToolMessage):
                    print("IGNORING TOOL OUTPUT")
                    continue

                # =====================================================
                # 2. ONLY PROCESS AI MESSAGES
                # =====================================================
                #
                # ChatLiteLLM may give us AIMessage instead of
                # AIMessageChunk, so support both.
                # =====================================================

                if not isinstance(
                    chunk,
                    (AIMessage, AIMessageChunk)
                ):
                    print(
                        "IGNORING NON-AI MESSAGE:",
                        type(chunk)
                    )
                    continue

                # =====================================================
                # 3. HANDLE TOOL CALLS
                # =====================================================

                tool_calls = getattr(
                    chunk,
                    "tool_calls",
                    []
                )

                if tool_calls:
                    for tool_call in tool_calls:

                        name = tool_call.get("name")

                        if not name:
                            continue

                        args = tool_call.get(
                            "args",
                            {}
                        )

                        tool_call_data = {
                            "name": name,
                            "args": args,
                        }

                        tool_calls_collected.append(
                            tool_call_data
                        )

                        # Send only metadata about the tool call
                        # to the frontend.
                        yield sse({
                            "type": "tool_call",
                            "name": name,
                            "args": args,
                        })

                # =====================================================
                # 4. EXTRACT AI TEXT
                # =====================================================

                text = getattr(
                    chunk,
                    "content",
                    ""
                )

                # ChatLiteLLM / LangChain can sometimes represent
                # content as a list of blocks.
                if isinstance(text, list):
                    text = "".join(
                        block.get("text", "")
                        for block in text
                        if isinstance(block, dict)
                    )

                if not text:
                    continue

                # =====================================================
                # 5. BUFFER TEXT FOR TABLE HANDLING
                # =====================================================

                line_buffer += text

                while "\n" in line_buffer:

                    line, line_buffer = line_buffer.split(
                        "\n",
                        1,
                    )

                    # ---------------------------------------------
                    # Table row
                    # ---------------------------------------------

                    if looks_like_table_row(line):
                        table_block.append(line)
                        continue

                    # ---------------------------------------------
                    # Flush pending table
                    # ---------------------------------------------

                    async for event in flush_table_block():
                        yield event

                    # ---------------------------------------------
                    # Normal text
                    # ---------------------------------------------

                    out = line + "\n"

                    saved_parts.append(out)

                    yield sse({
                        "type": "content",
                        "content": out,
                    })

            # =====================================================
            # 6. FLUSH REMAINING TABLE
            # =====================================================

            async for event in flush_table_block():
                yield event

            # =====================================================
            # 7. FLUSH REMAINING TEXT
            # =====================================================

            if line_buffer:
                saved_parts.append(line_buffer)

                yield sse({
                    "type": "content",
                    "content": line_buffer,
                })

            # =====================================================
            # 8. SAVE FINAL RESPONSE
            # =====================================================

            full_answer = "".join(saved_parts)

            await db.save_message(
                chat_id,
                "assistant",
                full_answer,
                tool_calls_collected,
            )

            # =====================================================
            # 9. COMPLETION EVENT
            # =====================================================

            yield sse({
                "type": "done",
            })

        except Exception as e:
            print(
                "STREAM ERROR:",
                repr(e)
            )

            yield sse({
                "type": "error",
                "error": str(e),
            })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )

#this is just comment