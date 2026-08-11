import streamlit as st
import logging
from src.config import logger
from src.agent.graph import graph
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

st.set_page_config(page_title="AI Tool-Calling Agent", layout="centered")

st.title("AI Tool-Calling Agent 🤖")
st.markdown("A LangGraph-powered AI assistant that can seamlessly execute tools to answer your questions.")

if "messages" not in st.session_state:
    st.session_state.messages = []

# Display chat history
for msg in st.session_state.messages:
    if isinstance(msg, HumanMessage):
        st.chat_message("user").write(msg.content)
    elif isinstance(msg, AIMessage):
        if msg.content:
            st.chat_message("assistant").write(msg.content)
        if hasattr(msg, 'tool_calls') and msg.tool_calls:
            for tc in msg.tool_calls:
                with st.chat_message("assistant"):
                    st.write(f"🔧 *Calling tool `{tc['name']}`...*")
    elif isinstance(msg, ToolMessage):
        with st.chat_message("assistant"):
            with st.expander(f"🛠️ Tool Result: {msg.name}"):
                st.write(msg.content)

# Clear button
if st.button("Clear Conversation"):
    st.session_state.messages = []
    st.rerun()

# User input
user_query = st.chat_input("Ask a question...")

if user_query:
    logger.info(f"\n[AGENT] Query: {user_query}")
    
    st.session_state.messages.append(HumanMessage(content=user_query))
    
    with st.spinner("Thinking..."):
        try:
            result = graph.invoke({"messages": st.session_state.messages})
            st.session_state.messages = result["messages"]
        except Exception as e:
            logger.error(f"[AGENT] Error during execution: {e}")
            st.error(f"An error occurred: {e}")
    
    st.rerun()
