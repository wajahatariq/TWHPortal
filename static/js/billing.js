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
   "The $1000 Gold Rush" (Theme Only - Widgets Safe)
   ========================================= */
(function() {
    let isGoldMode = false;

    // THEME DEFINITION
    const goldCss = `
        /* 1. MAIN BACKGROUND (Deep Luxury Black) */
        body {
            background-color: #000 !important;
            background-image: radial-gradient(circle at center, #111 0%, #000 100%) !important;
            color: #FFD700 !important;
            transition: background 1.5s ease;
        }

        /* 2. MAIN CONTAINERS (The Form Area) */
        /* We target the specific container classes used by the form, NOT generic widgets */
        .max-w-6xl, form .bg-slate-800, form .bg-slate-700 {
            background-color: rgba(10, 10, 10, 0.95) !important;
            border: 2px solid #FFD700 !important;
            box-shadow: 0 0 40px rgba(255, 215, 0, 0.2) !important;
        }

        /* 3. TYPOGRAPHY (Gold Text) */
        h1, h2, h3, label, .text-blue-400, .text-white, .text-slate-200, .text-slate-400 {
            color: #FFD700 !important;
            text-shadow: 0 0 5px rgba(255, 215, 0, 0.3);
        }
        
        /* 4. INPUTS (Black & Gold) */
        input, select, .input-field {
            background-color: #000 !important;
            color: #FFD700 !important;
            border: 1px solid #B8860B !important;
            font-weight: bold;
        }
        input:focus, select:focus {
            box-shadow: 0 0 15px #FFD700 !important;
            border-color: #FFD700 !important;
        }
        ::placeholder { color: #886b18 !important; }

        /* 5. BUTTONS (Solid Gold) */
        button[type="submit"], button#submitBtn, button#newLeadBtn, button[onclick="clearForm()"] {
            background: linear-gradient(180deg, #FFD700 0%, #B8860B 100%) !important;
            color: #000 !important;
            font-weight: 900 !important;
            border: none !important;
            box-shadow: 0 5px 15px rgba(184, 134, 11, 0.4) !important;
        }
        button:hover {
            filter: brightness(1.2);
            transform: scale(1.05);
        }

        /* 6. SPARKLE OVERLAY */
        body::after {
            content: "";
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background-image: url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23FFD700' fill-opacity='0.2' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='1.5'/%3E%3Ccircle cx='13' cy='13' r='1'/%3E%3C/g%3E%3C/svg%3E");
            pointer-events: none;
            z-index: -1;
            opacity: 0.5;
        }
    `;

    function checkTeamGoal() {
        // Safety check
        if (typeof nightStats === 'undefined' || !nightStats.billing) return;

        const total = nightStats.billing.total;
        const TARGET = 1000; // $1000 Threshold

        if (total >= TARGET) {
            if (!isGoldMode) enableGoldMode();
        } else {
            if (isGoldMode) disableGoldMode();
        }
    }

    function enableGoldMode() {
        isGoldMode = true;
        
        // Inject CSS
        const style = document.createElement('style');
        style.id = 'gold-mode-style';
        style.innerHTML = goldCss;
        document.head.appendChild(style);

        // Notify
        if(typeof showToast === 'function') {
            showToast("💰 $1000 HIT: GOLD MODE UNLOCKED! 💰");
        }

        // Confetti
        if (typeof confetti === 'function') {
            const end = Date.now() + 3000;
            (function frame() {
                confetti({
                    particleCount: 5, angle: 60, spread: 55, origin: { x: 0 },
                    colors: ['#FFD700', '#FFFFFF']
                });
                confetti({
                    particleCount: 5, angle: 120, spread: 55, origin: { x: 1 },
                    colors: ['#FFD700', '#FFFFFF']
                });
                if (Date.now() < end) requestAnimationFrame(frame);
            }());
        }
    }

    function disableGoldMode() {
        isGoldMode = false;
        const style = document.getElementById('gold-mode-style');
        if (style) style.remove();
    }

    // Check every 2 seconds
    setInterval(checkTeamGoal, 2000);
})();

