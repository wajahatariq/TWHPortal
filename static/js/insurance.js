/* =========================================
   INSURANCE PORTAL LOGIC
   ========================================= */

document.addEventListener("DOMContentLoaded", function() {
    // 1. Generate a Random Alphanumeric ID on page load
    generateRandomId();

    // 2. Initialize Date Field
    const dateField = document.getElementById('displayDate');
    if(dateField) {
        dateField.value = new Date().toISOString().split('T')[0].replace(/-/g, '/');
    }
});

/* ========================
   CORE FUNCTIONS
   ======================== */

// Generate a Random Alphanumeric ID (Letters & Numbers)
function generateRandomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    // Generate 6 random characters
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Optional: Add a prefix like 'INS-' for Insurance if you want
    // result = 'INS-' + result; 

    const idField = document.getElementById('recordId');
    if(idField) {
        idField.value = result;
        console.log("New Record ID generated:", result);
    }
    
    // Update placeholder to indicate ID availability
    const searchInput = document.getElementById('searchId');
    if(searchInput) searchInput.placeholder = "Enter Record ID to Edit...";
}

// Helper to set dropdown values
function setSelectValue(id, value) {
    const select = document.getElementById(id);
    if (!select || !value) return;
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value.toLowerCase() === value.toLowerCase()) {
            select.selectedIndex = i;
            break;
        }
    }
}

// Notification System
function showNotification(msg, type) {
    let notif = document.getElementById("notification");
    
    if (!notif) {
        notif = document.createElement('div');
        notif.id = "notification";
        document.body.appendChild(notif);
    }

    notif.innerText = msg;
    notif.className = `fixed bottom-5 right-5 px-6 py-3 rounded-lg shadow-xl transform transition-all duration-300 z-50 font-bold ${type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`;
    
    notif.style.transform = "translateY(0)";
    notif.style.opacity = "1";

    setTimeout(() => {
        notif.style.transform = "translateY(150%)";
        notif.style.opacity = "0";
    }, 3000);
}

/* ========================
   FORM SUBMISSION
   ======================== */
const form = document.getElementById("insuranceForm");
if (form) {
    form.addEventListener("submit", async function(e) {
        e.preventDefault();
        const btn = document.getElementById("submitBtn");
        const originalText = btn.innerText;
        
        btn.innerText = "Processing...";
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');

        try {
            const formData = new FormData(this);
            
            // Generate ID if missing (Fallback)
            if (!formData.get('record_id')) {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let newId = '';
                for (let i = 0; i < 6; i++) newId += chars.charAt(Math.floor(Math.random() * chars.length));
                formData.set('record_id', newId);
            }

            const response = await fetch("/api/save-lead", {
                method: "POST",
                body: formData
            });

            const result = await response.json();
            
            if (result.status === "success") {
                showNotification(result.message || "Saved Successfully!", "success");
                
                // --- UNIQUE ID LOGIC ---
                // 1. Form stays filled (No clearForm)
                // 2. Generate NEW Alphanumeric ID immediately for next click
                const isEdit = document.getElementById('isEdit').value;
                if (isEdit !== 'true') {
                    generateRandomId(); 
                }

            } else {
                showNotification("Error: " + result.message, "error");
            }
        } catch (error) {
            console.error(error);
            showNotification("Server Error. Check console.", "error");
        }

        btn.innerText = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    });
}

/* ========================
   CLEAR FORM LOGIC
   ======================== */
