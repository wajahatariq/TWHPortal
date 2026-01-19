/* =========================================
   GLOBAL TEAM CHAT & NOTIFICATION WIDGET
   (Billing & Insurance Only)
   ========================================= */

document.addEventListener("DOMContentLoaded", function() {
    
    // --- 0. SAFETY CHECK: No Chat on Design/Ebook Pages ---
    const path = window.location.pathname.toLowerCase();
    if (path.includes('design') || path.includes('ebook')) return;

    // --- 1. DETERMINE DEPARTMENT ---
    // Defaults to 'billing' if on index or unrecognized
    const MY_DEPT = path.includes('insurance') ? 'insurance' : 'billing';
    console.log("Chat initialized for Department:", MY_DEPT);

    // --- 2. Prepare Agent Selector ---
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

    // --- 3. Inject Chat HTML ---
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
                        <h3 class="font-bold text-white text-sm uppercase tracking-wide">${MY_DEPT} Chat</h3>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="toggleChat()" class="text-slate-400 hover:text-white transition">✕</button>
                    </div>
                </div>

                ${identityHTML}
                
                <div id="chatMessages" class="flex-1 p-4 overflow-y-auto space-y-3 h-80 bg-slate-800/50">
                    <div class="text-center text-xs text-slate-500 mt-4 mb-4 select-none opacity-50">
                        -- ${MY_DEPT.toUpperCase()} Room --<br>
                    </div>
                </div>

                <form id="chatForm" class="p-3 bg-slate-900 border-t border-slate-700 flex gap-2">
                    <input type="text" id="chatInput" class="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500 transition-colors" placeholder="Message..." required autocomplete="off">
                    <button type="submit" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg font-bold text-sm transition shadow-lg shadow-blue-500/20">
                        Send
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

    // --- 4. Variables ---
    const chatWindow = document.getElementById('chatWindow');
    const msgsDiv = document.getElementById('chatMessages');
    const badge = document.getElementById('chatUnreadBadge');
    const soundMsg = document.getElementById('soundMessage');
    const soundLead = document.getElementById('soundLead');
    const soundEdit = document.getElementById('soundEdit');
    const identitySelect = document.getElementById('chatIdentity');
    let isOpen = false;
    let unread = 0;

    function triggerSound(type) {
        try {
            if (type === 'money') { soundLead.currentTime = 0; soundLead.play(); } 
            else if (type === 'edit') { soundEdit.currentTime = 0; soundEdit.play(); } 
            else { soundMsg.currentTime = 0; soundMsg.play(); }
        } catch(e) { console.log("Audio autoplay restricted"); }
    }

    // --- 5. Chat UI Logic ---
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
        const agent = document.getElementById('agent'); // From billing/insurance form
        if (agent && agent.value) {
            if (identitySelect) identitySelect.value = agent.value;
            return agent.value;
        }
        return "Agent";
    }

    // --- 6. Message Rendering ---
    function appendMessage(data) {
        const myName = getSenderName();
        const isSelf = (data.sender === myName);
        
        // Filter: Don't show messages from other departments!
        if (data.dept && data.dept !== MY_DEPT) return;

        let roleColor = 'text-cyan-400';
        let bgClass = isSelf ? 'bg-blue-600' : 'bg-slate-700';
        
        if (data.role === 'Manager') {
            roleColor = 'text-red-400';
            bgClass = 'border border-red-500/30 bg-red-900/20';
        }
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

    // --- 7. Load History & Send ---
    fetch('/api/chat/history').then(r=>r.json()).then(data => {
        if(Array.isArray(data)) {
            data.forEach(msg => appendMessage(msg));
        }
    });

    document.getElementById('chatForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('chatInput');
        const msg = input.value.trim();
        const sender = getSenderName();

        if (sender === "Agent" || !sender) {
            alert("Please select your Name in the chat dropdown first!");
            return;
        }

        input.value = ''; 
        
        const formData = new FormData();
        formData.append('sender', sender);
        formData.append('message', msg);
        formData.append('role', 'agent');
        formData.append('dept', MY_DEPT); // IMPORTANT: Send current Dept

        try {
            await fetch('/api/chat/send', { method: 'POST', body: formData });
        } catch (e) { console.error(e); }
    });

    // --- 8. PUSHER LISTENER (STRICT RULES) ---
    if (window.PUSHER_KEY) {
        const pusher = new Pusher(window.PUSHER_KEY, { cluster: window.PUSHER_CLUSTER });
        const channel = pusher.subscribe('techware-channel');
        
        // A. CHAT MESSAGES
        channel.bind('new-chat', function(data) {
            // Only accept if same dept
            if (data.dept !== MY_DEPT) return;
            
            appendMessage(data);
            const myName = getSenderName();
            if (data.sender !== myName) {
                if (!isOpen) { unread++; badge.classList.remove('hidden'); badge.innerText = unread > 9 ? '9+' : unread; }
                triggerSound('message');
            }
        });

        // B. NEW LEAD
        channel.bind('new-lead', function(data) {
            // STRICT RULE: Only Ring if same Dept
            if (data.type !== MY_DEPT) return;

            triggerSound('money');
            appendMessage({
                sender: 'System',
                message: `New ${data.type} Lead:\n${data.agent} — ${data.amount}`,
                role: 'success',
                dept: MY_DEPT // Ensure it passes filter
            });
            
            if (!isOpen) { unread++; badge.classList.remove('hidden'); badge.innerText = unread; }
        });

        // C. STATUS UPDATE (INSURANCE ONLY RULE)
        channel.bind('status-update', function(data) {
            // STRICT RULE: Only Ring if same Dept
            if (data.type !== MY_DEPT) return;

            const isApproved = (data.status === 'Charged');
            const msg = `Lead Updated: ${data.client} is now ${data.status.toUpperCase()}`;
            
            triggerSound(isApproved ? 'money' : 'message');

            appendMessage({
                sender: 'System',
                message: msg,
                role: isApproved ? 'success' : 'error',
                dept: MY_DEPT
            });

            if (!isOpen) { unread++; badge.classList.remove('hidden'); badge.innerText = unread; }
        });

        // D. EDITED LEAD (BILLING ONLY RULE)
        channel.bind('lead-edited', function(data) {
            // STRICT RULE: Only Ring if same Dept
            if (data.type !== MY_DEPT) return;

            triggerSound('edit');
             
            appendMessage({
                sender: 'System',
                message: `Lead Edited (ID: ${data.id})`,
                role: 'warning',
                dept: MY_DEPT
            });
            
            if (!isOpen) { unread++; badge.classList.remove('hidden'); badge.innerText = unread; }
        });
    }
});