/* =========================================
   COPY & PASTE THIS AT THE END OF billing.js
   "Jackpot Rolling Counter" (Slot Machine Effect)
   ========================================= */
(function() {
    // 1. State to track the current number on screen
    // We attach it to the window so it persists
    window.lastDisplayedTotal = window.lastDisplayedTotal || 0;

    // 2. Override the existing updateNightWidget function
    window.updateNightWidget = function() {
        const type = document.getElementById('nightWidgetSelect').value;
        // Safety check if nightStats isn't ready yet
        if (typeof nightStats === 'undefined') return;

        const data = nightStats[type] || {total:0, breakdown:{}};
        const targetTotal = data.total;
        const element = document.getElementById('nightWidgetAmount');
        
        // --- A. THE ROLLING ANIMATION ---
        // If the number has changed, animate it. If not, just ensure it's set.
        if (Math.abs(targetTotal - window.lastDisplayedTotal) > 0.01) {
            animateValue(element, window.lastDisplayedTotal, targetTotal, 2000); // 2 seconds duration
        } else {
            // Just set it if no change (initial load)
            element.innerText = formatMoney(targetTotal);
        }

        // --- B. THE BREAKDOWN LIST (King/Banana Logic Preserved) ---
        const listDiv = document.getElementById('nightBreakdown');
        listDiv.innerHTML = '';
        
        if (data.breakdown && Object.keys(data.breakdown).length > 0) {
            listDiv.classList.remove('hidden');
            
            // Sort by Amount Descending
            const sortedEntries = Object.entries(data.breakdown).sort((a, b) => b[1] - a[1]);

            sortedEntries.forEach(([agent, amount], index) => {
                const row = document.createElement('div');
                
                // Top Performer (King)
                if (index === 0) {
                    row.className = "flex justify-between items-center bg-gradient-to-r from-yellow-300 to-amber-400 text-slate-900 font-extrabold p-2 rounded shadow-md mb-1 border border-yellow-500/50 transform scale-105 transition-all";
                    row.innerHTML = `<span class="truncate pr-2 flex items-center gap-1">👑 ${agent}</span> <span>${formatMoney(amount)}</span>`;
                } 
                // Bottom Performer (Banana)
                else if (index === sortedEntries.length - 1 && sortedEntries.length > 1) {
                    row.className = "flex justify-between items-center bg-white text-slate-900 font-bold p-2 rounded border border-slate-200 mt-1 shadow-sm opacity-90 transition-all";
                    row.innerHTML = `<span class="truncate pr-2 flex items-center gap-1">🍌 ${agent}</span> <span class="text-slate-900 font-black">${formatMoney(amount)}</span>`;
                } 
                // Middle Performers
                else {
                    row.className = "flex justify-between items-center border-b border-slate-500/30 py-1 last:border-0";
                    row.innerHTML = `<span class="truncate pr-2">${agent}</span> <span class="font-bold">${formatMoney(amount)}</span>`;
                }
                listDiv.appendChild(row);
            });
        } else { 
            listDiv.classList.add('hidden'); 
        }
    };

    // Helper: Formatter ($1,234.56)
    function formatMoney(amount) {
        return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Helper: Animation Logic
    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            
            // Easing function: easeOutQuart (Starts fast, slows down at the end)
            // This gives the "Heavy Wheel" feeling
            const ease = 1 - Math.pow(1 - progress, 4); 
            
            const currentVal = start + (end - start) * ease;
            
            // Update the text
            obj.innerText = formatMoney(currentVal);
            
            // Save state for next time
            window.lastDisplayedTotal = currentVal;

            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                // Ensure we land exactly on the target at the end
                obj.innerText = formatMoney(end);
                window.lastDisplayedTotal = end;
            }
        };
        
        window.requestAnimationFrame(step);
    }
})();

