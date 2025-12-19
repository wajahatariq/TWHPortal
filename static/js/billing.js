// --- WIDGET LOGIC ---
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
    
    // Update Total
    document.getElementById('nightWidgetAmount').innerText = '$' + data.total.toFixed(2);
    
    // Update Agent Breakdown
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


// --- MAIN LOGIC ---
function togglePin() {
    const provider = document.getElementById('providerSelect').value;
    const pinDiv = document.getElementById('pinContainer');
    if (provider === 'Spectrum') pinDiv.classList.remove('hidden');
    else pinDiv.classList.add('hidden');
}

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

async function searchLead() {
    const id = document.getElementById('searchId').value;
    if(!id) return showToast("Enter an Order ID", true);

    const btn = document.querySelector('button[onclick="searchLead()"]');
    btn.innerText = "...";
    
    try {
        const res = await fetch(`/api/get-lead?type=billing&id=${id}`);
        const json = await res.json();
        
        if(json.status === 'success') {
            const d = json.data;
            document.getElementById('isEdit').value = "true";
            
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.innerText = "Update Lead";
            submitBtn.classList.replace('bg-blue-600', 'bg-green-600');
            
            document.getElementById('editOptions').classList.remove('hidden');
            document.getElementById('original_timestamp').value = d['Timestamp'];

            // Populate Form
            document.getElementById('agent').value = d['Agent Name'];
            document.getElementById('client_name').value = d['Name'];
            document.getElementById('order_id').value = d['Record_ID'];
            document.getElementById('order_id').readOnly = true; 
            document.getElementById('phone').value = d['Ph Number'];
            document.getElementById('address').value = d['Address'];
            document.getElementById('email').value = d['Email'];
            document.getElementById('card_holder').value = d['Card Holder Name'];
            document.getElementById('card_number').value = d['Card Number'];
            document.getElementById('exp_date').value = d['Expiry Date'];
            document.getElementById('cvc').value = d['CVC'];
            
            const cleanCharge = String(d['Charge']).replace(/[^0-9.]/g, '');
            document.getElementById('charge_amt').value = cleanCharge;
            
            document.getElementById('llc').value = d['LLC'];
            document.getElementById('providerSelect').value = d['Provider'];
            document.getElementById('pin_code').value = d['PIN Code'] || '';
            
            togglePin();
            showToast("Lead Loaded.");
        } else {
            showToast("Order ID not found.", true);
        }
    } catch(e) { console.error(e); showToast("Error fetching data", true); }
    finally { btn.innerText = "Find"; }
}

document.getElementById('billingForm').addEventListener('submit', async (e) => {
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
            
            // RESET TO DEFAULT
            e.target.reset();
            document.getElementById('isEdit').value = 'false';
            document.getElementById('searchId').value = '';
            document.getElementById('order_id').readOnly = false;
            document.getElementById('editOptions').classList.add('hidden');
            
            btn.innerText = "Submit Billing";
            btn.classList.replace('bg-green-600', 'bg-blue-600');
            
            fetchNightStats(); 
        } else {
            showToast(data.message, true);
        }
    } catch (err) {
        showToast('Submission Failed', true);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});