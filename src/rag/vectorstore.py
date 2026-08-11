import os
import logging
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from langchain_community.vectorstores import FAISS

logger = logging.getLogger("agent")

class KnowledgeBase:
    def __init__(self, file_path="data/knowledge_base.txt"):
        self.file_path = file_path
        self.vectorstore = None
        self._initialize()

    def _initialize(self):
        try:
            if not os.path.exists(self.file_path):
                logger.warning(f"[RAG] Knowledge base file {self.file_path} not found.")
                return

            loader = TextLoader(self.file_path)
            docs = loader.load()

            text_splitter = RecursiveCharacterTextSplitter(chunk_size=200, chunk_overlap=50)
            splits = text_splitter.split_documents(docs)

            embeddings = HuggingFaceEndpointEmbeddings(model="sentence-transformers/all-MiniLM-L6-v2")
            self.vectorstore = FAISS.from_documents(splits, embeddings)
        except Exception as e:
            logger.error(f"[RAG] Failed to initialize vectorstore: {e}")

    def search(self, query: str, k: int = 3) -> str:
        if not self.vectorstore:
            return "Knowledge base is not available."
        
        try:
            docs = self.vectorstore.similarity_search(query, k=k)
            if not docs:
                return "No relevant information found in the knowledge base."
            
            context = "\n\n".join(doc.page_content for doc in docs)
            return context
        except Exception as e:
            logger.error(f"[RAG] Search failed: {e}")
            return "Error retrieving information from the knowledge base."

# Singleton instance
kb = KnowledgeBase()
