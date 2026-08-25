import json
import re

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_core.messages import AIMessageChunk

from agent.main import ask, agent

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QuestionRequest(BaseModel):
    question: str


@app.post("/ask")
def ask_endpoint(request: QuestionRequest):
    result = ask(request.question)
    return result


# ---------------------------------------------------------------------------
# Table normalizer — held-back lines that look tabular get corrected into
# real markdown tables before being flushed. Ordinary prose lines flush
# immediately, so typing still feels token-by-token.
# ---------------------------------------------------------------------------
def looks_like_table_row(line: str) -> bool:
    cols = [c for c in re.split(r"\t+|\s{2,}", line) if c.strip()]
    return len(cols) >= 2 and not line.lstrip().startswith("|")


def normalize_table_block(lines: list[str]) -> list[str]:
    def split_row(line: str) -> list[str]:
        return [c.strip() for c in re.split(r"\t+|\s{2,}", line) if c.strip()]

    rows = [split_row(l) for l in lines]
    if len(rows) < 2 or any(len(r) < 2 for r in rows):
        return lines

    col_count = max(len(r) for r in rows)
    pad = lambda r: r + [""] * (col_count - len(r))

    out = ["| " + " | ".join(pad(rows[0])) + " |"]
    out.append("|" + "|".join([" --- "] * col_count) + "|")
    for r in rows[1:]:
        out.append("| " + " | ".join(pad(r)) + " |")
    return out


@app.post("/ask-stream")
async def ask_stream_endpoint(request: QuestionRequest):
    async def generate():
        line_buffer = ""
        table_block: list[str] = []

        def sse(payload: dict) -> str:
            return f"data: {json.dumps(payload)}\n\n"

        try:
            # stream_mode="messages" gives real per-token chunks, as tuples
            # of (message_chunk, metadata), for every LLM call the agent
            # makes — including intermediate tool-planning calls, which is
            # why we still have to filter those out below.
            async for chunk, metadata in agent.astream(
                {"messages": [{"role": "user", "content": request.question}]},
                stream_mode="messages",
            ):
                # Tool call chunks: surface as a distinct event, not as text.
                #
                # Bedrock streams a single tool call across MULTIPLE chunks:
                # first one announces the name (args={}), later ones stream
                # the args incrementally with name='' on the continuation
                # chunks. If we emit an event on every non-empty tool_calls
                # list, we get one correct badge + one blank-name badge per
                # tool call. So: only emit when the name is actually present.
                #
                # Also: chunk.invalid_tool_calls can show up when Bedrock
                # splits a tool's JSON args mid-string across chunks (e.g.
                # '{"' then 'symbol": "X"}') — that's just a partial-parse
                # artifact of viewing one chunk in isolation, not a real
                # failure, so we deliberately ignore it here.
                if isinstance(chunk, AIMessageChunk) and chunk.tool_calls:
                    for tool_call in chunk.tool_calls:
                        if tool_call.get("name"):
                            yield sse({
                                "type": "tool_call",
                                "name": tool_call["name"],
                                "args": tool_call.get("args", {}),
                            })
                    continue

                if not isinstance(chunk, AIMessageChunk):
                    continue

                text = chunk.content
                if isinstance(text, list):
                    text = "".join(
                        p.get("text", "") for p in text if isinstance(p, dict)
                    )
                if not text:
                    continue

                line_buffer += text

                while "\n" in line_buffer:
                    line, line_buffer = line_buffer.split("\n", 1)

                    if looks_like_table_row(line):
                        table_block.append(line)
                        continue

                    if table_block:
                        for normalized in normalize_table_block(table_block):
                            yield sse({"type": "content", "content": normalized + "\n"})
                        table_block = []

                    yield sse({"type": "content", "content": line + "\n"})

            if table_block:
                for normalized in normalize_table_block(table_block):
                    yield sse({"type": "content", "content": normalized + "\n"})
            if line_buffer:
                yield sse({"type": "content", "content": line_buffer})

        except Exception as e:
            yield sse({"type": "error", "error": str(e)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )