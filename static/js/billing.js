/* ========================
   TAB SWITCHING LOGIC
   ======================== */
function switchTab(tabName) {
    const viewNew = document.getElementById('viewNew');
    const viewEdit = document.getElementById('viewEdit');
    const btnNew = document.getElementById('tabNew');
    const btnEdit = document.getElementById('tabEdit');

    if (tabName === 'new') {
        viewNew.classList.remove('hidden');
        viewEdit.classList.add('hidden');
        
        // Active Styles for 'New'
        btnNew.classList.add('bg-blue-600', 'text-white');
        btnNew.classList.remove('text-slate-400');
        
        // Inactive Styles for 'Edit'
        btnEdit.classList.remove('bg-blue-600', 'text-white');
        btnEdit.classList.add('text-slate-400');
    } else {
        viewNew.classList.add('hidden');
        viewEdit.classList.remove('hidden');
        
        // Active Styles for 'Edit'
        btnEdit.classList.add('bg-blue-600', 'text-white');
        btnEdit.classList.remove('text-slate-400');

        // Inactive Styles for 'New'
        btnNew.classList.remove('bg-blue-600', 'text-white');
        btnNew.classList.add('text-slate-400');
    }
}

/* ========================
   SUBMIT NEW LEAD (Logic)
   ======================== */
document.getElementById("billingForm").addEventListener("submit", async function(e) {
    e.preventDefault();
    const btn = document.getElementById("submitBtn");
    const originalText = btn.innerText;
    
    btn.innerText = "Submitting...";
    btn.disabled = true;

    try {
        const formData = new FormData(this);
        const response = await fetch("/api/save-lead", {
            method: "POST",
            body: formData
        });

        const result = await response.json();
        if (result.status === "success") {
            showNotification("Lead Submitted Successfully!", "success");
            this.reset();
        } else {
            showNotification("Error: " + result.message, "error");
        }
    } catch (error) {
        showNotification("Server Error. Check console.", "error");
        console.error(error);
    }

    btn.innerText = originalText;
    btn.disabled = false;
});

/* ========================
   EDIT LEAD LOGIC
   ======================== */

// 1. Search for the Lead
async function searchLead() {
    const id = document.getElementById('searchId').value.trim();
    if (!id) return alert("Please enter an Order ID");

    const btn = document.querySelector('#viewEdit button'); // Search button
    const originalText = btn.innerText;
    btn.innerText = "...";
    btn.disabled = true;

    try {
        // Change 'type=billing' to 'type=insurance' for the insurance file
        const res = await fetch(`/api/get-lead?type=billing&id=${id}`);
        const json = await res.json();

        if (json.status === 'success') {
            const data = json.data;
            populateEditForm(data);
            document.getElementById('editFormContainer').classList.remove('hidden');
        } else {
            alert(json.message || "Lead not found");
            document.getElementById('editFormContainer').classList.add('hidden');
        }
    } catch (e) {
        console.error(e);
        alert("Error searching for lead");
    }

    btn.innerText = originalText;
    btn.disabled = false;
}

// 2. Populate the Edit Form
function populateEditForm(data) {
    // Hidden Fields
    document.getElementById('edit_row_index').value = data.row_index;
    document.getElementById('edit_timestamp').value = data['Timestamp'] || '';

    // Visible Fields
    document.getElementById('edit_agent').value = data['Agent Name'];
    document.getElementById('edit_order_id').value = data['Record_ID'];
    document.getElementById('edit_client_name').value = data['Name'] || data['Client Name'];
    document.getElementById('edit_phone').value = data['Ph Number'];
    document.getElementById('edit_email').value = data['Email'];
    document.getElementById('edit_address').value = data['Address'];
    
    document.getElementById('edit_card_holder').value = data['Card Holder Name'];
    document.getElementById('edit_card_number').value = data['Card Number'];
    document.getElementById('edit_exp_date').value = data['Expiry Date'];
    document.getElementById('edit_cvc').value = data['CVC'];
    
    document.getElementById('edit_charge_amt').value = data['Charge'] || data['Charge Amount'];
    
    // Selects (Dropdowns)
    setSelectValue('edit_llc', data['LLC']);
    setSelectValue('edit_provider', data['Provider']);
}

// Helper to set dropdowns even if case doesn't match perfectly
function setSelectValue(id, value) {
    const select = document.getElementById(id);
    if (!value) return;
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value.toLowerCase() === value.toLowerCase()) {
            select.selectedIndex = i;
            break;
        }
    }
}

// 3. Submit Update
document.getElementById("editForm").addEventListener("submit", async function(e) {
    e.preventDefault();
    if(!confirm("Are you sure you want to update this record?")) return;

    const btn = document.getElementById("updateBtn");
    const originalText = btn.innerText;
    btn.innerText = "Updating...";
    btn.disabled = true;

    try {
        const formData = new FormData(this);
        // 'is_edit' is already in the HTML as hidden input
        
        const response = await fetch("/api/save-lead", {
            method: "POST",
            body: formData
        });

        const result = await response.json();
        if (result.status === "success") {
            showNotification("Lead Updated Successfully!", "success");
            // Hide form after success
            document.getElementById('editFormContainer').classList.add('hidden');
            document.getElementById('searchId').value = ""; 
        } else {
            showNotification("Error: " + result.message, "error");
        }
    } catch (error) {
        showNotification("Server Error", "error");
    }

    btn.innerText = originalText;
    btn.disabled = false;
});

/* ========================
   UTILITIES
   ======================== */
function showNotification(msg, type) {
    const notif = document.getElementById("notification");
    notif.innerText = msg;
    notif.className = `fixed bottom-5 right-5 px-6 py-3 rounded-lg shadow-xl transform transition-transform duration-300 z-50 font-bold ${type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`;
    notif.style.transform = "translateY(0)";
    setTimeout(() => {
        notif.style.transform = "translateY(150%)";
    }, 3000);
}
