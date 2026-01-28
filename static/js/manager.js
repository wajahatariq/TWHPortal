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
        if (sortedAgents.length === 0) listContainer.innerHTML = '<div class="text-slate-500 col-span-full italic">No night sales yet.</div>';
        else {
            sortedAgents.forEach(([agent, amount]) => {
                const item = document.createElement('div');
                item.className = "flex justify-between items-center bg-slate-700/50 p-3 rounded-lg border border-slate-600 hover:bg-slate-600 transition";
                item.innerHTML = `<span class="font-bold text-white">${agent}</span><span class="font-mono text-blue-300 font-bold">$${amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>`;
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

function renderPendingCards() {
    const container = document.getElementById('pendingContainer');
    container.innerHTML = '';
    const rawData = pendingSubTab === 'billing' ? allData.billing : allData.insurance;
    const data = rawData.filter(row => row['Status'] === 'Pending').slice().reverse();

    if(data.length === 0) {
        container.innerHTML = `<div class="col-span-3 text-center text-slate-500 py-10">No pending orders.</div>`;
        return;
    }

    // FIXED: Removed extra bracket syntax error
    const llcOptions = pendingSubTab === 'billing' 
        ? ["Secure Claim Solutions-NMI", "Visionary Pathways-Authorize", "Visionary Pathways-Chase"]  
        : ["Secure Claim Solutions-NMI"];

    data.forEach(row => {
        const id = row['Record_ID'] || row['Order ID']; 
        const cleanCharge = String(row['charge_str'] || row['Charge Amount'] || '').replace(/[^0-9.]/g, '');
        const cleanCard = String(row['card_number'] || '').replace(/\s+/g, ''); 
        const cleanExpiry = String(row['exp_date'] || '').replace(/[\/\\]/g, ''); 
        const address = row['Address'] || row['address'] || row['adress'] || 'N/A';

        const card = document.createElement('div');
        card.className = "pending-card fade-in p-0 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg hover:border-blue-500/50 transition-all";
        
        card.innerHTML = `
            <input type="hidden" class="row-index" value="${row['row_index']}">
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

// FIXED: Now correctly extracts rowIndex to handle duplicate leads
async function validateAndSetStatus(type, id, status, btnElement) {
    const llcSelect = document.getElementById(`llc_select_${id}`);
    const selectedLLC = llcSelect ? llcSelect.value : null;
    
    // Find the specific card to get the unique row index for duplicate safety
    const card = btnElement.closest('.pending-card');
    const rowIndex = card.querySelector('.row-index')?.value;

    if (!selectedLLC) {
        alert("Action Required: Please select an LLC from the dropdown before approving or declining.");
        llcSelect.classList.add('border-red-500');
        return;
    }

    try {
        const fd = new FormData();
        fd.append('type', type);
        fd.append('id', id);
        fd.append('field', 'llc');
        fd.append('value', selectedLLC);
        
        // Ensure the field update also respects the specific row
        if (rowIndex) fd.append('row_index', rowIndex);

        await fetch('/api/update_field', { method: 'POST', body: fd });
        
        // Proceed with original status update logic
        setStatus(type, id, status, btnElement, rowIndex);
    } catch (e) {
        console.error("LLC Update Failed", e);
        alert("Failed to assign LLC. Please try again.");
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







