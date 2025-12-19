function togglePin() {
    const provider = document.getElementById('providerSelect').value;
    const pinDiv = document.getElementById('pinContainer');
    if (provider === 'Spectrum') pinDiv.classList.remove('hidden');
    else pinDiv.classList.add('hidden');
}

// Toast Helper
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

// Search Logic (Same as before but uses toast on error)
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
            document.getElementById('submitBtn').innerText = "Update Lead";
            document.getElementById('submitBtn').classList.replace('bg-blue-600', 'bg-green-600');
            
            // Populate
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
            document.getElementById('charge_amt').value = d['Charge'];
            document.getElementById('llc').value = d['LLC'];
            document.getElementById('providerSelect').value = d['Provider'];
            document.getElementById('pin_code').value = d['PIN Code'] || '';
            
            togglePin();
            showToast("Lead Loaded. You can now edit.");
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
            // Reset form if NOT editing, otherwise maybe redirect or keep?
            // User requested no redirect. If it was an edit, maybe they want to stay.
            // If new, clear.
            if(document.getElementById('isEdit').value !== 'true') {
                 e.target.reset();
                 togglePin();
            }
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