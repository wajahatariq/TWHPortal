let nightStats = { billing: {total:0, breakdown:{}}, insurance: {total:0, breakdown:{}} };

async function fetchNightStats() {
    try {
        const res = await fetch('/api/public/night-stats');
        nightStats = await res.json();
        updateNightWidget();
    } catch(e) { console.error("Stats Error", e); }
}

function updateNightWidget() {
    const type = document.getElementById('nightWidgetSelect').value;
    const data = nightStats[type] || {total:0, breakdown:{}};
    document.getElementById('nightWidgetAmount').innerText = '$' + data.total.toFixed(2);
    
    const listDiv = document.getElementById('nightBreakdown');
    listDiv.innerHTML = '';
    
    if (data.breakdown && Object.keys(data.breakdown).length > 0) {
        listDiv.classList.remove('hidden');
        for (const [agent, amount] of Object.entries(data.breakdown)) {
            const row = document.createElement('div');
            row.className = "flex justify-between border-b border-slate-900/10 pb-1 last:border-0";
            row.innerHTML = `<span class="truncate pr-2">${agent}</span> <span class="font-bold">$${amount.toFixed(2)}</span>`;
            listDiv.appendChild(row);
        }
    } else {
        listDiv.classList.add('hidden');
    }
}

fetchNightStats();
setInterval(fetchNightStats, 30000); 

function showToast(msg, isError=false) {
    let toast = document.getElementById('toast');
    if(!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

if(!document.getElementById('recordId').value) {
    document.getElementById('recordId').value = crypto.randomUUID();
}

async function searchLead() {
    const id = document.getElementById('searchId').value;
    if(!id) return showToast("Enter Record ID", true);
    
    const btn = document.querySelector('button[onclick="searchLead()"]');
    btn.innerText = "...";

    try {
        const res = await fetch(`/api/get-lead?type=insurance&id=${id}`);
        const json = await res.json();
        
        if(json.status === 'success') {
            const d = json.data;
            document.getElementById('isEdit').value = "true";
            
            document.getElementById('submitBtn').innerText = "Update Insurance Lead";
            document.getElementById('editOptions').classList.remove('hidden');
            document.getElementById('original_timestamp').value = d['Timestamp'];

            document.getElementById('recordId').value = d['Record_ID'];
            document.getElementById('agent').value = d['Agent Name'];
            document.getElementById('llc').value = d['LLC'];
            document.getElementById('client_name').value = d['Name'];
            document.getElementById('phone').value = d['Ph Number'];
            document.getElementById('address').value = d['Address'];
            document.getElementById('email').value = d['Email'];
            document.getElementById('card_holder').value = d['Card Holder Name'];
            document.getElementById('card_number').value = d['Card Number'];
            document.getElementById('exp_date').value = d['Expiry Date'];
            document.getElementById('cvc').value = d['CVC'];
            
            // FIX: Clean Charge
            const cleanCharge = String(d['Charge']).replace(/[^0-9.]/g, '');
            document.getElementById('charge_amt').value = cleanCharge;
            
            showToast("Lead Loaded.");
        } else {
            showToast("Record ID not found", true);
        }
    } catch(e) { console.error(e); }
    finally { btn.innerText = "Find"; }
}

document.getElementById('insuranceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const originalText = btn.innerText;
    btn.innerText = 'Processing...';
    btn.disabled = true;

    const formData = new FormData(e.target);

    try {
        const res = await fetch('/api/save-lead', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.status === 'success') {
            showToast(data.message);
            e.target.reset();
            document.getElementById('isEdit').value = 'false';
            document.getElementById('searchId').value = '';
            document.getElementById('editOptions').classList.add('hidden');
            document.getElementById('submitBtn').innerText = "Submit Insurance";
            document.getElementById('recordId').value = crypto.randomUUID();
            fetchNightStats();
        } else {
            showToast(data.message, true);
        }
    } catch (err) {
        showToast('Failed', true);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});