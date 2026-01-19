/* =========================================
   GLOBAL TEAM CHAT & NOTIFICATION WIDGET
   ========================================= */

document.addEventListener("DOMContentLoaded", function() {
    
    // --- 0. Prepare Agent Selector (If available on page) ---
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

    // --- 1. Inject Chat HTML ---
    if (!document.getElementById('chat-root')) {
        const chatHTML = `
            <button id="chatToggleBtn" onclick="toggleChat()" class="fixed bottom-5 left-5 bg-blue-600 hover:bg-blue-500 text-white p-4 rounded-full shadow-2xl z-50 transition-transform hover:scale-110 group border-2 border-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full hidden border border-slate-900" id="chatUnreadBadge">0</span>
            </button>

            <div id="chatWindow" class="fixed bottom-24 left-5 w-80 md:w-96 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-50 hidden flex flex-col overflow-hidden origin-bottom-left transition-all duration-200 scale-95 opacity-0">
                
                <div class="bg-slate-900/90 backdrop-blur p-4 border-b border-slate-700 flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <h3 class="font-bold text-white text-sm">Notifications & Chat</h3>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="requestNotifyPermission()" title="Enable Desktop Notifications" class="text-slate-400 hover:text-yellow-400 transition relative group">
                             <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                             </svg>
                             <span id="notifyStatusDot" class="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-slate-900 hidden"></span>
                        </button>
                        <button onclick="toggleChat()" class="text-slate-400 hover:text-white transition">✕</button>
                    </div>
                </div>

                ${identityHTML}
                
                <div id="chatMessages" class="flex-1 p-4 overflow-y-auto space-y-3 h-80 bg-slate-800/50">
                    <div class="text-center text-xs text-slate-500 mt-4 mb-4 select-none opacity-50">
                        -- History (Max 50) --<br>
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
            
            <audio id="soundMessage" src="/static/sounds/messages.mp3"></audio>
            <audio id="soundLead" src="/static/sounds/new_lead.mp3"></audio>
            <audio id="soundEdit" src="/static/sounds/edited.mp3"></audio>
        `;

        const div = document.createElement('div');
        div.id = 'chat-root';
        div.innerHTML = chatHTML;
        document.body.appendChild(div);
    }

    // --- 2. Variables ---
    const chatWindow = document.getElementById('chatWindow');
    const msgsDiv = document.getElementById('chatMessages');
    const badge = document.getElementById('chatUnreadBadge');
    const soundMsg = document.getElementById('soundMessage');
    const soundLead = document.getElementById('soundLead');
    const soundEdit = document.getElementById('soundEdit');
    const identitySelect = document.getElementById('chatIdentity');
    let isOpen = false;
    let unread = 0;

    // --- 3. Notification Logic ---
    window.requestNotifyPermission = function() {
        if (!("Notification" in window)) {
            alert("This browser does not support system notifications");
            return;
        }
        if (Notification.permission === "granted") {
            new Notification("Notifications Enabled", { body: "You are all set!", icon: "/static/img/Logo Black.png" });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification("Notifications Enabled", { body: "You will now see popups for new leads.", icon: "/static/img/Logo Black.png" });
                    updateNotifyDot();
                }
            });
        }
    };

    function updateNotifyDot() {
        const dot = document.getElementById('notifyStatusDot');
        if (Notification.permission === 'granted') {
             dot.classList.remove('hidden');
             dot.classList.replace('bg-red-500', 'bg-green-500');
        } else {
             dot.classList.add('hidden');
        }
    }
    if(Notification.permission === 'granted') updateNotifyDot();

    function triggerAlert(title, body, type = 'message') {
        // 1. Play Sound
        try {
            if (type === 'money') {
                soundLead.currentTime = 0;
                soundLead.play();
            } else if (type === 'edit') {
                soundEdit.currentTime = 0;
                soundEdit.play();
            } else {
                soundMsg.currentTime = 0;
                soundMsg.play();
            }
        } catch(e) { console.log("Audio autoplay restricted"); }

        // 2. Browser Notification (PC Banner)
        if (Notification.permission === "granted") {
            // Check if page is hidden
            if (document.visibilityState === 'hidden' || (type === 'message' && !isOpen) || type !== 'message') {
                const n = new Notification(title, {
                    body: body,
                    icon: '/static/img/Logo Black.png',
                    silent: true // We play sound manually
                });
                n.onclick = function() { window.focus(); };
            }
        }
    }

    // --- 4. Chat UI Logic ---
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
        if (identitySelect && identitySelect.value) return identitySelect.value;
        const agent = document.getElementById('agent');
        if (agent && agent.value && agent.value !== "") {
            if (identitySelect) identitySelect.value = agent.value;
            return agent.value;
        }
        const hAgent = document.getElementById('h_agent');
        if (hAgent && hAgent.value) return hAgent.value;
        if (window.location.href.includes('manager')) return "Manager";
        return null;
    }

    const mainAgentSelect = document.getElementById('agent');
    if(mainAgentSelect && identitySelect) {
        mainAgentSelect.addEventListener('change', (e) => { identitySelect.value = e.target.value; });
    }

    // --- 5. Message Rendering ---
    function appendMessage(data) {
        const myName = getSenderName();
        const isSelf = (data.sender === myName);
        
        // Dynamic styling for different roles (Chat vs System Alerts)
        let roleColor = 'text-cyan-400';
        let bgClass = isSelf ? 'bg-blue-600' : 'bg-slate-700';
        
        if (data.role === 'manager') roleColor = 'text-red-400';
        if (data.sender === 'System') {
            roleColor = 'text-yellow-400';
            bgClass = 'bg-slate-800 border-yellow-500/30';
            if (data.role === 'success') { roleColor = 'text-green-400'; bgClass = 'bg-green-900/20 border-green-500/30'; }
            if (data.role === 'error') { roleColor = 'text-red-400'; bgClass = 'bg-red-900/20 border-red-500/30'; }
        }

        const div = document.createElement('div');
        div.className = `flex flex-col ${isSelf ? 'items-end' : 'items-start'} animate-fade-in-up`;
        
        div.innerHTML = `
            <div class="max-w-[90%] ${bgClass} rounded-xl px-3 py-2 text-sm text-white shadow-md border border-white/5">
                ${!isSelf ? `<div class="text-[10px] ${roleColor} font-bold mb-0.5 uppercase tracking-wide flex items-center gap-1">${data.sender === 'System' ? '🔔 ' : ''}${data.sender}</div>` : ''}
                <div class="leading-relaxed whitespace-pre-wrap">${data.message}</div>
            </div>
            <div class="text-[9px] text-slate-500 mt-1 px-1 font-mono">${data.time || new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
        `;
        msgsDiv.appendChild(div);
        scrollToBottom();
    }

    // --- 6. Load History & Send ---
    fetch('/api/chat/history').then(r=>r.json()).then(data => {
        if(Array.isArray(data)) {
            msgsDiv.innerHTML = '<div class="text-center text-xs text-slate-500 mt-4 mb-4 select-none opacity-50">-- Chat History --<br>Limit: 30 msgs/hr</div>';
            data.forEach(msg => appendMessage(msg));
        }
    });

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

        input.value = ''; 
        
        const formData = new FormData();
        formData.append('sender', sender);
        formData.append('message', msg);
        formData.append('role', window.location.href.includes('manager') ? 'manager' : 'agent');

        try {
            await fetch('/api/chat/send', { method: 'POST', body: formData });
        } catch (e) { console.error(e); }
    });

    // --- 7. PUSHER LISTENER (THE CORE LOGIC) ---
    if (window.PUSHER_KEY) {
        const pusher = new Pusher(window.PUSHER_KEY, { cluster: window.PUSHER_CLUSTER });
        const channel = pusher.subscribe('techware-channel');
        
        // A. CHAT MESSAGES
        channel.bind('new-chat', function(data) {
            appendMessage(data);
            const myName = getSenderName();
            const isSelf = (data.sender === myName);
            
            if (!isSelf) {
                if (!isOpen) {
                    unread++;
                    badge.classList.remove('hidden');
                    badge.innerText = unread > 9 ? '9+' : unread;
                }
                triggerAlert(`New Message from ${data.sender}`, data.message, 'message');
            }
        });

        // B. NEW LEAD (SUBMISSION)
        channel.bind('new-lead', function(data) {
            triggerAlert(
                `New ${data.type} Lead!`, 
                `Agent: ${data.agent}\nAmount: ${data.amount}`, 
                'money'
            );
            
            appendMessage({
                sender: 'System',
                message: `New ${data.type} Lead:\n${data.agent} — ${data.amount}`,
                role: 'success'
            });
            
            if (!isOpen) { unread++; badge.classList.remove('hidden'); badge.innerText = unread > 9 ? '9+' : unread; }
            if (window.location.href.includes('manager') && window.updateDashboardStats) { window.updateDashboardStats(); }
        });

        // C. STATUS UPDATE (APPROVED/DECLINED)
        channel.bind('status-update', function(data) {
            const status = data.status.toLowerCase();
            const isApproved = status === 'charged' || status === 'approved';
            
            // --- CUSTOM MESSAGE LOGIC ---
            const client = data.client || 'Client';
            const agent = data.agent || 'Agent';
            let title = `Lead #${data.id} Updated`;
            let body = `Status: ${data.status.toUpperCase()}`;

            // Specific text formatting
            if (isApproved) {
                title = "Approved! 🎉";
                body = `Congrats ${agent} - ${client} got approved!`;
                // Trigger Confetti
                triggerCelebration();
            } else if (status === 'declined') {
                title = "Declined ⚠️";
                body = `Sorry! ${agent} - ${client} got declined.`;
            }

            // 1. Alert
            triggerAlert(title, body, isApproved ? 'money' : 'message');

            // 2. Chat History
            appendMessage({
                sender: 'System',
                message: body,
                role: isApproved ? 'success' : 'error'
            });

            if (!isOpen) { unread++; badge.classList.remove('hidden'); badge.innerText = unread > 9 ? '9+' : unread; }
            if (window.location.href.includes('manager') && window.updateDashboardStats) { window.updateDashboardStats(); }
        });

        // D. EDITED LEAD
        channel.bind('lead-edited', function(data) {
            const client = data.client || 'Client';
            const msg = `${client} got edited by ${data.agent}`;

            triggerAlert(`Lead #${data.id} Edited`, msg, 'edit');
             
            appendMessage({
                sender: 'System',
                message: msg,
                role: 'warning'
            });
            
            if (!isOpen) { unread++; badge.classList.remove('hidden'); badge.innerText = unread; }
        });
    }
});

// --- CONFETTI ANIMATION ---
function triggerCelebration() {
    // School Pride (Side Cannons)
    const end = Date.now() + 3 * 1000;
    const colors = ['#bb0000', '#ffffff', '#228B22'];

    (function frame() {
        confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: colors
        });
        confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: colors
        });

        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}
