// --- DOM Element References ---
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const loadingIndicator = document.getElementById('loading');
const initialPrompt = document.getElementById('initial-prompt');
const modelDisplayTrigger = document.getElementById('model-display-trigger');
const currentModelNameDisplay = document.getElementById('current-model-name-display');
const modelSelector = document.getElementById('model-selector');
const newChatButton = document.getElementById('new-chat-button');
const conversationList = document.getElementById('conversation-list');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle'); // Ensure this ID exists in HTML

// --- State Variables ---
let accessToken = null;
let androidId = null;
let currentModel = { // Default model
    id: "anthropic/claude-3.7-sonnet", model: "Claude", version: "3.7",
    icon: "https://d3g322f8itkvhj.cloudfront.net/static/logo/Claude.png"
};
let availableModels = [];
let allConversations = [];
let currentConversationId = null;

// --- Constants ---
const STORAGE_KEY = 'chatAppConversations_v3';
const CORS_PROXY_URL = 'https://cors-proxy-19ea.onrender.com/'; // هام: استبدل هذا بعنوان الخادم الوكيل الفعلي الذي أعددته

// --- localStorage Helper Functions ---
function saveConversationsToStorage() {
    try {
        const dataToSave = { conversations: allConversations, lastActiveId: currentConversationId };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (e) { console.error("Failed to save conversations:", e); }
}

function loadConversationsFromStorage() {
    try {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            const parsedData = JSON.parse(storedData);
            if (parsedData && Array.isArray(parsedData.conversations)) {
                allConversations = parsedData.conversations;
                allConversations.forEach(conv => { if (!conv.apiSessionId) conv.apiSessionId = generateSessionId(); });
                currentConversationId = parsedData.lastActiveId || null;
                return true;
            } else { console.error("Invalid stored data structure."); allConversations = []; currentConversationId = null; return false; }
        }
    } catch (e) { console.error("Failed to load conversations:", e); allConversations = []; currentConversationId = null; }
    return false;
}

// --- Unique ID Generation ---
function generateUniqueId() { return Date.now().toString(36) + Math.random().toString(36).substring(2); }

// --- API Session ID Generation ---
function generateSessionId() {
    const fixedPart = "0180a4f6-612e-793d-a85b-"; const hexChars = "0123456789abcdef"; let randomPart = '';
    for (let i = 0; i < 12; i++) { randomPart += hexChars.charAt(Math.floor(Math.random() * hexChars.length)); }
    return fixedPart + randomPart;
}

