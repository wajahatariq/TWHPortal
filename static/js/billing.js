let allData = { billing: [], insurance: [], telecom_cb: [], insurance_cb: [], stats_bill: {}, stats_ins: {} };
let currentTab = 'stats';
let currentPendingType = 'billing';
let authUser = null;
let chartInstance = null; 

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
            document.getElementById('loginError').innerText = data.message;
            document.getElementById('loginError').classList.remove('hidden');
        }
    } catch (e) { console.error(e); }
});

function logout() { location.reload(); }

async function fetchAllData() {
    try {
        const res = await fetch(`/api/manager/data?token=auth_${authUser}`);
        allData = await res.json();
        renderCurrentTab();
    } catch(e) { console.error("Sync Error", e); }
}

function manualRefresh() {
    const btn = document.querySelector('button[onclick="manualRefresh()"]');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = "Syncing...";
    fetchAllData().then(() => { btn.innerHTML = oldHtml; showToast("Data Synced"); });
}

function switchMainTab(tab) {
    currentTab = tab;
    document.querySelectorAll('nav button[id^="nav"]').forEach(b => {
        b.classList.remove('bg-blue-600', 'text-white');
        b.classList.add('text-slate-400', 'hover:bg-slate-700');
    });
    let navId = 'nav' + tab.charAt(0).toUpperCase() + tab.slice(1);
    if(tab === 'chargebacks') navId = 'navCB';
    const activeBtn = document.getElementById(navId);
    if(activeBtn) {
        activeBtn.classList.remove('text-slate-400', 'hover:bg-slate-700');
        activeBtn.classList.add('bg-blue-600', 'text-white');
    }
    ['viewStats', 'viewPending', 'viewEdit', 'viewChargebacks', 'viewAnalysis'].forEach(id => document.getElementById(id).classList.add('hidden'));

    if (tab === 'stats') { document.getElementById('viewStats').classList.remove('hidden'); updateDashboardStats(); }
    else if (tab === 'pending') { document.getElementById('viewPending').classList.remove('hidden'); renderPending(); }
    else if (tab === 'edit') { document.getElementById('viewEdit').classList.remove('hidden'); }
    else if (tab === 'chargebacks') { document.getElementById('viewChargebacks').classList.remove('hidden'); renderChargebackList(); }
    else if (tab === 'analysis') { document.getElementById('viewAnalysis').classList.remove('hidden'); updateAgentSelector(); renderAnalysis(); }
}

function renderCurrentTab() { switchMainTab(currentTab); }

function updateDashboardStats() {
    const type = document.getElementById('statsSelector').value;
    const stats = type === 'billing' ? allData.stats_bill : allData.stats_ins;
    document.getElementById('dispToday').innerText = '$' + (stats.today || 0).toFixed(2);
    document.getElementById('dispNight').innerText = '$' + (stats.night || 0).toFixed(2);
    document.getElementById('dispPendingAmt').innerText = '$' + (stats.pending_amt || 0).toFixed(2);
    document.getElementById('dispDeclined').innerText = '$' + (stats.declined_amt || 0).toFixed(2);
    document.getElementById('dispCB').innerText = '$' + (stats.cb_amt || 0).toFixed(2);
    const list = document.getElementById('agentPerformanceList');
    list.innerHTML = '';
    if(stats.breakdown) {
        Object.entries(stats.breakdown).forEach(([agent, amt]) => {
            list.innerHTML += `<div class="bg-slate-700/50 p-3 rounded-lg flex justify-between"><span class="font-bold">${agent}</span><span class="text-green-400">$${amt.toFixed(2)}</span></div>`;
        });
    }
}

function updateAgentSelector() {
    const sheet = document.getElementById('analysisSheetSelector').value;
    const main = allData[sheet] || [];
    const cb = allData[sheet === 'billing' ? 'telecom_cb' : 'insurance_cb'] || [];
    const rows = [...main, ...cb];
    const selector = document.getElementById('analysisAgentSelector');
    selector.innerHTML = '<option value="all">All Agents</option>';
    const agents = new Set();
    rows.forEach(row => { const agent = row['Agent Name'] || row['Agent']; if(agent) agents.add(agent); });
    agents.forEach(a => { const opt = document.createElement('option'); opt.value = a; opt.innerText = a; selector.appendChild(opt); });
}

