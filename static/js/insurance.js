/* ========================
   INSURANCE PORTAL LOGIC (FIXED)
   ======================== */

// --- 1. Notification Helper (Prevents Crash) ---
function showNotification(msg, type) {
    let notif = document.getElementById("notification");
    
    // Fix: Create element if it doesn't exist
    if (!notif) {
        notif = document.createElement("div");
        notif.id = "notification";
        document.body.appendChild(notif);
    }
    
    notif.innerText = msg;
    notif.className = `fixed bottom-5 right-5 px-6 py-3 rounded-lg shadow-xl transform transition-transform duration-300 z-50 font-bold ${type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`;
    notif.style.transform = "translateY(0)";
    
    // Auto-hide
    setTimeout(() => {
        notif.style.transform = "translateY(150%)";
    }, 3000);
}

// --- 2. Unified Form Submission ---
const form = document.getElementById("insuranceForm");
if (form) {
    form.addEventListener("submit", async function(e) {
        e.preventDefault();
        
        const btn = document.getElementById("submitBtn");
        const isEdit = document.getElementById("isEdit").value === 'true';
        
        // Visual Feedback
        btn.innerText = "Processing...";
        btn.disabled = true;

        try {
            const formData = new FormData(this);

            // --- CRITICAL FIX: GENERATE ID FOR NEW LEADS ---
            let recordId = formData.get('record_id');
            if (!recordId) {
                // Generate unique ID: INS + Timestamp (e.g., INS-1724356789)
                recordId = 'INS-' + Date.now();
                formData.set('record_id', recordId);
            }
            // ------------------------------------------------

            const response = await fetch("/api/save-lead", {
                method: "POST",
                body: formData
            });

            const result = await response.json();
            
            if (result.status === "success") {
                showNotification(isEdit ? "Lead Updated Successfully!" : "Lead Submitted Successfully!", "success");
                clearForm(); 
            } else {
                showNotification("Error: " + result.message, "error");
            }
        } catch (error) {
            console.error(error);
            showNotification("Server Error. Check console.", "error");
        } finally {
            // Restore Button State
            btn.innerText = "Submit Insurance"; 
            btn.disabled = false;
        }
    });
}

// --- 3. Search / Edit Logic ---
async function searchLead() {
    const searchInput = document.getElementById('searchId');
    const id = searchInput.value.trim();
    if (!id) return alert("Please enter a Record ID");

    // Disable Find Button temporarily
    const findBtn = document.querySelector('button[onclick="searchLead()"]');
    if(findBtn) {
        findBtn.innerText = "...";
        findBtn.disabled = true;
    }

    try {
        const res = await fetch(`/api/get-lead?type=insurance&id=${id}`);
        const json = await res.json();

        if (json.status === 'success') {
            populateForm(json.data);
            showNotification("Record Loaded", "success");
        } else if (json.status === 'multiple') {
            showDuplicateSelection(json.candidates);
        } else {
            showNotification(json.message || "Lead not found", "error");
        }
    } catch (e) {
        console.error(e);
        showNotification("Error searching for lead", "error");
    } finally {
        if(findBtn) {
            findBtn.innerText = "Find";
            findBtn.disabled = false;
        }
    }
}

function populateForm(data) {
    // Enable Edit Mode
    document.getElementById('isEdit').value = 'true';
    document.getElementById('recordId').value = data['Record_ID'] || data['record_id'];
    
    // Change Button Text/Color to indicate Update
    const btn = document.getElementById('submitBtn');
    btn.innerText = "Update Record";
    btn.classList.remove('bg-green-600', 'hover:bg-green-500');
    btn.classList.add('bg-blue-600', 'hover:bg-blue-500');

    // Populate Fields
    setVal('agent', data['Agent Name']);
    setVal('card_number', data['Card Number']);
    setVal('client_name', data['Client Name'] || data['Name']);
    setVal('exp_date', data['Expiry Date']);
    setVal('phone', data['Ph Number']);
    setVal('cvc', data['CVC']);
    setVal('address', data['Address']);
    setVal('charge_amt', data['Charge'] || data['Charge Amount']);
    setVal('email', data['Email']);
    setVal('llc', data['LLC']);
    setVal('card_holder', data['Card Holder Name']);
    
    // Show Edit Options (Timestamp)
    document.getElementById('editOptions').classList.remove('hidden');
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if(el) el.value = val || '';
}

function clearForm() {
    document.getElementById("insuranceForm").reset();
    document.getElementById('isEdit').value = 'false';
    document.getElementById('recordId').value = '';
    
    // Reset Button Styles
    const btn = document.getElementById('submitBtn');
    btn.innerText = "Submit Insurance";
    btn.classList.add('bg-green-600', 'hover:bg-green-500');
    btn.classList.remove('bg-blue-600', 'hover:bg-blue-500');
    
    // Hide Edit Options
    document.getElementById('editOptions').classList.add('hidden');
    
    // Reset Date Display
    document.getElementById('displayDate').value = new Date().toISOString().split('T')[0].replace(/-/g, '/');
}

// --- 4. Duplicate Selection Logic ---
function showDuplicateSelection(candidates) {
    const modal = document.getElementById('duplicateModal');
    const list = document.getElementById('duplicateList');
    list.innerHTML = ''; // Clear previous

    candidates.forEach(c => {
        const div = document.createElement('div');
        div.className = "p-3 bg-slate-700 hover:bg-slate-600 rounded cursor-pointer border border-slate-600 flex justify-between";
        div.onclick = () => {
            if(c.record_id) {
                modal.classList.add('hidden');
                document.getElementById('searchId').value = c.record_id;
                searchLead(); 
            }
        };
        div.innerHTML = `<span>${c.name}</span> <span class="font-mono text-green-400">${c.charge}</span>`;
        list.appendChild(div);
    });
    
    modal.classList.remove('hidden');
}

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
