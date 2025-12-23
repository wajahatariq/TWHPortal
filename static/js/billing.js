/* =========================================
   1. NIGHT STATS LOGIC (Auto-Refresh)
   ========================================= */
let nightStats = { billing: {total:0, breakdown:{}}, insurance: {total:0, breakdown:{}} };

async function fetchNightStats() {
    try {
        const res = await fetch('/api/public/night-stats');
        nightStats = await res.json();
        updateNightWidget();
    } catch(e) { console.error("Stats Error", e); }
}

function updateNightWidget() {
    // Check if the widget elements exist (in case you are on a page without them)
    const selector = document.getElementById('nightWidgetSelect');
    if (!selector) return;

    const type = selector.value;
    const data = nightStats[type] || {total:0, breakdown:{}};
    
    const amountEl = document.getElementById('nightWidgetAmount');
    if(amountEl) amountEl.innerText = '$' + data.total.toFixed(2);
    
    const listDiv = document.getElementById('nightBreakdown');
    if(listDiv) {
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
}

// Init Stats
fetchNightStats(); 
setInterval(fetchNightStats, 60000); // Refresh every 60s


/* =========================================
   2. TAB SWITCHING LOGIC
   ========================================= */
function switchTab(tabName) {
    const viewNew = document.getElementById('viewNew');
    const viewEdit = document.getElementById('viewEdit');
    const btnNew = document.getElementById('tabNew');
    const btnEdit = document.getElementById('tabEdit');

    if (tabName === 'new') {
        viewNew.classList.remove('hidden');
        viewEdit.classList.add('hidden');
        
        btnNew.classList.add('bg-blue-600', 'text-white');
        btnNew.classList.remove('text-slate-400');
        
        btnEdit.classList.remove('bg-blue-600', 'text-white');
        btnEdit.classList.add('text-slate-400');
    } else {
        viewNew.classList.add('hidden');
        viewEdit.classList.remove('hidden');
        
        btnEdit.classList.add('bg-blue-600', 'text-white');
        btnEdit.classList.remove('text-slate-400');

        btnNew.classList.remove('bg-blue-600', 'text-white');
        btnNew.classList.add('text-slate-400');
    }
}


/* =========================================
   3. SUBMIT NEW LEAD
   ========================================= */
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
            fetchNightStats(); // Update stats immediately
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


/* =========================================
   4. EDIT / SEARCH LOGIC (With Duplicates)
   ========================================= */

// Main Search Function
async function searchLead() {
    const id = document.getElementById('searchId').value.trim();
    if (!id) return alert("Please enter an Order ID");

    const btn = document.querySelector('#viewEdit button'); // Search button
    const originalText = btn.innerText;
    btn.innerText = "...";
    btn.disabled = true;

    // Clear previous results
    const existingList = document.getElementById('duplicateList');
    if(existingList) existingList.remove();
    document.getElementById('editFormContainer').classList.add('hidden');

    try {
        const res = await fetch(`/api/get-lead?type=billing&id=${id}`);
        const json = await res.json();

        if (json.status === 'success') {
            // Case A: Found 1 Record
            populateEditForm(json.data);
            document.getElementById('editFormContainer').classList.remove('hidden');
        
        } else if (json.status === 'multiple') {
            // Case B: Found Duplicates -> Show List
            showDuplicateSelection(json.candidates);
            
        } else {
            showNotification(json.message || "Lead not found", "error");
        }
    } catch (e) {
        console.error(e);
        showNotification("Error searching for lead", "error");
    }

    btn.innerText = originalText;
    btn.disabled = false;
}

// Helper: Show the list of duplicates
function showDuplicateSelection(candidates) {
    // Create the container
    const container = document.createElement('div');
    container.id = 'duplicateList';
    container.className = "bg-slate-700 p-4 rounded-xl mt-4 space-y-2 border border-slate-600 animate-fade-in";
    
    container.innerHTML = `<h3 class="text-white font-bold mb-2 text-sm uppercase tracking-wide">Multiple Records Found:</h3>`;

    candidates.forEach(c => {
        const btn = document.createElement('button');
        btn.className = "w-full text-left bg-slate-800 hover:bg-slate-600 p-3 rounded-lg border border-slate-600 flex justify-between items-center transition group";
        // On click, fetch that specific row index
        btn.onclick = () => fetchSpecificRow(c.row_index);
        
        btn.innerHTML = `
            <div>
                <div class="font-bold text-white group-hover:text-blue-400">${c.name}</div>
                <div class="text-xs text-slate-400">${c.timestamp}</div>
            </div>
            <div class="font-mono text-green-400 font-bold">${c.charge}</div>
        `;
        container.appendChild(btn);
    });

    // Insert it after the search box container
    const searchBox = document.querySelector('#viewEdit .shadow-lg');
    searchBox.parentNode.insertBefore(container, searchBox.nextSibling);
}

// Helper: Fetch a specific row (when duplicate clicked)
async function fetchSpecificRow(rowIndex) {
    try {
        const res = await fetch(`/api/get-lead?type=billing&id=ignore&row_index=${rowIndex}`);
        const json = await res.json();
        
        if (json.status === 'success') {
            // Remove list and show form
            const list = document.getElementById('duplicateList');
            if(list) list.remove();
            
            populateEditForm(json.data);
            document.getElementById('editFormContainer').classList.remove('hidden');
        }
    } catch(e) { showNotification("Error loading record", "error"); }
}

// Helper: Fill the form fields
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
    
    // Clean charge (remove existing $)
    let charge = data['Charge'] || data['Charge Amount'];
    if(charge) charge = String(charge).replace(/[^0-9.]/g, '');
    document.getElementById('edit_charge_amt').value = charge;
    
    // Selects
    setSelectValue('edit_llc', data['LLC']);
    setSelectValue('edit_provider', data['Provider']);
}

// Helper to set dropdowns
function setSelectValue(id, value) {
    const select = document.getElementById(id);
    if (!value || !select) return;
    for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value.toLowerCase() === value.toLowerCase()) {
            select.selectedIndex = i;
            break;
        }
    }
}

// Edit Form Submit
document.getElementById("editForm").addEventListener("submit", async function(e) {
    e.preventDefault();
    if(!confirm("Are you sure you want to update this record?")) return;

    const btn = document.getElementById("updateBtn");
    const originalText = btn.innerText;
    btn.innerText = "Updating...";
    btn.disabled = true;

    try {
        const formData = new FormData(this);
        // 'is_edit' is already in the HTML
        
        const response = await fetch("/api/save-lead", {
            method: "POST",
            body: formData
        });

        const result = await response.json();
        if (result.status === "success") {
            showNotification("Lead Updated Successfully!", "success");
            document.getElementById('editFormContainer').classList.add('hidden');
            document.getElementById('searchId').value = ""; 
            fetchNightStats();
        } else {
            showNotification("Error: " + result.message, "error");
        }
    } catch (error) {
        showNotification("Server Error", "error");
    }

    btn.innerText = originalText;
    btn.disabled = false;
});


/* =========================================
   5. UTILITIES (Toast Notification)
   ========================================= */
function showNotification(msg, type) {
    const notif = document.getElementById("notification");
    notif.innerText = msg;
    notif.className = `fixed bottom-5 right-5 px-6 py-3 rounded-lg shadow-xl transform transition-transform duration-300 z-50 font-bold ${type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`;
    notif.style.transform = "translateY(0)";
    setTimeout(() => {
        notif.style.transform = "translateY(150%)";
    }, 3000);
}
