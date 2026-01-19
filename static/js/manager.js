let allData = { 
    billing: [], 
    insurance: [], 
    stats_bill: {today:0, night:0, pending:0, breakdown:{}}, 
    stats_ins: {today:0, night:0, pending:0, breakdown:{}} 
};
let pendingSubTab = 'billing';
let myChart = null;

// --- AUDIO SETUP ---
const soundNewLead = new Audio('/static/sounds/new_lead.mp3');
const soundSuccess = new Audio('/static/sounds/new_lead.mp3');
document.body.addEventListener('click', () => {
    soundNewLead.load();
    soundSuccess.load();
}, { once: true });

// --- PUSHER SETUP (SECURE) ---
if (window.PUSHER_KEY) {
    const pusher = new Pusher(window.PUSHER_KEY, {
        cluster: window.PUSHER_CLUSTER || 'ap1'
    });
    const channel = pusher.subscribe('techware-channel');

    // 1. New Lead Event
    channel.bind('new-lead', function(data) {
        soundNewLead.play().catch(() => console.log('Interact first'));
        fetchData();
    });

    // 2. Status Update Event
    channel.bind('status-update', function(data) {
        if(data.status === 'Charged') {
            soundSuccess.play().catch(() => console.log('Interact first'));
        }
        fetchData();
    });
} else {
    console.error("Pusher Key not found in configuration.");
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

// ============================================
// FIX 1: iPhone Cache Busting (Added &_t=...)
// ============================================
async function fetchData() {
    const t = sessionStorage.getItem('twh_token');
    if (!t) return;
    
    // We add current time to URL to force iPhone to download fresh data
    const res = await fetch(`/api/manager/data?token=${t}&_t=${new Date().getTime()}`);
    
    const json = await res.json();
    allData.billing = json.billing || [];
    allData.insurance = json.insurance || [];
    allData.stats_bill = json.stats_bill || {today:0, night:0, pending:0, breakdown:{}};
    allData.stats_ins = json.stats_ins || {today:0, night:0, pending:0, breakdown:{}};
    updateDashboardStats();
    if(!document.getElementById('viewPending').classList.contains('hidden')) renderPendingCards();
    updateAgentSelector();
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
        if (sortedAgents.length === 0) {
            listContainer.innerHTML = '<div class="text-slate-500 col-span-full italic">No night sales yet.</div>';
        } else {
            sortedAgents.forEach(([agent, amount]) => {
                const item = document.createElement('div');
                item.className = "flex justify-between items-center bg-slate-700/50 p-3 rounded-lg border border-slate-600 hover:bg-slate-700 transition";
                item.innerHTML = `
                    <span class="font-bold text-white">${agent}</span>
                    <span class="font-mono text-blue-300 font-bold">$${amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                `;
                listContainer.appendChild(item);
            });
        }
    }
}

