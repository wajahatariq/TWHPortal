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
            
            // Populate
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
            document.getElementById('charge_amt').value = d['Charge'];
            
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
            if(document.getElementById('isEdit').value !== 'true') {
                e.target.reset();
                document.getElementById('recordId').value = crypto.randomUUID();
            }
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