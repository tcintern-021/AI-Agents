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

    // Telemetry Steps
    const stepUser = document.getElementById('stepUser');
    const stepAgent = document.getElementById('stepAgent');
    const stepTool = document.getElementById('stepTool');
    const stepResponse = document.getElementById('stepResponse');
    const conn1 = document.getElementById('conn1');
    const conn2 = document.getElementById('conn2');
    const conn3 = document.getElementById('conn3');

    // App State: LocalStorage Sessions Management
    const STORAGE_KEY = 'ai_agent_sessions_v1';
    let sessions = loadSessions();
    let currentSessionId = sessions.length > 0 ? sessions[0].id : createNewSession();

    // Initialize App UI
    renderSessionList();
    loadCurrentSessionChat();

    // -------------------------------------------------------------
    // Session Management Functions
    // -------------------------------------------------------------
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
        const id = 'sess_' + Date.now();
        const newSession = {
            id,
            title: 'New Conversation',
            messages: [
                {
                    role: 'assistant',
                    content: "Hello! I'm your AI Tool-Calling Assistant. Ask me anything, or give me a calculation / knowledge base question!"
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
                    currentSessionId = sess.id;
                    renderSessionList();
                    loadCurrentSessionChat();
                }
            });

            sessionList.appendChild(div);
        });
    }

    function deleteSession(id) {
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
    }

    function updateSessionTitle(firstQuery) {
        const session = getCurrentSession();
        if (session && (session.title === 'New Conversation' || !session.title)) {
            session.title = firstQuery.slice(0, 30) + (firstQuery.length > 30 ? '...' : '');
            saveSessions();
            renderSessionList();
        }
    }

    function loadCurrentSessionChat() {
        chatContainer.innerHTML = '';
        const session = getCurrentSession();
        if (session && session.messages) {
            session.messages.forEach(msg => renderMessage(msg));
        }
        resetTelemetryFlow();
    }

    // -------------------------------------------------------------
    // Telemetry Pipeline Flow Controller
    // -------------------------------------------------------------
    function resetTelemetryFlow() {
        stepUser.className = 'flow-step step-user active';
        stepAgent.className = 'flow-step step-agent';
        stepTool.className = 'flow-step step-tool';
        stepResponse.className = 'flow-step step-response';
        conn1.className = 'flow-connector';
        conn2.className = 'flow-connector';
        conn3.className = 'flow-connector';
    }

    function updateTelemetryFlow(phase) {
        resetTelemetryFlow();
        if (phase === 'input') {
            stepUser.classList.add('active');
        } else if (phase === 'agent') {
            stepUser.classList.add('active');
            conn1.classList.add('active');
            stepAgent.classList.add('active');
        } else if (phase === 'tool') {
            stepUser.classList.add('active');
            conn1.classList.add('active');
            stepAgent.classList.add('active');
            conn2.classList.add('active');
            stepTool.classList.add('active');
        } else if (phase === 'response') {
            stepUser.classList.add('active');
            conn1.classList.add('active');
            stepAgent.classList.add('active');
            conn2.classList.add('active');
            stepTool.classList.add('active');
            conn3.classList.add('active');
            stepResponse.classList.add('active');
        }
    }

    // -------------------------------------------------------------
    // Formatting & Rendering
    // -------------------------------------------------------------
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
        
        // 1. Code blocks ```lang\ncode\n```
        let formatted = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const cleanLang = lang.trim() || 'plaintext';
            return `<pre><button class="copy-code-btn" onclick="copyCode(this)">Copy</button><code class="language-${cleanLang}">${escapeHtml(code.trim())}</code></pre>`;
        });

        // 2. Inline code `code`
        formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // 3. Bold **text**
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // 4. Line breaks
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
                            <span>🔧</span>
                            <span>Executing tool: <strong>${escapeHtml(tc.name)}</strong></span>
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
                        <span>🛠️ Execution Result</span>
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

    // -------------------------------------------------------------
    // Chat Submission Logic
    // -------------------------------------------------------------
    async function handleSend(queryText) {
        const text = queryText || userInput.value.trim();
        if (!text) return;

        userInput.value = '';
        userInput.disabled = true;
        sendBtn.disabled = true;

        const session = getCurrentSession();
        updateSessionTitle(text);

        // Add user message
        const userMsg = { role: 'user', content: text };
        session.messages.push(userMsg);
        saveSessions();
        renderMessage(userMsg);

        updateTelemetryFlow('agent');
        showLoading();

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: session.messages })
            });

            if (!response.ok) throw new Error(`Status ${response.status}`);

            const data = await response.json();
            hideLoading();

            if (data.messages && data.messages.length > 0) {
                const prevCount = session.messages.length;
                session.messages = data.messages;
                saveSessions();

                let executedTool = false;
                for (let i = prevCount; i < session.messages.length; i++) {
                    const m = session.messages[i];
                    if (m.role === 'tool' || (m.tool_calls && m.tool_calls.length > 0)) {
                        executedTool = true;
                    }
                    renderMessage(m);
                }

                if (executedTool) {
                    updateTelemetryFlow('tool');
                    setTimeout(() => updateTelemetryFlow('response'), 800);
                } else {
                    updateTelemetryFlow('response');
                }
            }
        } catch (err) {
            hideLoading();
            renderMessage({
                role: 'assistant',
                content: `⚠️ Error connecting to server: ${err.message}`
            });
            updateTelemetryFlow('input');
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

    // -------------------------------------------------------------
    // Event Listeners
    // -------------------------------------------------------------
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
    });

    clearChatBtn.addEventListener('click', () => {
        const session = getCurrentSession();
        if (session) {
            session.messages = [
                {
                    role: 'assistant',
                    content: "Conversation reset! What would you like to explore next?"
                }
            ];
            saveSessions();
            loadCurrentSessionChat();
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