function renderAnalysis() {
    const sheet = document.getElementById('analysisSheetSelector').value;
    let dateStart = document.getElementById('dateStart').value;
    let dateEnd = document.getElementById('dateEnd').value;
    const selectedAgent = document.getElementById('analysisAgentSelector').value;
    const statusFilter = document.getElementById('analysisStatusSelector').value;
    const searchText = document.getElementById('analysisSearch').value.toLowerCase();
    
    if(dateStart) dateStart = dateStart.replace('T', ' ');
    if(dateEnd) dateEnd = dateEnd.replace('T', ' ');

    const main = allData[sheet] || [];
    const cb = allData[sheet === 'billing' ? 'telecom_cb' : 'insurance_cb'] || [];
    const cb_tagged = cb.map(r => { const newR = {...r}; const k = Object.keys(newR).find(key => key.toLowerCase().includes('status')); if(k) newR[k] = 'Chargeback'; return newR; });
    let rows = [...main, ...cb_tagged];
    
    if (dateStart) rows = rows.filter(r => (r['Timestamp'] || r['Date'] || '') >= dateStart);
    if (dateEnd) rows = rows.filter(r => (r['Timestamp'] || r['Date'] || '') <= dateEnd);
    if (selectedAgent !== 'all') rows = rows.filter(r => (r['Agent Name'] || r['Agent']) === selectedAgent);
    if (searchText) rows = rows.filter(r => Object.values(r).join(' ').toLowerCase().includes(searchText));
    
    const getStatus = (r) => { const k = Object.keys(r).find(key => key.toLowerCase().includes('status')); return k ? r[k] : 'Unknown'; };
    if (statusFilter !== 'all') rows = rows.filter(r => getStatus(r).toLowerCase().includes(statusFilter.toLowerCase()));

    let tCharged = 0, tDeclined = 0, tCB = 0;
    let hourlyCounts = Array(24).fill(0);
    
    rows.forEach(r => {
        const s = getStatus(r).toLowerCase();
        const val = r['Charge'] || r['Charge Amount'] || r['Amount'];
        const num = parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
        
        if(s.includes('charged') || s.includes('approved')) {
            tCharged += num;
            const timeStr = r['Timestamp'] || r['Date'];
            if(timeStr && timeStr.includes(' ')) {
                const hour = parseInt(timeStr.split(' ')[1].split(':')[0]);
                if(!isNaN(hour)) hourlyCounts[hour] += num;
            }
        }
        else if(s.includes('declined')) tDeclined += num;
        else if(s.includes('chargeback')) tCB += num;
    });

    const chargedCount = rows.filter(r => { const s = getStatus(r).toLowerCase(); return s.includes('charged') || s.includes('approved'); }).length;
    const avg = chargedCount ? (tCharged / chargedCount) : 0;
    const peakHourIdx = hourlyCounts.indexOf(Math.max(...hourlyCounts));
    const peakHourAmt = hourlyCounts[peakHourIdx];
    const peakHourStr = peakHourAmt > 0 ? `${peakHourIdx}:00 - ${peakHourIdx+1}:00` : "-";

    document.getElementById('anaCharged').innerText = '$' + tCharged.toFixed(2);
    document.getElementById('anaDeclined').innerText = '$' + tDeclined.toFixed(2);
    document.getElementById('anaCB').innerText = '$' + tCB.toFixed(2);
    document.getElementById('anaCount').innerText = rows.length;
    document.getElementById('anaAvg').innerText = '$' + avg.toFixed(2);
    document.getElementById('anaPeak').innerText = peakHourStr;

    const thead = document.getElementById('analysisHeader');
    const tbody = document.getElementById('analysisBody');
    thead.innerHTML = ''; tbody.innerHTML = '';

    if (rows.length > 0) {
        let headers = Object.keys(rows[0]).filter(k => k !== 'row_index');
        const tsKey = headers.find(k => k.toLowerCase().includes('timestamp') || k.toLowerCase() === 'date');
        if (tsKey) { headers = headers.filter(k => k !== tsKey); headers.unshift(tsKey); }

        headers.forEach(h => thead.innerHTML += `<th class="px-4 py-2">${h}</th>`);
        rows.slice(0, 100).forEach(row => {
            const tr = document.createElement('tr');
            headers.forEach(h => {
                let val = row[h];
                let colorClass = 'text-slate-300';
                if(h.toLowerCase().includes('status')) {
                    const s = String(val).toLowerCase();
                    if(s.includes('charged')) colorClass = 'text-green-400 font-bold';
                    else if(s.includes('declined')) colorClass = 'text-red-400 font-bold';
                    else if(s.includes('pending')) colorClass = 'text-yellow-400 font-bold';
                    else if(s.includes('chargeback')) colorClass = 'text-purple-400 font-bold';
                }
                tr.innerHTML += `<td class="px-4 py-2 border-b border-slate-800 ${colorClass}">${val}</td>`;
            });
            tbody.appendChild(tr);
        });
    }

    const ctx = document.getElementById('analysisChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: Array.from({length: 24}, (_, i) => `${i}:00`), datasets: [{ label: 'Charged Amount ($)', data: hourlyCounts, backgroundColor: 'rgba(34, 197, 94, 0.6)', borderColor: '#22c55e', borderWidth: 1 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8' } } }, plugins: { legend: { labels: { color: '#e2e8f0' } } } }
    });
}

