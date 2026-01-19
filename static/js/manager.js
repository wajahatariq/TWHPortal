let allData = { 
    billing: [], insurance: [], design: [], ebook: [],
    stats_bill: {today:0, night:0, pending:0, breakdown:{}}, 
    stats_ins: {today:0, night:0, pending:0, breakdown:{}},
    totals: { billing:0, insurance:0, design:0, ebook:0 }
};
let pendingSubTab = 'billing';
let myChart = null;

// --- INIT ---
const token = sessionStorage.getItem('twh_token');
if (token) {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dateStart').value = today;
    document.getElementById('dateEnd').value = today;
    fetchData();
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

async function fetchData() {
    const t = sessionStorage.getItem('twh_token');
    if (!t) return;
    
    // Fetch Data
    const res = await fetch(`/api/manager/data?token=${t}&_t=${Date.now()}`);
    const json = await res.json();
    
    allData = json;
    
    // 1. Update Original Dashboard
    updateDashboardStats();
    if(!document.getElementById('viewPending').classList.contains('hidden')) renderPendingCards();
    if(!document.getElementById('viewAnalysis').classList.contains('hidden')) renderAnalysis();

    // 2. Update NEW Daily Totals (The 4 Boxes)
    document.getElementById('totalBilling').innerText = '$' + (json.totals?.billing || 0).toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('totalInsurance').innerText = '$' + (json.totals?.insurance || 0).toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('totalDesign').innerText = '$' + (json.totals?.design || 0).toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('totalEbook').innerText = '$' + (json.totals?.ebook || 0).toLocaleString(undefined, {minimumFractionDigits: 2});

    // 3. Update Design/Ebook Tables if visible
    if(!document.getElementById('viewDesign').classList.contains('hidden')) renderSimpleTable('design');
    if(!document.getElementById('viewEbook').classList.contains('hidden')) renderSimpleTable('ebook');
}

function updateDashboardStats() {
    const dept = document.getElementById('statsSelector').value;
    const stats = dept === 'billing' ? allData.stats_bill : allData.stats_ins;
    
    document.getElementById('dispToday').innerText = '$' + (stats.today || 0).toFixed(2);
    document.getElementById('dispNight').innerText = '$' + (stats.night || 0).toFixed(2);
    document.getElementById('dispPending').innerText = stats.pending || 0;

    const breakdown = stats.breakdown || {};
    const sortedAgents = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
    const listContainer = document.getElementById('agentPerformanceList');
    
    if(listContainer) {
        listContainer.innerHTML = '';
        if (sortedAgents.length === 0) {
            listContainer.innerHTML = '<div class="text-slate-500 col-span-full italic">No night sales yet.</div>';
        } else {
            sortedAgents.forEach(([agent, amount]) => {
                const item = document.createElement('div');
                item.className = "flex justify-between items-center bg-slate-700/50 p-3 rounded-lg border border-slate-600";
                item.innerHTML = `<span class="font-bold text-white">${agent}</span><span class="font-mono text-blue-300 font-bold">$${amount.toLocaleString()}</span>`;
                listContainer.appendChild(item);
            });
        }
    }
}

function switchMainTab(tab) {
    ['viewStats', 'viewPending', 'viewAnalysis', 'viewEdit', 'viewDaily', 'viewDesign', 'viewEbook'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['navStats', 'navPending', 'navAnalysis', 'navEdit', 'navDaily', 'navDesign', 'navEbook'].forEach(id => {
        document.getElementById(id).classList.remove('bg-blue-600', 'text-white');
        document.getElementById(id).classList.add('text-slate-400');
    });

    const viewId = 'view' + tab.charAt(0).toUpperCase() + tab.slice(1);
    const navId = 'nav' + tab.charAt(0).toUpperCase() + tab.slice(1);
    
    document.getElementById(viewId).classList.remove('hidden');
    document.getElementById(navId).classList.remove('text-slate-400');
    document.getElementById(navId).classList.add('bg-blue-600', 'text-white');

    if(tab === 'pending') renderPendingCards();
    if(tab === 'analysis') { updateAgentSelector(); renderAnalysis(); }
    if(tab === 'design') renderSimpleTable('design');
    if(tab === 'ebook') renderSimpleTable('ebook');
}

function renderSimpleTable(type) {
    const data = (type === 'design' ? allData.design : allData.ebook) || [];
    const tbody = document.getElementById('body' + type.charAt(0).toUpperCase() + type.slice(1));
    const thead = document.getElementById('header' + type.charAt(0).toUpperCase() + type.slice(1));
    
    thead.innerHTML = '<th class="p-4">Date</th><th class="p-4">Client</th><th class="p-4">Service</th><th class="p-4">Charge</th><th class="p-4">Status</th>';
    tbody.innerHTML = '';

    data.forEach(row => {
        tbody.innerHTML += `
            <tr class="border-b border-slate-800 hover:bg-slate-800/50">
                <td class="p-4 text-slate-400 text-sm">${row.Timestamp || ''}</td>
                <td class="p-4 text-white font-bold">${row.Name}</td>
                <td class="p-4 text-slate-300">${row.Service}</td>
                <td class="p-4 text-green-400 font-mono">${row.Charge}</td>
                <td class="p-4"><span class="px-2 py-1 rounded text-xs font-bold ${row.Status === 'Charged' ? 'bg-green-900 text-green-400' : 'bg-yellow-900 text-yellow-400'}">${row.Status || 'Pending'}</span></td>
            </tr>
        `;
    });
}

function switchPendingSubTab(tab) {
    pendingSubTab = tab;
    document.getElementById('subBill').className = tab === 'billing' ? "text-lg font-bold text-blue-400 border-b-2 border-blue-400 pb-1" : "text-lg font-bold text-slate-500 hover:text-white pb-1";
    document.getElementById('subIns').className = tab === 'insurance' ? "text-lg font-bold text-green-400 border-b-2 border-green-400 pb-1" : "text-lg font-bold text-slate-500 hover:text-white pb-1";
    renderPendingCards();
}

function renderPendingCards() {
    const container = document.getElementById('pendingContainer');
    container.innerHTML = '';
    const rawData = pendingSubTab === 'billing' ? allData.billing : allData.insurance;
    const data = rawData.filter(row => row['Status'] === 'Pending').slice().reverse();

    if(data.length === 0) {
        container.innerHTML = `<div class="col-span-3 text-center text-slate-500 py-10">No pending orders.</div>`;
        return;
    }

    data.forEach(row => {
        const id = row['Record_ID'] || row['Order ID']; 
        const charge = row['Charge'] || row['Charge Amount'];
        const card = document.createElement('div');
        card.className = "bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg p-4 space-y-4";
        card.innerHTML = `
            <div class="flex justify-between items-center border-b border-slate-700 pb-2">
                <h3 class="font-bold text-white">${row['Agent Name']}</h3>
                <span class="text-green-400 font-bold">${charge}</span>
            </div>
            <div class="text-sm text-slate-400 space-y-1">
                <div>Client: <span class="text-white">${row['Name'] || row['Client Name']}</span></div>
                <div>Card: <span class="text-white font-mono tracking-wider">${row['Card Number']}</span></div>
                <div>Exp: <span class="text-white">${row['Expiry Date']}</span> CVC: <span class="text-red-400">${row['CVC']}</span></div>
            </div>
            <div class="grid grid-cols-2 gap-3 pt-2">
                <button onclick="setStatus('${pendingSubTab}', '${id}', 'Charged')" class="bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-bold">Approve</button>
                <button onclick="setStatus('${pendingSubTab}', '${id}', 'Declined')" class="bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-bold">Decline</button>
            </div>
        `;
        container.appendChild(card);
    });
}

async function setStatus(type, id, status) {
    const formData = new FormData(); 
    formData.append('type', type); formData.append('id', id); formData.append('status', status);
    await fetch('/api/manager/update_status', { method: 'POST', body: formData });
    fetchData();
}

// --- ANALYSIS FUNCTIONS (KEPT ORIGINAL) ---
function updateAgentSelector() {
    const type = document.getElementById('analysisSheetSelector').value;
    const data = type === 'billing' ? allData.billing : allData.insurance;
    const agents = [...new Set(data.map(item => item['Agent Name']))].sort();
    const selector = document.getElementById('analysisAgentSelector');
    selector.innerHTML = '<option value="all">All Agents</option>';
    agents.forEach(agent => { if(agent) { const opt = document.createElement('option'); opt.value = agent; opt.innerText = agent; selector.appendChild(opt); } });
}

function renderAnalysis() {
    const type = document.getElementById('analysisSheetSelector').value;
    const search = document.getElementById('analysisSearch').value.toLowerCase();
    const agentFilter = document.getElementById('analysisAgentSelector').value;
    
    const dStart = new Date(document.getElementById('dateStart').value); dStart.setHours(0,0,0);
    const dEnd = new Date(document.getElementById('dateEnd').value); dEnd.setHours(23,59,59);

    const data = (type === 'billing' ? allData.billing : allData.insurance).slice().reverse();
    
    const filtered = data.filter(row => {
        const t = new Date(row['Timestamp']);
        if(t < dStart || t > dEnd) return false;
        if(agentFilter !== 'all' && row['Agent Name'] !== agentFilter) return false;
        return JSON.stringify(row).toLowerCase().includes(search);
    });

    let total = 0; 
    filtered.forEach(r => { if(r['Status'] === 'Charged') total += parseFloat(String(r['Charge']).replace(/[^0-9.]/g, '') || 0); });

    document.getElementById('anaTotal').innerText = '$' + total.toLocaleString();
    document.getElementById('anaCount').innerText = filtered.length;
    document.getElementById('anaAvg').innerText = filtered.length ? '$' + (total/filtered.length).toFixed(2) : '$0.00';

    const tbody = document.getElementById('analysisBody');
    tbody.innerHTML = '';
    const columns = type === 'billing' ? ['Agent Name', 'Name', 'Charge', 'Status', 'Timestamp'] : ['Agent Name', 'Name', 'Charge', 'Status', 'Timestamp'];
    
    document.getElementById('analysisHeader').innerHTML = columns.map(c => `<th class="p-3 text-left text-xs font-bold text-slate-400 uppercase">${c}</th>`).join('');

    filtered.forEach(row => {
        let rowHtml = `<tr class="hover:bg-slate-800 transition-colors border-b border-slate-800">`;
        columns.forEach(col => {
            let val = row[col] || row[col.replace('Name', 'Client Name')] || '';
            let color = col === 'Status' ? (val === 'Charged' ? 'text-green-400' : 'text-yellow-400') : 'text-slate-300';
            rowHtml += `<td class="p-3 ${color} text-sm">${val}</td>`;
        });
        tbody.innerHTML += rowHtml + '</tr>';
    });
}

async function searchForEdit() {
    const type = document.getElementById('editSheetType').value;
    const id = document.getElementById('editSearchId').value;
    const res = await fetch(`/api/get-lead?type=${type}&id=${id}`);
    const json = await res.json();
    if(json.status === 'success') {
        const d = json.data;
        document.getElementById('editForm').classList.remove('hidden');
        document.getElementById('e_agent').value = d['Agent Name'];
        document.getElementById('e_client').value = d['Name'] || d['Client Name'];
        document.getElementById('e_phone').value = d['Ph Number'];
        document.getElementById('e_email').value = d['Email'];
        document.getElementById('e_charge').value = d['Charge'];
        document.getElementById('e_status').value = d['Status'];
        document.getElementById('e_type').value = type;
        document.getElementById('e_order_id').value = d['Record_ID'];
        document.getElementById('e_record_id').value = d['Record_ID'];
    } else alert("Not Found");
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!confirm("Update?")) return;
    const formData = new FormData(e.target);
    formData.append('is_edit', 'true'); 
    await fetch('/api/save-lead', { method: 'POST', body: formData });
    fetchData(); 
    document.getElementById('editForm').classList.add('hidden');
});

async function deleteCurrentRecord() {
    if(!confirm("Delete?")) return;
    const type = document.getElementById('e_type').value;
    const id = document.getElementById('e_order_id').value || document.getElementById('e_record_id').value;
    const formData = new FormData(); formData.append('type', type); formData.append('id', id);
    await fetch('/api/delete-lead', { method: 'POST', body: formData });
    fetchData(); 
    document.getElementById('editForm').classList.add('hidden');
}

async function manualRefresh() {
    await fetchData();
}

setInterval(fetchData, 60000);