function switchMainTab(tab) {
    // Hide all views
    ['viewStats', 'viewPending', 'viewAnalysis', 'viewEdit', 'viewDaily'].forEach(id => document.getElementById(id).classList.add('hidden'));
    
    // Reset all nav buttons
    ['navStats', 'navPending', 'navAnalysis', 'navEdit', 'navDaily'].forEach(id => {
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
    if(tab === 'daily') renderDailyTotal(); 
}

function switchPendingSubTab(tab) {
    pendingSubTab = tab;
    const btnBill = document.getElementById('subBill');
    const btnIns = document.getElementById('subIns');
    if(tab === 'billing') {
        btnBill.className = "text-lg font-bold text-blue-400 border-b-2 border-blue-400 pb-1";
        btnIns.className = "text-lg font-bold text-slate-500 hover:text-white pb-1";
    } else {
        btnIns.className = "text-lg font-bold text-green-400 border-b-2 border-green-400 pb-1";
        btnBill.className = "text-lg font-bold text-slate-500 hover:text-white pb-1";
    }
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
        const cleanCharge = String(row['Charge'] || row['Charge Amount'] || '').replace(/[^0-9.]/g, '');
        const cleanCard = String(row['Card Number'] || '').replace(/\s+/g, ''); 
        const cleanExpiry = String(row['Expiry Date'] || '').replace(/[\/\\]/g, ''); 

        const fullName = row['Card Holder Name'] || '';
        const nameParts = fullName.trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        const clientName = row['Name'] || row['Client Name'] || '';
        const phoneNumber = row['Ph Number'] || row['Phone'] || '';
        const email = row['Email'] || '';

        const card = document.createElement('div');
        card.className = "pending-card fade-in p-0 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg hover:border-blue-500/50 transition-all";
        card.innerHTML = `
            <div class="bg-slate-900/50 p-4 border-b border-slate-700">
                <div class="flex justify-between items-center">
                    <h3 class="text-white font-bold text-lg truncate">${row['Agent Name']} — <span class="text-green-400">$${cleanCharge}</span></h3>
                    <div class="text-xs text-slate-400">(${row['LLC'] || row['Provider']})</div>
                </div>
            </div>
            <div class="p-4 space-y-2 text-sm font-mono text-slate-300">
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Card Number:</span><span class="text-white tracking-widest font-bold">${cleanCard}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Expiry Date:</span><span class="text-white">${cleanExpiry}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Charge:</span><span class="text-green-400 font-bold">$${cleanCharge}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Card Name:</span><span class="text-white">${fullName}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Phone:</span><span class="text-white">${phoneNumber}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Email:</span><span class="text-blue-300 truncate">${email}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Address:</span><span class="text-white break-words w-full">${row['Address']}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">CVC:</span><span class="text-red-400 font-bold">${row['CVC']}</span></div>
            </div>
            <div class="grid grid-cols-2 gap-3 p-4 pt-0">
                <button onclick="setStatus('${pendingSubTab}', '${id}', 'Charged', this)" class="bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-900/20 active:scale-95 transition">Approve</button>
                <button onclick="setStatus('${pendingSubTab}', '${id}', 'Declined', this)" class="bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg shadow-red-900/20 active:scale-95 transition">Decline</button>
            </div>
        `;
        container.appendChild(card);
    });
}

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
    const statusFilter = document.getElementById('analysisStatusSelector').value;
    
    const dateStartVal = document.getElementById('dateStart').value;
    const timeStartVal = document.getElementById('timeStart').value;
    const dateEndVal = document.getElementById('dateEnd').value;
    const timeEndVal = document.getElementById('timeEnd').value;

    let dStart = new Date(dateStartVal);
    if(timeStartVal) {
        const [h, m] = timeStartVal.split(':');
        dStart.setHours(h, m, 0); 
    } else {
        dStart.setHours(0, 0, 0); 
    }

    let dEnd = new Date(dateEndVal);
    if(timeEndVal) {
        const [h, m] = timeEndVal.split(':');
        dEnd.setHours(h, m, 59); 
    } else {
        dEnd.setHours(23, 59, 59); 
    }

    const data = (type === 'billing' ? allData.billing : allData.insurance).slice().reverse();
    
    const filtered = data.filter(row => {
        const t = new Date(row['Timestamp']);
        
        if(t < dStart || t > dEnd) return false;

        if(agentFilter !== 'all' && row['Agent Name'] !== agentFilter) return false;
        if(statusFilter !== 'all' && row['Status'] !== statusFilter) return false;
        return JSON.stringify(row).toLowerCase().includes(search);
    });

    let total = 0; let hours = {};
    filtered.forEach(r => {
        const raw = String(r['Charge']).replace(/[^0-9.]/g, '');
        const val = parseFloat(raw) || 0;
        if(r['Status'] === 'Charged') {
            total += val;
            const hour = r['Timestamp'].substring(11, 13) + ":00";
            hours[hour] = (hours[hour] || 0) + val;
        }
    });

    document.getElementById('anaTotal').innerText = '$' + total.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('anaCount').innerText = filtered.length;
    document.getElementById('anaAvg').innerText = filtered.length ? '$' + (total/filtered.length).toFixed(2) : '$0.00';
    let peak = '-'; let maxVal = 0;
    for(const [h, val] of Object.entries(hours)) { if(val > maxVal) { maxVal = val; peak = h; } }
    document.getElementById('anaPeak').innerText = peak;

    const ctx = document.getElementById('analysisChart').getContext('2d');
    const sortedHours = Object.keys(hours).sort();
    const values = sortedHours.map(h => hours[h]);
    if(myChart) myChart.destroy();
    myChart = new Chart(ctx, { type: 'line', data: { labels: sortedHours, datasets: [{ label: 'Hourly Charged', data: values, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.4, fill: true }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#334155' } }, x: { grid: { display: false } } } } });

    let columns = [];
    if(type === 'billing') {
        columns = [
            "Record_ID", "Agent Name", "Name", "Ph Number", "Address", "Email", 
            "Card Holder Name", "Card Number", "Expiry Date", "CVC", "Charge", 
            "LLC", "Provider", "Date of Charge", "Status", "Timestamp", "PIN Code"
        ];
    } else {
        columns = [
            "Record_ID", "Agent Name", "Name", "Ph Number", "Address", "Email", 
            "Card Holder Name", "Card Number", "Expiry Date", "CVC", "Charge", 
            "LLC", "Date of Charge", "Status", "Timestamp"
        ];
    }

    const tbody = document.getElementById('analysisBody');
    const thead = document.getElementById('analysisHeader');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    let headerHtml = '';
    columns.forEach(col => {
        let display = col.replace('_', ' ');
        if(col === 'Record_ID') display = (type === 'billing') ? 'Order ID' : 'Record ID';
        headerHtml += `<th class="p-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">${display}</th>`;
    });
    thead.innerHTML = headerHtml;

    if (filtered.length > 0) {
        const bodyHtml = filtered.map(row => {
            let rowHtml = `<tr class="hover:bg-slate-800 transition-colors border-b border-slate-800">`;
            columns.forEach(col => {
                let val = row[col] || row[col.replace('Name', 'Client Name')] || row[col.replace('Client Name', 'Name')] || '';
                let classes = "p-3 text-slate-300 text-sm whitespace-nowrap";

                if (col === 'Status') {
                    if(val === 'Charged') classes += ' text-green-400 font-bold';
                    else if(val === 'Declined') classes += ' text-red-400';
                    else if(val === 'Pending') classes += ' text-yellow-400';
                }
                else if (col === 'Charge' || col === 'Charge Amount') {
                    classes += ' text-green-400 font-mono';
                }
                else if (col.includes('ID')) {
                    classes += ' font-mono text-blue-300';
                }

                rowHtml += `<td class="${classes}">${val}</td>`;
            });
            rowHtml += `</tr>`;
            return rowHtml;
        }).join('');
        tbody.innerHTML = bodyHtml;
    } else {
        tbody.innerHTML = `<tr><td colspan="100%" class="p-8 text-center text-slate-500">No records found.</td></tr>`;
    }
}

async function setStatus(type, id, status, btnElement) {
    const card = btnElement.closest('.pending-card');
    const btns = card.querySelectorAll('button');
    
    btns.forEach(b => { b.disabled = true; b.classList.add('opacity-50'); });
    const originalText = btnElement.innerText;
    btnElement.innerText = "...";
    
    try {
        const formData = new FormData(); 
        formData.append('type', type); 
        formData.append('id', id); 
        formData.append('status', status);
        
        const res = await fetch('/api/manager/update_status', { method: 'POST', body: formData });
        
        if (!res.ok) throw new Error(`Server Error (${res.status})`);

        const data = await res.json();
        
        if(data.status === 'success') { 
            if (status === 'Charged') {
                soundSuccess.currentTime = 0; 
                soundSuccess.play().catch(e => console.error("Audio Play failed:", e));
            }

            card.style.transition = "all 0.5s"; 
            card.style.opacity = "0"; 
            card.style.transform = "scale(0.9)"; 
            
            setTimeout(() => { fetchData(); }, 500); 
        } else { 
            alert("Error: " + data.message); 
            resetButtons();
        }

    } catch (error) {
        console.error("Update Failed:", error);
        alert("Update Failed! Check Console.");
        resetButtons();
    }

    function resetButtons() {
        btns.forEach(b => { b.disabled = false; b.classList.remove('opacity-50'); }); 
        btnElement.innerText = originalText;
    }
}

async function searchForEdit() {
    const type = document.getElementById('editSheetType').value;
    const id = document.getElementById('editSearchId').value;
    if(!id) return alert("Enter ID");
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
        if(type === 'billing') document.getElementById('e_order_id').value = d['Record_ID'];
        else document.getElementById('e_record_id').value = d['Record_ID'];
        document.getElementById('h_agent').value = d['Agent Name'];
    } else if (json.status === 'multiple') {
        alert("Multiple records found. Please use the Billing/Insurance portal to edit specific duplicates.");
    } else { 
        alert("Not Found"); 
        document.getElementById('editForm').classList.add('hidden'); 
    }
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!confirm("Update?")) return;
    const formData = new FormData(e.target);
    formData.append('is_edit', 'true'); 
    const res = await fetch('/api/save-lead', { method: 'POST', body: formData });
    const data = await res.json();
    if(data.status === 'success') { alert("Updated"); fetchData(); document.getElementById('editForm').classList.add('hidden'); document.getElementById('editSearchId').value=""; } 
    else alert(data.message);
});

