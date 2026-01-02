/* =========================================
   GLOBAL TEAM CHAT WIDGET
   ========================================= */

document.addEventListener("DOMContentLoaded", function() {
    
    // 0. Prepare Agent Selector (If available on page)
    let identityHTML = '';
    if (window.PAGE_AGENTS && Array.isArray(window.PAGE_AGENTS)) {
        const options = window.PAGE_AGENTS.map(a => `<option value="${a}">${a}</option>`).join('');
        identityHTML = `
            <div class="px-4 py-2 bg-slate-900 border-b border-slate-700">
                <select id="chatIdentity" class="w-full bg-slate-700 text-xs text-slate-200 border border-slate-600 rounded px-2 py-1.5 outline-none focus:border-blue-500 transition-colors">
                    <option value="">-- Select Your Name --</option>
                    ${options}
                </select>
            </div>
        `;
    }

    // 1. Inject Chat HTML
    if (!document.getElementById('chat-root')) {
        const chatHTML = `
            <button id="chatToggleBtn" onclick="toggleChat()" class="fixed bottom-5 left-5 bg-blue-600 hover:bg-blue-500 text-white p-4 rounded-full shadow-2xl z-50 transition-transform hover:scale-110 group border-2 border-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full hidden border border-slate-900" id="chatUnreadBadge">0</span>
            </button>

            <div id="chatWindow" class="fixed bottom-24 left-5 w-80 md:w-96 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-50 hidden flex flex-col overflow-hidden origin-bottom-left transition-all duration-200 scale-95 opacity-0">
                
                <div class="bg-slate-900/90 backdrop-blur p-4 border-b border-slate-700 flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <h3 class="font-bold text-white text-sm">Team Cloud</h3>
                    </div>
                    <button onclick="toggleChat()" class="text-slate-400 hover:text-white transition">✕</button>
                </div>

                ${identityHTML}
                
                <div id="chatMessages" class="flex-1 p-4 overflow-y-auto space-y-3 h-80 bg-slate-800/50">
                    <div class="text-center text-xs text-slate-500 mt-4 mb-4 select-none opacity-50">
                        -- Chat History (Max 50) --<br>
                        Rate Limit: 30 msgs/hour
                    </div>
                </div>

                <form id="chatForm" class="p-3 bg-slate-900 border-t border-slate-700 flex gap-2">
                    <input type="text" id="chatInput" class="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500 transition-colors" placeholder="Message..." required autocomplete="off">
                    <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg font-bold text-sm transition shadow-lg shadow-blue-500/20">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                    </button>
                </form>
            </div>
            
            <audio id="chatSoundAudio" src="/static/sounds/messages.mp3"></audio>
        `;

        const div = document.createElement('div');
        div.id = 'chat-root';
        div.innerHTML = chatHTML;
        document.body.appendChild(div);
    }

    // 2. Variables & Logic
    const chatWindow = document.getElementById('chatWindow');
    const msgsDiv = document.getElementById('chatMessages');
    const badge = document.getElementById('chatUnreadBadge');
    const audio = document.getElementById('chatSoundAudio');
    const identitySelect = document.getElementById('chatIdentity');
    let isOpen = false;
    let unread = 0;

    // Toggle Chat
    window.toggleChat = function() {
        isOpen = !isOpen;
        if (isOpen) {
            chatWindow.classList.remove('hidden');
            setTimeout(() => chatWindow.classList.remove('scale-95', 'opacity-0'), 10);
            unread = 0;
            badge.classList.add('hidden');
            badge.innerText = 0;
            scrollToBottom();
        } else {
            chatWindow.classList.add('scale-95', 'opacity-0');
            setTimeout(() => chatWindow.classList.add('hidden'), 200);
        }
    };

    function scrollToBottom() {
        msgsDiv.scrollTop = msgsDiv.scrollHeight;
    }

    function getSenderName() {
        // 1. Try Chat Widget Selector (Priority)
        if (identitySelect && identitySelect.value) return identitySelect.value;

        // 2. Try Main Form Input (Sync Fallback)
        const agent = document.getElementById('agent');
        if (agent && agent.value && agent.value !== "") {
            // Auto-update the chat selector if it matches
            if (identitySelect) identitySelect.value = agent.value;
            return agent.value;
        }
        
        // 3. Try Hidden Manager Input
        const hAgent = document.getElementById('h_agent');
        if (hAgent && hAgent.value) return hAgent.value;

        // 4. Fallback based on URL
        if (window.location.href.includes('manager')) return "Manager";
        return null;
    }

    // Auto-Sync: If user changes Main Form, update Chat Selector
    const mainAgentSelect = document.getElementById('agent');
    if(mainAgentSelect && identitySelect) {
        mainAgentSelect.addEventListener('change', (e) => {
            identitySelect.value = e.target.value;
        });
    }

    function appendMessage(data) {
        const myName = getSenderName();
        const isSelf = (data.sender === myName);
        const roleColor = data.role === 'manager' ? 'text-red-400' : 'text-cyan-400';
        
        const div = document.createElement('div');
        div.className = `flex flex-col ${isSelf ? 'items-end' : 'items-start'} animate-fade-in-up`;
        
        div.innerHTML = `
            <div class="max-w-[85%] ${isSelf ? 'bg-blue-600' : 'bg-slate-700'} rounded-xl px-3 py-2 text-sm text-white shadow-md border border-white/5">
                ${!isSelf ? `<div class="text-[10px] ${roleColor} font-bold mb-0.5 uppercase tracking-wide">${data.sender}</div>` : ''}
                <div class="leading-relaxed">${data.message}</div>
            </div>
            <div class="text-[9px] text-slate-500 mt-1 px-1 font-mono">${data.time}</div>
        `;
        msgsDiv.appendChild(div);
        scrollToBottom();
    }

    // 3. Load History
    fetch('/api/chat/history').then(r=>r.json()).then(data => {
        if(Array.isArray(data)) {
            msgsDiv.innerHTML = '<div class="text-center text-xs text-slate-500 mt-4 mb-4 select-none opacity-50">-- Chat History --<br>Limit: 30 msgs/hr</div>';
            data.forEach(msg => appendMessage(msg));
        }
    });

    // 4. Send Message
    document.getElementById('chatForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('chatInput');
        const msg = input.value.trim();
        const sender = getSenderName();

        if (!sender) {
            alert("Please select your Name in the chat dropdown first!");
            if(identitySelect) identitySelect.classList.add('border-red-500', 'animate-pulse');
            setTimeout(() => identitySelect?.classList.remove('border-red-500', 'animate-pulse'), 1000);
            return;
        }

        input.value = ''; // Clear input immediately
        
        const formData = new FormData();
        formData.append('sender', sender);
        formData.append('message', msg);
        formData.append('role', window.location.href.includes('manager') ? 'manager' : 'agent');

        try {
            const res = await fetch('/api/chat/send', { method: 'POST', body: formData });
            if (!res.ok) {
                const err = await res.json();
                alert(err.message || "Error sending message");
            }
        } catch (e) { console.error(e); }
    });

    // 5. Pusher Listener
    if (window.PUSHER_KEY) {
        const pusher = new Pusher(window.PUSHER_KEY, { cluster: window.PUSHER_CLUSTER });
        const channel = pusher.subscribe('techware-channel');
        
        channel.bind('new-chat', function(data) {
            appendMessage(data);

            // Determine if I sent this message
            const myName = getSenderName();
            const isSelf = (data.sender === myName);
            
            // --- SOUND LOGIC ---
            // Play sound for ALL incoming messages (Agent or Manager), 
            // regardless of whether the chat window is Open or Closed.
            if (!isSelf) {
                try {
                    audio.currentTime = 0;
                    audio.play();
                } catch(e) { console.log("Audio autoplay restricted"); }
            }

            // --- BADGE LOGIC ---
            // Only increment badge if window is closed
            if (!isOpen) {
                unread++;
                badge.classList.remove('hidden');
                badge.innerText = unread > 9 ? '9+' : unread;
            }
        });
    }
});
