let allData = { 
    billing: [], 
    insurance: [], 
    design: [],
    ebook: [],
    stats_bill: {today:0, night:0, pending:0, breakdown:{}}, 
    stats_ins: {today:0, night:0, pending:0, breakdown:{}},
    daily_stats: { billing: 0, insurance: 0, design: 0, ebook: 0 }
};
let pendingSubTab = 'billing';
let myChart = null;

const soundNewLead = new Audio('/static/sounds/new_lead.mp3');
document.body.addEventListener('click', () => { soundNewLead.load(); }, { once: true });

// --- PUSHER SETUP ---
if (window.PUSHER_KEY) {
    const pusher = new Pusher(window.PUSHER_KEY, { cluster: window.PUSHER_CLUSTER });
    const channel = pusher.subscribe('techware-channel');

    // Manager hears everything
    channel.bind('new-lead', function(data) {
        soundNewLead.play().catch(() => {});
        fetchData();
        showNotification(`New ${data.type} Lead!`, data.amount);
    });

    channel.bind('status-update', function(data) {
        soundNewLead.play().catch(() => {}); // Play sound for updates too
        fetchData();
        showNotification(`${data.type} Update`, data.status);
    });
    
    channel.bind('lead-edited', function(data) {
        soundNewLead.play().catch(() => {});
        fetchData();
        showNotification(`${data.type} Edited`, data.client);
    });
}

function showNotification(title, msg) {
    const div = document.createElement('div');
    div.className = 'fixed bottom-5 right-5 bg-[#6E1A2D] text-white px-6 py-4 rounded-xl shadow-2xl border border-white/10 z-50 animate-fade-in-up';
    div.innerHTML = `<div class="font-bold">${title}</div><div class="text-sm opacity-90">${msg}</div>`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

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
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('dateStart').value = today;
        document.getElementById('dateEnd').value = today;
        fetchData();
    } else { document.getElementById('loginError').classList.remove('hidden'); }
});

function logout() { sessionStorage.removeItem('twh_token'); window.location.reload(); }

async function fetchData() {
    const t = sessionStorage.getItem('twh_token');
    if (!t) return;
    const res = await fetch(`/api/manager/data?token=${t}&_t=${new Date().getTime()}`);
    const json = await res.json();
    
    allData.billing = json.billing || [];
    allData.insurance = json.insurance || [];
    allData.design = json.design || [];
    allData.ebook = json.ebook || [];
    allData.stats_bill = json.stats_bill || {today:0, night:0, pending:0, breakdown:{}};
    allData.stats_ins = json.stats_ins || {today:0, night:0, pending:0, breakdown:{}};
    allData.daily_stats = json.daily_stats || {billing:0, insurance:0, design:0, ebook:0};

    updateDashboardStats();
    if(!document.getElementById('viewPending').classList.contains('hidden')) renderPendingCards();
    if(!document.getElementById('viewDaily').classList.contains('hidden')) renderDailyTotal();
    if(!document.getElementById('viewAnalysis').classList.contains('hidden')) renderAnalysis();
}

function updateDashboardStats() {
    const dept = document.getElementById('statsSelector').value;
    const stats = dept === 'billing' ? allData.stats_bill : allData.stats_ins;
    document.getElementById('dispToday').innerText = '$' + stats.today.toFixed(2);
    document.getElementById('dispNight').innerText = '$' + stats.night.toFixed(2);
    document.getElementById('dispPending').innerText = stats.pending;

    const breakdown = stats.breakdown || {};
    const sortedAgents = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
    const listContainer = document.getElementById('agentPerformanceList');
    if(listContainer) {
        listContainer.innerHTML = '';
        if (sortedAgents.length === 0) listContainer.innerHTML = '<div class="text-slate-500 col-span-full italic">No night sales yet.</div>';
        else {
            sortedAgents.forEach(([agent, amount]) => {
                const item = document.createElement('div');
                item.className = "flex justify-between items-center bg-[#292229] p-3 rounded-lg border border-[#6E1A2D]/30";
                item.innerHTML = `<span class="font-bold text-white">${agent}</span><span class="font-mono text-blue-300 font-bold">$${amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>`;
                listContainer.appendChild(item);
            });
        }
    }
}

