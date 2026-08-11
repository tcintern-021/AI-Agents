# AI Tool-Calling Agent

## Description
This project implements a sophisticated AI Assistant capable of determining when to use external tools, executing them, and using their results to formulate a final response. It demonstrates a complete AI agent workflow using LangChain and LangGraph, wrapping it in a simple Streamlit interface.

## Architecture
```text
User
 ↓
LLM Agent
 ↓
Tool Selection
 ↓
Calculator / RAG
 ↓
Tool Result
 ↓
LLM
 ↓
Final Response
```

## Features
- **Tool Calling**: The agent correctly determines if a tool is needed based on the user's query.
- **Function Calling**: LLM natively triggers Python functions with correctly structured arguments.
- **LangChain**: Used for core tool definitions, vector stores, and model orchestration.
- **LangGraph**: Orchestrates the state-based agent workflow (agent -> tool -> agent).
- **RAG**: A local knowledge base with a RAG tool for information retrieval.
- **Error Handling**: Graceful error management for invalid inputs or execution failures.
- **Logging**: Detailed execution logs.
- **LangSmith**: Native tracing integration for observability.
- **Streamlit**: Minimal professional UI.

## Installation

1. Create a virtual environment:
```bash
python -m venv .venv
```

2. Activate the virtual environment:
- Windows:
```bash
.venv\Scripts\activate
```
- macOS/Linux:
```bash
source .venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Configuration

Copy `.env.example` to `.env` and fill in your details:
```bash
cp .env.example .env
```
Ensure you have `OPENAI_API_KEY` set.

## Running

Start the Streamlit application:
```bash
streamlit run app.py
```

## Example Queries

Try asking the agent:
- "Calculate 125 * 37" (Triggers Calculator)
- "What are the working hours?" (Triggers RAG Tool)
- "What technologies does the project use?" (Triggers RAG Tool)
- "What is machine learning?" (Answers directly without tools)

## Agent Workflow
The agent uses LangGraph to manage state. The user query is passed to an LLM node that can output tool calls. If tool calls are present, execution is routed to a Tool Node, which executes the corresponding tools and passes the results back to the LLM node for a final cohesive response.

## LangSmith
To enable tracing for observability:
1. Sign up at https://smith.langchain.com/
2. Generate an API key.
3. In your `.env` file, set `LANGCHAIN_TRACING_V2=true` and provide your `LANGCHAIN_API_KEY`.
Tracing will be enabled automatically.

## Deployment
To deploy this Streamlit app, you can use Streamlit Community Cloud:
1. Push this repository to GitHub.
2. Go to [share.streamlit.io](https://share.streamlit.io) and link your GitHub account.
3. Select this repository and the `app.py` file.
4. Add your `.env` variables to the "Advanced Settings -> Secrets" in Streamlit Cloud.
5. Deploy!

## Interview Concepts
- **Function calling**: The ability of an LLM to generate structured JSON payloads describing a function signature to execute.
- **Tool calling**: The actual execution of the function by the application based on the LLM's function call.
- **Agent vs LLM**: An LLM is a text-generation model. An Agent is a system that uses an LLM to make decisions, execute tools, and orchestrate a workflow to achieve a goal.
- **LangGraph**: A library for building stateful, multi-actor applications with LLMs.
- **RAG**: Retrieval-Augmented Generation, injecting relevant retrieved context into the LLM prompt.
- **Tool result flow**: Passing the execution output of a tool back as a distinct "Tool Message" so the LLM understands what happened.
