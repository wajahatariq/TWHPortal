document.addEventListener("DOMContentLoaded", function() {
    
    // --- CHAT INJECTION ---
    const pageType = window.PAGE_TYPE || 'unknown';
    const showChat = ['billing', 'insurance', 'manager'].includes(pageType);
    
    if (showChat && !document.getElementById('chat-root')) {
        const chatHTML = `
            <button id="chatToggleBtn" onclick="toggleChat()" class="fixed bottom-5 right-5 bg-[#8B2339] hover:bg-[#a62b44] text-white p-4 rounded-full shadow-2xl z-40 transition-transform hover:scale-110 group border-2 border-white/20">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                <span class="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full hidden border border-[#2d050a]" id="chatUnreadBadge">0</span>
            </button>
            <div id="chatWindow" class="fixed bottom-24 right-5 w-80 md:w-96 glass-panel rounded-2xl shadow-2xl z-50 hidden flex flex-col overflow-hidden transition-all duration-200 scale-95 opacity-0 border border-[#6E1A2D]/50">
                <div class="bg-[#2d050a]/80 p-4 border-b border-[#6E1A2D]/30 flex justify-between items-center"><h3 class="font-bold text-white text-sm">Team Chat</h3><button onclick="toggleChat()" class="text-[#ffb3b3] hover:text-white">✕</button></div>
                <div class="flex border-b border-[#6E1A2D]/30 bg-[#2d050a]/60">
                     <button class="flex-1 py-2 text-xs font-bold text-white border-b-2 border-[#8B2339]">General</button>
                </div>
                <div id="chatMessages" class="flex-1 p-4 overflow-y-auto space-y-3 h-80 bg-black/10"></div>
                <form id="chatForm" class="p-3 bg-[#2d050a]/80 border-t border-[#6E1A2D]/30 flex gap-2">
                    <input type="text" id="chatInput" class="flex-1 input-field py-2 text-sm" placeholder="Message..." required>
                    <button type="submit" class="bg-[#8B2339] text-white px-3 py-2 rounded-lg font-bold text-sm hover:bg-[#a62b44]">→</button>
                </form>
            </div>
            <audio id="soundMessage" src="/static/sounds/messages.mp3"></audio>
            <audio id="soundLead" src="/static/sounds/new_lead.mp3"></audio>
        `;
        const d = document.createElement('div'); d.id = 'chat-root'; d.innerHTML = chatHTML;
        document.body.appendChild(d);
        
        const msgsDiv = document.getElementById('chatMessages');
        window.appendMessage = function(data) {
             const div = document.createElement('div');
             div.className = "bg-[#4a0e16]/80 rounded p-2 text-sm text-white mb-2 border border-[#6E1A2D]/30";
             div.innerHTML = `<div class="text-[10px] text-[#ffb3b3] font-bold">${data.sender}</div>${data.message}`;
             msgsDiv.appendChild(div);
             msgsDiv.scrollTop = msgsDiv.scrollHeight;
        };
        
        document.getElementById('chatForm').addEventListener('submit', async(e)=>{
            e.preventDefault();
            const inp = document.getElementById('chatInput');
            const fd = new FormData(); fd.append('sender', 'Me'); fd.append('message', inp.value); fd.append('role', pageType);
            await fetch('/api/chat/send', {method:'POST', body:fd});
            inp.value = '';
        });
        
        window.toggleChat = function() {
            const w = document.getElementById('chatWindow');
            if(w.classList.contains('hidden')) { w.classList.remove('hidden'); setTimeout(()=> { w.classList.remove('scale-95', 'opacity-0'); },10); } 
            else { w.classList.add('scale-95', 'opacity-0'); setTimeout(()=> { w.classList.add('hidden'); },200); }
        };
    }

    // --- GLOBAL PUSHER LISTENER ---
    if (window.PUSHER_KEY) {
        const pusher = new Pusher(window.PUSHER_KEY, { cluster: window.PUSHER_CLUSTER });
        const channel = pusher.subscribe('techware-channel');
        
        const soundMsg = document.getElementById('soundMessage');
        const soundLead = document.getElementById('soundLead');
        const myType = window.PAGE_TYPE || 'unknown';

        if(showChat) {
            channel.bind('new-chat', function(data) {
                if(window.appendMessage) window.appendMessage(data);
                if(soundMsg) soundMsg.play().catch(()=>{});
            });
        }

        channel.bind('new-lead', function(data) {
            if (myType === 'manager') { 
                playSound(); 
                handleNotification(`New ${data.type} Lead`, data.amount); 
            }
        });

        channel.bind('status-update', function(data) {
            const status = data.status; const type = data.type;
            if (myType === 'manager') { 
                playSound(); 
                handleNotification(`${type} Update`, status); 
            }
            else if (myType === 'insurance' && type === 'insurance') { 
                playSound(); 
                handleNotification(`Insurance ${status}`, data.client); 
            }
            else if (myType === 'billing' && type === 'billing') { 
                playSound(); 
                handleNotification(`Billing ${status}`, data.client); 
            }
        });

        channel.bind('lead-edited', function(data) {
            if (myType === 'manager') { 
                playSound(); 
                handleNotification(`${data.type} Edited`, data.client); 
            }
            else if (myType === 'billing' && data.type === 'billing') { 
                playSound(); 
                handleNotification(`Lead Edited`, data.client); 
            }
        });

        function playSound() { if(soundLead) { soundLead.currentTime=0; soundLead.play().catch(e => console.log("Audio Blocked")); } }

        function handleNotification(title, msg) {
            // 1. Show Pop-out Toast (Bottom/Top Right)
            showToast(title, msg);

            // 2. Add to Scrollable Bell List (If Bell exists)
            addToBellList(title, msg);
        }

        function showToast(title, msg) {
            // Create container if not exists (Manager page might not have bell, but needs toast)
            let container = document.getElementById('toast-root');
            if(!container) {
                container = document.createElement('div');
                container.id = 'toast-root';
                container.className = 'toast-container'; // CSS defined in style.css
                document.body.appendChild(container);
            }
            
            const el = document.createElement('div');
            el.className = "toast-card";
            el.innerHTML = `<div class="font-bold text-xs uppercase tracking-wide text-[#ff4d4d]">${title}</div><div class="text-sm text-white">${msg}</div>`;
            container.appendChild(el);
            setTimeout(() => { 
                el.style.opacity = '0'; 
                el.style.transform = 'translateX(100%)';
                setTimeout(()=>el.remove(), 300);
            }, 5000);
        }

        function addToBellList(title, msg) {
            const listBody = document.getElementById('notif-list-body');
            const badge = document.getElementById('notif-badge');
            
            if (listBody && badge) {
                // Remove 'No notifications' text if present
                if(listBody.querySelector('.text-center')) listBody.innerHTML = '';
                
                const item = document.createElement('div');
                item.className = "notif-item animate-fade-in-up";
                item.innerHTML = `<div class="notif-title">${title}</div><div class="notif-msg">${msg}</div>`;
                listBody.prepend(item); // Add to top
                
                // Update Badge
                let count = parseInt(badge.innerText) || 0;
                count++;
                badge.innerText = count;
                badge.classList.remove('hidden');
            }
        }
    }

    // Toggle Dropdown Function
    window.toggleNotifDropdown = function() {
        const dd = document.getElementById('notif-dropdown');
        if (dd) dd.classList.toggle('show');
        
        // Reset badge on open
        const badge = document.getElementById('notif-badge');
        if(badge && dd.classList.contains('show')) {
            badge.innerText = '0';
            badge.classList.add('hidden');
        }
    };

    // Close dropdown when clicking outside
    window.addEventListener('click', function(e) {
        if (!e.target.closest('.notification-container')) {
            const dd = document.getElementById('notif-dropdown');
            if (dd) dd.classList.remove('show');
        }
    });
});
