document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chatContainer');
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const chips = document.querySelectorAll('.chip');

    // In-memory conversation state
    let messages = [];

    // Scroll chat to bottom
    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // Render single message object
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
            
            // Check if tool calls exist
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                msg.tool_calls.forEach(tc => {
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
        } else if (msg.role === 'tool') {
            row.innerHTML = `
                <div class="tool-result-card">
                    <div class="tool-result-header">
                        <span>🛠️ Tool Execution Output</span>
                        <span>${escapeHtml(msg.name)}</span>
                    </div>
                    <div>${escapeHtml(msg.content)}</div>
                </div>
            `;
        }

        chatContainer.appendChild(row);
        scrollToBottom();
    }

    // Show loading spinner
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

    // Remove loading spinner
    function hideLoading() {
        const indicator = document.getElementById('loadingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }

    // Helper functions
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatContent(content) {
        // Simple markdown line breaks & bold formatting
        return escapeHtml(content)
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    }

    // Send query to backend
    async function handleSend(queryText) {
        const text = queryText || userInput.value.trim();
        if (!text) return;

        userInput.value = '';
        userInput.disabled = true;
        sendBtn.disabled = true;

        // Add user message to state
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
                // Update messages state and render newly received messages
                const previousCount = messages.length;
                messages = data.messages;

                for (let i = previousCount; i < messages.length; i++) {
                    renderMessage(messages[i]);
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

    // Event listeners
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSend();
    });

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const query = chip.getAttribute('data-query');
            if (query) {
                handleSend(query);
            }
        });
    });

    clearBtn.addEventListener('click', () => {
        messages = [];
        chatContainer.innerHTML = `
            <div class="message-row assistant">
                <span class="sender-label">AI Assistant</span>
                <div class="message-bubble">
                    Conversation cleared! How can I assist you now?
                </div>
            </div>
        `;
    });
});
