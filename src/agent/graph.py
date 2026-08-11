import logging
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
from src.config import HUGGINGFACE_REPO_ID
from src.agent.state import AgentState
from src.tools.calculator import calculator
from src.tools.rag_tool import search_knowledge_base

logger = logging.getLogger("agent")

# Define tools
tools = [calculator, search_knowledge_base]

# Initialize LLM
endpoint = HuggingFaceEndpoint(
    repo_id=HUGGINGFACE_REPO_ID,
    task="text-generation",
    max_new_tokens=512,
    do_sample=False,
)
llm = ChatHuggingFace(llm=endpoint)
llm_with_tools = llm.bind_tools(tools)

# Define nodes
def agent_node(state: AgentState):
    logger.info("[AGENT] Generating response...")
    response = llm_with_tools.invoke(state["messages"])
    
    # Check if a tool was selected
    if response.tool_calls:
        logger.info(f"[AGENT] Tool selected: {response.tool_calls[0]['name']}")
    else:
        logger.info("[AGENT] Final response generated directly.")
        
    return {"messages": [response]}

# Build the graph
workflow = StateGraph(AgentState)

# Add nodes
workflow.add_node("agent", agent_node)
tool_node = ToolNode(tools)
workflow.add_node("tools", tool_node)

# Add edges
workflow.add_edge(START, "agent")
workflow.add_conditional_edges(
    "agent",
    tools_condition,
    {
        "tools": "tools",
        END: END
    }
)
workflow.add_edge("tools", "agent")

# Compile graph
graph = workflow.compile()
