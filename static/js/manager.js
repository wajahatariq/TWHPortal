let allData = { billing: [], insurance: [] };
let pendingSubTab = 'billing';

// --- AUTH & INIT ---
const token = sessionStorage.getItem('twh_token');
if (token) {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
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
    } else {
        document.getElementById('loginError').classList.remove('hidden');
    }
});

function logout() { sessionStorage.removeItem('twh_token'); window.location.reload(); }

// --- DATA FETCHING ---
async function fetchData() {
    const t = sessionStorage.getItem('twh_token');
    if (!t) return;
    const res = await fetch(`/api/manager/data?token=${t}`);
    const json = await res.json();
    
    allData.billing = json.billing || [];
    allData.insurance = json.insurance || [];
    
    // UPDATE SPLIT STATS
    if (json.stats_bill) {
        document.getElementById('billToday').innerText = '$' + json.stats_bill.today.toFixed(2);
        document.getElementById('billNight').innerText = '$' + json.stats_bill.night.toFixed(2);
        document.getElementById('billPending').innerText = json.stats_bill.pending;
    }
    if (json.stats_ins) {
        document.getElementById('insToday').innerText = '$' + json.stats_ins.today.toFixed(2);
        document.getElementById('insNight').innerText = '$' + json.stats_ins.night.toFixed(2);
        document.getElementById('insPending').innerText = json.stats_ins.pending;
    }
    renderPendingCards();
}

