"""Persistent conversation memory using LangGraph's SqliteSaver checkpointer.

This module provides a MemoryManager that wraps an SQLite-backed checkpoint
store. Every graph invocation with a `thread_id` config is automatically
persisted, and can be retrieved, listed, or deleted through the manager.
"""

import os
import sqlite3
import logging
from langgraph.checkpoint.sqlite import SqliteSaver

logger = logging.getLogger("agent")

# Default database path — stored alongside the knowledge base data
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "conversations.db")
DB_PATH = os.path.normpath(DB_PATH)


class MemoryManager:
    """Manages persistent conversation memory via SQLite checkpoints.

    Usage:
        manager = MemoryManager()
        checkpointer = manager.get_checkpointer()
        graph = workflow.compile(checkpointer=checkpointer)
    """

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        # SqliteSaver uses a raw sqlite3 connection (sync mode)
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._checkpointer = SqliteSaver(self._conn)

        logger.info(f"[MEMORY] Initialized SQLite checkpointer at {self.db_path}")

    def get_checkpointer(self) -> SqliteSaver:
        """Return the SqliteSaver instance for graph compilation."""
        return self._checkpointer

    def list_threads(self) -> list[str]:
        """List all unique thread IDs that have stored checkpoints."""
        try:
            cursor = self._conn.execute(
                "SELECT DISTINCT thread_id FROM checkpoints ORDER BY thread_id"
            )
            return [row[0] for row in cursor.fetchall()]
        except Exception as e:
            logger.error(f"[MEMORY] Failed to list threads: {e}")
            return []

    def delete_thread(self, thread_id: str) -> bool:
        """Delete all checkpoints and writes for a given thread (reset conversation)."""
        try:
            self._conn.execute(
                "DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,)
            )
            # Also clean up the writes table if it exists
            try:
                self._conn.execute(
                    "DELETE FROM writes WHERE thread_id = ?", (thread_id,)
                )
            except sqlite3.OperationalError:
                pass  # writes table may not exist in all versions
            self._conn.commit()
            logger.info(f"[MEMORY] Deleted thread: {thread_id}")
            return True
        except Exception as e:
            logger.error(f"[MEMORY] Failed to delete thread {thread_id}: {e}")
            return False

    def get_thread_history(self, thread_id: str) -> dict | None:
        """Retrieve the latest checkpoint state for a given thread.

        Returns the state dict (with 'messages', 'summary', etc.)
        or None if the thread has no history.
        """
        try:
            config = {"configurable": {"thread_id": thread_id}}
            checkpoint = self._checkpointer.get(config)
            if checkpoint and checkpoint.get("channel_values"):
                return checkpoint["channel_values"]
            return None
        except Exception as e:
            logger.error(f"[MEMORY] Failed to get history for thread {thread_id}: {e}")
            return None

    def close(self):
        """Close the underlying database connection."""
        try:
            self._conn.close()
            logger.info("[MEMORY] Database connection closed.")
        except Exception:
            pass


# Singleton instance
memory_manager = MemoryManager()
