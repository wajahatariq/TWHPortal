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
        
        // 1. Sort by Amount Descending (Largest on Top)
        const sortedEntries = Object.entries(data.breakdown).sort((a, b) => b[1] - a[1]);

        sortedEntries.forEach(([agent, amount], index) => {
            const row = document.createElement('div');
            
            if (index === 0) {
                // 2. Gold Touch for Top Performer
                row.className = "flex justify-between items-center bg-gradient-to-r from-yellow-300 to-amber-400 text-slate-900 font-extrabold p-2 rounded shadow-md mb-1 border border-yellow-500/50 transform scale-105";
                row.innerHTML = `<span class="truncate pr-2 flex items-center gap-1">👑 ${agent}</span> <span>$${amount.toFixed(2)}</span>`;
            } else if (index === sortedEntries.length - 1 && sortedEntries.length > 1) {
                // --- BOTTOM PERFORMER: Slight Backdrop & Banana ---
                row.className = "flex justify-between items-center bg-white text-slate-900 font-bold p-2 rounded border border-slate-200 mt-1 shadow-sm opacity-90";
                row.innerHTML = `<span class="truncate pr-2 flex items-center gap-1">🍌 ${agent}</span> <span class="text-slate-900 font-black">$${amount.toFixed(2)}</span>`;
                
            } else {
                // Standard Styling for others
                row.className = "flex justify-between items-center border-b border-slate-900/10 py-1 last:border-0";
                row.innerHTML = `<span class="truncate pr-2">${agent}</span> <span class="font-bold">$${amount.toFixed(2)}</span>`;
            }
            listDiv.appendChild(row);
        });

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
    
    // HIDE NEW LEAD BUTTON ON CLEAR
    document.getElementById('newLeadBtn').classList.add('hidden');
    
    submitBtn.innerText = "Submit Billing";
    submitBtn.classList.replace('bg-green-600', 'bg-blue-600');
    
    toggleProviderFields();
    showToast("Form Cleared");
}