/* =========================================
   COPY & PASTE THIS AT THE END OF billing.js
   "The 4:45 AM Wake-Up Call" (Lowest Agent Roast)
   ========================================= */
(function() {
    // PREVENT SPAM (Only show once per day)
    let hasRoostedToday = false;

    // 1. The Popup HTML (Injected Dynamically)
    const roastModalHTML = `
        <div id="roastModal" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm hidden transition-opacity duration-300 opacity-0">
            <div class="bg-white rounded-3xl p-8 max-w-md w-full text-center border-8 border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.6)] transform scale-90 transition-transform duration-300 relative overflow-hidden">
                
                <div class="absolute inset-0 opacity-10 pointer-events-none" style="background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDIwIDIwIiBmaWxsPSJub25lIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMSI+PHBhdGggZD0iTTEwIDB2MjBNMCAxMGgyMCIgb3BhY2l0eT0iMC4xIi8+PC9zdmc+');"></div>

                <div class="text-8xl mb-4 animate-bounce">🤡</div>

                <h2 class="text-3xl font-black text-slate-900 uppercase italic tracking-tighter mb-2">
                    4:30 AM REALITY CHECK
                </h2>
                
                <div class="bg-red-100 text-red-800 px-4 py-2 rounded-lg font-bold text-sm mb-6 inline-block border border-red-200">
                    ⚠️ LOWEST PERFORMANCE DETECTED
                </div>

                <div class="space-y-1 mb-6">
                    <div class="text-xs font-bold text-slate-400 uppercase tracking-widest">The "Participation Award" goes to:</div>
                    <div id="roastVictimName" class="text-4xl font-black text-blue-600">...</div>
                    <div id="roastVictimAmount" class="text-2xl font-mono font-bold text-slate-500">$0.00</div>
                </div>

                <p id="roastMessage" class="text-lg font-serif italic text-slate-800 mb-8 leading-tight">
                    "Searching for your sales... 404 Not Found."
                </p>

                <button onclick="closeRoastModal()" class="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 hover:scale-[1.02] transition-all shadow-xl">
                    I PROMISE TO DO BETTER
                </button>
            </div>
        </div>
    `;

    // Inject HTML into body
    const container = document.createElement('div');
    container.innerHTML = roastModalHTML;
    document.body.appendChild(container);

    // 2. Roast Database
    const insults = [
        "Is your keyboard broken or just your spirit?",
        "My grandma closes more deals at bingo night.",
        "You are literally stealing oxygen from the sales floor.",
        "Are you waiting for the leads to close themselves?",
        "Status: Asleep at the wheel.",
        "I've seen dial tones work harder than this.",
        "Did you forget your password or how to sell?",
        "Congratulations on maintaining absolute zero."
    ];

    // 3. Logic to Trigger Roast
    function triggerRoast() {
        // Find the lowest performer
        if (typeof nightStats === 'undefined' || !nightStats.billing || !nightStats.billing.breakdown) return;
        
        const breakdown = nightStats.billing.breakdown;
        const entries = Object.entries(breakdown);
        
        if (entries.length === 0) return;

        // Sort Low to High
        entries.sort((a, b) => a[1] - b[1]);

        const loserName = entries[0][0];
        const loserAmount = entries[0][1];

        // Populate Modal
        document.getElementById('roastVictimName').innerText = loserName;
        document.getElementById('roastVictimAmount').innerText = '$' + loserAmount.toLocaleString();
        
        // Pick Random Insult
        const randomInsult = insults[Math.floor(Math.random() * insults.length)];
        document.getElementById('roastMessage').innerText = `"${randomInsult}"`;

        // Show Modal
        const modal = document.getElementById('roastModal');
        modal.classList.remove('hidden');
        // Small delay for fade-in
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-90');
        }, 10);

        // Play Error Sound (optional)
        if (typeof playTone === 'function') playTone('error');
    }

    // 4. Global Close Function
    window.closeRoastModal = function() {
        const modal = document.getElementById('roastModal');
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.add('scale-90');
        setTimeout(() => modal.classList.add('hidden'), 300);
    };

    // 5. Time Watcher & Ambush Logic
    function attemptRoast() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // LOGIC: Trigger if it is AFTER 4:45 AM but BEFORE 5:00 AM
        // This handles cases where they tab back in at 4:48 AM
        const isRoastTime = (hours === 4 && minutes >= 30); 

        if (isRoastTime && !hasRoostedToday) {
            triggerRoast();
            hasRoostedToday = true;
        }
        
        // Reset flag after 5:00 AM so it works tomorrow
        if (hours >= 5) {
            hasRoostedToday = false;
        }
    }

    // Check constantly (every 5 seconds)
    setInterval(attemptRoast, 5000);

    // "AMBUSH MODE": Check immediately when they switch back to this tab
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === 'visible') {
            attemptRoast();
        }
    });

    // --- TEST TRIGGER (For you to verify it works) ---
    // Press "Shift + R" to force the roast popup right now
    document.addEventListener('keydown', (e) => {
        if (e.shiftKey && e.key.toLowerCase() === 'r') {
            console.log("Manual Roast Triggered");
            triggerRoast();
        }
    });

})();

