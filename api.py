"""FastAPI backend with thread-aware conversation memory.

The API no longer requires clients to send the full message history.
Clients send only the latest user message plus a thread_id; the
LangGraph checkpointer supplies previous context automatically.

Endpoints:
    POST /chat              — Send a message to a conversation thread
    GET  /threads           — List all active conversation threads
    GET  /threads/{id}/history — Retrieve full message history for a thread
    DELETE /threads/{id}    — Reset / delete a conversation thread
"""

import os
import uuid
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional

from src.agent.graph import graph
from src.agent.memory import memory_manager
from langchain_core.messages import (
    HumanMessage, AIMessage, ToolMessage, SystemMessage
)

app = FastAPI(title="AI Tool-Calling Agent API")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static frontend directory
frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")


@app.get("/")
async def serve_frontend():
    index_file = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "AI Tool-Calling Agent API is running."}


# ── Request / Response Models ────────────────────────────────────────────


class ChatRequest(BaseModel):
    """Client sends only the new message + thread_id.
    The checkpointer supplies previous conversation context.
    """
    message: str
    thread_id: Optional[str] = None


class LegacyChatRequest(BaseModel):
    """Legacy format — full message list. Kept for backward compatibility."""
    messages: list[dict]
    thread_id: Optional[str] = None


# ── Message Conversion Helpers ───────────────────────────────────────────


def dict_to_message(msg: dict):
    role = msg.get("role")
    content = msg.get("content", "")
    if role == "user":
        return HumanMessage(content=content)
    elif role == "assistant":
        kwargs = {"content": content}
        if "tool_calls" in msg and msg["tool_calls"]:
            kwargs["tool_calls"] = msg["tool_calls"]
        return AIMessage(**kwargs)
    elif role == "tool":
        return ToolMessage(
            content=content,
            name=msg.get("name", "tool"),
            tool_call_id=msg.get("tool_call_id", ""),
        )
    return HumanMessage(content=content)


def message_to_dict(msg) -> dict:
    if isinstance(msg, HumanMessage):
        return {"role": "user", "content": msg.content}
    elif isinstance(msg, AIMessage):
        res = {"role": "assistant", "content": msg.content}
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            res["tool_calls"] = msg.tool_calls
        return res
    elif isinstance(msg, ToolMessage):
        return {
            "role": "tool",
            "content": msg.content,
            "name": msg.name,
            "tool_call_id": msg.tool_call_id,
        }
    elif isinstance(msg, SystemMessage):
        return {"role": "system", "content": msg.content}
    else:
        return {"role": "unknown", "content": str(msg.content)}


# ── Chat Endpoint ────────────────────────────────────────────────────────


@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """Process a user message within a conversation thread.

    The checkpointer automatically loads prior messages for the thread_id,
    so only the new user message needs to be sent.
    """
    try:
        # Generate or use provided thread_id
        thread_id = request.thread_id or str(uuid.uuid4())

        # Build config with thread_id for the checkpointer
        config = {"configurable": {"thread_id": thread_id}}

        # Create the new user message
        user_message = HumanMessage(content=request.message)

        # Invoke graph — the checkpointer loads previous state automatically
        result = graph.invoke(
            {"messages": [user_message]},
            config=config,
        )

        # Convert updated state back to dicts
        updated_messages = [message_to_dict(m) for m in result["messages"]]

        return {
            "thread_id": thread_id,
            "messages": updated_messages,
            "summary": result.get("summary", ""),
            "message_count": len(result["messages"]),
        }

    except Exception as e:
        logging.error(f"Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat/legacy")
async def chat_legacy_endpoint(request: LegacyChatRequest):
    """Legacy endpoint accepting full message array (backward compatibility)."""
    try:
        thread_id = request.thread_id or str(uuid.uuid4())
        config = {"configurable": {"thread_id": thread_id}}

        lc_messages = [dict_to_message(m) for m in request.messages]
        result = graph.invoke({"messages": lc_messages}, config=config)

        updated_messages = [message_to_dict(m) for m in result["messages"]]
        return {
            "thread_id": thread_id,
            "messages": updated_messages,
            "summary": result.get("summary", ""),
        }

    except Exception as e:
        logging.error(f"Error in legacy chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Thread Management Endpoints ──────────────────────────────────────────


@app.get("/threads")
async def list_threads():
    """List all conversation threads with stored checkpoints."""
    threads = memory_manager.list_threads()
    return {"threads": threads, "count": len(threads)}


@app.get("/threads/{thread_id}/history")
async def get_thread_history(thread_id: str):
    """Retrieve the full message history for a conversation thread."""
    state = memory_manager.get_thread_history(thread_id)

    if state is None:
        return {"thread_id": thread_id, "messages": [], "summary": ""}

    messages = state.get("messages", [])
    summary = state.get("summary", "")

    return {
        "thread_id": thread_id,
        "messages": [message_to_dict(m) for m in messages],
        "summary": summary,
        "message_count": len(messages),
    }


@app.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str):
    """Delete / reset a conversation thread's history."""
    success = memory_manager.delete_thread(thread_id)
    if not success:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete thread {thread_id}",
        )
    return {
        "status": "deleted",
        "thread_id": thread_id,
        "message": f"Conversation thread '{thread_id}' has been reset.",
    }