// --- API Token Fetching ---
async function getAccessToken() {
    try {
        const randomSecret = crypto.randomUUID();
        const randomAndroidId = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('');
        const targetUrl = "https://saas.castbox.fm/auth/api/v1/tokens/provider/secret";
        const response = await fetch(CORS_PROXY_URL + targetUrl, {
            method: 'POST',
            headers: {
                'User-Agent': "Dart/3.3 (dart:io)", 'Accept-Encoding': "gzip", 'Content-Type': "application/json", 'x-app-id': "ai-seek",
                'x-device-info': `appIdentifier=ai.chatbot.ask.chat.deep.seek.assistant.search.free;appVersion=1.5.${Math.floor(Math.random() * 10)}-25040965;deviceType=android;deviceCountry=US;appCountry=us;local=en_US;language=en;timezone=Asia/Baghdad;brand=realme;model=RMX${Math.floor(1000 + Math.random() * 9000)};androidId=${randomAndroidId}`,
                'x-access-token': ""
            }, body: JSON.stringify({ "secret": randomSecret })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.data && data.data.token) { return { token: data.data.token, androidId: randomAndroidId }; }
        else { throw new Error("Token not found in response"); }
    } catch (error) { console.error("Error getting token:", error); return { token: null, androidId: null }; }
}

// --- Model Selection Functions ---
async function fetchAvailableModels() {
    try {
        if (!accessToken || !androidId) {
            const tokenData = await getAccessToken(); accessToken = tokenData.token; androidId = tokenData.androidId;
            if (!accessToken) throw new Error("Cannot get access token");
        }
        const response = await fetch("https://ai-seek.thebetter.ai/v1/chat/list_models", {
             method: 'GET',
             headers: {
                'User-Agent': "Dart/3.3 (dart:io)", 'Accept-Encoding': "gzip", 'x-app-id': "ai-seek",
                'x-device-info': `appIdentifier=ai.chatbot.ask.chat.deep.seek.assistant.search.free;appVersion=1.5.2-25040965;deviceType=android;deviceCountry=US;appCountry=us;local=en_US;language=en;timezone=Asia/Baghdad;brand=realme;model=RMX1931;androidId=${androidId}`,
                'content-type': "application/json", 'x-access-token': accessToken
             }
        });
        const data = await response.json();
        if (data.data && data.data.models) { availableModels = data.data.models; populateModelSelector(); return data.data.models; }
        else { throw new Error("Model list not found"); }
    } catch (error) { console.error("Error fetching models:", error); if (modelDisplayTrigger) modelDisplayTrigger.style.display = 'none'; return []; }
}

function populateModelSelector() {
    if (!modelSelector) return;
    modelSelector.innerHTML = '';
    availableModels.forEach(model => {
        const modelItem = document.createElement('div'); modelItem.className = 'model-item';
        if (model.id === currentModel.id) modelItem.classList.add('selected-model');
        modelItem.innerHTML = `
            <img src="${model.icon}" alt="${model.model}">
            <div class="model-info"> <div class="model-name">${model.model}</div> <div class="model-version">${model.version}</div> </div>
            ${model.paidOnly ? '<span class="model-badge">مدفوع</span>' : ''}
        `;
        modelItem.addEventListener('click', () => { selectModel(model); toggleModelSelector(); });
        modelSelector.appendChild(modelItem);
    });
}

function selectModel(model) {
    currentModel = { id: model.id, model: model.model, version: model.version, icon: model.icon };
    if (currentModelNameDisplay) currentModelNameDisplay.textContent = `${model.model} ${model.version}`;
    const modelItems = modelSelector.querySelectorAll('.model-item');
    modelItems.forEach(item => item.classList.remove('selected-model'));
    availableModels.forEach((m, index) => { if (m.id === model.id && modelItems[index]) modelItems[index].classList.add('selected-model'); });
}

function toggleModelSelector() {
    console.log("[Debug] toggleModelSelector called."); // Debug log
    if (!modelSelector) { console.error("[Debug] modelSelector element not found!"); return; }
    const isVisible = modelSelector.style.display === 'block';
    console.log(`[Debug] Model selector is currently ${isVisible ? 'visible' : 'hidden'}. Toggling.`); // Debug log
    modelSelector.style.display = isVisible ? 'none' : 'block';
}

// --- Conversation Management Functions ---
function renderConversationList() {
    if (!conversationList) return;
    conversationList.innerHTML = '';
    allConversations.sort((a, b) => (b.messages[b.messages.length - 1]?.timestamp || b.createdAt) - (a.messages[a.messages.length - 1]?.timestamp || a.createdAt));
    allConversations.forEach(conv => {
        const listItem = document.createElement('li'); listItem.className = 'conversation-item'; listItem.dataset.conversationId = conv.id;
        listItem.textContent = conv.title || 'محادثة جديدة';
        if (conv.id === currentConversationId) listItem.classList.add('active');
        listItem.addEventListener('click', () => loadConversation(conv.id));
        conversationList.appendChild(listItem);
    });
}

function loadConversation(conversationId) {
    const conversation = allConversations.find(conv => conv.id === conversationId);
    if (!conversation) { console.error("Conv not found:", conversationId); startNewConversation(); return; }
    if (!conversation.apiSessionId) { conversation.apiSessionId = generateSessionId(); console.log(`Generated missing apiSessionId for loaded conversation ${conversationId}`); }
    currentConversationId = conversationId;
    chatMessages.innerHTML = '';
    conversation.messages.forEach(msg => { const messageElement = renderMessageDOM(msg.content, msg.isUser); chatMessages.appendChild(messageElement); });
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(chatMessages);
    }
    checkInitialPromptVisibility();
    renderConversationList();
    saveConversationsToStorage();
}