/* =========================================
   COPY & PASTE THIS AT THE END OF billing.js
   "Cinematic Status Effects" (BILLING PORTAL ONLY)
   ========================================= */
(function() {
    
    // 1. STRICT CHECK: Only run if this is the Billing Portal
    // (We check the body data attribute or URL)
    const isBilling = document.body.dataset.pageType === 'billing' || window.location.pathname.includes('billing');
    if (!isBilling) return;

    // --- 2. THE VISUAL ENGINE (CSS) ---
    const fxStyles = `
        /* FIREWORKS (Approved) */
        @keyframes firework {
            0% { transform: translate(var(--x), var(--initialY)); width: var(--initialSize); opacity: 1; }
            50% { width: 0.5rem; opacity: 1; }
            100% { transform: translate(var(--x), -20px); width: 0; opacity: 0; }
        }
        .pyro-container {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 99999;
        }
        .particle {
            position: absolute; bottom: 0; width: 6px; height: 6px; border-radius: 50%;
            animation: firework 1s ease-out infinite;
        }

        /* RAIN (Declined) */
        @keyframes rain-fall {
            0% { transform: translateY(-100vh); }
            100% { transform: translateY(100vh); }
        }
        .rain-container {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 99999;
            background: rgba(20, 30, 40, 0.4); /* Gloomy overlay */
            backdrop-filter: grayscale(100%);
        }
        .rain-drop {
            position: absolute; top: -20px; width: 2px; height: 15px;
            background: rgba(174, 194, 224, 0.8);
            animation: rain-fall 0.6s linear infinite;
        }
        
        /* SHAKE (Impact) */
        .hard-shake { animation: hardShake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes hardShake {
            10%, 90% { transform: translate3d(-4px, 0, 0) rotate(-1deg); }
            20%, 80% { transform: translate3d(8px, 0, 0) rotate(2deg); }
            30%, 50%, 70% { transform: translate3d(-8px, 0, 0) rotate(-2deg); }
            40%, 60% { transform: translate3d(8px, 0, 0) rotate(2deg); }
        }
        
        /* FLASH (Victory) */
        .gold-flash { animation: goldFlash 1s ease-out; }
        @keyframes goldFlash {
            0% { box-shadow: inset 0 0 0 0 #FFD700; }
            50% { box-shadow: inset 0 0 100px 50px #FFD700; }
            100% { box-shadow: inset 0 0 0 0 transparent; }
        }
    `;
    const style = document.createElement('style'); style.innerHTML = fxStyles; document.head.appendChild(style);


    // --- 3. ANIMATION LOGIC ---

    function triggerApprovedFX() {
        // A. Flash Screen Gold
        document.body.classList.add('gold-flash');
        setTimeout(() => document.body.classList.remove('gold-flash'), 1000);

        // B. Create Fire/Particles
        const container = document.createElement('div');
        container.className = 'pyro-container';
        
        // Generate 60 particles
        for(let i=0; i<60; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.setProperty('--x', Math.random() * 100 + 'vw');
            p.style.setProperty('--initialY', Math.random() * 50 + 'vh');
            p.style.setProperty('--initialSize', (Math.random() * 10 + 5) + 'px');
            p.style.backgroundColor = ['#ff0000', '#ffa500', '#ffd700', '#ffffff'][Math.floor(Math.random()*4)];
            p.style.animationDuration = (Math.random() * 1 + 0.5) + 's';
            p.style.animationDelay = Math.random() * 0.5 + 's';
            container.appendChild(p);
        }
        document.body.appendChild(container);

        // Cleanup
        setTimeout(() => container.remove(), 2500);
    }

    function triggerDeclinedFX() {
        // A. Shake Screen
        document.body.classList.add('hard-shake');
        setTimeout(() => document.body.classList.remove('hard-shake'), 500);

        // B. Rain Effect
        const container = document.createElement('div');
        container.className = 'rain-container';

        // Generate 80 Raindrops
        for(let i=0; i<80; i++) {
            const drop = document.createElement('div');
            drop.className = 'rain-drop';
            drop.style.left = Math.random() * 100 + 'vw';
            drop.style.animationDuration = (Math.random() * 0.5 + 0.4) + 's';
            drop.style.animationDelay = Math.random() * 1 + 's';
            container.appendChild(drop);
        }
        document.body.appendChild(container);

        // Cleanup
        setTimeout(() => container.remove(), 4000);
    }


    // --- 4. PUSHER LISTENER (Status Updates) ---
    if (window.PUSHER_KEY) {
        // Note: We use a lightweight check to avoid duplicate listeners if possible, 
        // but creating a new instance specifically for FX is safe here.
        const pusher = new Pusher(window.PUSHER_KEY, { cluster: window.PUSHER_CLUSTER });
        const channel = pusher.subscribe('techware-channel');

        channel.bind('status-update', function(data) {
            // FILTER: Only care about Billing updates if you want to be specific
            // But usually "Status Update" implies a billing result.
            
            const status = data.status.toLowerCase();
            
            if (status === 'charged' || status === 'approved') {
                triggerApprovedFX();
            } 
            else if (status === 'declined') {
                triggerDeclinedFX();
            }
        });
    }

    // --- 5. TEST KEYS (Shift+A / Shift+D) ---
    // Use these to verify the effects instantly
    document.addEventListener('keydown', (e) => {
        if (e.shiftKey && e.key.toLowerCase() === 'a') {
            console.log("TEST: Approved FX");
            triggerApprovedFX();
        }
        if (e.shiftKey && e.key.toLowerCase() === 'd') {
            console.log("TEST: Declined FX");
            triggerDeclinedFX();
        }
    });

})();