// --- PENDING TAB (DETAILED CARDS) ---
function switchPendingSubTab(type) {
    currentPendingType = type;
    document.getElementById('subBill').className = type === 'billing' ? "text-lg font-bold text-blue-400 border-b-2 border-blue-400 pb-1" : "text-lg font-bold text-slate-500 hover:text-white pb-1";
    document.getElementById('subIns').className = type === 'insurance' ? "text-lg font-bold text-blue-400 border-b-2 border-blue-400 pb-1" : "text-lg font-bold text-slate-500 hover:text-white pb-1";
    renderPending();
}

function renderPending() {
    const container = document.getElementById('pendingContainer');
    container.innerHTML = '';
    const data = allData[currentPendingType] || [];
    const getStatus = (row) => { const key = Object.keys(row).find(k => k.toLowerCase().includes('status')); return key ? row[key] : ''; };
    const pending = data.filter(r => (getStatus(r) || '').toLowerCase() === 'pending');
    
    if(pending.length === 0) { container.innerHTML = '<div class="col-span-3 text-center text-slate-500 py-10">No Pending Approvals</div>'; return; }

    pending.forEach(item => {
        const id = item['Order ID'] || item['Record_ID'];
        const agent = item['Agent Name'] || item['Agent'];
        const amount = item['Charge'] || item['Charge Amount'] || item['Amount'];
        const client = item['Client Name'] || item['Name'] || 'Unknown';
        const phone = item['Phone'] || item['Ph Number'] || item['Phone Number'] || 'N/A';
        const email = item['Email'] || 'N/A';
        const timeVal = item['Timestamp'] || item['Date'] || '';

        container.innerHTML += `
            <div id="pending-${id}" class="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl relative overflow-hidden group hover:border-blue-500 transition">
                <div class="absolute top-0 right-0 bg-blue-600/20 text-blue-400 text-xs font-bold px-3 py-1 rounded-bl-lg border-b border-l border-blue-500/20">#${id}</div>
                <div class="flex justify-between items-start mb-6 mt-2">
                    <div><div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Agent</div><div class="text-xl font-bold text-white">${agent}</div></div>
                    <div class="text-right"><div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Amount</div><div class="text-3xl font-black text-green-400">${amount}</div></div>
                </div>
                <div class="space-y-3 mb-6 bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                    <div class="flex justify-between items-center text-sm"><span class="text-slate-500">Client:</span><span class="text-white font-medium truncate ml-2">${client}</span></div>
                    <div class="flex justify-between items-center text-sm"><span class="text-slate-500">Phone:</span><span class="text-slate-300 font-mono select-all ml-2">${phone}</span></div>
                    <div class="flex justify-between items-center text-sm"><span class="text-slate-500">Email:</span><span class="text-slate-300 truncate w-32 text-right ml-2" title="${email}">${email}</span></div>
                    <div class="flex justify-between items-center text-sm border-t border-slate-700/50 pt-2 mt-2"><span class="text-slate-500">Time:</span><span class="text-yellow-500 font-mono text-xs">${timeVal}</span></div>
                </div>
                <div class="flex gap-3">
                    <button onclick="updateStatus('${id}', 'Charged', '${currentPendingType}')" class="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-green-900/20 transition transform active:scale-95">Approve</button>
                    <button onclick="updateStatus('${id}', 'Declined', '${currentPendingType}')" class="flex-1 bg-slate-700 hover:bg-red-600 hover:text-white text-slate-300 font-bold py-3 rounded-lg shadow-lg transition transform active:scale-95">Decline</button>
                </div>
            </div>`;
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
        } else { alert(data.message); }
    } catch(e) { console.error(e); }
}