// --- TAB SWITCHING ---
function switchMainTab(tab) {
    ['viewStats', 'viewPending', 'viewEdit'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['navStats', 'navPending', 'navEdit'].forEach(id => {
        document.getElementById(id).classList.remove('bg-blue-600', 'text-white');
        document.getElementById(id).classList.add('text-slate-400');
    });

    if(tab === 'stats') {
        document.getElementById('viewStats').classList.remove('hidden');
        document.getElementById('navStats').classList.add('bg-blue-600', 'text-white');
    } else if (tab === 'pending') {
        document.getElementById('viewPending').classList.remove('hidden');
        document.getElementById('navPending').classList.add('bg-blue-600', 'text-white');
        renderPendingCards();
    } else {
        document.getElementById('viewEdit').classList.remove('hidden');
        document.getElementById('navEdit').classList.add('bg-blue-600', 'text-white');
    }
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

// --- PENDING CARDS LOGIC (VERTICAL FORMAT) ---
function renderPendingCards() {
    const container = document.getElementById('pendingContainer');
    container.innerHTML = '';
    
    const rawData = pendingSubTab === 'billing' ? allData.billing : allData.insurance;
    const data = rawData.filter(row => row['Status'] === 'Submitted').slice().reverse();

    if(data.length === 0) {
        container.innerHTML = `<div class="col-span-3 text-center text-slate-500 py-10">No pending orders.</div>`;
        return;
    }

    data.forEach(row => {
        const id = row['Record_ID'];
        const providerOrLLC = pendingSubTab === 'billing' ? row['Provider'] : row['LLC'];
        
        // Vertical Card HTML
        const card = document.createElement('div');
        card.className = "pending-card fade-in";
        card.innerHTML = `
            <div class="flex justify-between items-start border-b border-slate-700 pb-3">
                <div>
                    <div class="text-white font-bold text-lg">${row['Agent Name']}</div>
                    <div class="text-xs text-slate-400">${row['Timestamp']}</div>
                </div>
                <div class="text-right">
                    <span class="block bg-slate-800 text-blue-300 px-2 py-1 rounded text-xs font-mono mb-1">ID: ${id}</span>
                    <span class="text-xs text-slate-500">${providerOrLLC}</span>
                </div>
            </div>

            <div class="text-center py-2">
                <span class="text-3xl font-bold text-green-400">$${row['Charge']}</span>
            </div>

            <div class="flex flex-col gap-1">
                <div class="detail-row">
                    <span class="detail-label">Card Holder</span>
                    <span class="detail-value text-white">${row['Card Holder Name']}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Card Number</span>
                    <span class="detail-value text-white tracking-widest">${row['Card Number']}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Expiry / CVC</span>
                    <span class="detail-value">
                        ${row['Expiry Date']} <span class="text-slate-600 mx-2">|</span> <span class="text-red-400">${row['CVC']}</span>
                    </span>
                </div>
                 <div class="detail-row border-none flex-col items-start gap-1 mt-1">
                    <span class="detail-label">Address</span>
                    <span class="detail-value text-xs text-slate-400 text-left leading-tight w-full">${row['Address']}</span>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4 mt-auto pt-4 border-t border-slate-700">
                <button onclick="setStatus('${pendingSubTab}', '${id}', 'Charged', this)" class="bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                    Approve
                </button>
                <button onclick="setStatus('${pendingSubTab}', '${id}', 'Declined', this)" class="bg-red-600 hover:bg-red-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                    Decline
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- NON-BLOCKING ACTION HANDLER ---
async function setStatus(type, id, status, btnElement) {
    // UI Feedback: Disable buttons in this card and show spinner
    const card = btnElement.closest('.pending-card');
    const btns = card.querySelectorAll('button');
    btns.forEach(b => { b.disabled = true; b.classList.add('opacity-50'); });
    btnElement.innerText = "...";

    const formData = new FormData();
    formData.append('type', type);
    formData.append('id', id);
    formData.append('status', status);

    const res = await fetch('/api/manager/update_status', { method: 'POST', body: formData });
    const data = await res.json();
    
    if(data.status === 'success') {
        // Success Animation: Fade out card
        card.style.transition = "all 0.5s";
        card.style.opacity = "0";
        card.style.transform = "scale(0.9)";
        
        setTimeout(() => {
            fetchData(); // Refresh data to remove it cleanly and update stats
        }, 500);
    } else {
        alert(data.message); // Only alert on error
        btns.forEach(b => { b.disabled = false; b.classList.remove('opacity-50'); });
        btnElement.innerText = status === 'Charged' ? 'Approve' : 'Decline';
    }
}

// --- EDIT (Unchanged) ---
async function searchForEdit() {
    const type = document.getElementById('editSheetType').value;
    const id = document.getElementById('editSearchId').value;
    if(!id) return alert("Enter ID");

    const res = await fetch(`/api/get-lead?type=${type}&id=${id}`);
    const json = await res.json();

    if(json.status === 'success') {
        const d = json.data;
        const form = document.getElementById('editForm');
        form.classList.remove('hidden');

        document.getElementById('e_agent').value = d['Agent Name'];
        document.getElementById('e_client').value = d['Name'];
        document.getElementById('e_phone').value = d['Ph Number'];
        document.getElementById('e_email').value = d['Email'];
        document.getElementById('e_charge').value = d['Charge'];
        document.getElementById('e_status').value = d['Status'];

        document.getElementById('e_type').value = type;
        if(type === 'billing') document.getElementById('e_order_id').value = d['Record_ID'];
        else document.getElementById('e_record_id').value = d['Record_ID'];

        // Hidden fields... (Same as before)
        document.getElementById('h_agent').value = d['Agent Name'];
        document.getElementById('h_client').value = d['Name'];
        document.getElementById('h_phone').value = d['Ph Number'];
        document.getElementById('h_address').value = d['Address'];
        document.getElementById('h_email').value = d['Email'];
        document.getElementById('h_card_holder').value = d['Card Holder Name'];
        document.getElementById('h_card_number').value = d['Card Number'];
        document.getElementById('h_exp').value = d['Expiry Date'];
        document.getElementById('h_cvc').value = d['CVC'];
        document.getElementById('h_llc').value = d['LLC'];
        document.getElementById('h_provider').value = d['Provider'] || '';
        document.getElementById('h_pin').value = d['PIN Code'] || '';

    } else {
        alert("Record not found.");
        document.getElementById('editForm').classList.add('hidden');
    }
}

document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!confirm("Update this record?")) return;
    const formData = new FormData(e.target);
    const res = await fetch('/api/save-lead', { method: 'POST', body: formData });
    const data = await res.json();
    if(data.status === 'success') {
        alert("Updated Successfully");
        fetchData(); 
        document.getElementById('editForm').classList.add('hidden');
        document.getElementById('editSearchId').value = "";
    } else {
        alert(data.message);
    }
});

async function deleteCurrentRecord() {
    if(!confirm("ARE YOU SURE? Delete?")) return;
    const type = document.getElementById('e_type').value;
    const id = type === 'billing' ? document.getElementById('e_order_id').value : document.getElementById('e_record_id').value;

    const formData = new FormData();
    formData.append('type', type);
    formData.append('id', id);

    const res = await fetch('/api/delete-lead', { method: 'POST', body: formData });
    const data = await res.json();
    if(data.status === 'success') {
        alert("Deleted");
        fetchData();
        document.getElementById('editForm').classList.add('hidden');
        document.getElementById('editSearchId').value = "";
    } else {
        alert(data.message);
    }
}