/* =========================================
   COPY & PASTE THIS AT THE END OF billing.js
   "The Evolving Trigger" (Updated Thresholds: $50/$100/$200)
   ========================================= */
(function() {

    // 1. CSS for the Button States
    const btnStyles = `
        /* STATE 1: MONEY MODE ($50 - $99) */
        .btn-money-mode {
            background: linear-gradient(to bottom, #22c55e, #15803d) !important;
            border: 2px solid #86efac !important;
            color: white !important;
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
            transform: scale(1.02);
            transition: all 0.2s;
        }

        /* STATE 2: BAG CHASER ($100 - $199) */
        .btn-bag-mode {
            background: linear-gradient(45deg, #FFD700, #B8860B) !important;
            border: 2px solid #fff !important;
            color: #000 !important;
            font-weight: 900 !important;
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.6) !important;
            animation: pulse-gold-btn 1s infinite;
        }
        @keyframes pulse-gold-btn {
            0% { box-shadow: 0 0 15px rgba(255, 215, 0, 0.6); }
            50% { box-shadow: 0 0 25px rgba(255, 215, 0, 0.9); scale: 1.05; }
            100% { box-shadow: 0 0 15px rgba(255, 215, 0, 0.6); }
        }

        /* STATE 3: NUCLEAR LAUNCH ($200+) */
        .btn-nuke-mode {
            background: repeating-linear-gradient(
                45deg,
                #000,
                #000 10px,
                #dc2626 10px,
                #dc2626 20px
            ) !important;
            border: 3px solid #fff !important;
            color: #fff !important;
            font-family: 'Courier New', monospace;
            font-weight: 900 !important;
            text-transform: uppercase;
            letter-spacing: 2px;
            box-shadow: 0 0 30px #dc2626 !important;
            animation: shake-nuke 0.2s infinite;
        }
        @keyframes shake-nuke {
            0% { transform: translate(1px, 1px) rotate(0deg); }
            10% { transform: translate(-1px, -2px) rotate(-1deg); }
            20% { transform: translate(-3px, 0px) rotate(1deg); }
            30% { transform: translate(3px, 2px) rotate(0deg); }
            40% { transform: translate(1px, -1px) rotate(1deg); }
            50% { transform: translate(-1px, 2px) rotate(-1deg); }
            60% { transform: translate(-3px, 1px) rotate(0deg); }
            70% { transform: translate(3px, 1px) rotate(-1deg); }
            80% { transform: translate(-1px, -1px) rotate(1deg); }
            90% { transform: translate(1px, 2px) rotate(0deg); }
            100% { transform: translate(1px, -2px) rotate(-1deg); }
        }
    `;
    const style = document.createElement('style');
    style.innerHTML = btnStyles;
    document.head.appendChild(style);


    // 2. Logic to Find Elements
    function initTrigger() {
        const input = document.getElementById('charge_amt');
        // Try to find the button
        const btn = document.querySelector('button[type="submit"]') || 
                    document.getElementById('submitBtn');

        if (!input || !btn) return;

        // Save original text to restore later (only once)
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerText;

        // Remove old listener if re-running
        input.removeEventListener('input', handleTriggerInput);
        input.addEventListener('input', handleTriggerInput);

        function handleTriggerInput(e) {
            const val = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
            
            // RESET
            btn.className = btn.className.replace(/btn-money-mode|btn-bag-mode|btn-nuke-mode/g, '');
            btn.innerText = btn.dataset.originalText; // Restore Original Text
            
            if (isNaN(val)) return;

            // EVOLVE
            if (val >= 200) {
                // LEVEL 3: NUKE ($200+)
                btn.classList.add('btn-nuke-mode');
                btn.innerText = "🚀 LAUNCH NUKE 🚀";
            } 
            else if (val >= 100) {
                // LEVEL 2: GOLD BAG ($100 - $199)
                btn.classList.add('btn-bag-mode');
                btn.innerText = "SECURE THE BAG 💰";
            } 
            else if (val >= 50) {
                // LEVEL 1: MONEY ($50 - $99)
                btn.classList.add('btn-money-mode');
                btn.innerText = "Confirm Sale 💸";
            }
        }
    }

    // Run Init
    initTrigger();
    // Re-run safely in case of page updates
    setInterval(initTrigger, 3000);

})();

