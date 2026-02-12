let allData = { 
    billing: [], insurance: [], design: [], ebook: [], 
    stats_bill: {today:0, night:0, pending:0, breakdown:{}}, 
    stats_ins: {today:0, night:0, pending:0, breakdown:{}},
    stats_design: {total:0, breakdown:{}},
    stats_ebook: {total:0, breakdown:{}}
};
let pendingSubTab = 'billing';
let myChart = null;

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
    allData.stats_design = json.stats_design || {total:0, breakdown:{}};
    allData.stats_ebook = json.stats_ebook || {total:0, breakdown:{}};
    
    updateDashboardStats(); 
    updateDepartmentTotals();
    if(!document.getElementById('viewPending').classList.contains('hidden')) renderPendingCards();
    updateAgentSelector();
    if(!document.getElementById('viewAnalysis').classList.contains('hidden')) renderAnalysis();
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
            const values = Object.values(breakdown);
            const maxVal = Math.max(...values);
            const minVal = Math.min(...values);

            sortedAgents.forEach(([agent, amount]) => {
                const item = document.createElement('div');
                
                // Default styling
                let rowClass = "flex justify-between items-center p-3 rounded-lg border transition ";
                let nameClass = "font-bold ";
                let amountClass = "font-mono font-bold ";
                let emoji = "";

                // Apply Gold Gradient for King (Top Performer)
                if (amount === maxVal && maxVal > 0) {
                    rowClass += "bg-gradient-to-r from-yellow-600 to-yellow-400 border-yellow-300 shadow-lg shadow-yellow-900/20";
                    nameClass += "text-black";
                    amountClass += "text-black";
                    emoji = " 👑";
                } 
                // Apply White Backdrop for Banana (Lowest Performer)
                else if (amount === minVal && values.length > 1) {
                    rowClass += "bg-white border-gray-200 shadow-md";
                    nameClass += "text-black";
                    amountClass += "text-black";
                    emoji = " 🍌";
                } 
                // Default look for everyone else
                else {
                    rowClass += "bg-slate-700/50 border-slate-600 hover:bg-slate-600 text-white";
                    nameClass += "text-white";
                    amountClass += "text-blue-300";
                }

                item.className = rowClass;
                item.innerHTML = `
                    <span class="${nameClass}">${agent}${emoji}</span>
                    <span class="${amountClass}">$${amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                `;
                listContainer.appendChild(item);
            });
        }
    }
}

function updateDepartmentTotals() {
    const billTotal = allData.stats_bill?.total || 0;
    const insTotal = allData.stats_ins?.total || 0;
    const designTotal = allData.stats_design?.total || 0;
    const ebookTotal = allData.stats_ebook?.total || 0;

    document.getElementById('totalBilling').innerText = '$' + billTotal.toFixed(2);
    document.getElementById('totalInsurance').innerText = '$' + insTotal.toFixed(2);
    document.getElementById('totalDesign').innerText = '$' + designTotal.toFixed(2);
    document.getElementById('totalEbook').innerText = '$' + ebookTotal.toFixed(2);
}

