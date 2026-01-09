/* =========================================
   INSURANCE PORTAL LOGIC (Fixed & Complete)
   ========================================= */

document.addEventListener("DOMContentLoaded", function() {
    // 1. Generate a Random Order ID on page load
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

// Generate a random 6-digit ID for new orders
function generateRandomId() {
    const randomId = Math.floor(100000 + Math.random() * 900000);
    const idField = document.getElementById('recordId');
    if(idField) {
        idField.value = randomId;
    }
    // Also update the search field placeholder to hint functionality
    const searchInput = document.getElementById('searchId');
    if(searchInput) searchInput.placeholder = "Enter Record ID to Edit...";
}

// Helper to set dropdown values safely
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

// Notification System (Fixed to prevent crashing)
function showNotification(msg, type) {
    let notif = document.getElementById("notification");
    
    // Create the notification element if it doesn't exist
    if (!notif) {
        notif = document.createElement('div');
        notif.id = "notification";
        document.body.appendChild(notif);
    }

    notif.innerText = msg;
    notif.className = `fixed bottom-5 right-5 px-6 py-3 rounded-lg shadow-xl transform transition-all duration-300 z-50 font-bold ${type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`;
    
    // Animate In
    notif.style.transform = "translateY(0)";
    notif.style.opacity = "1";

    // Animate Out after 3 seconds
    setTimeout(() => {
        notif.style.transform = "translateY(150%)";
        notif.style.opacity = "0";
    }, 3000);
}

/* ========================
   FORM SUBMISSION (Create & Update)
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
            
            // Ensure Record ID exists (Fix for new leads)
            if (!formData.get('record_id')) {
                const newId = Math.floor(100000 + Math.random() * 900000);
                formData.set('record_id', newId);
            }

            const response = await fetch("/api/save-lead", {
                method: "POST",
                body: formData
            });

            const result = await response.json();
            
            if (result.status === "success") {
                showNotification(result.message || "Saved Successfully!", "success");
                
                // Only clear form if it was a NEW submission
                const isEdit = document.getElementById('isEdit').value;
                if (isEdit !== 'true') {
                    clearForm();
                }
            } else {
                showNotification("Error: " + result.message, "error");
            }
        } catch (error) {
            console.error(error);
            showNotification("Server Error. Check console.", "error");
        }

        // Reset Button
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

    // 1. Reset Hidden Fields
    document.getElementById('isEdit').value = 'false';
    document.getElementById('row_index').value = '';
    document.getElementById('original_timestamp').value = '';
    
    // 2. Hide Edit Specifics
    const editOptions = document.getElementById('editOptions');
    if(editOptions) editOptions.classList.add('hidden');

    // 3. Reset Button Style
    const submitBtn = document.getElementById('submitBtn');
    if(submitBtn) {
        submitBtn.innerText = "Submit Insurance";
        submitBtn.classList.replace('bg-blue-600', 'bg-green-600');
        submitBtn.classList.replace('hover:bg-blue-500', 'hover:bg-green-500');
    }

    // 4. Generate New ID & Reset Date
    generateRandomId();
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

    // Build URL (Search by ID or specific Row Index)
    let url = `/api/get-lead?type=insurance&id=${id}`;
    if (rowIndex) url += `&row_index=${rowIndex}`;

    try {
        const res = await fetch(url);
        const json = await res.json();

        if (json.status === 'success') {
            // SINGLE RECORD FOUND -> Populate Main Form
            populateMainForm(json.data);
            
            // Close duplicate modal if open
            document.getElementById('duplicateModal').classList.add('hidden');
            
        } else if (json.status === 'multiple') {
            // MULTIPLE RECORDS -> Show Selection Modal
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
    // 1. Switch to Edit Mode
    document.getElementById('isEdit').value = 'true';
    document.getElementById('editOptions').classList.remove('hidden');

    // 2. Update Button
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.innerText = "Update Insurance";
    submitBtn.classList.replace('bg-green-600', 'bg-blue-600');
    submitBtn.classList.replace('hover:bg-green-500', 'hover:bg-blue-500');

    // 3. Populate Hidden Fields
    document.getElementById('row_index').value = data.row_index || '';
    document.getElementById('original_timestamp').value = data['Timestamp'] || '';
    document.getElementById('recordId').value = data['Record_ID'] || data['Order ID'];

    // 4. Populate Visible Fields
    // Using safe checks in case IDs differ slightly
    if(document.getElementById('agent')) document.getElementById('agent').value = data['Agent Name'];
    if(document.getElementById('client_name')) document.getElementById('client_name').value = data['Name'] || data['Client Name'];
    if(document.getElementById('phone')) document.getElementById('phone').value = data['Ph Number'];
    if(document.getElementById('email')) document.getElementById('email').value = data['Email'];
    if(document.getElementById('address')) document.getElementById('address').value = data['Address'];
    
    if(document.getElementById('card_holder')) document.getElementById('card_holder').value = data['Card Holder Name'];
    if(document.getElementById('card_number')) document.getElementById('card_number').value = data['Card Number'];
    if(document.getElementById('exp_date')) document.getElementById('exp_date').value = data['Expiry Date'];
    if(document.getElementById('cvc')) document.getElementById('cvc').value = data['CVC'];
    
    // Clean up charge amount (remove $ symbol)
    let charge = data['Charge'] || data['Charge Amount'] || '';
    charge = charge.replace(/[^0-9.]/g, '');
    if(document.getElementById('charge_amt')) document.getElementById('charge_amt').value = charge;

    // Dropdown
    setSelectValue('llc', data['LLC']);

    showNotification("Lead Loaded. You can now edit.", "success");
}

function showDuplicateSelection(candidates) {
    const container = document.getElementById('duplicateList');
    if(!container) return;
    
    container.innerHTML = ''; // Clear previous

    candidates.forEach(c => {
        const btn = document.createElement('button');
        btn.className = "w-full text-left bg-slate-700 hover:bg-slate-600 p-3 rounded-lg border border-slate-600 flex justify-between items-center transition group mb-2";
        
        // When clicked, call searchLead again with the specific ROW INDEX
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

    // Show the modal
    document.getElementById('duplicateModal').classList.remove('hidden');
}

/* ========================
   UI UTILITIES (Tabs, etc)
   ======================== */
// Kept for compatibility if you add tabs later
function switchTab(tabName) {
    console.log("Switching tab to:", tabName);
}