function switchMainTab(tab) {
    ['viewStats', 'viewPending', 'viewAnalysis', 'viewEdit', 'viewDaily'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['navStats', 'navPending', 'navAnalysis', 'navEdit', 'navDaily'].forEach(id => {
        document.getElementById(id).classList.remove('bg-[#6E1A2D]', 'text-white');
        document.getElementById(id).classList.add('text-slate-400');
    });
    document.getElementById('view' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.remove('hidden');
    const navId = 'nav' + tab.charAt(0).toUpperCase() + tab.slice(1);
    document.getElementById(navId).classList.remove('text-slate-400');
    document.getElementById(navId).classList.add('bg-[#6E1A2D]', 'text-white');

    if(tab === 'pending') renderPendingCards();
    if(tab === 'analysis') { updateAgentSelector(); renderAnalysis(); }
    if(tab === 'daily') renderDailyTotal(); 
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

    if(data.length === 0) { container.innerHTML = `<div class="col-span-3 text-center text-slate-500 py-10">No pending orders.</div>`; return; }

    data.forEach(row => {
        const id = row['Record_ID'] || row['Order ID']; 
        const cleanCharge = String(row['Charge'] || '').replace(/[^0-9.]/g, '');
        const cleanCard = String(row['Card Number'] || '').replace(/\s+/g, ''); 
        const card = document.createElement('div');
        card.className = "pending-card fade-in p-0 bg-[#1a0505] border border-[#6E1A2D] rounded-xl overflow-hidden shadow-lg hover:border-red-500 transition-all";
        card.innerHTML = `
            <div class="bg-[#292229] p-4 border-b border-[#6E1A2D]">
                <div class="flex justify-between items-center"><h3 class="text-white font-bold text-lg truncate">${row['Agent Name']} — <span class="text-green-400">$${cleanCharge}</span></h3><div class="text-xs text-slate-400">(${row['LLC'] || row['Provider']})</div></div>
            </div>
            <div class="p-4 space-y-2 text-sm font-mono text-slate-300">
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Card Number:</span><span class="text-white tracking-widest font-bold">${cleanCard}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Expiry Date:</span><span class="text-white">${row['Expiry Date']||''}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Charge:</span><span class="text-green-400 font-bold">$${cleanCharge}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Card Name:</span><span class="text-white">${row['Card Holder Name']||''}</span></div>
            </div>
            <div class="grid grid-cols-2 gap-3 p-4 pt-0">
                <button onclick="setStatus('${pendingSubTab}', '${id}', 'Charged', this)" class="bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-bold">Approve</button>
                <button onclick="setStatus('${pendingSubTab}', '${id}', 'Declined', this)" class="bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-bold">Decline</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function updateAgentSelector() {
    const type = document.getElementById('analysisSheetSelector').value;
    let data = allData[type] || [];
    const agents = [...new Set(data.map(item => item['Agent Name'] || 'Unknown'))].sort();
    const selector = document.getElementById('analysisAgentSelector');
    selector.innerHTML = '<option value="all">All Agents</option>';
    agents.forEach(agent => { if(agent && agent !== 'Unknown') { const opt = document.createElement('option'); opt.value = agent; opt.innerText = agent; selector.appendChild(opt); } });
}

function renderAnalysis() {
    const type = document.getElementById('analysisSheetSelector').value;
    const search = document.getElementById('analysisSearch').value.toLowerCase();
    const agentFilter = document.getElementById('analysisAgentSelector').value;
    const statusFilter = document.getElementById('analysisStatusSelector').value;
    
    let dStart = new Date(document.getElementById('dateStart').value);
    const tStart = document.getElementById('timeStart').value;
    if(tStart) { const [h, m] = tStart.split(':'); dStart.setHours(h, m, 0); } else dStart.setHours(0, 0, 0); 
    let dEnd = new Date(document.getElementById('dateEnd').value);
    const tEnd = document.getElementById('timeEnd').value;
    if(tEnd) { const [h, m] = tEnd.split(':'); dEnd.setHours(h, m, 59); } else dEnd.setHours(23, 59, 59); 

    let data = (allData[type] || []).slice().reverse();
    const filtered = data.filter(row => {
        let tStr = row['Timestamp'] || row['timestamp'];
        if(!tStr) return false;
        const t = new Date(tStr);
        if(t < dStart || t > dEnd) return false;
        if(agentFilter !== 'all' && row['Agent Name'] !== agentFilter) return false;
        if(statusFilter !== 'all' && (row['Status'] || 'Charged') !== statusFilter) return false;
        return JSON.stringify(row).toLowerCase().includes(search);
    });

    let total = 0; let hours = {};
    filtered.forEach(r => {
        const val = parseFloat(String(r['Charge']).replace(/[^0-9.]/g, '')) || 0;
        if((r['Status'] || 'Charged') === 'Charged') {
            total += val;
            let tStr = r['Timestamp'] || r['timestamp'];
            if(tStr) { const h = tStr.substring(11, 13) + ":00"; hours[h] = (hours[h] || 0) + val; }
        }
    });

    document.getElementById('anaTotal').innerText = '$' + total.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('anaCount').innerText = filtered.length;
    document.getElementById('anaAvg').innerText = filtered.length ? '$' + (total/filtered.length).toFixed(2) : '$0.00';
    
    // Chart
    const ctx = document.getElementById('analysisChart').getContext('2d');
    if(myChart) myChart.destroy();
    myChart = new Chart(ctx, { type: 'line', data: { labels: Object.keys(hours).sort(), datasets: [{ label: 'Hourly', data: Object.keys(hours).sort().map(h=>hours[h]), borderColor: '#6E1A2D', backgroundColor: 'rgba(110, 26, 45, 0.2)', fill: true }] }, options: { maintainAspectRatio: false, plugins: {legend:{display:false}}, scales:{x:{grid:{display:false}},y:{grid:{color:'#334155'}}} } });

    // Table
    const tbody = document.getElementById('analysisBody');
    const thead = document.getElementById('analysisHeader');
    thead.innerHTML = ''; tbody.innerHTML = '';
    
    let columns = type === 'billing' ? ["Record_ID", "Agent Name", "Name", "Ph Number", "Address", "Charge", "LLC", "Status", "Timestamp"] :
                  type === 'insurance' ? ["Record_ID", "Agent Name", "Name", "Ph Number", "Charge", "LLC", "Status", "Timestamp"] :
                  ["Record_ID", "Name", "Service", "Charge", "Timestamp"];

    thead.innerHTML = columns.map(c=>`<th class="p-3 text-left text-xs font-bold text-slate-400 uppercase whitespace-nowrap">${c.replace('_',' ')}</th>`).join('');
    
    if (filtered.length > 0) {
        tbody.innerHTML = filtered.map(row => {
            let tds = columns.map(col => {
                let val = row[col] || row[col.replace('Name', 'Client Name')] || row[col.replace('Client Name', 'Name')] || '';
                let color = col === 'Status' ? (val === 'Charged' ? 'text-green-400' : 'text-red-400') : (col === 'Charge' ? 'text-green-400 font-mono' : 'text-slate-300');
                if(col === 'Status' && !val) { val='Charged'; color='text-green-400'; }
                return `<td class="p-3 text-sm whitespace-nowrap ${color}">${val}</td>`;
            }).join('');
            return `<tr class="hover:bg-slate-800 border-b border-slate-800">${tds}</tr>`;
        }).join('');
    } else tbody.innerHTML = `<tr><td colspan="100%" class="p-8 text-center text-slate-500">No records found.</td></tr>`;
}

async function setStatus(type, id, status, btnElement) {
    const btns = btnElement.closest('.pending-card').querySelectorAll('button');
    btns.forEach(b => { b.disabled = true; b.classList.add('opacity-50'); });
    btnElement.innerText = "...";
    try {
        const formData = new FormData(); 
        formData.append('type', type); formData.append('id', id); formData.append('status', status);
        const res = await fetch('/api/manager/update_status', { method: 'POST', body: formData });
        const data = await res.json();
        if(data.status === 'success') { 
            btnElement.closest('.pending-card').style.opacity = "0"; 
            setTimeout(() => { fetchData(); }, 500); 
        } else alert("Error");
    } catch (error) { console.error(error); }
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
        document.getElementById('e_client').value = d['Name'];
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
    const res = await fetch('/api/save-lead', { method: 'POST', body: formData });
    const data = await res.json();
    if(data.status === 'success') { alert("Updated"); fetchData(); document.getElementById('editForm').classList.add('hidden'); }
});

async function deleteCurrentRecord() {
    if(!confirm("Delete?")) return;
    const formData = new FormData(); 
    formData.append('type', document.getElementById('e_type').value); 
    formData.append('id', document.getElementById('e_order_id').value || document.getElementById('e_record_id').value);
    const res = await fetch('/api/delete-lead', { method: 'POST', body: formData });
    if((await res.json()).status === 'success') { alert("Deleted"); fetchData(); document.getElementById('editForm').classList.add('hidden'); }
}

async function manualRefresh() {
    document.getElementById('refreshBtn').querySelector('svg').classList.add('animate-spin'); 
    await fetchData(); 
    setTimeout(() => { document.getElementById('refreshBtn').querySelector('svg').classList.remove('animate-spin'); }, 500);
}

setInterval(() => { fetchData(); }, 120000);

function renderDailyTotal() {
    const stats = allData.daily_stats || {};
    document.getElementById('cardDailyBilling').innerText = '$' + (stats.billing||0).toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('cardDailyInsurance').innerText = '$' + (stats.insurance||0).toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('cardDailyDesign').innerText = '$' + (stats.design||0).toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('cardDailyEbook').innerText = '$' + (stats.ebook||0).toLocaleString('en-US', {minimumFractionDigits: 2});

    const type = document.getElementById('dailySheetSelector').value;
    const tbody = document.getElementById('dailyTotalBody');
    tbody.innerHTML = '';
    
    for (let i = 0; i < 30; i++) {
        let winStart = new Date(); winStart.setDate(winStart.getDate() - i); winStart.setHours(18, 0, 0, 0);
        let winEnd = new Date(winStart); winEnd.setDate(winEnd.getDate() + 1); winEnd.setHours(9, 0, 0, 0);

        let sum = 0; let scores = {};
        (allData[type] || []).forEach(row => {
            const t = new Date(row['Timestamp'] || row['timestamp']);
            if (t >= winStart && t < winEnd && (row['Status']||'Charged') === 'Charged') {
                const p = parseFloat(String(row['Charge']||'').replace(/[^0-9.]/g, '')) || 0;
                sum += p;
                const a = row['Agent Name'] || 'System';
                scores[a] = (scores[a] || 0) + p;
            }
        });

        let top = "-";
        if(type==='billing'||type==='insurance') {
             let max = 0;
             for(const [a, s] of Object.entries(scores)) if(s>max){max=s; top=`${a} ($${s.toFixed(0)})`;}
        } else top = "N/A";

        if (sum > 0 || i < 5) { 
            tbody.innerHTML += `
                <tr class="hover:bg-[#6E1A2D]/10 border-b border-[#6E1A2D]/30 transition">
                    <td class="p-4 text-white"><div class="font-bold">${winStart.toLocaleDateString()}</div><div class="text-xs text-slate-500">${winStart.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} - ${winEnd.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div></td>
                    <td class="p-4 font-mono font-bold text-green-400 text-lg">$${sum.toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
                    <td class="p-4 text-blue-300 font-semibold">${top}</td>
                </tr>`;
        }
    }
}
