/* =========================================
   BILLING SUBMISSION LOGIC (Final Version)
   ========================================= */

// --- 1. GLOBAL VARIABLES & NIGHT STATS ---
let nightStats = { billing: {total:0, breakdown:{}}, insurance: {total:0, breakdown:{}} };

async function fetchNightStats() {
    try {
        const res = await fetch('/api/public/night-stats');
        nightStats = await res.json();
        updateNightWidget();
    } catch(e) { console.error("Stats Error", e); }
}

function updateNightWidget() {
    const selector = document.getElementById('nightWidgetSelect');
    if(!selector) return;
    
    const type = selector.value;
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

// Start polling
fetchNightStats(); 
setInterval(fetchNightStats, 120000); 

// --- 2. UI HELPERS ---
function toggleProviderFields() {
    const provider = document.getElementById('providerSelect').value;
    const pinDiv = document.getElementById('pinContainer');
    const accDiv = document.getElementById('accountContainer');
    const placeholder = document.getElementById('providerPlaceholder');
    const pinInput = document.getElementById('pin_code');
    const accInput = document.getElementById('account_number');

    // Default: Hide Inputs
    pinDiv.classList.add('hidden');
    accDiv.classList.add('hidden');
    if(placeholder) placeholder.classList.remove('hidden');
    
    // Reset requirements
    if(pinInput) pinInput.required = false;
    if(accInput) accInput.required = false;

    if (provider === 'Spectrum') {
        pinDiv.classList.remove('hidden');
        if(placeholder) placeholder.classList.add('hidden');
        if(pinInput) pinInput.required = true;
    } else if (provider === 'Frontier' || provider === 'Optimum') {
        pinDiv.classList.remove('hidden');
        accDiv.classList.remove('hidden');
        if(placeholder) placeholder.classList.add('hidden');
        if(pinInput) pinInput.required = true;
        if(accInput) accInput.required = true;
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
    const orderInput = document.getElementById('order_id');
    if(orderInput) orderInput.readOnly = false;
    
    document.getElementById('editOptions').classList.add('hidden');
    document.getElementById('row_index').value = '';
    
    submitBtn.innerText = "Submit Billing";
    submitBtn.classList.replace('bg-green-600', 'bg-blue-600');
    submitBtn.classList.replace('hover:bg-green-500', 'hover:bg-blue-500');
    submitBtn.disabled = false;
    
    toggleProviderFields();
    showToast("Form Cleared");
}

// --- 3. SEARCH & EDIT LOGIC ---
async function searchLead(rowIndex = null) {
    const id = document.getElementById('searchId').value.trim();
    if(!id) return showToast("Enter an Order ID", true);

    const btn = document.querySelector('button[onclick="searchLead()"]');
    if(!rowIndex && btn) btn.innerText = "...";
    
    let url = `/api/get-lead?type=billing&id=${id}`;
    if (rowIndex) url += `&row_index=${rowIndex}`;

    try {
        const res = await fetch(url);
        const json = await res.json();
        
        // --- DUPLICATE HANDLING ---
        if(json.status === 'multiple') {
            const list = document.getElementById('duplicateList');
            list.innerHTML = '';
            
            json.candidates.forEach(c => {
                const name = c.name || c.Name || c['Client Name'] || 'Unknown';
                const charge = c.charge || c.Charge || c['Charge Amount'] || '$0';
                const date = c.timestamp || c.Timestamp || c.Date || '';
                const rIndex = c.row_index || c.Row_Index;

                const item = document.createElement('div');
                item.className = "p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-blue-600/50 border border-slate-600 transition flex justify-between items-center";
                
                item.innerHTML = `
                    <div>
                        <div class="font-bold text-white">${name}</div>
                        <div class="text-xs text-slate-400">${date}</div>
                    </div>
                    <div class="text-green-400 font-mono font-bold">${charge}</div>
                `;
                
                item.onclick = () => {
                    document.getElementById('duplicateModal').classList.add('hidden');
                    searchLead(rIndex);
                };
                list.appendChild(item);
            });
            document.getElementById('duplicateModal').classList.remove('hidden');
            return; 
        }

        // --- SUCCESSFUL LOAD ---
        if(json.status === 'success') {
            const d = json.data;
            document.getElementById('isEdit').value = "true";
            
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.innerText = "Update Lead";
            submitBtn.classList.replace('bg-blue-600', 'bg-green-600');
            submitBtn.classList.replace('hover:bg-blue-500', 'hover:bg-green-500');
            
            document.getElementById('editOptions').classList.remove('hidden');
            
            // Populate Fields
            document.getElementById('original_timestamp').value = d['Timestamp'] || d['timestamp'];
            document.getElementById('row_index').value = d['row_index'];

            if(document.getElementById('agent')) document.getElementById('agent').value = d['Agent Name'] || d['agent'];
            document.getElementById('client_name').value = d['Name'] || d['Client Name']; 
            
            const orderInput = document.getElementById('order_id');
            orderInput.value = d['Record_ID'] || d['Order ID'];
            orderInput.readOnly = true; // Lock ID on edit

            document.getElementById('phone').value = d['Ph Number'] || d['Phone'];
            document.getElementById('address').value = d['Address'];
            document.getElementById('email').value = d['Email'];
            document.getElementById('card_holder').value = d['Card Holder Name'];
            document.getElementById('card_number').value = d['Card Number'];
            document.getElementById('exp_date').value = d['Expiry Date'];
            document.getElementById('cvc').value = d['CVC'];
            
            const rawCharge = d['Charge'] || d['Charge Amount'] || '0';
            const cleanCharge = String(rawCharge).replace(/[^0-9.]/g, '');
            document.getElementById('charge_amt').value = cleanCharge;
            
            if(document.getElementById('llc')) document.getElementById('llc').value = d['LLC'];
            
            const providerSelect = document.getElementById('providerSelect');
            if(providerSelect) {
                providerSelect.value = d['Provider'];
                toggleProviderFields();
            }
            
            const savedCode = d['PIN Code'] || d['Account Number'] || '';
            const pinIn = document.getElementById('pin_code');
            const accIn = document.getElementById('account_number');
            if(pinIn) pinIn.value = savedCode;
            if(accIn) accIn.value = savedCode;
            
            showToast("Lead Loaded Successfully");
        } else {
            showToast("Order ID not found.", true);
        }
    } catch(e) { console.error(e); showToast("Error fetching data", true); }
    finally { if(!rowIndex && btn) btn.innerText = "Find"; }
}

// --- 4. DOM EVENTS & AUTO-FORMATTING ---
document.addEventListener("DOMContentLoaded", function() {

    // A. Submit Handler
    const form = document.getElementById('billingForm');
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submitBtn');
            const originalText = btn.innerText;
            
            // Lock Button
            btn.innerText = 'Processing...';
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');

            const formData = new FormData(e.target);
            try {
                const res = await fetch('/api/save-lead', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.status === 'success') {
                    showToast(data.message);
                    fetchNightStats(); 
                    if(document.getElementById('isEdit').value !== "true") {
                        // form.reset(); // <--- COMMENTED OUT TO PREVENT FORM DISAPPEARING
                        // toggleProviderFields(); // <--- COMMENTED OUT
                    }
                } else { showToast(data.message, true); }
            } catch (err) { showToast('Submission Failed', true); } 
            finally { 
                // Unlock Button
                btn.innerText = originalText; 
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        });
    }

    // B. Auto-Format Card Number ( #### #### #### #### )
    const cardInput = document.getElementById('card_number');
    if (cardInput) {
        cardInput.addEventListener('input', function (e) {
            let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
            if (value.length > 16) value = value.substring(0, 16); // Max 16
            let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
            e.target.value = formattedValue;
        });
    }

    // C. Auto-Format Expiry Date ( MM/YY )
    const expInput = document.getElementById('exp_date');
    if (expInput) {
        expInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
            if (value.length >= 2) {
                value = value.substring(0, 2) + '/' + value.substring(2, 4);
            }
            e.target.value = value;
        });
    }
});
