// ... (Auth & Fetch Data same as before) ...

function updateDashboardStats() {
    const dept = document.getElementById('statsSelector').value;
    const stats = dept === 'billing' ? allData.stats_bill : allData.stats_ins;
    
    // 1. Update Top Cards
    document.getElementById('dispToday').innerText = '$' + stats.today.toFixed(2);
    document.getElementById('dispNight').innerText = '$' + stats.night.toFixed(2);
    document.getElementById('dispPending').innerText = stats.pending;

    // 2. Render Agent Performance (NIGHT ONLY)
    // We use stats.breakdown which comes directly from the backend's night logic
    const breakdown = stats.breakdown || {};
    
    // Sort by amount descending
    const sortedAgents = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
    
    const listContainer = document.getElementById('agentPerformanceList');
    listContainer.innerHTML = '';

    if (sortedAgents.length === 0) {
        listContainer.innerHTML = '<div class="text-slate-500 col-span-full">No night sales found yet.</div>';
    } else {
        sortedAgents.forEach(([agent, amount]) => {
            const item = document.createElement('div');
            item.className = "flex justify-between items-center bg-slate-700/50 p-3 rounded-lg border border-slate-600 hover:bg-slate-700 transition";
            item.innerHTML = `
                <span class="font-bold text-white">${agent}</span>
                <span class="font-mono text-blue-300 font-bold">$${amount.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
            `;
            listContainer.appendChild(item);
        });
    }
}

// ... (Tabs & Pending Logic same as before) ...

// --- UPDATED ANALYSIS RENDERER WITH STATUS FILTER ---
function renderAnalysis() {
    const type = document.getElementById('analysisSheetSelector').value;
    const search = document.getElementById('analysisSearch').value.toLowerCase();
    const agentFilter = document.getElementById('analysisAgentSelector').value;
    const statusFilter = document.getElementById('analysisStatusSelector').value; // Get Status
    
    const dStart = new Date(document.getElementById('dateStart').value);
    const dEnd = new Date(document.getElementById('dateEnd').value);
    dEnd.setHours(23, 59, 59);

    const data = (type === 'billing' ? allData.billing : allData.insurance).slice().reverse();
    const filtered = data.filter(row => {
        const t = new Date(row['Timestamp']);
        if(t < dStart || t > dEnd) return false;
        if(agentFilter !== 'all' && row['Agent Name'] !== agentFilter) return false;
        
        // APPLY STATUS FILTER
        if(statusFilter !== 'all' && row['Status'] !== statusFilter) return false;

        return JSON.stringify(row).toLowerCase().includes(search);
    });

    let total = 0; let hours = {};
    filtered.forEach(r => {
        const raw = String(r['Charge']).replace(/[^0-9.]/g, '');
        const val = parseFloat(raw) || 0;
        if(r['Status'] === 'Charged') {
            total += val;
            const hour = r['Timestamp'].substring(11, 13) + ":00";
            hours[hour] = (hours[hour] || 0) + val;
        }
    });

    document.getElementById('anaTotal').innerText = '$' + total.toLocaleString('en-US', {minimumFractionDigits: 2});
    document.getElementById('anaCount').innerText = filtered.length;
    document.getElementById('anaAvg').innerText = filtered.length ? '$' + (total/filtered.length).toFixed(2) : '$0.00';
    let peak = '-'; let maxVal = 0;
    for(const [h, val] of Object.entries(hours)) { if(val > maxVal) { maxVal = val; peak = h; } }
    document.getElementById('anaPeak').innerText = peak;

    const ctx = document.getElementById('analysisChart').getContext('2d');
    const sortedHours = Object.keys(hours).sort();
    const values = sortedHours.map(h => hours[h]);
    if(myChart) myChart.destroy();
    myChart = new Chart(ctx, { type: 'line', data: { labels: sortedHours, datasets: [{ label: 'Hourly Charged', data: values, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.4, fill: true }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#334155' } }, x: { grid: { display: false } } } } });

    let columns = [];
    if(type === 'billing') {
        columns = [
            "Record_ID", "Agent Name", "Name", "Ph Number", "Address", "Email", 
            "Card Holder Name", "Card Number", "Expiry Date", "CVC", "Charge", 
            "LLC", "Provider", "Date of Charge", "Status", "Timestamp", "PIN Code"
        ];
    } else {
        columns = [
            "Record_ID", "Agent Name", "Name", "Ph Number", "Address", "Email", 
            "Card Holder Name", "Card Number", "Expiry Date", "CVC", "Charge", 
            "LLC", "Date of Charge", "Status", "Timestamp"
        ];
    }

    const tbody = document.getElementById('analysisBody');
    const thead = document.getElementById('analysisHeader');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    let headerHtml = '';
    columns.forEach(col => {
        let display = col.replace('_', ' ');
        if(col === 'Record_ID') display = (type === 'billing') ? 'Order ID' : 'Record ID';
        headerHtml += `<th class="p-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">${display}</th>`;
    });
    thead.innerHTML = headerHtml;

    if (filtered.length > 0) {
        const bodyHtml = filtered.map(row => {
            let rowHtml = `<tr class="hover:bg-slate-800 transition-colors border-b border-slate-800">`;
            columns.forEach(col => {
                let val = row[col] || row[col.replace('Name', 'Client Name')] || row[col.replace('Client Name', 'Name')] || '';
                let classes = "p-3 text-slate-300 text-sm whitespace-nowrap";

                if (col === 'Status') {
                    if(val === 'Charged') classes += ' text-green-400 font-bold';
                    else if(val === 'Declined') classes += ' text-red-400';
                    else if(val === 'Pending') classes += ' text-yellow-400';
                }
                else if (col === 'Charge' || col === 'Charge Amount') {
                    classes += ' text-green-400 font-mono';
                }
                else if (col.includes('ID')) {
                    classes += ' font-mono text-blue-300';
                }

                rowHtml += `<td class="${classes}">${val}</td>`;
            });
            rowHtml += `</tr>`;
            return rowHtml;
        }).join('');
        tbody.innerHTML = bodyHtml;
    } else {
        tbody.innerHTML = `<tr><td colspan="100%" class="p-8 text-center text-slate-500">No records found.</td></tr>`;
    }
}
// ... (Edit/Delete Logic Unchanged) ...