async function deleteCurrentRecord() {
    if(!confirm("Delete?")) return;
    const type = document.getElementById('e_type').value;
    const id = type === 'billing' ? document.getElementById('e_order_id').value : document.getElementById('e_record_id').value;
    const formData = new FormData(); formData.append('type', type); formData.append('id', id);
    const res = await fetch('/api/delete-lead', { method: 'POST', body: formData });
    const data = await res.json();
    if(data.status === 'success') { alert("Deleted"); fetchData(); document.getElementById('editForm').classList.add('hidden'); document.getElementById('editSearchId').value=""; }
    else alert(data.message);
}

async function manualRefresh() {
    const btn = document.getElementById('refreshBtn');
    const icon = btn.querySelector('svg');
    
    icon.classList.add('animate-spin'); 
    btn.disabled = true;
    btn.classList.add('opacity-50');

    await fetchData(); 

    setTimeout(() => {
        icon.classList.remove('animate-spin');
        btn.disabled = false;
        btn.classList.remove('opacity-50');
    }, 500);
}

setInterval(() => {
    console.log("Auto-refreshing data...");
    fetchData();
}, 120000);

// ============================================
// NEW FUNCTION: Render Daily Total (6PM - 9AM)
// ============================================
function renderDailyTotal() {
    const type = document.getElementById('dailySheetSelector').value;
    const rawData = type === 'billing' ? allData.billing : allData.insurance;
    const tbody = document.getElementById('dailyTotalBody');
    tbody.innerHTML = '';

    // Loop through the last 30 days
    for (let i = 0; i < 30; i++) {
        // 1. Define the Window
        // Start: Day 'i' at 6:00 PM (18:00)
        let winStart = new Date();
        winStart.setDate(winStart.getDate() - i); 
        winStart.setHours(18, 0, 0, 0);

        // End: Day 'i+1' at 9:00 AM (09:00)
        let winEnd = new Date(winStart);
        winEnd.setDate(winEnd.getDate() + 1); 
        winEnd.setHours(9, 0, 0, 0);

        // 2. Filter Data for this specific window
        let dailySum = 0;
        let agentScores = {};

        rawData.forEach(row => {
            const t = new Date(row['Timestamp']);
            const status = row['Status'] || '';
            
            // Check if time is in window AND status is Charged
            if (t >= winStart && t < winEnd && status === 'Charged') {
                const rawPrice = String(row['Charge'] || row['Charge Amount']).replace(/[^0-9.]/g, '');
                const price = parseFloat(rawPrice) || 0;
                
                dailySum += price;

                // Track Agent Score
                const agent = row['Agent Name'] || 'Unknown';
                if (!agentScores[agent]) agentScores[agent] = 0;
                agentScores[agent] += price;
            }
        });

        // 3. Find Top Agent
        let topAgent = "-";
        let maxScore = 0;
        for (const [agent, score] of Object.entries(agentScores)) {
            if (score > maxScore) {
                maxScore = score;
                topAgent = `${agent} ($${score.toFixed(0)})`;
            }
        }

        // 4. Create Table Row (Only if there is data or it's today/yesterday)
        if (dailySum > 0 || i < 5) { 
            const rowHtml = `
                <tr class="hover:bg-slate-700/50 border-b border-slate-700 transition">
                    <td class="p-4 text-white">
                        <div class="font-bold">${winStart.toLocaleDateString()}</div>
                        <div class="text-xs text-slate-500">
                            ${winStart.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - 
                            ${winEnd.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} (+1 Day)
                        </div>
                    </td>
                    <td class="p-4 font-mono font-bold text-green-400 text-lg">
                        $${dailySum.toLocaleString('en-US', {minimumFractionDigits: 2})}
                    </td>
                    <td class="p-4 text-blue-300 font-semibold">
                        ${topAgent}
                    </td>
                </tr>
            `;
            tbody.innerHTML += rowHtml;
        }
    }
}
