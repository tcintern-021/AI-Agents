document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const sidebar = document.getElementById('sidebar');
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
    const newChatBtn = document.getElementById('newChatBtn');
    const sessionList = document.getElementById('sessionList');
    const clearChatBtn = document.getElementById('clearChatBtn');
    const chatContainer = document.getElementById('chatContainer');
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const chips = document.querySelectorAll('.chip');

    // Memory / Thread display elements
    const threadIdDisplay = document.getElementById('threadIdDisplay');
    const threadCountEl = document.getElementById('threadCount');
    const messageCountEl = document.getElementById('messageCount');
    const memorySummaryText = document.getElementById('memorySummaryText');
    const memorySummaryBadge = document.getElementById('memorySummaryBadge');

    // App State: LocalStorage Sessions Management
    const STORAGE_KEY = 'ai_agent_sessions_v2';
    let sessions = loadSessions();
    let currentSessionId = sessions.length > 0 ? sessions[0].id : null;

    // If no sessions exist, create one
    if (!currentSessionId) {
        currentSessionId = createNewSession();
    }

    // Initialize App UI
    renderSessionList();
    loadCurrentSessionChat();
    refreshThreadCount();

    // -----------------------------------------------------------------
    // UUID Generator
    // -----------------------------------------------------------------
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // -----------------------------------------------------------------
    // Session Management Functions
    // -----------------------------------------------------------------
    function loadSessions() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveSessions() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
        } catch (e) {
            console.error('Failed to save sessions:', e);
        }
    }

    function getCurrentSession() {
        let session = sessions.find(s => s.id === currentSessionId);
        if (!session) {
            currentSessionId = createNewSession();
            session = sessions.find(s => s.id === currentSessionId);
        }
        return session;
    }

    function createNewSession() {
        const threadId = generateUUID();
        const id = 'sess_' + Date.now();
        const newSession = {
            id,
            thread_id: threadId,
            title: 'New Conversation',
            messages: [
                {
                    role: 'assistant',
                    content: "Hello! I'm your AI Agent Assistant with persistent memory. I'll remember our conversation across messages. Ask me anything!"
                }
            ]
        };
        sessions.unshift(newSession);
        saveSessions();
        currentSessionId = id;
        renderSessionList();
        loadCurrentSessionChat();
        return id;
    }

    function renderSessionList() {
        sessionList.innerHTML = '';
        sessions.forEach(sess => {
            const div = document.createElement('div');
            div.className = `session-item ${sess.id === currentSessionId ? 'active' : ''}`;
            div.innerHTML = `
                <span class="session-title">${escapeHtml(sess.title)}</span>
                <button class="delete-session-btn" title="Delete Session">✕</button>
            `;

            div.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-session-btn')) {
                    e.stopPropagation();
                    deleteSession(sess.id);
                } else {
                    switchToSession(sess.id);
                }
            });

            sessionList.appendChild(div);
        });
    }

    function switchToSession(sessionId) {
        currentSessionId = sessionId;
        renderSessionList();
        loadCurrentSessionChat();
    }

    async function deleteSession(id) {
        const session = sessions.find(s => s.id === id);

        // Delete from server if thread exists
        if (session && session.thread_id) {
            try {
                await fetch(`/threads/${session.thread_id}`, { method: 'DELETE' });
            } catch (e) {
                console.warn('Failed to delete server thread:', e);
            }
        }

        sessions = sessions.filter(s => s.id !== id);
        if (sessions.length === 0) {
            createNewSession();
        } else {
            if (currentSessionId === id) {
                currentSessionId = sessions[0].id;
            }
            saveSessions();
            renderSessionList();
            loadCurrentSessionChat();
        }
        refreshThreadCount();
    }

    function updateSessionTitle(firstQuery) {
        const session = getCurrentSession();
        if (session && (session.title === 'New Conversation' || !session.title)) {
            session.title = firstQuery.slice(0, 30) + (firstQuery.length > 30 ? '...' : '');
            saveSessions();
            renderSessionList();
        }
    }

    async function loadCurrentSessionChat() {
        chatContainer.innerHTML = '';
        const session = getCurrentSession();

        // Update thread ID display
        if (threadIdDisplay && session.thread_id) {
            threadIdDisplay.textContent = session.thread_id.substring(0, 8) + '...';
        }

        // Try loading from server first
        if (session.thread_id) {
            try {
                const response = await fetch(`/threads/${session.thread_id}/history`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.messages && data.messages.length > 0) {
                        session.messages = data.messages;
                        saveSessions();
                        updateMemoryDisplay(data);
                    }
                }
            } catch (e) {
                console.warn('Could not fetch server history, using local:', e);
            }
        }

        // Render messages
        if (session && session.messages) {
            session.messages.forEach(msg => renderMessage(msg));
        }

        updateMessageCount();
    }

    function updateMemoryDisplay(data) {
        if (messageCountEl) {
            messageCountEl.textContent = data.message_count || data.messages?.length || 0;
        }
        if (memorySummaryText && data.summary) {
            memorySummaryText.textContent = 'Summary active';
            memorySummaryBadge.classList.add('active');
        } else if (memorySummaryText) {
            memorySummaryText.textContent = 'No summary';
            memorySummaryBadge.classList.remove('active');
        }
    }

    function updateMessageCount() {
        const session = getCurrentSession();
        if (messageCountEl) {
            const count = session.messages ? session.messages.filter(
                m => m.role === 'user' || m.role === 'assistant'
            ).length : 0;
            messageCountEl.textContent = count;
        }
    }

    async function refreshThreadCount() {
        try {
            const response = await fetch('/threads');
            if (response.ok) {
                const data = await response.json();
                if (threadCountEl) {
                    threadCountEl.textContent = data.count || 0;
                }
            }
        } catch (e) {
            if (threadCountEl) {
                threadCountEl.textContent = sessions.length;
            }
        }
    }

    // -----------------------------------------------------------------
    // Formatting & Rendering
    // -----------------------------------------------------------------
    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function parseMarkdown(text) {
        if (!text) return '';
        
        // Code blocks ```lang\ncode\n```
        let formatted = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const cleanLang = lang.trim() || 'plaintext';
            return `<pre><button class="copy-code-btn" onclick="copyCode(this)">Copy</button><code class="language-${cleanLang}">${escapeHtml(code.trim())}</code></pre>`;
        });

        // Inline code `code`
        formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // Bold **text**
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Line breaks
        formatted = formatted.replace(/\n/g, '<br>');

        return formatted;
    }

    function renderMessage(msg) {
        const row = document.createElement('div');
        row.className = `message-row ${msg.role}`;

        if (msg.role === 'user') {
            row.innerHTML = `
                <span class="sender-label">You</span>
                <div class="message-bubble">${escapeHtml(msg.content)}</div>
            `;
        } else if (msg.role === 'assistant') {
            let html = '<span class="sender-label">AI Assistant</span>';
            
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                msg.tool_calls.forEach(tc => {
                    html += `
                        <div class="tool-call-pill">
                            <span>⚙️</span>
                            <span>Executing Tool: <strong>${escapeHtml(tc.name)}</strong></span>
                        </div>
                    `;
                });
            }

            if (msg.content) {
                html += `<div class="message-bubble">${parseMarkdown(msg.content)}</div>`;
            }

            row.innerHTML = html;
        } else if (msg.role === 'tool') {
            row.innerHTML = `
                <div class="tool-result-card">
                    <div class="tool-result-header">
                        <span>⚙️ EXECUTION RESULT</span>
                        <span>${escapeHtml(msg.name)}</span>
                    </div>
                    <div>${escapeHtml(msg.content)}</div>
                </div>
            `;
        }

        chatContainer.appendChild(row);
        
        // Trigger Highlight.js on code blocks
        row.querySelectorAll('pre code').forEach((block) => {
            if (window.hljs) {
                window.hljs.highlightElement(block);
            }
        });

        scrollToBottom();
    }

    function showLoading() {
        const row = document.createElement('div');
        row.className = 'message-row assistant';
        row.id = 'loadingIndicator';
        row.innerHTML = `
            <span class="sender-label">AI Assistant</span>
            <div class="loading-dots">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        `;
        chatContainer.appendChild(row);
        scrollToBottom();
    }

    function hideLoading() {
        const indicator = document.getElementById('loadingIndicator');
        if (indicator) indicator.remove();
    }

    // -----------------------------------------------------------------
    // Chat Submission Logic — Thread-Aware
    // -----------------------------------------------------------------
    async function handleSend(queryText) {
        const text = queryText || userInput.value.trim();
        if (!text) return;

        userInput.value = '';
        userInput.disabled = true;
        sendBtn.disabled = true;

        const session = getCurrentSession();
        updateSessionTitle(text);

        // Add user message locally
        const userMsg = { role: 'user', content: text };
        session.messages.push(userMsg);
        saveSessions();
        renderMessage(userMsg);

        showLoading();

        try {
            // Send only the new message + thread_id to the server
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    thread_id: session.thread_id,
                })
            });

            if (!response.ok) throw new Error(`Status ${response.status}`);

            const data = await response.json();
            hideLoading();

            if (data.messages && data.messages.length > 0) {
                // Store the thread_id returned by server (in case it was auto-generated)
                if (data.thread_id) {
                    session.thread_id = data.thread_id;
                }

                const prevCount = session.messages.length;
                session.messages = data.messages;
                saveSessions();

                // Render only new messages
                for (let i = prevCount; i < session.messages.length; i++) {
                    renderMessage(session.messages[i]);
                }

                // Update memory display
                updateMemoryDisplay(data);
                updateMessageCount();
                refreshThreadCount();
            }
        } catch (err) {
            hideLoading();
            renderMessage({
                role: 'assistant',
                content: `⚠️ Error connecting to server: ${err.message}`
            });
        } finally {
            userInput.disabled = false;
            sendBtn.disabled = false;
            userInput.focus();
        }
    }

    // Copy Code Helper
    window.copyCode = function(button) {
        const pre = button.parentElement;
        const code = pre.querySelector('code');
        if (code) {
            navigator.clipboard.writeText(code.innerText).then(() => {
                button.textContent = 'Copied!';
                setTimeout(() => button.textContent = 'Copy', 2000);
            });
        }
    };

    // -----------------------------------------------------------------
    // Event Listeners
    // -----------------------------------------------------------------
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSend();
    });

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const query = chip.getAttribute('data-query');
            if (query) handleSend(query);
        });
    });

    newChatBtn.addEventListener('click', () => {
        createNewSession();
        refreshThreadCount();
    });

    clearChatBtn.addEventListener('click', async () => {
        const session = getCurrentSession();
        if (session) {
            // Delete from server
            if (session.thread_id) {
                try {
                    await fetch(`/threads/${session.thread_id}`, { method: 'DELETE' });
                } catch (e) {
                    console.warn('Failed to clear server thread:', e);
                }
            }

            // Reset locally with a new thread_id
            session.thread_id = generateUUID();
            session.messages = [
                {
                    role: 'assistant',
                    content: "Conversation reset! Memory has been cleared. What would you like to explore next?"
                }
            ];
            saveSessions();
            loadCurrentSessionChat();
            refreshThreadCount();
        }
    });

    sidebarToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });

    if (sidebarCloseBtn) {
        sidebarCloseBtn.addEventListener('click', () => {
            sidebar.classList.add('collapsed');
        });
    }
});