function clearForm() {
    const form = document.getElementById('insuranceForm');
    if (form) form.reset();

    // Reset Hidden Values
    document.getElementById('isEdit').value = 'false';
    document.getElementById('row_index').value = '';
    document.getElementById('original_timestamp').value = '';
    
    // Hide Edit UI
    const editOptions = document.getElementById('editOptions');
    if(editOptions) editOptions.classList.add('hidden');

    // Reset Button
    const submitBtn = document.getElementById('submitBtn');
    if(submitBtn) {
        submitBtn.innerText = "Submit Insurance";
        submitBtn.classList.replace('bg-blue-600', 'bg-green-600');
        submitBtn.classList.replace('hover:bg-blue-500', 'hover:bg-green-500');
    }

    // Generate NEW Unique ID
    generateRandomId();
    
    // Reset Date
    const dateField = document.getElementById('displayDate');
    if(dateField) dateField.value = new Date().toISOString().split('T')[0].replace(/-/g, '/');

    showNotification("Form Cleared");
}

/* ========================
   SEARCH & EDIT LOGIC
   ======================== */
async function searchLead(rowIndex = null) {
    const idInput = document.getElementById('searchId');
    const id = idInput.value.trim();
    if (!id) return showNotification("Please enter a Record ID", "error");

    const btn = document.querySelector('button[onclick="searchLead()"]');
    if(btn) btn.innerText = "...";

    let url = `/api/get-lead?type=insurance&id=${id}`;
    if (rowIndex) url += `&row_index=${rowIndex}`;

    try {
        const res = await fetch(url);
        const json = await res.json();

        if (json.status === 'success') {
            populateMainForm(json.data);
            document.getElementById('duplicateModal').classList.add('hidden');
        } else if (json.status === 'multiple') {
            showDuplicateSelection(json.candidates);
        } else {
            showNotification(json.message || "Lead not found", "error");
        }
    } catch (e) {
        console.error(e);
        showNotification("Error searching for lead", "error");
    }

    if(btn) btn.innerText = "Find";
}

function populateMainForm(data) {
    document.getElementById('isEdit').value = 'true';
    document.getElementById('editOptions').classList.remove('hidden');

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.innerText = "Update Insurance";
    submitBtn.classList.replace('bg-green-600', 'bg-blue-600');
    submitBtn.classList.replace('hover:bg-green-500', 'hover:bg-blue-500');

    document.getElementById('row_index').value = data.row_index || '';
    document.getElementById('original_timestamp').value = data['Timestamp'] || '';
    document.getElementById('recordId').value = data['Record_ID'] || data['Order ID'];

    const fields = {
        'agent': 'Agent Name',
        'client_name': 'Name', 
        'phone': 'Ph Number',
        'email': 'Email',
        'address': 'Address',
        'card_holder': 'Card Holder Name',
        'card_number': 'Card Number',
        'exp_date': 'Expiry Date',
        'cvc': 'CVC'
    };

    for (const [id, key] of Object.entries(fields)) {
        if(document.getElementById(id)) {
            let val = data[key];
            if(!val && key === 'Name') val = data['Client Name'];
            document.getElementById(id).value = val || '';
        }
    }

    let charge = data['Charge'] || data['Charge Amount'] || '';
    charge = charge.replace(/[^0-9.]/g, '');
    if(document.getElementById('charge_amt')) document.getElementById('charge_amt').value = charge;

    setSelectValue('llc', data['LLC']);
    showNotification("Lead Loaded. You can now edit.", "success");
}

function showDuplicateSelection(candidates) {
    const container = document.getElementById('duplicateList');
    if(!container) return;
    container.innerHTML = ''; 

    candidates.forEach(c => {
        const btn = document.createElement('button');
        btn.className = "w-full text-left bg-slate-700 hover:bg-slate-600 p-3 rounded-lg border border-slate-600 flex justify-between items-center transition group mb-2";
        btn.onclick = () => searchLead(c.row_index);
        
        btn.innerHTML = `
            <div>
                <div class="font-bold text-white group-hover:text-blue-400">${c.name}</div>
                <div class="text-xs text-slate-400">${c.timestamp}</div>
            </div>
            <div class="font-mono text-green-400 font-bold">${c.charge}</div>
        `;
        container.appendChild(btn);
    });

    document.getElementById('duplicateModal').classList.remove('hidden');
}
