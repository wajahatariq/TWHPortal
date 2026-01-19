let allData = { 
    billing: [], insurance: [], design: [], ebook: [],
    totals: { billing:0, insurance:0, design:0, ebook:0 }
};
let chatHistory = [];
let currentChatDept = 'billing';

// --- AUDIO ---
const soundNewLead = new Audio('/static/sounds/new_lead.mp3');

// --- PUSHER ---
if (window.PUSHER_KEY) {
    const pusher = new Pusher(window.PUSHER_KEY, { cluster: window.PUSHER_CLUSTER });
    const channel = pusher.subscribe('techware-channel');

    channel.bind('new-lead', function(data) {
        soundNewLead.play().catch(e=>console.log(e));
        showNotification(`New ${data.type} Lead: ${data.amount}`, 'success');
        fetchData(); // Updates totals instantly
    });

    channel.bind('status-update', function(data) {
        fetchData();
    });

    channel.bind('new-chat', function(data) {
        chatHistory.push(data);
        renderChat();
    });
}

// --- LOGIN & INIT ---
const token = sessionStorage.getItem('twh_token');
if (token) {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    fetchData();
    fetchChat();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const res = await fetch('/api/manager/login', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.status === 'success') {
        sessionStorage.setItem('twh_token', data.token);
        location.reload();
    } else { document.getElementById('loginError').classList.remove('hidden'); }
});

function logout() { sessionStorage.removeItem('twh_token'); location.reload(); }

// --- DATA FETCHING ---
async function fetchData() {
    const t = sessionStorage.getItem('twh_token');
    if (!t) return;
    const res = await fetch(`/api/manager/data?token=${t}&_t=${Date.now()}`);
    const json = await res.json();
    
    allData = json; // Stores billing, insurance, design, ebook lists AND totals
    
    // Update 4 Large Boxes
    document.getElementById('totalBilling').innerText = '$' + (json.totals.billing || 0).toLocaleString();
    document.getElementById('totalInsurance').innerText = '$' + (json.totals.insurance || 0).toLocaleString();
    document.getElementById('totalDesign').innerText = '$' + (json.totals.design || 0).toLocaleString();
    document.getElementById('totalEbook').innerText = '$' + (json.totals.ebook || 0).toLocaleString();

    // Render tables if visible
    if(!document.getElementById('viewDesign').classList.contains('hidden')) renderTable('design');
    if(!document.getElementById('viewEbook').classList.contains('hidden')) renderTable('ebook');
    if(!document.getElementById('viewPending').classList.contains('hidden')) renderPending();
}

// --- CHAT LOGIC ---
async function fetchChat() {
    const res = await fetch('/api/chat/history');
    chatHistory = await res.json();
    renderChat();
}

function switchChatTab(dept) {
    currentChatDept = dept;
    const btnBill = document.getElementById('chatTabBill');
    const btnIns = document.getElementById('chatTabIns');
    
    if(dept === 'billing') {
        btnBill.className = "text-[var(--color-primary)] font-bold border-b-2 border-[var(--color-primary)]";
        btnIns.className = "text-gray-500 font-bold hover:text-white";
    } else {
        btnIns.className = "text-[var(--color-primary)] font-bold border-b-2 border-[var(--color-primary)]";
        btnBill.className = "text-gray-500 font-bold hover:text-white";
    }
    renderChat();
}

function renderChat() {
    const win = document.getElementById('chatWindow');
    win.innerHTML = '';
    // Filter by department
    const filtered = chatHistory.filter(m => m.dept === currentChatDept);
    
    filtered.forEach(msg => {
        const div = document.createElement('div');
        div.className = "p-2 rounded bg-gray-900 border border-gray-800";
        div.innerHTML = `<span class="text-[var(--color-primary)] font-bold">${msg.sender}:</span> <span class="text-white">${msg.message}</span> <span class="text-xs text-gray-500 ml-2">${msg.time}</span>`;
        win.appendChild(div);
    });
    win.scrollTop = win.scrollHeight;
}

