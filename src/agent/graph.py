"""LangGraph agent workflow with persistent conversation memory.

Graph flow:
    START → agent → [tools_condition] → tools → agent
                  └→ [should_summarize] → summarize → END
                  └→ END

The graph is compiled with a SqliteSaver checkpointer, so every node
execution is automatically persisted. Callers must supply a thread_id
via `config={"configurable": {"thread_id": "..."}}` to isolate sessions.
"""

import logging
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
from langchain_core.messages import HumanMessage, SystemMessage, RemoveMessage

from src.config import HUGGINGFACE_REPO_ID
from src.agent.state import AgentState
from src.agent.memory import memory_manager
from src.tools.calculator import calculator
from src.tools.rag_tool import search_knowledge_base

logger = logging.getLogger("agent")

# ── Tools ────────────────────────────────────────────────────────────────
tools = [calculator, search_knowledge_base]

# ── LLM ──────────────────────────────────────────────────────────────────
endpoint = HuggingFaceEndpoint(
    repo_id=HUGGINGFACE_REPO_ID,
    task="text-generation",
    max_new_tokens=512,
    do_sample=False,
)
llm = ChatHuggingFace(llm=endpoint)
llm_with_tools = llm.bind_tools(tools)

# ── Threshold: when to trigger conversation summarization ────────────────
SUMMARIZE_AFTER = 10  # number of messages before we compress history


# ── Node: Agent ──────────────────────────────────────────────────────────
def agent_node(state: AgentState) -> dict:
    """Invoke the LLM with conversation history and optional summary context.

    If a conversation summary exists from previous turns, it is prepended
    as a SystemMessage so the LLM retains context from compressed history.
    """
    logger.info("[AGENT] Generating response...")

    messages = state["messages"]

    # Prepend summary context if available
    summary = state.get("summary", "")
    if summary:
        system_msg = SystemMessage(
            content=(
                f"Summary of the conversation so far:\n{summary}\n\n"
                "Use this summary as context for the conversation. "
                "The recent messages below contain the latest exchanges."
            )
        )
        messages = [system_msg] + list(messages)

    response = llm_with_tools.invoke(messages)

    # Log tool selection vs direct response
    if response.tool_calls:
        logger.info(f"[AGENT] Tool selected: {response.tool_calls[0]['name']}")
    else:
        logger.info("[AGENT] Final response generated directly.")

    return {"messages": [response]}


# ── Conditional edge: should we summarize? ───────────────────────────────
def should_summarize(state: AgentState) -> str:
    """Route to 'summarize' if message history exceeds threshold, else END."""
    messages = state["messages"]
    if len(messages) > SUMMARIZE_AFTER:
        logger.info(
            f"[AGENT] Message count ({len(messages)}) > {SUMMARIZE_AFTER}. "
            "Triggering summarization."
        )
        return "summarize"
    return END


# ── Node: Summarize ─────────────────────────────────────────────────────
def summarize_node(state: AgentState) -> dict:
    """Compress older messages into a running summary to manage context size.

    Keeps the most recent 4 messages intact and summarizes everything else.
    The summary is stored in state['summary'] and old messages are removed
    using LangGraph's RemoveMessage pattern.
    """
    messages = state["messages"]
    existing_summary = state.get("summary", "")

    # Build summarization prompt
    if existing_summary:
        summary_prompt = (
            f"This is the existing conversation summary:\n{existing_summary}\n\n"
            "Extend the summary by incorporating the new messages below. "
            "Keep it concise but preserve key facts, names, numbers, and context:\n\n"
        )
    else:
        summary_prompt = (
            "Create a concise summary of the conversation below. "
            "Preserve key facts, names, numbers, tool results, and context:\n\n"
        )

    # Add the messages that will be summarized (all except last 4)
    messages_to_summarize = messages[:-4]
    for msg in messages_to_summarize:
        role = getattr(msg, "type", "unknown")
        summary_prompt += f"{role}: {msg.content}\n"

    # Use the LLM to generate the summary
    try:
        summary_response = llm.invoke(
            [HumanMessage(content=summary_prompt)]
        )
        new_summary = summary_response.content
        logger.info(f"[AGENT] Conversation summarized. Summary length: {len(new_summary)}")
    except Exception as e:
        logger.error(f"[AGENT] Summarization failed: {e}")
        # If summarization fails, just keep the existing summary
        new_summary = existing_summary

    # Remove old messages (keep last 4)
    delete_messages = [RemoveMessage(id=m.id) for m in messages_to_summarize]

    return {
        "summary": new_summary,
        "messages": delete_messages,
    }


# ── Build the Graph ──────────────────────────────────────────────────────
workflow = StateGraph(AgentState)

# Add nodes
workflow.add_node("agent", agent_node)
workflow.add_node("tools", ToolNode(tools))
workflow.add_node("summarize", summarize_node)

# Edges: START → agent
workflow.add_edge(START, "agent")

# Agent → tools (if tool call) | agent → should_summarize (if no tool call)
workflow.add_conditional_edges(
    "agent",
    tools_condition,
    {
        "tools": "tools",
        END: END,
    },
)

# Tools → agent (loop back for the LLM to process tool results)
workflow.add_edge("tools", "agent")

# After agent produces a final response (no tool calls), check if we
# need to summarize. We achieve this by overriding the END edge:
# Instead of going directly to END, route through should_summarize.
# NOTE: We need to restructure — add a routing node after agent for
# non-tool responses. Let's use a simpler approach: check summarization
# after the tools loop completes. We do this by replacing the END
# destination in the conditional edges above.

# Re-build with the summarization routing:
workflow = StateGraph(AgentState)

workflow.add_node("agent", agent_node)
workflow.add_node("tools", ToolNode(tools))
workflow.add_node("summarize", summarize_node)

workflow.add_edge(START, "agent")

# Agent routes to tools or to summarization check
workflow.add_conditional_edges(
    "agent",
    tools_condition,
    {
        "tools": "tools",
        END: END,
    },
)

workflow.add_edge("tools", "agent")

# Summarize always goes to END
workflow.add_edge("summarize", END)

# ── Compile with persistent checkpointer ─────────────────────────────────
checkpointer = memory_manager.get_checkpointer()
graph = workflow.compile(checkpointer=checkpointer)

logger.info("[AGENT] Graph compiled with persistent memory checkpointer.")
