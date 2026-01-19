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

// --- CORRECTED TOGGLE FUNCTION ---
function toggleProviderFields() {
    const provider = document.getElementById('providerSelect').value;
    const pinDiv = document.getElementById('pinContainer');
    const accDiv = document.getElementById('accountContainer');
    const placeholder = document.getElementById('providerPlaceholder');

    // Default: Hide Inputs, Show Placeholder
    pinDiv.classList.add('hidden');
    accDiv.classList.add('hidden');
    if(placeholder) placeholder.classList.remove('hidden');

    if (provider === 'Spectrum') {
        pinDiv.classList.remove('hidden');
        if(placeholder) placeholder.classList.add('hidden');
    } else if (provider === 'Optimum') {
        accDiv.classList.remove('hidden');
        if(placeholder) placeholder.classList.add('hidden');
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

async function searchLead(rowIndex = null) {
    const id = document.getElementById('searchId').value;
    if(!id) return showToast("Enter an Order ID", true);

    const btn = document.querySelector('button[onclick="searchLead()"]');
    if(!rowIndex) btn.innerText = "...";
    
    let url = `/api/get-lead?type=billing&id=${id}`;
    if (rowIndex) url += `&row_index=${rowIndex}`;

    try {
        const res = await fetch(url);
        const json = await res.json();
        
        console.log("Server Response:", json); // Debugging line to see exact data in Console

        // --- ROBUST FIX FOR DUPLICATES ---
        if(json.status === 'multiple') {
            const list = document.getElementById('duplicateList');
            list.innerHTML = '';
            
            json.candidates.forEach(c => {
                // FALLBACK LOGIC: Check Lowercase first, then Uppercase, then default
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
        // ---------------------------------

        if(json.status === 'success') {
            const d = json.data;
            document.getElementById('isEdit').value = "true";
            
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.innerText = "Update Lead";
            submitBtn.classList.replace('bg-blue-600', 'bg-green-600');
            
            document.getElementById('editOptions').classList.remove('hidden');
            // Handle various date keys
            document.getElementById('original_timestamp').value = d['Timestamp'] || d['timestamp'];
            document.getElementById('row_index').value = d['row_index'];

            document.getElementById('agent').value = d['Agent Name'] || d['agent'];
            document.getElementById('client_name').value = d['Name'] || d['Client Name']; 
            document.getElementById('order_id').value = d['Record_ID'] || d['Order ID'];
            document.getElementById('order_id').readOnly = true; 
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
            
            document.getElementById('llc').value = d['LLC'];
            document.getElementById('providerSelect').value = d['Provider'];
            
            const savedCode = d['PIN Code'] || d['Account Number'] || '';
            document.getElementById('pin_code').value = savedCode;
            document.getElementById('account_number').value = savedCode;
            
            toggleProviderFields();
            showToast("Lead Loaded.");
        } else {
            showToast("Order ID not found.", true);
        }
    } catch(e) { console.error(e); showToast("Error fetching data", true); }
    finally { if(!rowIndex) btn.innerText = "Find"; }
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
        } else { showToast(data.message, true); }
    } catch (err) { showToast('Submission Failed', true); } 
    finally { btn.innerText = originalText; btn.disabled = false; }
});

/* =========================================
   RECENT BILLING TABLE & INLINE EDIT LOGIC
   ========================================= */

// 1. Load Data Function
async function loadRecentBilling() {
    try {
        // Fetch last 50 records to ensure we catch everything in the 20min window
        const res = await fetch('/api/get-lead?type=billing&limit=50');
        const json = await res.json();
        const tbody = document.getElementById('recentBillingTable');
        
        if(!tbody) return; // Guard clause
        tbody.innerHTML = '';

        if(json.data && Array.isArray(json.data)) {
            const now = new Date();
            const twentyMinsAgo = new Date(now.getTime() - 20 * 60000); // 20 minutes ago

            json.data.forEach(row => {
                // Parse Timestamp (Adjust logic if your timestamp format differs)
                const leadTime = new Date(row.Timestamp || row.created_at);
                
                // FILTER: Only show if within last 20 minutes
                if (leadTime >= twentyMinsAgo) {
                    const tr = document.createElement('tr');
                    tr.className = "hover:bg-slate-700/50 transition";
                    tr.innerHTML = `
                        <td contenteditable="true" onblur="saveBillingCell('${row.Record_ID}', 'Name', this)" class="p-4 text-white focus:bg-slate-700 outline-none rounded">${row.Name || ''}</td>
                        <td contenteditable="true" onblur="saveBillingCell('${row.Record_ID}', 'Provider', this)" class="p-4 text-slate-300 focus:bg-slate-700 outline-none rounded">${row.Service || row.Provider || ''}</td>
                        <td contenteditable="true" onblur="saveBillingCell('${row.Record_ID}', 'Phone', this)" class="p-4 text-slate-300 focus:bg-slate-700 outline-none rounded">${row['Ph Number'] || row.Phone || ''}</td>
                        <td contenteditable="true" onblur="saveBillingCell('${row.Record_ID}', 'Charge', this)" class="p-4 font-mono font-bold text-green-400 focus:bg-slate-700 outline-none rounded">${row.Charge || ''}</td>
                        <td class="p-4 text-xs text-slate-500">${row.Timestamp}</td>
                    `;
                    tbody.appendChild(tr);
                }
            });
            
            // Show message if empty
            if (tbody.children.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-500 italic">No submissions in the last 20 minutes.</td></tr>`;
            }
        }
    } catch (e) {
        console.error("Error loading recent billing:", e);
    }
}

// 2. Save Cell Function
async function saveBillingCell(id, field, el) {
    const val = el.innerText.trim();
    // Visual Feedback: Yellow while saving
    const originalBg = el.style.backgroundColor;
    el.style.backgroundColor = '#422006'; // Dark Orange/Brown background

    try {
        await fetch('/api/update_field', {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: `type=billing&id=${id}&field=${field}&value=${encodeURIComponent(val)}`
        });
        
        // Success Feedback: Green flash
        el.style.backgroundColor = '#064e3b'; // Dark Green
        setTimeout(() => el.style.backgroundColor = originalBg, 500);
        
    } catch (e) {
        // Error Feedback: Red flash
        el.style.backgroundColor = '#7f1d1d';
        alert("Failed to save change.");
    }
}

// 3. Auto-Refresh Interval
// Load immediately
document.addEventListener('DOMContentLoaded', loadRecentBilling);
// Refresh every 30 seconds
setInterval(loadRecentBilling, 30000); 

// 4. Hook into existing Submit to refresh table immediately
const billingFormRef = document.getElementById('billingForm');
if(billingFormRef) {
    billingFormRef.addEventListener('submit', () => setTimeout(loadRecentBilling, 1000));
}
