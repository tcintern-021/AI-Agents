import os
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Dict, Any

from src.agent.graph import graph
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, SystemMessage

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

class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]]

def dict_to_message(msg: Dict[str, Any]):
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
        return ToolMessage(content=content, name=msg.get("name", "tool"), tool_call_id=msg.get("tool_call_id", ""))
    return HumanMessage(content=content)

def message_to_dict(msg):
    if isinstance(msg, HumanMessage):
        return {"role": "user", "content": msg.content}
    elif isinstance(msg, AIMessage):
        res = {"role": "assistant", "content": msg.content}
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            res["tool_calls"] = msg.tool_calls
        return res
    elif isinstance(msg, ToolMessage):
        return {"role": "tool", "content": msg.content, "name": msg.name, "tool_call_id": msg.tool_call_id}
    elif isinstance(msg, SystemMessage):
        return {"role": "system", "content": msg.content}
    else:
        return {"role": "unknown", "content": str(msg.content)}

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    try:
        # Reconstruct LangChain message objects
        lc_messages = [dict_to_message(m) for m in request.messages]
        
        # Invoke graph
        result = graph.invoke({"messages": lc_messages})
        
        # Convert updated state back to dicts
        updated_messages = [message_to_dict(m) for m in result["messages"]]
        
        return {"messages": updated_messages}
        
    except Exception as e:
        logging.error(f"Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))
