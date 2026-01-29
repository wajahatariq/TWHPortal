/* =========================================
   GLOBAL TEAM CHAT, AUDIO & NOTIFICATION SYSTEM
   ========================================= */

document.addEventListener("DOMContentLoaded", function() {
    
    const PAGE_TYPE = document.body.dataset.pageType || 'unknown'; 
    const showChat = ['billing', 'insurance', 'manager'].includes(PAGE_TYPE);

    // --- 1. Request Windows Permission ---
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    // --- 2. Synthesized Audio System ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    function playTone(type) {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === 'money') { 
            // SUCCESS
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now);       
            osc.frequency.setValueAtTime(659.25, now + 0.1); 
            osc.frequency.setValueAtTime(783.99, now + 0.2); 
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
            osc.start(now);
            osc.stop(now + 0.6);
        } 
        else if (type === 'error') {
            // ERROR
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        }
        else if (type === 'edit') {
            // EDIT
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
        else {
            // MESSAGE
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    }

    // --- 3. Custom Professional Toast System ---
    const toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);

    function showToast(title, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast-message toast-${type}`;
        
        let icon = 'ℹ️';
        if(type === 'success') icon = '✅';
        if(type === 'error') icon = '⚠️';

        // Use pre-line style to support \n line breaks
        toast.style.whiteSpace = 'pre-line'; 

        toast.innerHTML = `
            <div class="text-2xl">${icon}</div>
            <div class="toast-content">
                <span class="toast-title">${title}</span>
                <span class="toast-body">${message}</span>
            </div>
            <div class="toast-close" onclick="this.parentElement.remove()">✕</div>
        `;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    // --- 4. Chat UI Logic ---
    let identityHTML = '';
    if (showChat && window.PAGE_AGENTS && Array.isArray(window.PAGE_AGENTS)) {
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

    if (showChat && !document.getElementById('chat-root')) {
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
                        <h3 class="font-bold text-white text-sm">Team Chat</h3>
                    </div>
                    <button onclick="toggleChat()" class="text-slate-400 hover:text-white transition">✕</button>
                </div>
                ${identityHTML}
                <div id="chatMessages" class="flex-1 p-4 overflow-y-auto space-y-3 h-80 bg-slate-800/50">
                     <div class="text-center text-xs text-slate-500 mt-4 mb-4 select-none">-- Chat History --</div>
                </div>
                <form id="chatForm" class="p-3 bg-slate-900 border-t border-slate-700 flex gap-2">
                    <input type="text" id="chatInput" class="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500" placeholder="Message..." required autocomplete="off">
                    <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20">Send</button>
                </form>
            </div>
        `;
        const div = document.createElement('div');
        div.id = 'chat-root';
        div.innerHTML = chatHTML;
        document.body.appendChild(div);
    }

    const chatWindow = document.getElementById('chatWindow');
    const msgsDiv = document.getElementById('chatMessages');
    const badge = document.getElementById('chatUnreadBadge');
    const identitySelect = document.getElementById('chatIdentity');
    let isOpen = false;
    let unread = 0;

    // --- 5. Unified Trigger Function ---
    function triggerAlert(title, body, type = 'message') {
        if (PAGE_TYPE === 'design' || PAGE_TYPE === 'ebook') return; 

        playTone(type);

        let toastType = 'info';
        if(type === 'money') toastType = 'success';
        if(type === 'error') toastType = 'error';
        showToast(title, body, toastType);

        if ("Notification" in window && Notification.permission === "granted") {
            if (document.visibilityState === 'hidden' || type === 'money' || type === 'error') {
                new Notification(title, { // Title passed directly
                    body: body,
                    icon: '/static/img/Logo Black.png',
                    silent: true 
                });
            }
        }
    }

    window.toggleChat = function() {
        if(!chatWindow) return;
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
    function scrollToBottom() { if(msgsDiv) msgsDiv.scrollTop = msgsDiv.scrollHeight; }
    function getSenderName() {
        if (identitySelect && identitySelect.value) return identitySelect.value;
        const agent = document.getElementById('agent');
        if (agent && agent.value) return agent.value;
        return PAGE_TYPE === 'manager' ? "Manager" : "Anon";
    }

    function appendMessage(data) {
        if(!msgsDiv) return;
        const myName = getSenderName();
        const isSelf = (data.sender === myName);
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

    if(showChat) {
        fetch('/api/chat/history').then(r=>r.json()).then(data => {
            if(Array.isArray(data)) data.forEach(msg => appendMessage(msg));
        });
        
        document.getElementById('chatForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('chatInput');
            const msg = input.value.trim();
            const sender = getSenderName();
            if (!sender) return alert("Select Name!");
            input.value = ''; 
            const formData = new FormData();
            formData.append('sender', sender);
            formData.append('message', msg);
            formData.append('role', PAGE_TYPE);
            await fetch('/api/chat/send', { method: 'POST', body: formData });
        });
    }

    // --- 6. PUSHER LISTENERS (CUSTOMIZED) ---
    if (window.PUSHER_KEY) {
        const pusher = new Pusher(window.PUSHER_KEY, { cluster: window.PUSHER_CLUSTER });
        const channel = pusher.subscribe('techware-channel');
        
        if(showChat) {
            channel.bind('new-chat', function(data) {
                appendMessage(data);
                const isSelf = (data.sender === getSenderName());
                if (!isSelf) {
                    if (!isOpen) { unread++; badge.classList.remove('hidden'); badge.innerText = unread > 9 ? '9+' : unread; }
                    triggerAlert('Message', 'New msg');
                }
            });
        }

        channel.bind('new-lead', function(data) {
            // Format: Haziq submitted a new lead \n <Name> \n <Charge>
            const title = `${data.agent} submitted a new lead`;
            const body = `${data.client}\n${data.amount}`;
            
            if (PAGE_TYPE === 'manager') {
                triggerAlert(title, body, 'money');
                if (window.fetchData) window.fetchData();
            }
            // For chat, simpler message is usually better, but we can match
            if(showChat) appendMessage({ sender: 'System', message: `${title}\n${body}`, role: 'success' });
        });

        channel.bind('status-update', function(data) {
            const status = data.status.toLowerCase();
            const isApproved = status === 'charged' || status === 'approved';
            const llcName = data.llc ? ` on ${data.llc}` : "";
            
            // Format: Congrats/Sorry [Agent] [Client] got [Status]
            let msg = '';
            if(isApproved) {
                msg = `Congrats ${data.agent} ${data.client} got approved ${llcName} puchna mt ab.`;
            } else {
                msg = `Sorry ${data.agent} ${data.client} got declined`;
            }
            
            let shouldRing = false;
            if (PAGE_TYPE === 'manager') shouldRing = true;
            if (PAGE_TYPE === 'insurance' && data.type === 'insurance' && isApproved) shouldRing = true;
            if (PAGE_TYPE === 'billing' && data.type === 'billing') shouldRing = true;
            
            if (shouldRing) triggerAlert('Update', msg, isApproved ? 'money' : 'error');
            
            if(showChat) appendMessage({ sender: 'System', message: msg, role: isApproved ? 'success' : 'error' });
            
            if (PAGE_TYPE === 'manager' && window.fetchData) window.fetchData();
        });

        channel.bind('lead-edited', function(data) {
            // Format: [Agent] edited [Client]
            const msg = `${data.agent} edited ${data.client}`;
            
            let shouldRing = false;
            if (PAGE_TYPE === 'manager') shouldRing = true;
            if (PAGE_TYPE === 'billing' && data.type === 'billing') shouldRing = true;
            
            if (shouldRing) triggerAlert('Edited', msg, 'edit');
            
            if(showChat) appendMessage({ sender: 'System', message: msg, role: 'warning' });
            
            if (PAGE_TYPE === 'manager' && window.fetchData) window.fetchData();
        });
    }
});