function startNewConversation() {
    const newId = generateUniqueId();
    const newApiSessionId = generateSessionId();
    const newConversation = { id: newId, title: "محادثة جديدة", messages: [], createdAt: Date.now(), apiSessionId: newApiSessionId };
    allConversations.unshift(newConversation);
    currentConversationId = newId;
    chatMessages.innerHTML = '';
    checkInitialPromptVisibility();
    renderConversationList();
    saveConversationsToStorage();
}

// --- Message Rendering (DOM only) ---
function renderMessageDOM(messageContent, isUser, targetElement = null) {
    const messageElement = targetElement || document.createElement('div');
    if (!targetElement) { messageElement.className = `message ${isUser ? 'user-message' : 'bot-message'}`; }
    else { messageElement.innerHTML = ''; }

    const firstChar = messageContent.trim().charAt(0);
    const isLikelyLTR = firstChar && ( (firstChar >= 'a' && firstChar <= 'z') || (firstChar >= 'A' && firstChar <= 'Z') || (firstChar >= '0' && firstChar <= '9') || '!@#$%^&*()_+=-[]{};:\'",.<>/?`~'.includes(firstChar) );
    messageElement.classList.toggle('message-ltr', isLikelyLTR);

    const codeBlockPattern = /```(?:(\w*)\n([\s\S]*?)```|(\w*)\n([\s\S]*)$)/g;
    let lastIndexProcessed = 0; let matchResult;
    while ((matchResult = codeBlockPattern.exec(messageContent)) !== null) {
        if (matchResult.index > lastIndexProcessed) { messageElement.appendChild(document.createTextNode(messageContent.substring(lastIndexProcessed, matchResult.index))); }
        let language, codeTextValue;
        const isCompleteBlock = matchResult[2] !== undefined;
        if (isCompleteBlock) { language = matchResult[1]; codeTextValue = matchResult[2].trim(); }
        else { language = matchResult[3]; codeTextValue = matchResult[4]; }
        const container = document.createElement('div'); container.className = 'code-block-container';
        const copyBtn = document.createElement('button'); copyBtn.className = 'copy-code-button'; copyBtn.textContent = 'نسخ';
        const pre = document.createElement('pre'); const code = document.createElement('code');
        if (language) code.className = `language-${language}`;
        code.textContent = codeTextValue;
        // Restore full copy logic
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(code.textContent).then(() => {
                copyBtn.textContent = 'تم النسخ!'; copyBtn.classList.add('copied');
                setTimeout(() => { copyBtn.textContent = 'نسخ'; copyBtn.classList.remove('copied'); }, 2000);
            }).catch(err => { console.error('Copy failed', err); copyBtn.textContent = 'فشل النسخ'; });
        });
        pre.appendChild(code);
        if (language) {
            const header = document.createElement('div'); header.className = 'code-block-header';
            const langSpan = document.createElement('span'); langSpan.textContent = language;
            header.appendChild(langSpan); header.appendChild(copyBtn); container.appendChild(header);
        } else { container.appendChild(copyBtn); }
        container.appendChild(pre); messageElement.appendChild(container);
        lastIndexProcessed = codeBlockPattern.lastIndex;
    }
    if (lastIndexProcessed < messageContent.length) { messageElement.appendChild(document.createTextNode(messageContent.substring(lastIndexProcessed))); }
    if (!messageElement.hasChildNodes() && messageContent.length > 0) { messageElement.appendChild(document.createTextNode(messageContent)); }
    return messageElement;
}

