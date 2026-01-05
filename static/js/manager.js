// --- GLOBAL DATA STORE ---
let allData = { billing: [], insurance: [], stats_bill: {}, stats_ins: {} };
let currentTab = 'stats';
let currentPendingType = 'billing';
let authUser = null;

// --- LOGIN & INIT ---
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    try {
        const res = await fetch('/api/manager/login', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.status === 'success') {
            authUser = formData.get('user_id');
            document.getElementById('loginModal').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
            fetchAllData();
        } else {
            const err = document.getElementById('loginError');
            err.innerText = data.message;
            err.classList.remove('hidden');
        }
    } catch (e) { console.error(e); }
});

function logout() { location.reload(); }

async function fetchAllData() {
    try {
        // Fetch Fresh Data (No Cache)
        const res = await fetch(`/api/manager/data?token=auth_${authUser}`);
        allData = await res.json();
        renderCurrentTab();
    } catch(e) { console.error("Sync Error", e); }
}

function manualRefresh() {
    const btn = document.querySelector('button[onclick="manualRefresh()"]');
    const oldText = btn.innerText;
    btn.innerText = "Syncing...";
    fetchAllData().then(() => {
        btn.innerText = oldText;
        showToast("Data Synced");
    });
}

function switchMainTab(tab) {
    currentTab = tab;
    
    // UI Updates
    document.querySelectorAll('nav button[id^="nav"]').forEach(b => {
        b.classList.remove('bg-blue-600', 'text-white');
        b.classList.add('text-slate-400', 'hover:bg-slate-700');
    });
    const activeBtn = document.getElementById(tab === 'chargebacks' ? 'navCB' : 'nav' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if(activeBtn) {
        activeBtn.classList.remove('text-slate-400', 'hover:bg-slate-700');
        activeBtn.classList.add('bg-blue-600', 'text-white');
    }

    // Hide All Views
    ['viewStats', 'viewPending', 'viewEdit', 'viewChargebacks'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });

    // Show Active
    if (tab === 'stats') {
        document.getElementById('viewStats').classList.remove('hidden');
        updateDashboardStats();
    } else if (tab === 'pending') {
        document.getElementById('viewPending').classList.remove('hidden');
        renderPending();
    } else if (tab === 'edit') {
        document.getElementById('viewEdit').classList.remove('hidden');
    } else if (tab === 'chargebacks') {
        document.getElementById('viewChargebacks').classList.remove('hidden');
        renderChargebackList();
    }
}

function renderCurrentTab() { switchMainTab(currentTab); }

// --- STATS TAB ---
function updateDashboardStats() {
    const type = document.getElementById('statsSelector').value;
    const stats = type === 'billing' ? allData.stats_bill : allData.stats_ins;
    
    document.getElementById('dispToday').innerText = '$' + (stats.today || 0).toFixed(2);
    document.getElementById('dispNight').innerText = '$' + (stats.night || 0).toFixed(2);
    
    // NEW FIELDS
    document.getElementById('dispPendingAmt').innerText = '$' + (stats.pending_amt || 0).toFixed(2);
    document.getElementById('dispDeclined').innerText = '$' + (stats.declined_amt || 0).toFixed(2);
    document.getElementById('dispCB').innerText = '$' + (stats.cb_amt || 0).toFixed(2);

    const list = document.getElementById('agentPerformanceList');
    list.innerHTML = '';
    if(stats.breakdown) {
        Object.entries(stats.breakdown).forEach(([agent, amt]) => {
            list.innerHTML += `
                <div class="bg-slate-700/50 p-3 rounded-lg flex justify-between">
                    <span class="font-bold">${agent}</span>
                    <span class="text-green-400">$${amt.toFixed(2)}</span>
                </div>`;
        });
    }
}

