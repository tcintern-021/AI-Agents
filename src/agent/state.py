from typing import Annotated, TypedDict
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """State schema for the LangGraph agent with conversation memory.

    Attributes:
        messages: The conversation message history. Uses the `add_messages`
                  reducer so each node can return new messages that get
                  appended (or matched by ID for updates) automatically.
        session_id: Identifier for the conversation thread / session.
                    Used alongside the checkpointer's `thread_id` config
                    so the state itself carries the session context.
        summary: A running summary of older conversation turns. When the
                 message list grows long, the summarize node compresses
                 older messages into this field to keep the context window
                 manageable while preserving conversational continuity.
    """
    messages: Annotated[list[BaseMessage], add_messages]
    session_id: str
    summary: str