// --- CHARGEBACK TAB (OPTIMIZED) ---
function renderChargebackList() {
    const sheet = document.getElementById('cbSheetSelector').value;
    const filter = document.getElementById('cbSearch').value.toLowerCase().trim();
    const container = document.getElementById('cbListContainer');
    container.innerHTML = '';

    if(filter.length === 0) { container.innerHTML = `<div class="text-center text-slate-500 py-10">Enter ID, Name, or Card Number to search...</div>`; return; }

    const data = allData[sheet] || [];
    const getStatus = (row) => { const key = Object.keys(row).find(k => k.toLowerCase().includes('status')); return key ? row[key] : ''; };
    const charged = data.filter(r => { const s = (getStatus(r) || '').toLowerCase(); return s === 'charged' || s === 'approved'; });
    
    const filtered = charged.filter(r => {
        const client = (r['Client Name'] || r['Name'] || '').toLowerCase();
        const card = (r['Card Number'] || '').toLowerCase();
        const id = (r['Order ID'] || r['Record_ID'] || '').toString().toLowerCase();
        const agent = (r['Agent Name'] || r['Agent'] || '').toLowerCase();
        return client.includes(filter) || card.includes(filter) || id.includes(filter) || agent.includes(filter);
    });

    if(filtered.length === 0) { container.innerHTML = `<div class="text-center text-slate-500 py-4">No results found</div>`; return; }

    filtered.forEach(item => {
        const id = item['Order ID'] || item['Record_ID'];
        const agent = item['Agent Name'] || item['Agent'];
        const amount = item['Charge'] || item['Charge Amount'] || item['Amount'];
        const cardLast4 = (item['Card Number'] || '****').slice(-4);
        container.innerHTML += `
            <div class="bg-slate-800 p-4 rounded-lg border border-slate-700 flex justify-between items-center group hover:border-red-500/50 transition">
                <div>
                    <div class="font-bold text-white flex items-center gap-2">${agent} <span class="bg-slate-700 text-slate-300 text-[10px] px-1.5 py-0.5 rounded">#${id}</span></div>
                    <div class="text-sm text-slate-400 mt-1">${item['Client Name'] || item['Name']} <span class="mx-1">•</span> Card: ...${cardLast4}</div>
                    <div class="text-green-400 font-mono font-bold mt-1">${amount}</div>
                </div>
                <button onclick="markAsChargeback('${sheet}', '${id}')" class="bg-red-900/30 hover:bg-red-600 text-red-200 hover:text-white px-4 py-2 rounded-lg font-bold transition border border-red-800/50">Mark Chargeback</button>
            </div>`;
    });
}

async function markAsChargeback(type, id) {
    if(!confirm(`Warning: This will MOVE Lead #${id} to the Chargeback Sheet. Continue?`)) return;
    const formData = new FormData();
    formData.append('type', type);
    formData.append('id', id);
    try {
        const res = await fetch('/api/manager/mark_chargeback', { method: 'POST', body: formData });
        const data = await res.json();
        if(data.status === 'success') { showToast("Moved to Chargeback Sheet"); fetchAllData(); } else { alert(data.message); }
    } catch(e) { console.error(e); }
}

document.getElementById('pwdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('pwdUserId').value;
    const oldP = document.getElementById('oldPwd').value;
    const newP = document.getElementById('newPwd').value;
    const formData = new FormData();
    formData.append('user_id', userId); formData.append('old_password', oldP); formData.append('new_password', newP);
    const res = await fetch('/api/manager/change_password', {method: 'POST', body: formData});
    const data = await res.json();
    if(data.status === 'success') { alert("Password Changed Successfully. You may now login."); document.getElementById('pwdModal').classList.add('hidden'); document.getElementById('pwdForm').reset(); } else { alert(data.message); }
});

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
    } else { alert("Not Found"); }
}

async function updateStatusFromEdit() {
    const type = document.getElementById('e_type').value;
    const id = document.getElementById('e_order_id').value;
    const status = document.getElementById('e_status').value;
    await updateStatus(id, status, type);
}

async function deleteCurrentRecord() {
    if(!confirm("DELETE this record?")) return;
    const type = document.getElementById('e_type').value;
    const id = document.getElementById('e_order_id').value;
    const formData = new FormData();
    formData.append('type', type);
    formData.append('id', id);
    const res = await fetch('/api/delete-lead', {method: 'POST', body: formData});
    const d = await res.json();
    if(d.status === 'success') { alert("Deleted"); document.getElementById('editForm').reset(); document.getElementById('editForm').classList.add('hidden'); fetchAllData(); }
}

function showToast(msg) {
    let t = document.createElement('div');
    t.className = "fixed bottom-5 right-5 bg-blue-600 text-white px-6 py-3 rounded-xl shadow-2xl z-50 animate-bounce";
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}
