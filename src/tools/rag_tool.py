import logging
from langchain_core.tools import tool
from src.rag.vectorstore import kb

logger = logging.getLogger("agent")

@tool
def search_knowledge_base(query: str) -> str:
    """Search the company knowledge base for information about company overview, 
    working hours, leave policy, technology stack, AI team, and project rules.
    Input should be a natural language question.
    """
    logger.info(f"[TOOL] Arguments: {query}")
    try:
        result = kb.search(query)
        logger.info(f"[TOOL] Result: Retrieved context.")
        return result
    except Exception as e:
        logger.error(f"[TOOL] Error in RAG tool: {e}")
        return "Failed to search the knowledge base."