/* =========================================
   COPY & PASTE THIS AT THE END OF billing.js
   "The Energy Core" (Vertical Gauge - Bottom Right)
   ========================================= */
(function() {

    // --- CONFIGURATION ---
    const DAILY_TARGET = 1000;

    // 1. CSS for the Vertical Gauge
    const gaugeStyles = `
        #energy-core {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 200px;
            background: #0f172a;
            border: 3px solid #334155;
            border-radius: 10px;
            z-index: 99999;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            overflow: hidden;
            display: flex;
            align-items: flex-end; /* Fills from bottom */
            cursor: help;
            transition: transform 0.2s;
        }

        #energy-core:hover {
            transform: scale(1.05);
        }

        /* The Glass Reflection */
        #energy-core::after {
            content: '';
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(to right, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.05) 100%);
            pointer-events: none;
            z-index: 10;
        }

        /* The Liquid Fill */
        .core-fill {
            width: 100%;
            height: 0%; /* Starts Empty */
            background: linear-gradient(to top, #2563eb, #3b82f6);
            box-shadow: 0 0 20px #2563eb;
            transition: height 1s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
        }

        /* Bubbles inside the liquid */
        .core-fill::before {
            content: '';
            position: absolute;
            top: 0; left: 0; width: 100%; height: 10px;
            background: rgba(255,255,255,0.5);
            opacity: 0.5;
            filter: blur(5px);
        }

        /* Overdrive Mode (Gold) */
        .core-fill.overdrive {
            background: linear-gradient(to top, #ca8a04, #eab308);
            box-shadow: 0 0 30px #eab308;
            animation: core-pulse 0.8s infinite alternate;
        }

        /* The Text Overlay (Percentage) */
        .core-text {
            position: absolute;
            bottom: 10px;
            width: 100%;
            text-align: center;
            color: #fff;
            font-family: 'Courier New', monospace;
            font-weight: 900;
            font-size: 14px;
            text-shadow: 0 2px 4px #000;
            z-index: 20;
            pointer-events: none;
        }

        /* Tooltip (Hover to see details) */
        #core-tooltip {
            position: absolute;
            bottom: 20px;
            right: 80px; /* To the left of the bar */
            background: #000;
            color: #fff;
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid #333;
            font-family: sans-serif;
            font-size: 12px;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s;
            transform: translateX(10px);
            font-weight: bold;
        }

        #energy-core:hover + #core-tooltip {
            opacity: 1;
            transform: translateX(0);
        }

        @keyframes core-pulse {
            0% { filter: brightness(100%); }
            100% { filter: brightness(130%); }
        }

        .shake-vertical { animation: shake-v 0.5s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes shake-v {
            10%, 90% { transform: translate3d(0, -1px, 0); }
            20%, 80% { transform: translate3d(0, 2px, 0); }
            30%, 50%, 70% { transform: translate3d(0, -4px, 0); }
            40%, 60% { transform: translate3d(0, 4px, 0); }
        }
    `;
    const style = document.createElement('style');
    style.innerHTML = gaugeStyles;
    document.head.appendChild(style);

    // 2. HTML Structure
    const container = document.createElement('div');
    container.innerHTML = `
        <div id="energy-core">
            <div class="core-fill" id="coreFill"></div>
            <div class="core-text" id="corePercent">0%</div>
        </div>
        <div id="core-tooltip">Target: $0 / $${DAILY_TARGET}</div>
    `;
    document.body.appendChild(container);

    // 3. Logic
    let lastKnownTotal = 0;

    function updateEnergyCore() {
        if (typeof nightStats === 'undefined' || !nightStats.billing) return;
        
        const currentTotal = nightStats.billing.total || 0;
        let percent = (currentTotal / DAILY_TARGET) * 100;
        const displayPercent = Math.min(percent, 100);

        const fill = document.getElementById('coreFill');
        const pctText = document.getElementById('corePercent');
        const tooltip = document.getElementById('core-tooltip');

        // Update Text
        pctText.innerText = Math.floor(percent) + "%";
        tooltip.innerText = `Target: $${currentTotal.toLocaleString()} / $${DAILY_TARGET.toLocaleString()}`;
        
        // Update Height
        fill.style.height = displayPercent + "%";

        // Check Overdrive
        if (percent >= 100) {
            fill.classList.add('overdrive');
        } else {
            fill.classList.remove('overdrive');
        }

        // Shake Animation on Increase
        if (currentTotal > lastKnownTotal) {
            const gauge = document.getElementById('energy-core');
            gauge.classList.remove('shake-vertical');
            void gauge.offsetWidth; // Force reflow
            gauge.classList.add('shake-vertical');
        }
        lastKnownTotal = currentTotal;
    }

    updateEnergyCore();
    setInterval(updateEnergyCore, 2000);

})();