// --- UPDATED SEARCH LOGIC ---
async function searchLead(specificRowIndex = null) {
    const id = document.getElementById('searchId').value.trim();
    if(!id) return showToast("Enter an Order ID", true);

    const btn = document.querySelector('button[onclick="searchLead()"]');
    if(!specificRowIndex) btn.innerText = "...";
    
    let url = `/api/get-lead?type=billing&id=${id}`;
    if (specificRowIndex) url += `&row_index=${specificRowIndex}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Server responded with an error"); 
        
        const json = await res.json();
        
        // 1. Handle Duplicates
        if(json.status === 'multiple') {
            const list = document.getElementById('duplicateList');
            list.innerHTML = '';
            json.data.forEach(c => {
                const item = document.createElement('div');
                item.className = "p-3 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-blue-600/50 border border-slate-600 transition flex justify-between items-center mb-2";
                item.innerHTML = `<div><div class="font-bold text-white text-sm">${c.Agent} - ${c.Client}</div><div class="text-xs text-slate-400">${c.Timestamp}</div></div><div class="text-green-400 font-mono font-bold text-sm">${c.Charge}</div>`;
                item.onclick = () => {
                    document.getElementById('duplicateModal').classList.add('hidden');
                    searchLead(c.row_index);
                };
                list.appendChild(item);
            });
            document.getElementById('duplicateModal').classList.remove('hidden');
            return; 
        }

        // 2. Handle Success
        if(json.status === 'success') {
            const d = json.data;
            document.getElementById('isEdit').value = "true";
            
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.innerText = "Update Lead";
            submitBtn.classList.replace('bg-blue-600', 'bg-green-600');
            document.getElementById('editOptions').classList.remove('hidden');
            
            // SHOW NEW LEAD BUTTON
            document.getElementById('newLeadBtn').classList.remove('hidden');
            
            document.getElementById('original_timestamp').value = d['Timestamp'] || d['timestamp_str'] || '';
            document.getElementById('row_index').value = d['row_index'] || '';
            document.getElementById('agent').value = d['Agent Name'] || '';
            document.getElementById('client_name').value = d['Client Name'] || ''; 
            document.getElementById('order_id').value = d['Order ID'] || id;
            document.getElementById('order_id').readOnly = true; 
            document.getElementById('phone').value = d['Ph Number'] || d['phone'] || '';
            document.getElementById('address').value = d['Address'] || '';
            document.getElementById('email').value = d['Email'] || '';
            document.getElementById('card_holder').value = d['Card Holder Name'] || '';
            document.getElementById('card_number').value = d['Card Number'] || '';
            document.getElementById('exp_date').value = d['Expiry Date'] || '';
            document.getElementById('cvc').value = d['CVC'] || '';
            
            const rawCharge = d['Charge'] || '0';
            const cleanCharge = String(rawCharge).replace(/[^0-9.]/g, '');
            document.getElementById('charge_amt').value = cleanCharge;
            
            const llcField = document.getElementById('llc');
            if(llcField) llcField.value = d['LLC'] || '';

            document.getElementById('providerSelect').value = d['Provider'] || '';
            
            const savedCode = d['PIN Code'] || d['Account Number'] || '';
            if(document.getElementById('pin_code')) document.getElementById('pin_code').value = savedCode;
            if(document.getElementById('account_number')) document.getElementById('account_number').value = savedCode;
            
            toggleProviderFields();
            showToast("Lead Loaded.");
            return; 
        } else {
            showToast(json.message || "Order ID not found.", true);
        }
    } catch(e) { 
        console.error("Search Error Detail:", e); 
        showToast("Error fetching data", true); 
    } finally { 
        if(!specificRowIndex && btn) btn.innerText = "Find"; 
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
            let value = e.target.value.replace(/\D/g, '');
            value = value.substring(0, 16);
            e.target.value = value.replace(/(\d{4})(?=\d)/g, '$1 ');
        });
    }

    // 2. Expiry Date: Adds slash after 2 digits while typing
    if (expInput) {
        expInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            value = value.substring(0, 4);
            if (value.length > 2) {
                e.target.value = value.substring(0, 2) + '/' + value.substring(2);
            } else {
                e.target.value = value;
            }
        });
    }
});

// --- NEW LEAD BUTTON LOGIC ---
const newLeadBtn = document.getElementById('newLeadBtn');
if(newLeadBtn) {
    newLeadBtn.addEventListener('click', async function() {
        const form = document.getElementById('billingForm');
        const originalText = newLeadBtn.innerText;

        // 1. Prepare form data for a "New" submission
        const formData = new FormData(form);
        formData.set('is_edit', 'false');       // Force it to be a new record
        formData.set('row_index', '');          // Remove the old row index
        formData.set('original_timestamp', ''); // Remove original timestamp
        
        // Force timestamp to update to NOW
        formData.set('timestamp_mode', 'update');

        // 2. UI Feedback
        newLeadBtn.innerText = 'Creating...';
        newLeadBtn.disabled = true;

        try {
            // 3. Submit to the save-lead API
            const res = await fetch('/api/save-lead', { method: 'POST', body: formData });
            const data = await res.json();
            
            if (data.status === 'success') {
                showToast("New Lead Created Successfully!");
                if(typeof fetchNightStats === "function") fetchNightStats();
                
                // Do NOT clear form, so user can edit further if needed
            } else {
                showToast(data.message, true);
            }
        } catch (err) {
            console.error(err);
            showToast('Submission Failed', true);
        } finally {
            newLeadBtn.innerText = originalText;
            newLeadBtn.disabled = false;
        }
    });
}
(function() {
    // 1. Save the original toast function so we don't break it
    const originalShowToast = window.showToast;
    
    // 2. List of Hype Quotes
    const hypeQuotes = [
        "CHA-CHING! 💸",
        "Money printer go BRRRR! 🖨️💵",
        "Another one! DJ Khaled would be proud. 🔑",
        "Save some commissions for the rest of us! 🤑",
        "You're on fire! (Not literally, please). 🔥",
        "Stonks only go up! 📈",
        "Glengarry Glen Ross vibes! ☕",
        "Show me the money!!! 💰",
        "Boom! Mic drop. 🎤",
        "I smell a bonus... 👃💵"
    ];

    // 3. Override the showToast function
    window.showToast = function(msg, isError = false) {
        // Only trigger fun stuff on Success (when msg contains 'saved', 'created', or 'success')
        if (!isError && (msg.toLowerCase().includes('saved') || msg.toLowerCase().includes('created') || msg.toLowerCase().includes('success'))) {
            
            // Pick a random quote
            const randomQuote = hypeQuotes[Math.floor(Math.random() * hypeQuotes.length)];
            msg = `${msg} — ${randomQuote}`;
            
            // Make it rain!
            makeItRain();
        }
        
        // Call the original function to show the message
        if (originalShowToast) originalShowToast(msg, isError);
    };

    // 4. The Money Rain Logic (Pure JS & CSS injection)
    function makeItRain() {
        // Create container
        const container = document.createElement('div');
        Object.assign(container.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: '9999', overflow: 'hidden'
        });
        document.body.appendChild(container);

        // Inject Animation CSS if not present
        if (!document.getElementById('money-rain-style')) {
            const style = document.createElement('style');
            style.id = 'money-rain-style';
            style.innerHTML = `@keyframes moneyFall { to { transform: translateY(110vh) rotate(720deg); } }`;
            document.head.appendChild(style);
        }

        // Create 50 falling emojis
        const currencies = ['💸', '💵', '💰', '🤑', '💎'];
        for (let i = 0; i < 50; i++) {
            const money = document.createElement('div');
            money.innerText = currencies[Math.floor(Math.random() * currencies.length)];
            Object.assign(money.style, {
                position: 'absolute',
                left: Math.random() * 100 + 'vw',
                top: '-50px',
                fontSize: (Math.random() * 20 + 25) + 'px',
                animation: `moneyFall ${Math.random() * 2 + 1.5}s linear forwards`,
                opacity: Math.random() + 0.5
            });
            container.appendChild(money);
        }

        // Cleanup after 4 seconds
        setTimeout(() => container.remove(), 4000);
    }
})();
