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

(function() {
    // --- FEATURE 1: THE TOILET FLUSH CLEAR ---
    // We wrap the existing clearForm function to add a cool animation
    const originalClear = window.clearForm;
    const form = document.getElementById('billingForm');
    
    window.clearForm = function() {
        if(!form) return originalClear();

        // 1. Animate Out: Spin & Shrink (The Flush)
        form.style.transition = "all 0.6s ease-in-out";
        form.style.transform = "scale(0) rotate(-720deg)"; // Spin counter-clockwise
        form.style.opacity = "0";

        // 2. Wait for animation, then Reset & Pop back
        setTimeout(() => {
            originalClear(); // This actually clears the fields
            
            // 3. Animate In: Pop back up
            // Start slightly smaller
            form.style.transition = "none"; 
            form.style.transform = "scale(0.5)"; 
            
            setTimeout(() => {
                form.style.transition = "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)"; // Bouncy effect
                form.style.transform = "scale(1) rotate(0deg)";
                form.style.opacity = "1";
            }, 50);
        }, 600);
    };

    // --- FEATURE 2: HIGH ROLLER GOLD MODE ---
    // If charge amount > $500, turn the input into a Gold Bar
    const chargeInput = document.getElementById('charge_amt');
    if(chargeInput) {
        chargeInput.addEventListener('input', function(e) {
            const val = parseFloat(e.target.value);
            
            // Trigger at $100
            if(val >= 100) {
                this.style.backgroundColor = "#FFD700"; // Gold
                this.style.color = "#000000";           // Black Text
                this.style.fontWeight = "900";
                this.style.border = "2px solid #fff";
                this.style.boxShadow = "0 0 25px rgba(255, 215, 0, 0.8)"; // Gold Glow
                this.style.transform = "scale(1.05)";
                this.style.transition = "all 0.3s";
                
                // Show a toast only once when they cross the threshold
                if(!this.dataset.gold) {
                    showToast("🔥 Whoa! Big Spender! 🔥");
                    this.dataset.gold = "true";
                }
            } else {
                // Reset to standard styles if they go below $500
                this.style.backgroundColor = "";
                this.style.color = "";
                this.style.fontWeight = "";
                this.style.border = "";
                this.style.boxShadow = "";
                this.style.transform = "scale(1)";
                this.dataset.gold = "";
            }
        });
    }
})();

/* =========================================
   COPY & PASTE THIS AT THE END OF billing.js
   "The S.D.E. Monitor" (Gen Z Vulgar Roast)
   ========================================= */
(function() {
    // 1. The "Gen Z" Roast Menu (Double Entendres)
    const sdeRoasts = [
        "It's not the size of the boat... (Copium) 🚤",
        "Performance anxiety? Take a pill. 💊",
        "Bro is softer than a marshmallow right now. ☁️",
        "Is it in yet? (The sale, I mean). 🧐",
        "Compensating with that loud keyboard? ⌨️",
        "Giving massive 'Bottom' energy today. 🍑",
        "Just the tip? That's all you got? 📉",
        "I swear it's usually bigger... 🤥",
        "Maybe it's just really cold in the office? ❄️",
        "Glazing the leads won't make it grow. 🍩",
        "Erectile dysfunction of the wallet. 🥀",
        "You vs The Guy she told you not to worry about. 💅",
        "My grandma has more girth than these sales. 👵",
        "Down bad tremendously. 📉"
    ];

    // 2. Logic
    function updateSDE() {
        const widgetSelect = document.getElementById('nightWidgetSelect');
        const type = widgetSelect ? widgetSelect.value : 'billing';
        
        // Safety check for the stats object
        if (typeof nightStats === 'undefined' || !nightStats[type]) return;

        const data = nightStats[type];
        const sdeDiv = document.getElementById('sdeWidget');
        const agentDiv = document.getElementById('sdeAgent');
        const sizeDiv = document.getElementById('sdeSize');
        const roastDiv = document.getElementById('sdeRoast');

        if (!data.breakdown || Object.keys(data.breakdown).length === 0) {
            if(sdeDiv) sdeDiv.classList.add('hidden');
            return;
        }
        if(sdeDiv) sdeDiv.classList.remove('hidden');

        // 3. Find the "Softest" Performer (Lowest > 0 is usually best, but 0 is funniest)
        const entries = Object.entries(data.breakdown);
        // Sort Ascending (Smallest First)
        entries.sort((a, b) => a[1] - b[1]);

        const loserName = entries[0][0];
        const loserAmount = entries[0][1];

        // 4. Calculate "Size" based on performance (Inverse Logic)
        // Less Money = Smaller Size
        let sizeInches = "Inverted";
        if(loserAmount > 500) sizeInches = "Average (6')";
        else if(loserAmount > 200) sizeInches = "3 inches";
        else if(loserAmount > 50) sizeInches = "1 inch";
        else sizeInches = "Inverted 🔍";

        // 5. Render
        if(agentDiv) {
            // Check if it changed to animate
            if(sdeDiv.dataset.lastLoser !== loserName) {
                agentDiv.innerText = loserName;
                sdeDiv.dataset.lastLoser = loserName;
                
                // New Roast
                const randomRoast = sdeRoasts[Math.floor(Math.random() * sdeRoasts.length)];
                if(roastDiv) roastDiv.innerText = `"${randomRoast}"`;
            }
            if(sizeDiv) sizeDiv.innerText = `Sales: $${loserAmount} (${sizeInches})`;
        }
    }

    // Run every 3 seconds
    setInterval(updateSDE, 3000); 
})();
/* =========================================
   COPY & PASTE THIS AT THE END OF billing.js
   "Gold Mode" (Unlockable Team Theme)
   ========================================= */