function switchMainTab(tab) {
    ['viewStats', 'viewPending', 'viewAnalysis', 'viewEdit', 'viewDaily'].forEach(id => document.getElementById(id).classList.add('hidden'));
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
    if(tab === 'daily') updateDepartmentTotals(); 
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

/* =========================================
   REPLACE "renderPendingCards" IN manager.js
   (Ensures Unique ID is hidden in the card)
   ========================================= */

/* =========================================
   1. RESTORED: renderPendingCards
   (Back to the version you liked)
   ========================================= */

function renderPendingCards() {
    const container = document.getElementById('pendingContainer');
    container.innerHTML = '';
    const rawData = pendingSubTab === 'billing' ? allData.billing : allData.insurance;
    const data = rawData.filter(row => row['Status'] === 'Pending').slice().reverse();

    if(data.length === 0) {
        container.innerHTML = `<div class="col-span-3 text-center text-slate-500 py-10">No pending orders.</div>`;
        return;
    }

    // Options derived from your original code
    const llcOptions = pendingSubTab === 'billing' 
        ? ["Secure Claim Solutions-NMI", "Visionary Pathways-Authorize", "Visionary Pathways-Chase", "TS", "Zelle", "Venmo"] 
        : ["Secure Claim Solutions-NMI"];

    data.forEach(row => {
        // We capture both IDs here
        const uniqueRowIndex = row['row_index'] || row['_id']; 
        const id = row['Record_ID'] || row['Order ID']; 
        
        const cleanCharge = String(row['charge_str'] || row['Charge Amount'] || '').replace(/[^0-9.]/g, '');
        const cleanCard = String(row['card_number'] || '').replace(/\s+/g, ''); 
        const cleanExpiry = String(row['exp_date'] || '').replace(/[\/\\]/g, ''); 
        const address = row['Address'] || row['address'] || row['adress'] || 'N/A';
    
        const card = document.createElement('div');
        card.className = "pending-card fade-in p-0 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg hover:border-blue-500/50 transition-all";
        
        card.innerHTML = `
            <input type="hidden" class="row-index" value="${uniqueRowIndex}">
            
            <div class="bg-slate-900/50 p-4 border-b border-slate-700">
                <div class="flex justify-between items-center">
                    <h3 class="text-white font-bold text-lg truncate">${row['agent']} — <span class="text-green-400">$${cleanCharge}</span></h3>
                    <div class="text-xs text-slate-400">(${row['llc'] || row['provider']})</div>
                </div>
            </div>
            <div class="p-4 space-y-2 text-sm font-mono text-slate-300">
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Card Number:</span><span class="text-white tracking-widest font-bold">${cleanCard}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Expiry Date:</span><span class="text-white">${cleanExpiry}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Charge:</span><span class="text-green-400 font-bold">$${cleanCharge}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Card Name:</span><span class="text-white">${row['card_holder']}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Phone:</span><span class="text-white">${row['phone']}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Email:</span><span class="text-blue-300 truncate">${row['email']}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">Address:</span><span class="text-white break-words w-full">${address}</span></div>
                <div class="flex"><span class="w-36 text-slate-500 font-semibold shrink-0">CVC:</span><span class="text-red-400 font-bold">${row['cvc']}</span></div>
            </div>
    
            <div class="px-4 mb-4">
                <label class="block text-xs font-bold text-blue-400 uppercase mb-1">Select LLC *</label>
                <select id="llc_select_${id}" class="input-field w-full py-2 text-sm border-blue-500/50 bg-slate-900">
                    <option value="">-- Choose LLC --</option>
                    ${llcOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                </select>
            </div>
    
            <div class="grid grid-cols-2 gap-3 p-4 pt-0">
                <button onclick="validateAndSetStatus('${pendingSubTab}', '${id}', 'Charged', this)" class="bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-bold shadow-lg shadow-green-900/20 active:scale-95 transition">Approve</button>
                <button onclick="validateAndSetStatus('${pendingSubTab}', '${id}', 'Declined', this)" class="bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg font-bold shadow-lg shadow-red-900/20 active:scale-95 transition">Decline</button>
            </div>
        `;
        container.appendChild(card);
    });
}

/* =========================================
   2. FIXED: validateAndSetStatus
   (Smart Logic: Finds dropdown inside the card)
   ========================================= */

async function validateAndSetStatus(type, id, status, btnElement) {
    const card = btnElement.closest('.pending-card');
    
    // --- THE FIX ---
    // Instead of looking for ID="llc_select_123" (which fails on duplicates),
    // we just find the <select> tag closest to the button you clicked.
    const llcSelect = card.querySelector('select'); 
    const selectedLLC = llcSelect ? llcSelect.value : null;
    
    // Get the unique identifier from the hidden input
    const rowIndex = card.querySelector('.row-index').value;

    if (!selectedLLC) {
        alert("Action Required: Please select an LLC before approving or declining.");
        llcSelect.classList.add('border-red-500');
        llcSelect.focus();
        return;
    }

    try {
        const fd = new FormData();
        fd.append('type', type);
        fd.append('id', id);
        fd.append('field', 'llc');
        fd.append('value', selectedLLC);
        fd.append('row_index', rowIndex); // Uses unique ID
        
        await fetch('/api/update_field', { method: 'POST', body: fd });
        
        // Pass the unique rowIndex to setStatus so it updates the correct record
        setStatus(type, id, status, btnElement, rowIndex); 
    } catch (e) {
        console.error("Update Failed", e);
        alert("Failed to process update. Please try again.");
    }
}
function updateAgentSelector() {
    const type = document.getElementById('analysisSheetSelector').value;
    const data = allData[type] || [];
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
    
    // Get Date Range inputs
    const dateStartVal = document.getElementById('dateStart').value;
    const dateEndVal = document.getElementById('dateEnd').value;
    
    // Create Date Objects for the Filter Range (Local Time 00:00 to 23:59)
    let dStart = new Date(dateStartVal); dStart.setHours(0,0,0,0);
    let dEnd = new Date(dateEndVal); dEnd.setHours(23,59,59,999);

    const data = allData[type] || [];
    
    const filtered = data.filter(row => {
        // 1. Create Date object from the record's timestamp
        const t = new Date(row['Timestamp']);
        
        // --- FIX: Apply Shift Logic (Subtract 8 Hours) ---
        // 8 hours * 60 mins * 60 secs * 1000 ms = 28800000 ms
        // This ensures 4 AM counts as the previous day, and 9 PM counts as today.
        const shiftDate = new Date(t.getTime() - 21600000); 
        // -------------------------------------------------

        // 2. Compare SHIFT DATE vs Selected Range
        if(shiftDate < dStart || shiftDate > dEnd) return false;

        // 3. Apply other filters (Agent, Status, Search)
        if(agentFilter !== 'all' && row['Agent Name'] !== agentFilter) return false;
        if(statusFilter !== 'all' && row['Status'] !== statusFilter) return false;
        
        // Search text
        return JSON.stringify(row).toLowerCase().includes(search);
    });

    // --- Aggregation Logic (Calculations) ---
    let total = 0; 
    let hours = {};
    
    filtered.forEach(r => {
        // Clean the charge amount string to a number
        const raw = String(r['Charge']).replace(/[^0-9.]/g, '');
        const val = parseFloat(raw) || 0;
        
        // Status Logic: Billing/Insurance need "Charged", others count everything
        let shouldCount = false;
        if(type === 'design' || type === 'ebook') shouldCount = true;
        else if(r['Status'] === 'Charged') shouldCount = true;

        if(shouldCount) {
            total += val;
            
            // For the Chart: Extract the hour
            const hour = r['Timestamp'].substring(11, 13) + ":00";
            hours[hour] = (hours[hour] || 0) + val;
        }
    });

    // --- Update DOM Elements ---
    document.getElementById('anaTotal').innerText = '$' + total.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('anaCount').innerText = filtered.length;
    document.getElementById('anaAvg').innerText = filtered.length ? '$' + (total/filtered.length).toFixed(2) : '$0.00';
    
    let peak = '-'; let maxVal = 0;
    for(const [h, val] of Object.entries(hours)) { if(val > maxVal) { maxVal = val; peak = h; } }
    document.getElementById('anaPeak').innerText = peak;

    // --- Render Chart ---
    const ctx = document.getElementById('analysisChart').getContext('2d');
    const sortedHours = Object.keys(hours).sort();
    const values = sortedHours.map(h => hours[h]);
    if(myChart) myChart.destroy();
    myChart = new Chart(ctx, { type: 'line', data: { labels: sortedHours, datasets: [{ label: 'Hourly Charged', data: values, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.4, fill: true }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#334155' } }, x: { grid: { display: false } } } } });

    // --- Render Table Columns ---
    let columns = [];
    if (type === 'billing') {
        columns = ["Record_ID", "Agent Name", "Name", "Phone", "Email", "Address", "Card Number", "Exp Date", "CVC", "Charge", "Status", "LLC", "Provider", "PIN/Acc", "Timestamp"];
    } else if (type === 'insurance') {
        columns = ["Record_ID", "Agent Name", "Name", "Phone", "Email", "Address", "Card Number", "Exp Date", "CVC", "Charge", "Status", "LLC", "Timestamp"];
    } else {
        columns = ["Record_ID", "Agent Name", "Name", "Service", "Charge", "Status", "Timestamp"];
    }

    const tbody = document.getElementById('analysisBody');
    const thead = document.getElementById('analysisHeader');
    thead.innerHTML = columns.map(c => `<th class="p-3 text-left text-xs font-bold text-slate-400 uppercase whitespace-nowrap">${c}</th>`).join('');

    // --- Render Table Rows ---
    if (filtered.length > 0) {
        tbody.innerHTML = filtered.map(row => {
            return `<tr class="border-b border-slate-800 hover:bg-slate-800 transition">
                ${columns.map(col => {
                    let val = row[col];
                    if (!val) {
                        const key = col.toLowerCase().replace(/ /g, '_').replace(/\//g, '_').replace('.', '');
                        val = row[key];
                    }
                    if (!val && col === 'Name') val = row['Client Name'];
                    if (!val && col === 'Service') val = row['Provider'] || row['provider'];
                    if (!val && col === 'PIN/Acc') val = row['pin_code'] || row['account_number'];
                    if (!val && col === 'Exp Date') val = row['exp_date'] || row['Expiry Date'];
                    if (!val) val = ''; 

                    let color = 'text-slate-300';
                    if(col === 'Status') {
                        if(val === 'Charged') color = 'text-green-400 font-bold';
                        else if(val === 'Pending') color = 'text-yellow-400';
                        else color = 'text-red-400';
                    }
                    if(col === 'Charge') color = 'text-green-400 font-mono font-bold';
                    return `<td class="p-3 text-sm ${color} whitespace-nowrap">${val}</td>`;
                }).join('')}
            </tr>`;
        }).join('');
    } else { tbody.innerHTML = `<tr><td colspan="100%" class="p-8 text-center text-slate-500">No records found.</td></tr>`; }
}

// Updated setStatus to handle the unique identifier
async function setStatus(type, id, status, btnElement, rowIndex = null) {
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
        
        // Use the unique row_index to distinguish between duplicate IDs
        if (rowIndex) formData.append('row_index', rowIndex);

        const res = await fetch('/api/manager/update_status', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.status === 'success') { 
            card.style.transition = "all 0.5s"; 
            card.style.opacity = "0"; 
            card.style.transform = "scale(0.9)"; 
            setTimeout(() => { fetchData(); }, 500); 
        } else { 
            alert("Error: " + data.message); 
            resetButtons(); 
        }
    } catch (error) { 
        alert("Update Failed!"); 
        resetButtons(); 
    }

    function resetButtons() { 
        btns.forEach(b => { b.disabled = false; b.classList.remove('opacity-50'); }); 
        btnElement.innerText = originalText; 
    }
}

// --- UPDATED: Search with Duplicate Handling ---
async function searchForEdit(specificRowIndex = null) {
    const type = document.getElementById('editSheetType').value;
    const id = document.getElementById('editSearchId').value.trim();
    if(!id) return alert("Enter ID");
    
    let url = `/api/get-lead?type=${type}&id=${id}`;
    if (specificRowIndex) url += `&row_index=${specificRowIndex}`;

    try {
        const res = await fetch(url);
        const json = await res.json();
        
        // Handle Duplicates
        if(json.status === 'multiple') {
            showManagerDuplicateSelection(json.data);
            return;
        }

        if(json.status === 'success') {
            const d = json.data;
            document.getElementById('editForm').classList.remove('hidden');
            
            document.getElementById('e_agent').value = d['Agent Name'] || d['agent'] || '';
            document.getElementById('h_agent').value = d['Agent Name'] || d['agent'] || '';
            document.getElementById('e_client').value = d['Name'] || d['Client Name'] || d['client_name'] || '';
            document.getElementById('e_phone').value = d['Ph Number'] || d['Phone'] || d['phone'] || '';
            document.getElementById('e_email').value = d['Email'] || d['email'] || '';
            
            const rawCharge = d['Charge'] || d['Charge Amount'] || d['charge_str'] || d['charge_amt'] || '0';
            document.getElementById('e_charge').value = String(rawCharge).replace(/[^0-9.]/g, '');
            
            document.getElementById('e_status').value = d['Status'] || d['status'] || 'Pending';
            document.getElementById('e_type').value = type;
            
            // Populate hidden row_index for unique identification
            document.getElementById('e_row_index').value = d['row_index'] || '';

            const recId = d['Record_ID'] || d['record_id'] || d['Order ID'] || d['order_id'] || id;
            if(type === 'billing') {
                document.getElementById('e_order_id').value = recId;
            } else {
                document.getElementById('e_record_id').value = recId;
            }
            
        } else { 
            alert(json.message || "Not Found"); 
            document.getElementById('editForm').classList.add('hidden'); 
        }
    } catch (e) {
        console.error(e);
        alert("Error searching for lead. Check console.");
    }
}

// --- NEW: Duplicate Selection Modal Logic ---
function showManagerDuplicateSelection(candidates) {
    const modal = document.getElementById('duplicateModal');
    const list = document.getElementById('duplicateList');
    list.innerHTML = ''; 

    candidates.forEach(c => {
        const div = document.createElement('div');
        div.className = "p-3 bg-slate-700 hover:bg-slate-600 rounded cursor-pointer border border-slate-600 flex justify-between items-center mb-2";
        div.innerHTML = `
            <div>
                <div class="font-bold text-white text-sm">${c.Agent}</div>
                <div class="text-xs text-slate-400">${c.Timestamp}</div>
            </div>
            <div class="font-mono text-green-400 font-bold">${c.Charge}</div>
        `;
        div.onclick = () => {
            modal.classList.add('hidden');
            searchForEdit(c.row_index); // Recurse with specific ID
        };
        list.appendChild(div);
    });
    
    modal.classList.remove('hidden');
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

// --- UPDATED: Delete using Unique Row Index ---
async function deleteCurrentRecord() {
    if(!confirm("Delete?")) return;
    const type = document.getElementById('e_type').value;
    const id = type === 'billing' ? document.getElementById('e_order_id').value : document.getElementById('e_record_id').value;
    const rowIndex = document.getElementById('e_row_index').value;

    const formData = new FormData(); 
    formData.append('type', type); 
    formData.append('id', id);
    if(rowIndex) formData.append('row_index', rowIndex);

    const res = await fetch('/api/delete-lead', { method: 'POST', body: formData });
    const data = await res.json();
    if(data.status === 'success') { alert("Deleted"); fetchData(); document.getElementById('editForm').classList.add('hidden'); document.getElementById('editSearchId').value=""; }
    else alert(data.message);
}

async function manualRefresh() {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('animate-spin'); 
    await fetchData(); 
    setTimeout(() => btn.classList.remove('animate-spin'), 500);
}

setInterval(() => { fetchData(); }, 120000);
// --- NEW: Load History Logic ---
async function loadHistory() {
    const tbody = document.getElementById('historyTableBody');
    if(!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-500">Loading...</td></tr>';

    try {
        const res = await fetch('/api/manager/history-totals');
        const json = await res.json();
        
        if(json.status === 'success') {
            tbody.innerHTML = '';
            json.data.forEach(row => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-700/50 transition";
                tr.innerHTML = `
                    <td class="p-4 font-mono text-slate-300">${row.date}</td>
                    <td class="p-4 font-bold text-blue-400">$${row.billing.toLocaleString()}</td>
                    <td class="p-4 font-bold text-green-400">$${row.insurance.toLocaleString()}</td>
                    <td class="p-4 font-bold text-purple-400">$${row.design.toLocaleString()}</td>
                    <td class="p-4 font-bold text-orange-400">$${row.ebook.toLocaleString()}</td>
                    <td class="p-4 font-black text-white bg-slate-700/30">$${row.total.toLocaleString()}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-red-400">Error loading data</td></tr>';
        }
    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-red-400">Connection Error</td></tr>';
    }
}

// Auto-load history when page loads
if(document.getElementById('historyTableBody')) {
    loadHistory();
}
async function processLeadWithLLC(type, id, status, btn) {
    const llcSelect = document.getElementById(`llc_select_${id}`);
    const val = llcSelect.value;

    if (!val) {
        alert("Please select an LLC before processing this lead.");
        llcSelect.focus();
        return;
    }

    // Save the LLC selection to the lead record first
    const fd = new FormData();
    fd.append('type', type);
    fd.append('id', id);
    fd.append('field', 'llc');
    fd.append('value', val);

    try {
        await fetch('/api/update_field', { method: 'POST', body: fd });
        // Call your existing setStatus function
        setStatus(type, id, status, btn);
    } catch (e) {
        alert("Error saving LLC. Please try again.");
    }
}

/* =========================================
   COPY & PASTE THIS AT THE END OF manager.js
   "The Global Market Ticker" (All Departments Combined)
   ========================================= */
(function() {

    // 1. CSS for the Global Ticker
    const tickerStyles = `
        #stock-ticker {
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 40px;
            background: #0f172a; /* Dark Slate */
            border-top: 3px solid #1e293b;
            color: #fff;
            font-family: 'Courier New', monospace;
            font-weight: bold;
            font-size: 14px;
            display: flex;
            align-items: center;
            overflow: hidden;
            z-index: 9999;
            white-space: nowrap;
            box-shadow: 0 -5px 20px rgba(0,0,0,0.6);
        }

        .ticker-label {
            background: #dc2626; /* Red "LIVE" badge */
            color: #fff;
            padding: 0 15px;
            height: 100%;
            display: flex;
            align-items: center;
            font-weight: 900;
            z-index: 10;
            box-shadow: 5px 0 15px rgba(0,0,0,0.5);
            letter-spacing: 1px;
        }

        .ticker-track {
            display: flex;
            animation: ticker-scroll 40s linear infinite; /* Slower scroll for readability */
        }
        
        /* Pause on hover */
        #stock-ticker:hover .ticker-track {
            animation-play-state: paused;
        }

        .ticker-item {
            display: inline-flex;
            align-items: center;
            padding: 0 25px;
            border-right: 1px solid #334155;
        }

        /* Value Colors */
        .val-up { color: #4ade80; } /* Green */
        .val-down { color: #f87171; } /* Red */
        
        /* Department Tags */
        .dept-tag {
            font-size: 10px;
            padding: 2px 4px;
            border-radius: 3px;
            margin-right: 8px;
            color: #000;
            font-weight: 900;
        }
        .tag-bill { background-color: #22c55e; } /* Green */
        .tag-ins  { background-color: #3b82f6; } /* Blue */
        .tag-dsgn { background-color: #d946ef; } /* Purple */
        .tag-book { background-color: #f97316; } /* Orange */

        @keyframes ticker-scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); } 
        }
    `;

    // Inject CSS
    const style = document.createElement('style');
    style.innerHTML = tickerStyles;
    document.head.appendChild(style);

    // 2. Create HTML Structure
    const tickerContainer = document.createElement('div');
    tickerContainer.id = 'stock-ticker';
    tickerContainer.innerHTML = `
        <div class="ticker-label">TWH FEED</div>
        <div class="ticker-track" id="tickerTrack">
            </div>
    `;
    document.body.appendChild(tickerContainer);

    // 3. Logic to Aggregate ALL Data
    function updateGlobalTicker() {
        if (typeof allData === 'undefined') return;

        // Master list array
        let consolidatedList = [];

        // Helper to extract data safely
        function extract(source, deptCode, tagClass) {
            if (source && source.breakdown) {
                Object.entries(source.breakdown).forEach(([name, amount]) => {
                    // Normalize name to Title Case
                    const cleanName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
                    consolidatedList.push({
                        name: cleanName,
                        amount: parseFloat(amount),
                        dept: deptCode,
                        css: tagClass
                    });
                });
            }
        }

        // A. Extract Billing
        extract(allData.stats_bill, 'BILL', 'tag-bill');
        // B. Extract Insurance
        extract(allData.stats_ins, 'INS', 'tag-ins');
        // C. Extract Design (Check various common key names)
        extract(allData.stats_design || allData.stats_web, 'DSGN', 'tag-dsgn');
        // D. Extract Book Publishing
        extract(allData.stats_book || allData.stats_publishing, 'BOOK', 'tag-book');

        // Sort: Highest earners first across the whole company
        consolidatedList.sort((a, b) => b.amount - a.amount);

        // Generate HTML
        let itemsHTML = '';
        
        if (consolidatedList.length === 0) {
            itemsHTML = '<div class="ticker-item">WAITING FOR DATA...</div>';
        } else {
            consolidatedList.forEach(item => {
                const arrow = item.amount > 0 ? '▲' : '▼';
                const colorClass = item.amount > 0 ? 'val-up' : 'val-down';
                const money = '$' + item.amount.toLocaleString();

                itemsHTML += `
                    <div class="ticker-item">
                        <span class="dept-tag ${item.css}">${item.dept}</span>
                        <span class="text-slate-200 mr-2 font-bold">${item.name}</span>
                        <span class="${colorClass}">${arrow} ${money}</span>
                    </div>
                `;
            });
        }

        // DUPLICATE CONTENT x4 for infinite scroll loop
        const track = document.getElementById('tickerTrack');
        if(track) {
            track.innerHTML = itemsHTML + itemsHTML + itemsHTML + itemsHTML;
        }
    }

    // 4. Run Loop
    updateGlobalTicker(); 
    setInterval(updateGlobalTicker, 5000); // Refresh every 5s

})();

/* ===========================================
   THE DASHBOARD PARKOUR (Active Game Mode)
   Trigger: Press 'P' on keyboard to Start/Stop
   =========================================== */
(function() {
    // 1. Inject Styles (The Physics Engine)
    const gameStyles = `
        /* The Kid */
        #parkour-kid {
            position: fixed; font-size: 40px; z-index: 99999;
            pointer-events: none; transition: all 0.8s cubic-bezier(0.25, 1, 0.5, 1);
            filter: drop-shadow(0 10px 10px rgba(0,0,0,0.5));
        }
        
        /* Card Flip Animation */
        .parkour-flip { animation: flip-360 0.8s ease-in-out; }
        @keyframes flip-360 {
            0% { transform: perspective(1000px) rotateY(0deg); }
            50% { transform: perspective(1000px) rotateY(180deg); background: #3b82f6; }
            100% { transform: perspective(1000px) rotateY(360deg); }
        }

        /* Row Jump Animation */
        .parkour-jump { animation: jump-row 0.5s ease-out; background: #1e293b !important; }
        @keyframes jump-row {
            0% { transform: scale(1); }
            50% { transform: scale(1.05) translateX(10px); box-shadow: 0 5px 15px rgba(59,130,246,0.3); }
            100% { transform: scale(1); }
        }
        
        /* The Floor is Lava (Background Pulse) */
        body.parkour-active { animation: bg-pulse 5s infinite alternate; }
        @keyframes bg-pulse {
            0% { background-color: #0f172a; }
            100% { background-color: #020617; }
        }
    `;
    const style = document.createElement('style');
    style.innerHTML = gameStyles;
    document.head.appendChild(style);

    // 2. Global State
    let isRunning = false;
    let timer = null;
    let kid = null;

    // 3. Game Logic
    function spawnKid() {
        if(document.getElementById('parkour-kid')) return;
        kid = document.createElement('div');
        kid.id = 'parkour-kid';
        kid.innerHTML = '🛹'; // Skateboarder (or use 🏃)
        document.body.appendChild(kid);
        
        // Start center
        kid.style.top = '50%';
        kid.style.left = '50%';
    }

    function removeKid() {
        if(kid) kid.remove();
        kid = null;
        document.body.classList.remove('parkour-active');
    }

    function runLoop() {
        if(!isRunning) return;

        // 1. Identify Targets (Cards + Table Rows)
        // We look for the stats grid items and table rows
        const cards = document.querySelectorAll('#viewAnalysis .grid > div, #viewStats .grid > div');
        const rows = document.querySelectorAll('#analysisBody tr');
        
        // Combine all valid targets
        const targets = [...cards, ...rows].filter(el => el.offsetParent !== null); // Only visible ones

        if(targets.length === 0) return;

        // 2. Pick Random Target
        const target = targets[Math.floor(Math.random() * targets.length)];
        
        // 3. Calculate Position
        const rect = target.getBoundingClientRect();
        
        // 4. Move Kid (Offset slightly so he stands ON the element)
        if(kid) {
            kid.style.top = (rect.top - 20) + 'px';
            kid.style.left = (rect.left + rect.width/2 - 20) + 'px';
            
            // Randomize Character sometimes
            const emojis = ['🛹', '🏃', '🤸', '🏄'];
            kid.innerHTML = emojis[Math.floor(Math.random() * emojis.length)];
        }

        // 5. Trigger Interaction (Flip or Jump)
        setTimeout(() => {
            // Check if it's a card (usually divs in grid) or a row
            if(target.tagName === 'DIV') {
                target.classList.remove('parkour-flip');
                void target.offsetWidth; // Trigger reflow
                target.classList.add('parkour-flip');
            } else if (target.tagName === 'TR') {
                target.classList.remove('parkour-jump');
                void target.offsetWidth;
                target.classList.add('parkour-jump');
            }
        }, 600); // Wait for kid to "arrive"

        // 6. Schedule Next Run
        timer = setTimeout(runLoop, 2000); // Moves every 2 seconds
    }

    function toggleParkour() {
        isRunning = !isRunning;
        
        if(isRunning) {
            console.log("🛹 PARKOUR MODE ACTIVATED");
            document.body.classList.add('parkour-active');
            spawnKid();
            runLoop();
            
            // Visual Banner
            const banner = document.createElement('div');
            banner.id = 'pk-banner';
            banner.innerHTML = "🏃 PARKOUR MODE: ON";
            banner.style.cssText = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#22c55e; color:black; font-weight:900; padding:10px 20px; border-radius:30px; z-index:99999; box-shadow:0 0 30px #22c55e;";
            document.body.appendChild(banner);
            setTimeout(() => banner.remove(), 2000);

        } else {
            console.log("🛑 PARKOUR MODE STOPPED");
            clearTimeout(timer);
            removeKid();
            
            // Cleanup Animations
            document.querySelectorAll('.parkour-flip').forEach(el => el.classList.remove('parkour-flip'));
            document.querySelectorAll('.parkour-jump').forEach(el => el.classList.remove('parkour-jump'));
        }
    }

    // 4. Keyboard Trigger (Press 'P')
    document.addEventListener('keydown', (e) => {
        // Prevent triggering if typing in an input
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key.toLowerCase() === 'p') {
            toggleParkour();
        }
    });

    console.log("🏃 Press 'P' to activate Dashboard Parkour");

})();

/* =========================================
   COPY & PASTE THIS AT THE END OF manager.js
   "Single-Click Copy Badges" (Zero File Modification)
   ========================================= */
(function() {
    // 1. CSS for the Glowing Copy Badges
    const style = document.createElement('style');
    style.innerHTML = `
        .copy-badge {
            margin-left: 12px;
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            color: #60a5fa;
            border-radius: 6px;
            padding: 2px 8px;
            font-size: 11px;
            font-weight: bold;
            text-transform: uppercase;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            height: 22px;
        }
        .copy-badge:hover {
            background: rgba(59, 130, 246, 0.3);
            border-color: #3b82f6;
            color: #ffffff;
            box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
            transform: scale(1.05);
        }
        .copy-badge.copied {
            background: rgba(34, 197, 94, 0.2);
            border-color: #22c55e;
            color: #4ade80;
            box-shadow: 0 0 10px rgba(34, 197, 94, 0.4);
        }
    `;
    document.head.appendChild(style);

    // 2. The Injection Logic
    function injectCopyBadges() {
        // Find all pending cards
        const cards = document.querySelectorAll('.pending-card');
        
        cards.forEach(card => {
            const rows = card.querySelectorAll('.flex');
            
            rows.forEach(row => {
                // Prevent double-adding badges to the same row
                if (row.classList.contains('copy-injected')) return;

                const labelSpan = row.querySelector('span:first-child');
                const valueSpan = row.querySelector('span:nth-child(2)');
                
                if (labelSpan && valueSpan) {
                    const labelText = labelSpan.innerText.trim();
                    
                    // Added Phone, Email, and Address to the target fields
                    const targetFields = [
                        'Card Number:', 'Expiry Date:', 'Charge:', 'CVC:', 
                        'Card Name:', 'Phone:', 'Email:', 'Address:'
                    ];
                    
                    if (targetFields.includes(labelText)) {
                        
                        // Create the badge
                        const badge = document.createElement('button');
                        badge.className = 'copy-badge';
                        badge.innerHTML = 'Copy';
                        badge.title = 'Click to copy to clipboard';
                        
                        // Force flex items to align nicely vertically
                        row.style.alignItems = 'center';

                        // Click Event
                        badge.addEventListener('click', (e) => {
                            e.preventDefault();
                            
                            let textToCopy = valueSpan.innerText.trim();
                            
                            // UX FIX: Gateways usually hate the $ sign, so we strip it during the copy process
                            if (labelText === 'Charge:') {
                                textToCopy = textToCopy.replace('$', ''); 
                            }
                            
                            navigator.clipboard.writeText(textToCopy).then(() => {
                                // Visual feedback
                                badge.innerHTML = 'Copied!';
                                badge.classList.add('copied');
                                
                                setTimeout(() => {
                                    badge.innerHTML = 'Copy';
                                    badge.classList.remove('copied');
                                }, 1500);
                            });
                        });

                        // Append to the row and mark as injected
                        row.appendChild(badge);
                        row.classList.add('copy-injected');
                    }
                }
            });
        });
    }

    // 3. MutationObserver to automatically inject when you switch to the "Pending" tab
    const observer = new MutationObserver((mutations) => {
        let shouldInject = false;
        for (let mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                shouldInject = true;
                break;
            }
        }
        if (shouldInject) injectCopyBadges();
    });

    // 4. Attach Observer as soon as the container is available
    const initInterval = setInterval(() => {
        const container = document.getElementById('pendingContainer');
        if (container) {
            observer.observe(container, { childList: true, subtree: true });
            injectCopyBadges(); // Run once initially
            clearInterval(initInterval);
        }
    }, 1000);
})();
