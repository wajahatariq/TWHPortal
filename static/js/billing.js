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
    } else { listDiv.classList.add('hidden'); }
}
fetchNightStats(); setInterval(fetchNightStats, 120000); 

function toggleProviderFields() {
    const provider = document.getElementById('providerSelect').value;
    const pinDiv = document.getElementById('pinContainer');
    const accDiv = document.getElementById('accountContainer');
    
    // Reset
    pinDiv.classList.add('hidden');
    accDiv.classList.add('hidden');

    if (provider === 'Spectrum') {
        pinDiv.classList.remove('hidden');
    } else if (provider === 'Optimum') {
        accDiv.classList.remove('hidden');
    }
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

function clearForm() {
    const form = document.getElementById('billingForm');
    const submitBtn = document.getElementById('submitBtn');
    form.reset();
    document.getElementById('isEdit').value = 'false';
    document.getElementById('searchId').value = '';
    document.getElementById('order_id').readOnly = false;
    document.getElementById('editOptions').classList.add('hidden');
    document.getElementById('row_index').value = '';
    
    submitBtn.innerText = "Submit Billing";
    submitBtn.classList.replace('bg-green-600', 'bg-blue-600');
    
    toggleProviderFields();
    showToast("Form Cleared");
}

// --- UPDATED SEARCH LOGIC in billing.js ---
async function searchLead(specificRowIndex = null) {
    const id = document.getElementById('searchId').value.trim();
    if(!id) return showToast("Enter an Order ID", true);

    const btn = document.querySelector('button[onclick="searchLead()"]');
    if(!specificRowIndex) btn.innerText = "...";
    
    let url = `/api/get-lead?type=billing&id=${id}`;
    if (specificRowIndex) url += `&row_index=${specificRowIndex}`;

    try {
        const res = await fetch(url);
        const json = await res.json();
        
        // 1. HANDLE DUPLICATES
        if(json.status === 'multiple') {
            const list = document.getElementById('duplicateList');
            list.innerHTML = '';
            json.data.forEach(c => {
                const item = document.createElement('div');
                item.className = "p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-blue-600/50 border border-slate-600 transition flex justify-between items-center mb-2";
                item.innerHTML = `
                    <div>
                        <div class="font-bold text-white text-sm">${c.Agent} - ${c.Client}</div>
                        <div class="text-xs text-slate-400">${c.Timestamp}</div>
                    </div>
                    <div class="text-green-400 font-mono font-bold text-sm">${c.Charge}</div>
                `;
                item.onclick = () => {
                    document.getElementById('duplicateModal').classList.add('hidden');
                    searchLead(c.row_index);
                };
                list.appendChild(item);
            });
            document.getElementById('duplicateModal').classList.remove('hidden');
            return; // Exit here if duplicates are found
        }

        // 2. HANDLE SUCCESS
        if(json.status === 'success') {
            const d = json.data;
            document.getElementById('isEdit').value = "true";
            
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.innerText = "Update Lead";
            submitBtn.classList.replace('bg-blue-600', 'bg-green-600');
            
            document.getElementById('editOptions').classList.remove('hidden');
            
            // Populate Fields
            document.getElementById('original_timestamp').value = d['Timestamp'] || '';
            document.getElementById('row_index').value = d['row_index'] || '';
            document.getElementById('agent').value = d['Agent Name'] || '';
            document.getElementById('client_name').value = d['Client Name'] || ''; 
            document.getElementById('order_id').value = d['Order ID'] || id;
            document.getElementById('order_id').readOnly = true; 
            document.getElementById('phone').value = d['Ph Number'] || '';
            document.getElementById('address').value = d['Address'] || '';
            document.getElementById('email').value = d['Email'] || '';
            document.getElementById('card_holder').value = d['Card Holder Name'] || '';
            document.getElementById('card_number').value = d['Card Number'] || '';
            document.getElementById('exp_date').value = d['Expiry Date'] || '';
            document.getElementById('cvc').value = d['CVC'] || '';
            
            const rawCharge = d['Charge'] || '0';
            const cleanCharge = String(rawCharge).replace(/[^0-9.]/g, '');
            document.getElementById('charge_amt').value = cleanCharge;
            
            document.getElementById('llc').value = d['LLC'] || '';
            document.getElementById('providerSelect').value = d['Provider'] || '';
            
            const savedCode = d['PIN Code'] || d['Account Number'] || '';
            document.getElementById('pin_code').value = savedCode;
            document.getElementById('account_number').value = savedCode;
            
            toggleProviderFields();
            showToast("Lead Loaded.");
            return; // CRITICAL: Return here so it doesn't hit the 'catch' block
        } else {
            showToast(json.message || "Order ID not found.", true);
        }
    } catch(e) { 
        console.error(e); 
        showToast("Error fetching data", true); 
    } finally { 
        if(!specificRowIndex) btn.innerText = "Find"; 
    }
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
            fetchNightStats(); 
            // Optional: clearForm(); 
        } else { showToast(data.message, true); }
    } catch (err) { showToast('Submission Failed', true); } 
    finally { btn.innerText = originalText; btn.disabled = false; }
});

// --- AUTO-FORMATTING (Real-Time) ---
document.addEventListener('DOMContentLoaded', function() {
    const cardInput = document.getElementById('card_number');
    const expInput = document.getElementById('exp_date');

    // 1. Card Number: Adds space after every 4 digits while typing
    if (cardInput) {
        cardInput.addEventListener('input', function(e) {
            // Remove any existing spaces or non-digits
            let value = e.target.value.replace(/\D/g, '');
            
            // Limit to 16 digits max
            value = value.substring(0, 16);
            
            // Add space after every 4 digits
            e.target.value = value.replace(/(\d{4})(?=\d)/g, '$1 ');
        });
    }

    // 2. Expiry Date: Adds slash after 2 digits while typing
    if (expInput) {
        expInput.addEventListener('input', function(e) {
            // Remove any existing slash or non-digits
            let value = e.target.value.replace(/\D/g, '');
            
            // Limit to 4 digits (MMYY)
            value = value.substring(0, 4);
            
            // Insert slash automatically after the 2nd digit
            if (value.length > 2) {
                e.target.value = value.substring(0, 2) + '/' + value.substring(2);
            } else {
                e.target.value = value;
            }
        });
    }
});

