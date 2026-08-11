document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chatContainer');
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const exportBtn = document.getElementById('exportBtn');
    const toggleSidebar = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('sidebar');
    const themeSelect = document.getElementById('themeSelect');
    const queryCountEl = document.getElementById('queryCount');
    const toolCountEl = document.getElementById('toolCount');
    const chips = document.querySelectorAll('.chip');

    // State
    let messages = [];
    let queryCount = 0;
    let toolCount = 0;

    // Theme Picker
    const savedTheme = localStorage.getItem('agent_theme') || 'cyber';
    document.body.setAttribute('data-theme', savedTheme);
    themeSelect.value = savedTheme;

    themeSelect.addEventListener('change', (e) => {
        const theme = e.target.value;
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('agent_theme', theme);
    });

    // Sidebar Toggle
    toggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });

    // Scroll to bottom
    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Escape HTML helper
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Format content markdown
    function formatContent(content) {
        return escapeHtml(content)
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;">$1</code>');
    }

    // Render single message
    function renderMessage(msg, animate = false) {
        const row = document.createElement('div');
        row.className = `message-row ${msg.role}`;

        if (msg.role === 'user') {
            row.innerHTML = `
                <div class="message-header">
                    <span class="sender-label">You</span>
                </div>
                <div class="message-bubble">${escapeHtml(msg.content)}</div>
            `;
        } else if (msg.role === 'assistant') {
            let html = `
                <div class="message-header">
                    <span class="sender-label">AI Assistant</span>
                    <button class="copy-btn" title="Copy message">Copy</button>
                </div>
            `;
            
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                msg.tool_calls.forEach(tc => {
                    toolCount++;
                    toolCountEl.textContent = toolCount;
                    html += `
                        <div class="tool-call-pill">
                            <span>🔧</span>
                            <span>Executing tool <strong>${escapeHtml(tc.name)}</strong>...</span>
                        </div>
                    `;
                });
            }

            if (msg.content) {
                html += `<div class="message-bubble">${formatContent(msg.content)}</div>`;
            }

            row.innerHTML = html;

            // Bind copy button
            const copyBtn = row.querySelector('.copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(msg.content || '');
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
                });
            }
        } else if (msg.role === 'tool') {
            row.innerHTML = `
                <div class="tool-accordion">
                    <div class="tool-accordion-header">
                        <span>🛠️ Tool Execution Output (${escapeHtml(msg.name)})</span>
                        <span>▼</span>
                    </div>
                    <div class="tool-accordion-body">${escapeHtml(msg.content)}</div>
                </div>
            `;

            // Toggle accordion
            const header = row.querySelector('.tool-accordion-header');
            const body = row.querySelector('.tool-accordion-body');
            header.addEventListener('click', () => {
                const isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'block';
                header.querySelector('span:last-child').textContent = isOpen ? '▶' : '▼';
            });
        }

        chatContainer.appendChild(row);
        scrollToBottom();
    }

    // Loading indicator
    function showLoading() {
        const row = document.createElement('div');
        row.className = 'message-row assistant';
        row.id = 'loadingIndicator';
        row.innerHTML = `
            <div class="message-header">
                <span class="sender-label">AI Assistant</span>
            </div>
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

    // Handle user query submission
    async function handleSend(queryText) {
        const text = queryText || userInput.value.trim();
        if (!text) return;

        userInput.value = '';
        userInput.disabled = true;
        sendBtn.disabled = true;

        queryCount++;
        queryCountEl.textContent = queryCount;

        const userMsg = { role: 'user', content: text };
        messages.push(userMsg);
        renderMessage(userMsg);

        showLoading();

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages })
            });

            if (!response.ok) {
                throw new Error(`Server returned status ${response.status}`);
            }

            const data = await response.json();
            hideLoading();

            if (data.messages && data.messages.length > 0) {
                const previousCount = messages.length;
                messages = data.messages;

                for (let i = previousCount; i < messages.length; i++) {
                    renderMessage(messages[i], true);
                }
            }
        } catch (err) {
            hideLoading();
            renderMessage({
                role: 'assistant',
                content: `⚠️ Error communicating with server: ${err.message}`
            });
        } finally {
            userInput.disabled = false;
            sendBtn.disabled = false;
            userInput.focus();
        }
    }

    // Form submission
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSend();
    });

    // Prompt chips
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const query = chip.getAttribute('data-query');
            if (query) handleSend(query);
        });
    });

    // Clear chat
    clearBtn.addEventListener('click', () => {
        messages = [];
        queryCount = 0;
        toolCount = 0;
        queryCountEl.textContent = '0';
        toolCountEl.textContent = '0';
        chatContainer.innerHTML = `
            <div class="message-row assistant">
                <div class="message-header">
                    <span class="sender-label">AI Assistant</span>
                </div>
                <div class="message-bubble">
                    Conversation reset. How can I help you next?
                </div>
            </div>
        `;
    });

    // Export Chat Markdown
    exportBtn.addEventListener('click', () => {
        if (messages.length === 0) return;
        let markdown = `# AI Agent Studio - Chat Transcript\n\n`;
        messages.forEach(m => {
            markdown += `### ${m.role.toUpperCase()}\n${m.content || ''}\n\n`;
        });
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-transcript-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
    });
});