// --- PENDING TAB ---
function switchPendingSubTab(type) {
    currentPendingType = type;
    document.getElementById('subBill').className = type === 'billing' ? "text-lg font-bold text-blue-400 border-b-2 border-blue-400 pb-1" : "text-lg font-bold text-slate-500 hover:text-white pb-1";
    document.getElementById('subIns').className = type === 'insurance' ? "text-lg font-bold text-blue-400 border-b-2 border-blue-400 pb-1" : "text-lg font-bold text-slate-500 hover:text-white pb-1";
    renderPending();
}

function renderPending() {
    const container = document.getElementById('pendingContainer');
    container.innerHTML = '';
    const data = allData[currentPendingType];
    
    const getStatus = (row) => {
        const key = Object.keys(row).find(k => k.toLowerCase().includes('status'));
        return key ? row[key] : '';
    };

    const pending = data.filter(r => (getStatus(r) || '').toLowerCase() === 'pending');
    
    if(pending.length === 0) {
        container.innerHTML = '<div class="col-span-3 text-center text-slate-500 py-10">No Pending Approvals</div>';
        return;
    }

    pending.forEach(item => {
        const id = item['Order ID'] || item['Record_ID'];
        const agent = item['Agent Name'] || item['Agent'];
        const amount = item['Charge'] || item['Charge Amount'] || item['Amount'];
        
        container.innerHTML += `
            <div id="pending-${id}" class="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg hover:border-blue-500 transition relative">
                <div class="absolute top-4 right-4 text-xs font-mono text-slate-500">#${id}</div>
                <h3 class="font-bold text-xl text-white mb-1">${agent}</h3>
                <div class="text-2xl font-black text-green-400 mb-4">${amount}</div>
                
                <div class="grid grid-cols-2 gap-2 text-sm text-slate-400 mb-4">
                    <div>${item['Client Name'] || item['Name']}</div>
                    <div>${item['Timestamp'] || item['Date']}</div>
                </div>

                <div class="flex gap-2">
                    <button onclick="updateStatus('${id}', 'Charged', '${currentPendingType}')" class="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg">Approve</button>
                    <button onclick="updateStatus('${id}', 'Declined', '${currentPendingType}')" class="flex-1 bg-slate-700 hover:bg-red-600 hover:text-white text-slate-300 font-bold py-2 rounded-lg">Decline</button>
                </div>
            </div>
        `;
    });
}

async function updateStatus(id, newStatus, sheetType) {
    if(!confirm(`Mark Lead #${id} as ${newStatus}?`)) return;
    
    const formData = new FormData();
    formData.append('type', sheetType);
    formData.append('id', id);
    formData.append('status', newStatus);

    try {
        const res = await fetch('/api/manager/update_status', { method: 'POST', body: formData });
        const data = await res.json();
        if(data.status === 'success') {
            const el = document.getElementById(`pending-${id}`);
            if(el) el.remove();
            showToast(`Marked as ${newStatus}`);
            fetchAllData(); 
        } else {
            alert(data.message);
        }
    } catch(e) { console.error(e); }
}

// --- CHARGEBACK TAB ---
function renderChargebackList() {
    const sheet = document.getElementById('cbSheetSelector').value;
    const filter = document.getElementById('cbSearch').value.toLowerCase();
    const container = document.getElementById('cbListContainer');
    container.innerHTML = '';

    const data = allData[sheet];
    const getStatus = (row) => {
        const key = Object.keys(row).find(k => k.toLowerCase().includes('status'));
        return key ? row[key] : '';
    };

    // List all Charged deals to allow moving them to CB
    const charged = data.filter(r => {
        const s = (getStatus(r) || '').toLowerCase();
        return s === 'charged' || s === 'approved';
    });
    
    const filtered = charged.filter(r => {
        const searchStr = Object.values(r).join(' ').toLowerCase();
        return searchStr.includes(filter);
    });

    filtered.forEach(item => {
        const id = item['Order ID'] || item['Record_ID'];
        const agent = item['Agent Name'] || item['Agent'];
        const amount = item['Charge'] || item['Charge Amount'] || item['Amount'];
        
        container.innerHTML += `
            <div class="bg-slate-800 p-4 rounded-lg border border-slate-700 flex justify-between items-center">
                <div>
                    <div class="font-bold text-white">${agent} <span class="text-slate-500 text-xs ml-2">#${id}</span></div>
                    <div class="text-sm text-slate-400">${item['Client Name'] || item['Name']} - <span class="text-green-400">${amount}</span></div>
                </div>
                <button onclick="markAsChargeback('${sheet}', '${id}')" class="bg-red-900/50 hover:bg-red-600 text-red-200 hover:text-white px-4 py-2 rounded-lg font-bold transition border border-red-800">
                    Mark Chargeback
                </button>
            </div>
        `;
    });
}

