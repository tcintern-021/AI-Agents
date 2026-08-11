import os
import logging
from dotenv import load_dotenv

load_dotenv()

# Setup structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s'
)
logger = logging.getLogger("agent")

HUGGINGFACEHUB_API_TOKEN = os.getenv("HUGGINGFACEHUB_API_TOKEN")
HUGGINGFACE_REPO_ID = os.getenv("HUGGINGFACE_REPO_ID", "meta-llama/Meta-Llama-3-8B-Instruct")