// --- Add Message to Chat (Handles Saving & Appending/Updating) ---
function addMessageToChat(messageContent, isUser, targetElement = null) {
    const messageElement = renderMessageDOM(messageContent, isUser, targetElement);
    if (!targetElement) {
        chatMessages.appendChild(messageElement);
        const conversation = allConversations.find(conv => conv.id === currentConversationId);
        if (conversation) {
            const messageData = { content: messageContent, isUser: isUser, timestamp: Date.now() };
            conversation.messages.push(messageData);
            let titleUpdated = false;
            if (conversation.messages.length === 1 && isUser) {
                conversation.title = messageContent.substring(0, 30) + (messageContent.length > 30 ? '...' : '');
                titleUpdated = true;
            }
            saveConversationsToStorage();
            if (titleUpdated) renderConversationList();
        } else {
             console.warn("No active conv found when saving. ID:", currentConversationId);
             if (!allConversations.find(c => c.id === currentConversationId)) {
                 startNewConversation();
                 const newConv = allConversations.find(conv => conv.id === currentConversationId);
                 if (newConv) {
                     const messageData = { content: messageContent, isUser: isUser, timestamp: Date.now() };
                     newConv.messages.push(messageData);
                     newConv.title = messageContent.substring(0, 30) + (messageContent.length > 30 ? '...' : '');
                     saveConversationsToStorage();
                     renderConversationList();
                 }
             }
        }
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
    checkInitialPromptVisibility();
}

// --- Send Message to API ---
async function sendMessage(message) {
    let conversation = allConversations.find(conv => conv.id === currentConversationId);
    if (!conversation) { startNewConversation(); conversation = allConversations.find(conv => conv.id === currentConversationId); if (!conversation) { addMessageToChat("Error starting chat.", false); return; } }
    if (!conversation.apiSessionId) { conversation.apiSessionId = generateSessionId(); saveConversationsToStorage(); console.log(`Generated missing apiSessionId for conv ${conversation.id}`); }
    const apiSessionIdForRequest = conversation.apiSessionId;

    addMessageToChat(message, true); // Add user msg

    try {
        showLoading(true);
        if (!accessToken || !androidId) {
             const tokenData = await getAccessToken(); accessToken = tokenData.token; androidId = tokenData.androidId;
             if (!accessToken) throw new Error("Cannot get access token for send");
        }

        const response = await fetch("https://ai-seek.thebetter.ai/v3/chat/send", {
             method: 'POST',
             headers: { // Restore full headers
                 'User-Agent': "Dart/3.3 (dart:io)", 'Accept': "text/event-stream", 'Accept-Encoding': "gzip", 'Content-Type': "application/json", 'x-app-id': "ai-seek",
                 'x-device-info': `appIdentifier=ai.chatbot.ask.chat.deep.seek.assistant.search.free;appVersion=1.5.2-25040965;deviceType=android;deviceCountry=US;appCountry=us;local=en_US;language=en;timezone=Asia/Baghdad;brand=realme;model=RMX1931;androidId=${androidId}`,
                 'x-access-token': accessToken
             },
             body: JSON.stringify({ // Restore full body and use stored apiSessionId
                 "sessionId": apiSessionIdForRequest, "model": currentModel.id, "text": message, "restrictedType": "PRO_USER",
                 "imageS3Keys": null, "fileS3Keys": null, "webSearch": false
             })
        });

        const botMessageElement = document.createElement('div');
        botMessageElement.className = 'message bot-message';
        chatMessages.appendChild(botMessageElement);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let botResponseText = '';
        while (true) { // Stream processing
            const { done, value } = await reader.read(); if (done) break;
            const chunk = decoder.decode(value, { stream: true }); const lines = chunk.split("\n");
            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    try {
                        const data = JSON.parse(line.substring(6));
                        if (data.content) {
                            botResponseText += data.content;
                            renderMessageDOM(botResponseText, false, botMessageElement); // Update placeholder
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                            if (typeof Prism !== 'undefined' && botMessageElement) {
                                Prism.highlightAllUnder(botMessageElement); // Highlight after each chunk update
                            }
                        }
                    } catch (e) { console.error("Stream parse error:", e); }
                }
            }
        }
        // Save final bot message
        const finalConversation = allConversations.find(conv => conv.id === currentConversationId);
        if (finalConversation) {
            const messageData = { content: botResponseText, isUser: false, timestamp: Date.now() };
            finalConversation.messages.push(messageData);
            saveConversationsToStorage();
        } else { console.warn("No active conv found for final bot msg. ID:", currentConversationId); }

        // The call to Prism.highlightAllUnder is now inside the loop,
        // but we can keep one here for a final pass if needed, or remove it if redundant.
        // For now, let's assume the in-loop highlighting is sufficient.
        // If issues arise, this could be a place for a final highlight.
        // if (typeof Prism !== 'undefined' && botMessageElement) {
        //     Prism.highlightAllUnder(botMessageElement);
        // }
        showLoading(false);
    } catch (error) {
        console.error("Send message error:", error);
        showLoading(false);
        addMessageToChat("Error connecting. Please try again.", false); // Add & save error msg
    }
}