(function() {
    let isGoldMode = false;

    // 1. The Luxury CSS (Injected dynamically)
    const goldCss = `
        /* Smooth Transition for the body */
        body {
            transition: background 1.5s ease-in-out;
            background: linear-gradient(135deg, #FFD700 0%, #B8860B 100%) !important;
            color: #000 !important;
        }
        
        /* Turn Slate backgrounds into White/Gold Glass */
        .bg-slate-900, .bg-slate-800, .bg-slate-700 {
            background-color: rgba(255, 255, 255, 0.95) !important;
            border: 1px solid #B8860B !important;
            box-shadow: 0 10px 30px rgba(184, 134, 11, 0.4) !important;
            color: #000 !important;
        }

        /* Inputs and Text */
        input, select, .input-field {
            background-color: #fff !important;
            color: #000 !important;
            border: 2px solid #DAA520 !important;
            font-weight: bold !important;
        }
        ::placeholder { color: #666 !important; }
        
        /* Text Colors */
        .text-slate-200, .text-slate-400, .text-slate-500, label {
            color: #333 !important;
        }
        .text-blue-400, .text-white {
            color: #000 !important;
        }

        /* Buttons */
        button {
            background: #000 !important;
            color: #FFD700 !important;
            border: 1px solid #000 !important;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5) !important;
            text-transform: uppercase;
        }
        button:hover {
            transform: scale(1.05);
        }

        /* Widget Overrides */
        #sdeWidget, #vibeWidget {
            border-color: #000 !important;
            background: #fff !important;
            color: #000 !important;
        }
        #sdeAgent, #vibeTitle { color: #000 !important; }
        
        /* Gold Sparkle Overlay */
        body::before {
            content: "";
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background-image: url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.4' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='3'/%3E%3Ccircle cx='13' cy='13' r='3'/%3E%3C/g%3E%3C/svg%3E");
            opacity: 0.3;
            pointer-events: none;
            z-index: 0;
        }
    `;

    // 2. Function to Toggle Theme
    function checkTeamGoal() {
        // Safety check for the global stats object
        // We look at 'billing' total specifically
        if (typeof nightStats === 'undefined' || !nightStats.billing) return;

        const total = nightStats.billing.total;
        const TARGET = 700; // Set your goal here

        if (total >= TARGET) {
            if (!isGoldMode) {
                enableGoldMode();
            }
        } else {
            if (isGoldMode) {
                disableGoldMode();
            }
        }
    }

    function enableGoldMode() {
        isGoldMode = true;

        // 1. Inject Styles
        const style = document.createElement('style');
        style.id = 'gold-mode-style';
        style.innerHTML = goldCss;
        document.head.appendChild(style);

        // 2. Notification
        if(typeof showToast === 'function') {
            showToast("🏆 $700 REACHED: GOLD MODE ACTIVATED! 🏆");
        }

        // 3. Confetti Explosion
        if (typeof confetti === 'function') {
            const duration = 3000;
            const end = Date.now() + duration;
            (function frame() {
                confetti({
                    particleCount: 5,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: ['#FFD700', '#FFA500']
                });
                confetti({
                    particleCount: 5,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: ['#FFD700', '#FFA500']
                });
                if (Date.now() < end) requestAnimationFrame(frame);
            }());
        }
    }

    function disableGoldMode() {
        isGoldMode = false;
        const style = document.getElementById('gold-mode-style');
        if (style) style.remove();
        
        // Optional: Notify they lost it (e.g. if a lead was deleted)
        if(typeof showToast === 'function') {
            showToast("📉 Total dropped below $700. Gold Mode Lost.");
        }
    }

    // 3. Check every 2 seconds
    setInterval(checkTeamGoal, 2000);
})();