async function markAsChargeback(type, id) {
    if(!confirm(`Warning: This will MOVE Lead #${id} to the Chargeback Sheet and delete it from here. Continue?`)) return;

    const formData = new FormData();
    formData.append('type', type);
    formData.append('id', id);

    try {
        const res = await fetch('/api/manager/mark_chargeback', { method: 'POST', body: formData });
        const data = await res.json();
        if(data.status === 'success') {
            showToast("Moved to Chargeback Sheet");
            fetchAllData(); 
        } else {
            alert(data.message);
        }
    } catch(e) { console.error(e); }
}

// --- EDIT TAB ---
function searchForEdit() {
    const id = document.getElementById('editSearchId').value;
    const type = document.getElementById('editSheetType').value;
    if(!id) return;
    
    const record = allData[type].find(r => (r['Order ID'] == id || r['Record_ID'] == id));
    if(record) {
        document.getElementById('editForm').classList.remove('hidden');
        document.getElementById('e_type').value = type;
        document.getElementById('e_order_id').value = id;
        document.getElementById('e_agent').value = record['Agent Name'] || record['Agent'];
        document.getElementById('e_client').value = record['Client Name'] || record['Name'];
        
        const key = Object.keys(record).find(k => k.toLowerCase().includes('status'));
        document.getElementById('e_status').value = record[key] || 'Pending';
    } else {
        alert("Not Found");
    }
}

async function updateStatusFromEdit() {
    const type = document.getElementById('e_type').value;
    const id = document.getElementById('e_order_id').value;
    const status = document.getElementById('e_status').value;
    await updateStatus(id, status, type);
}

async function deleteCurrentRecord() {
    if(!confirm("Are you sure you want to DELETE this record?")) return;
    const type = document.getElementById('e_type').value;
    const id = document.getElementById('e_order_id').value;
    const formData = new FormData();
    formData.append('type', type);
    formData.append('id', id);
    const res = await fetch('/api/delete-lead', {method: 'POST', body: formData});
    const d = await res.json();
    if(d.status === 'success') {
        alert("Deleted");
        document.getElementById('editForm').reset();
        document.getElementById('editForm').classList.add('hidden');
        fetchAllData();
    }
}

// --- CHANGE PASSWORD ---
document.getElementById('pwdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldP = document.getElementById('oldPwd').value;
    const newP = document.getElementById('newPwd').value;
    
    const formData = new FormData();
    formData.append('user_id', authUser);
    formData.append('old_password', oldP);
    formData.append('new_password', newP);
    
    const res = await fetch('/api/manager/change_password', {method: 'POST', body: formData});
    const data = await res.json();
    
    if(data.status === 'success') {
        alert("Password Changed Successfully");
        document.getElementById('pwdModal').classList.add('hidden');
        document.getElementById('pwdForm').reset();
    } else {
        alert(data.message);
    }
});

function showToast(msg) {
    let t = document.createElement('div');
    t.className = "fixed bottom-5 right-5 bg-blue-600 text-white px-6 py-3 rounded-xl shadow-2xl z-50 animate-bounce";
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