// --- UI Helper Functions ---
function checkInitialPromptVisibility() { if (initialPrompt) initialPrompt.classList.toggle('visible', chatMessages.children.length === 0); }
function showLoading(show) { if (loadingIndicator) loadingIndicator.style.display = show ? 'block' : 'none'; }
function updateSendButtonState() {
     const message = messageInput.value.trim();
     if (sendButton) { sendButton.disabled = !message; sendButton.style.opacity = message ? '1' : '0.5'; sendButton.style.cursor = message ? 'pointer' : 'not-allowed'; }
}

// --- Event Listeners ---
if (sendButton) sendButton.addEventListener('click', async () => { const message = messageInput.value.trim(); if (message && !sendButton.disabled) { messageInput.value = ''; updateSendButtonState(); await sendMessage(message); } });
if (messageInput) {
    messageInput.addEventListener('input', updateSendButtonState);
    messageInput.addEventListener('keypress', async (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const message = messageInput.value.trim(); if (message && !sendButton.disabled) { messageInput.value = ''; updateSendButtonState(); await sendMessage(message); } } });
}
if (modelDisplayTrigger) {
    console.log("[Debug] Adding click listener to modelDisplayTrigger"); // Debug log
    modelDisplayTrigger.addEventListener('click', (event) => {
        console.log("[Debug] modelDisplayTrigger clicked!"); // Debug log
        event.stopPropagation();
        toggleModelSelector();
    });
}
if (newChatButton) newChatButton.addEventListener('click', startNewConversation);
document.addEventListener('click', (event) => { if (modelSelector && modelSelector.style.display === 'block') { if (!modelSelector.contains(event.target) && !modelDisplayTrigger.contains(event.target)) { toggleModelSelector(); } } });

// --- Sidebar Toggle Logic ---
if (sidebarToggle) {
    console.log("[Debug] Adding click listener to sidebarToggle"); // Debug log
    sidebarToggle.addEventListener('click', () => {
        console.log("[Debug] sidebarToggle clicked!"); // Debug log
        document.body.classList.toggle('sidebar-hidden');
        // Optional: Save sidebar state in localStorage
        // localStorage.setItem('sidebarState', document.body.classList.contains('sidebar-hidden') ? 'hidden' : 'visible');
    });
}

// --- Initialization ---
async function init() {
    try {
        const tokenData = await getAccessToken();
        accessToken = tokenData.token; androidId = tokenData.androidId;
        if (!accessToken) { if (modelDisplayTrigger) modelDisplayTrigger.style.display = 'none'; console.error("No token"); }
        else { await fetchAvailableModels(); selectModel(currentModel); }

        loadConversationsFromStorage();
        if (currentConversationId && allConversations.find(c => c.id === currentConversationId)) { loadConversation(currentConversationId); }
        else if (allConversations.length > 0) { renderConversationList(); loadConversation(allConversations[0].id); }
        else { startNewConversation(); }
        renderConversationList();

        // Optional: Restore sidebar state from localStorage
        // const sidebarState = localStorage.getItem('sidebarState');
        // if (sidebarState === 'hidden') {
        //     document.body.classList.add('sidebar-hidden');
        // }

    } catch (error) {
        console.error("Init error:", error);
        if (modelDisplayTrigger) modelDisplayTrigger.style.display = 'none';
        if (allConversations.length === 0) startNewConversation();
    }
}

// --- Start Application ---
document.addEventListener('DOMContentLoaded', () => {
    init();
    updateSendButtonState();
});
