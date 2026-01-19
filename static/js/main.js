/* =========================================
   GLOBAL TEAM CHAT & NOTIFICATION WIDGET
   ========================================= */

document.addEventListener("DOMContentLoaded", function() {
    
    const PAGE_TYPE = document.body.dataset.pageType || 'unknown'; // 'manager', 'billing', 'insurance', 'design', 'ebook'

    // --- 0. Prepare Agent Selector ---
    let identityHTML = '';
    // Chat only for Billing, Insurance, Manager
    const showChat = ['billing', 'insurance', 'manager'].includes(PAGE_TYPE);

    if (showChat && window.PAGE_AGENTS && Array.isArray(window.PAGE_AGENTS)) {
        const options = window.PAGE_AGENTS.map(a => `<option value="${a}">${a}</option>`).join('');
        identityHTML = `
            <div class="px-4 py-2 bg-[#2A0A12] border-b border-[#831843]">
                <select id="chatIdentity" class="w-full bg-[#450a1f] text-xs text-rose-100 border border-[#831843] rounded px-2 py-1.5 outline-none focus:border-rose-400 transition-colors">
                    <option value="">-- Select Your Name --</option>
                    ${options}
                </select>
            </div>
        `;
    }

    // --- 1. Inject Chat HTML (Only if applicable) ---
    if (showChat && !document.getElementById('chat-root')) {
        const chatHTML = `
            <button id="chatToggleBtn" onclick="toggleChat()" class="fixed bottom-5 left-5 bg-rose-700 hover:bg-rose-600 text-white p-4 rounded-full shadow-2xl z-50 transition-transform hover:scale-110 group border-2 border-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full hidden border border-[#2A0A12]" id="chatUnreadBadge">0</span>
            </button>

            <div id="chatWindow" class="fixed bottom-24 left-5 w-80 md:w-96 bg-[#450a1f] border border-[#831843] rounded-2xl shadow-2xl z-50 hidden flex flex-col overflow-hidden origin-bottom-left transition-all duration-200 scale-95 opacity-0">
                <div class="bg-[#2A0A12]/90 backdrop-blur p-4 border-b border-[#831843] flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <h3 class="font-bold text-white text-sm">Team Chat</h3>
                    </div>
                    <button onclick="toggleChat()" class="text-rose-300 hover:text-white transition">✕</button>
                </div>
                ${identityHTML}
                <div id="chatMessages" class="flex-1 p-4 overflow-y-auto space-y-3 h-80 bg-[#450a1f]/50">
                     <div class="text-center text-xs text-rose-300/50 mt-4 mb-4 select-none">-- Chat History --</div>
                </div>
                <form id="chatForm" class="p-3 bg-[#2A0A12] border-t border-[#831843] flex gap-2">
                    <input type="text" id="chatInput" class="flex-1 bg-[#450a1f] border border-[#831843] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-rose-400" placeholder="Message..." required autocomplete="off">
                    <button type="submit" class="bg-rose-700 hover:bg-rose-600 text-white px-3 py-2 rounded-lg font-bold text-sm shadow-lg shadow-rose-900/20">Send</button>
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
    } else if (!showChat) {
        // Just Audio elements for Design/Ebook if they ever need sound (though rules say no)
        // But Manager needs sound and they use main.js. 
        // Design/Ebook will just not have the chat widget.
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

    // --- 3. Alert Logic ---
    function triggerAlert(title, body, type = 'message') {
        // Sound Rules based on PAGE_TYPE
        if (PAGE_TYPE === 'design' || PAGE_TYPE === 'ebook') return; // No sound for these

        try {
            if (type === 'money') {
                if (PAGE_TYPE === 'manager' || PAGE_TYPE === 'insurance' || PAGE_TYPE === 'billing') {
                     // Check specific portal rules in Listener section, but general 'money' usually plays
                     // We will control "play or not" inside the Pusher listener callback
                     soundLead.currentTime = 0; soundLead.play();
                }
            } else if (type === 'edit') {
                 if (PAGE_TYPE === 'manager') { soundEdit.currentTime = 0; soundEdit.play(); }
                 if (PAGE_TYPE === 'billing' && title.includes('Billing')) { soundEdit.currentTime = 0; soundEdit.play(); }
            } else {
                 soundMsg.currentTime = 0; soundMsg.play();
            }
        } catch(e) {}
    }

    // --- 4. Chat UI Functions ---
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
        let bgClass = isSelf ? 'bg-rose-600' : 'bg-[#2A0A12]';
        
        if (data.role === 'manager') roleColor = 'text-red-400';
        if (data.sender === 'System') {
            roleColor = 'text-yellow-400';
            bgClass = 'bg-[#2A0A12] border-yellow-500/30';
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
            <div class="text-[9px] text-rose-300/50 mt-1 px-1 font-mono">${data.time || new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
        `;
        msgsDiv.appendChild(div);
        scrollToBottom();
    }

    // --- 5. Initial History ---
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

    // --- 6. PUSHER LISTENER (Strict Rules) ---
    if (window.PUSHER_KEY) {
        const pusher = new Pusher(window.PUSHER_KEY, { cluster: window.PUSHER_CLUSTER });
        const channel = pusher.subscribe('techware-channel');
        
        // A. CHAT
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

        // B. NEW LEAD
        channel.bind('new-lead', function(data) {
            // Manager: Ring for ALL types
            // Design/Ebook: NO Ring
            // Billing/Insurance: Ring only if it matches? No rule said they ring on new lead, mostly edited/status.
            // But let's assume they might want to know. "if a lead is submitted ... then manager portal should ring". 
            // It didn't explicitly say portals should ring on new lead. I'll stick to Manager only for now.
            
            if (PAGE_TYPE === 'manager') {
                triggerAlert('New Lead', data.message, 'money');
                if (window.updateDashboardStats) window.updateDashboardStats(); // Update totals immediately
            }
            
            if(showChat) appendMessage({ sender: 'System', message: data.message, role: 'success' });
        });

        // C. STATUS UPDATE (Approved/Declined)
        channel.bind('status-update', function(data) {
            const status = data.status.toLowerCase();
            const isApproved = status === 'charged' || status === 'approved';
            const msg = `${data.type.toUpperCase()} Lead #${data.id} is ${data.status.toUpperCase()}`;

            // Rules:
            // Manager: Sees all.
            // Insurance: Ring only if Insurance & Approved.
            // Billing: Ring only if Billing & Edited (This is status update, handled below or here? "if a lead of billing is edited then billin portal should ring". Status update IS an edit in a way, but let's handle strict status here).
            // Let's assume Billing also rings on Approved/Declined for feedback.
            
            let shouldRing = false;

            if (PAGE_TYPE === 'manager') shouldRing = true;
            if (PAGE_TYPE === 'insurance' && data.type === 'insurance' && isApproved) shouldRing = true;
            if (PAGE_TYPE === 'billing' && data.type === 'billing') shouldRing = true; // General feedback
            
            if (shouldRing) triggerAlert('Update', msg, isApproved ? 'money' : 'edit');
            
            if(showChat) appendMessage({ sender: 'System', message: msg, role: isApproved ? 'success' : 'error' });
            if (PAGE_TYPE === 'manager' && window.updateDashboardStats) window.updateDashboardStats();
        });

        // D. LEAD EDITED
        channel.bind('lead-edited', function(data) {
            // Rule: "if a lead of billing is edited then billin portal should ring"
            const msg = `${data.type} Lead Edited by ${data.agent}`;
            
            let shouldRing = false;
            if (PAGE_TYPE === 'manager') shouldRing = true;
            if (PAGE_TYPE === 'billing' && data.type === 'billing') shouldRing = true;
            
            if (shouldRing) triggerAlert('Edited', msg, 'edit');
            
            if(showChat) appendMessage({ sender: 'System', message: msg, role: 'warning' });
            if (PAGE_TYPE === 'manager' && window.updateDashboardStats) window.updateDashboardStats();
        });
    }
});