document.getElementById('managerChatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('chatMsg').value;
    if(!msg) return;
    
    const formData = new FormData();
    formData.append('sender', 'Manager');
    formData.append('role', 'Manager');
    formData.append('dept', currentChatDept); // Send to current tab's room
    formData.append('message', msg);
    
    await fetch('/api/chat/send', { method: 'POST', body: formData });
    document.getElementById('chatMsg').value = '';
});

// --- NAVIGATION ---
function switchMainTab(tab) {
    ['viewStats', 'viewPending', 'viewDesign', 'viewEbook'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['navStats', 'navPending', 'navDesign', 'navEbook'].forEach(id => document.getElementById(id).classList.remove('tab-active'));
    
    document.getElementById('view' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.remove('hidden');
    document.getElementById('nav' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('tab-active');

    if(tab === 'design') renderTable('design');
    if(tab === 'ebook') renderTable('ebook');
    if(tab === 'pending') renderPending();
}

// --- TABLE RENDERERS ---
function renderTable(type) {
    const data = allData[type] || [];
    const tbody = document.getElementById('body' + type.charAt(0).toUpperCase() + type.slice(1));
    const thead = document.getElementById('header' + type.charAt(0).toUpperCase() + type.slice(1));
    
    thead.innerHTML = '<th class="p-4">Date</th><th class="p-4">Client</th><th class="p-4">Service</th><th class="p-4">Charge</th><th class="p-4">Status</th>';
    tbody.innerHTML = '';

    data.forEach(row => {
        tbody.innerHTML += `
            <tr class="border-b border-gray-800 hover:bg-gray-900">
                <td class="p-4 text-gray-400">${row.Timestamp || ''}</td>
                <td class="p-4 font-bold">${row.Name}</td>
                <td class="p-4">${row.Service}</td>
                <td class="p-4 text-[var(--color-accent)] font-mono">${row.Charge}</td>
                <td class="p-4 text-sm">${row.Status || 'Pending'}</td>
            </tr>
        `;
    });
}

function renderPending() {
    const container = document.getElementById('pendingContainer');
    container.innerHTML = '';
    // Combine Billing and Insurance Pending
    const pendingB = (allData.billing || []).filter(r => r.Status === 'Pending').map(r => ({...r, type:'billing'}));
    const pendingI = (allData.insurance || []).filter(r => r.Status === 'Pending').map(r => ({...r, type:'insurance'}));
    const all = [...pendingB, ...pendingI];

    if(all.length === 0) { container.innerHTML = '<div class="text-gray-500">No pending approvals.</div>'; return; }

    all.forEach(row => {
        const div = document.createElement('div');
        div.className = "bg-gray-900 border border-gray-700 p-4 rounded-xl";
        div.innerHTML = `
            <div class="flex justify-between font-bold mb-2">
                <span class="text-[var(--color-primary)]">${row['Agent Name']}</span>
                <span class="text-[var(--color-accent)]">${row.Charge}</span>
            </div>
            <div class="text-sm text-gray-400 mb-4">
                <div>Client: ${row.Name}</div>
                <div>Type: ${row.type.toUpperCase()}</div>
            </div>
            <div class="grid grid-cols-2 gap-2">
                <button onclick="setStatus('${row.type}', '${row['Order ID']}', 'Charged')" class="bg-green-600 text-white py-1 rounded">Approve</button>
                <button onclick="setStatus('${row.type}', '${row['Order ID']}', 'Declined')" class="bg-red-600 text-white py-1 rounded">Decline</button>
            </div>
        `;
        container.appendChild(div);
    });
}

async function setStatus(type, id, status) {
    const formData = new FormData();
    formData.append('type', type); formData.append('id', id); formData.append('status', status);
    await fetch('/api/manager/update_status', { method: 'POST', body: formData });
    fetchData();
}

function showNotification(msg, type) {
    const container = document.getElementById('notification-container');
    const div = document.createElement('div');
    div.className = `p-3 rounded shadow-lg text-white font-bold animate-bounce ${type==='success'?'bg-green-600':'bg-blue-600'}`;
    div.innerText = msg;
    container.appendChild(div);
    setTimeout(() => div.remove(), 5000);
}
