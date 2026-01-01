// --- PUSHER CONFIGURATION ---
// IMPORTANT: Replace with your actual PUSHER KEY and CLUSTER if different
const pusher = new Pusher('YOUR_PUSHER_KEY', {
    cluster: 'mt1'
});

const channel = pusher.subscribe('techware-channel');

// Listen for Payment Confirmation from Manager
channel.bind('payment-confirmed', function(data) {
    const currentAgent = localStorage.getItem('agentName') || document.getElementById('agent').value;
    
    // Check if this approval is for THIS agent
    // (Normalize strings to avoid case mismatch issues)
    if (data.agent && currentAgent && data.agent.toLowerCase().trim() === currentAgent.toLowerCase().trim()) {
        
        // 1. Play Sound
        const audio = document.getElementById('notifSound');
        if(audio) audio.play().catch(e => console.log("Audio play blocked", e));
        
        // 2. Populate Modal
        document.getElementById('emailContent').value = data.email_body;
        document.getElementById('emailSubtitle').innerText = `Great job, ${data.agent}! Here is the confirmation email for ${data.client_name}.`;
        
        // 3. Show Modal
        const modal = document.getElementById('emailModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
});
// ----------------------------


document.addEventListener('DOMContentLoaded', () => {
    // Set Agent Name from LocalStorage
    const savedAgent = localStorage.getItem('agentName');
    if(savedAgent) document.getElementById('agent').value = savedAgent;

    // Form Submission
    const form = document.getElementById('billingForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = document.getElementById('submitBtn');
        const originalText = btn.innerText;
        btn.innerText = "Submitting...";
        btn.disabled = true;

        // Save Agent Name
        localStorage.setItem('agentName', document.getElementById('agent').value);

        const formData = new FormData(form);
        formData.append('type', 'billing');

        try {
            const res = await fetch('/api/save-lead', {
                method: 'POST',
                body: formData
            });
            const json = await res.json();

            if(json.status === 'success') {
                showToast(json.message);
                
                if(document.getElementById('isEdit').value !== 'true') {
                    form.reset();
                    document.getElementById('agent').value = localStorage.getItem('agentName');
                    document.getElementById('isEdit').value = "false";
                }
            } else {
                showToast(json.message, true);
            }
        } catch(err) {
            console.error(err);
            showToast("Error submitting lead", true);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });
});

// Toggle Provider Fields
function toggleProviderFields() {
    const provider = document.getElementById('providerSelect').value;
    const pinGroup = document.getElementById('pinGroup');
    const accountGroup = document.getElementById('accountGroup');

    if(provider === 'Spectrum' || provider === 'T-Mobile' || provider === 'Verizon') {
        pinGroup.classList.remove('hidden');
        accountGroup.classList.add('hidden');
    } else if(provider === 'AT&T' || provider === 'DirectTV') {
        pinGroup.classList.remove('hidden');
        accountGroup.classList.add('hidden');
    } else if(provider === 'Xfinity' || provider === 'Cox' || provider === 'Optimum') {
        pinGroup.classList.add('hidden');
        accountGroup.classList.add('hidden');
    } else {
        pinGroup.classList.add('hidden');
        accountGroup.classList.add('hidden');
    }
}

// Search Function
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
        
        if(json.status === 'multiple') {
            const list = document.getElementById('duplicateList');
            list.innerHTML = '';
            
            json.candidates.forEach(c => {
                const name = c.name || c.Name || 'Unknown';
                const charge = c.charge || c.Charge || '$0';
                const date = c.timestamp || c.Timestamp || '';
                const rIndex = c.row_index;

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

        if(json.status === 'success') {
            const d = json.data;
            document.getElementById('isEdit').value = "true";
            document.getElementById('submitBtn').innerText = "Update Lead";
            document.getElementById('submitBtn').classList.replace('bg-blue-600', 'bg-green-600');
            
            document.getElementById('editOptions').classList.remove('hidden');
            document.getElementById('original_timestamp').value = d['Timestamp'] || d['timestamp'];
            document.getElementById('row_index').value = d['row_index'];

            document.getElementById('agent').value = d['Agent Name'];
            document.getElementById('client_name').value = d['Name'] || d['Client Name']; 
            document.getElementById('order_id').value = d['Record_ID'] || d['Order ID'];
            document.getElementById('order_id').readOnly = true; 
            document.getElementById('phone').value = d['Ph Number'];
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

// Toast Notification
function showToast(msg, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast-message fixed bottom-5 right-5 px-6 py-3 rounded shadow-xl text-white font-bold transform transition-all translate-y-10 opacity-0 ${isError ? 'bg-red-600' : 'bg-green-600'}`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function closeEmailModal() {
    document.getElementById('emailModal').classList.add('hidden');
    document.getElementById('emailModal').classList.remove('flex');
}

function copyEmailText() {
    const txt = document.getElementById('emailContent');
    txt.select();
    navigator.clipboard.writeText(txt.value).then(() => {
        showToast("Email copied to clipboard!");
    });
}
