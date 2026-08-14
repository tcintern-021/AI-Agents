"""Streamlit chat interface with LangGraph conversation memory.

Each browser session gets a unique thread_id stored in st.session_state.
The graph's checkpointer persists conversation state, so refreshing
the page within the same session retains full context.
"""

import uuid
import streamlit as st
import logging
from src.config import logger
from src.agent.graph import graph
from src.agent.memory import memory_manager
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

st.set_page_config(page_title="AI Tool-Calling Agent", layout="centered")

st.title("AI Tool-Calling Agent 🤖")
st.markdown(
    "A LangGraph-powered AI assistant with **persistent conversation memory**. "
    "Your conversation history is preserved across interactions."
)

# ── Session State Initialization ─────────────────────────────────────────

if "thread_id" not in st.session_state:
    st.session_state.thread_id = str(uuid.uuid4())

if "messages" not in st.session_state:
    # Try to load existing history from the checkpointer
    existing = memory_manager.get_thread_history(st.session_state.thread_id)
    if existing and existing.get("messages"):
        st.session_state.messages = existing["messages"]
    else:
        st.session_state.messages = []

# ── Sidebar: Thread Management ───────────────────────────────────────────

with st.sidebar:
    st.header("🧠 Memory & Sessions")

    # Display current thread info
    st.caption(f"**Thread ID:** `{st.session_state.thread_id[:12]}...`")
    st.caption(f"**Messages in memory:** {len(st.session_state.messages)}")

    st.divider()

    # List all threads
    all_threads = memory_manager.list_threads()
    if all_threads:
        st.subheader("Saved Threads")
        for tid in all_threads:
            cols = st.columns([3, 1])
            label = f"`{tid[:12]}...`"
            is_current = tid == st.session_state.thread_id
            if is_current:
                label += " ✅"

            with cols[0]:
                if st.button(label, key=f"switch_{tid}", use_container_width=True):
                    st.session_state.thread_id = tid
                    existing = memory_manager.get_thread_history(tid)
                    if existing and existing.get("messages"):
                        st.session_state.messages = existing["messages"]
                    else:
                        st.session_state.messages = []
                    st.rerun()

            with cols[1]:
                if st.button("🗑️", key=f"del_{tid}"):
                    memory_manager.delete_thread(tid)
                    if tid == st.session_state.thread_id:
                        st.session_state.thread_id = str(uuid.uuid4())
                        st.session_state.messages = []
                    st.rerun()

    st.divider()

    # New conversation button
    if st.button("➕ New Conversation", use_container_width=True):
        st.session_state.thread_id = str(uuid.uuid4())
        st.session_state.messages = []
        st.rerun()

    # Clear current conversation
    if st.button("🧹 Clear Current History", use_container_width=True):
        memory_manager.delete_thread(st.session_state.thread_id)
        st.session_state.thread_id = str(uuid.uuid4())
        st.session_state.messages = []
        st.rerun()

# ── Display Chat History ─────────────────────────────────────────────────

for msg in st.session_state.messages:
    if isinstance(msg, HumanMessage):
        st.chat_message("user").write(msg.content)
    elif isinstance(msg, AIMessage):
        if msg.content:
            st.chat_message("assistant").write(msg.content)
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                with st.chat_message("assistant"):
                    st.write(f"🔧 *Calling tool `{tc['name']}`...*")
    elif isinstance(msg, ToolMessage):
        with st.chat_message("assistant"):
            with st.expander(f"🛠️ Tool Result: {msg.name}"):
                st.write(msg.content)

# ── User Input ───────────────────────────────────────────────────────────

user_query = st.chat_input("Ask a question...")

if user_query:
    logger.info(f"\n[AGENT] Query: {user_query}")
    logger.info(f"[AGENT] Thread: {st.session_state.thread_id}")

    st.session_state.messages.append(HumanMessage(content=user_query))

    with st.spinner("Thinking..."):
        try:
            # Invoke with thread_id config for persistent memory
            config = {
                "configurable": {
                    "thread_id": st.session_state.thread_id
                }
            }
            result = graph.invoke(
                {"messages": [HumanMessage(content=user_query)]},
                config=config,
            )
            st.session_state.messages = result["messages"]
        except Exception as e:
            logger.error(f"[AGENT] Error during execution: {e}")
            st.error(f"An error occurred: {e}")

    st.rerun()
