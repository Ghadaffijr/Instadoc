// --- 1. CONFIGURATION ---
// !!! REPLACE THESE WITH YOUR CREDENTIALS !!!
var SUPABASE_URL = 'https://ioaqlcltvakuqqehkyor.supabase.co'; 
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYXFsY2x0dmFrdXFxZWhreW9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNTk1MzksImV4cCI6MjA4MTczNTUzOX0._7ISJbfJzryBJWmtRuN72F-JZpYdvJxsltwwhombPtE';

var supabaseClient;
var currentUser = null;
var myChart = null; 
var currentChartTable = 'weight_logs'; // Default
var currentChartDays = 7; // Default range
var allHistoryData = []; // Store for export

// Initialize
try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.warn("Supabase credentials missing.");
    } else {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (err) { console.error("Init Error", err); }

// --- 2. AUTH & VIEW STATE ---
if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        const landing = document.getElementById('landing-view');
        const dashboard = document.getElementById('dashboard-view');
        const deco = document.getElementById('decorations');

        if (session && session.user) {
            // LOGGED IN
            currentUser = session.user;
            landing.style.display = 'none';
            dashboard.style.display = ''; 
            if(deco) deco.style.display = 'none';
            
            closeModals();
            resetDates();
            
            // Request notification permission (US-14)
            if (Notification.permission !== "granted") Notification.requestPermission();

            loadDashboardData();
        } else {
            // LOGGED OUT
            currentUser = null;
            landing.style.display = 'grid'; 
            dashboard.style.display = 'none';
            if(deco) deco.style.display = 'block';
        }
    });
}

function resetDates() {
    const today = new Date().toISOString().split('T')[0];
    ['weight-date', 'bp-date', 'temp-date', 'gluc-date'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = today;
    });
}

// --- 3. UI LOGIC ---
function switchView(viewName, element) {
    const dashView = document.getElementById('view-dashboard');
    const metricsView = document.getElementById('view-metrics');
    
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // Add active class to clicked item (if provided)
    if (element && element.parentElement) {
        element.parentElement.classList.add('active');
    }

    if (viewName === 'dashboard') {
        dashView.style.display = 'block';
        metricsView.style.display = 'none';
    } else if (viewName === 'metrics') {
        dashView.style.display = 'none';
        metricsView.style.display = 'block';
        // Trigger chart update/resize in case it was hidden
        if(myChart) myChart.resize();
    }
}

// --- 4. AUTH LOGIC ---
async function logout() {
    if (supabaseClient) await supabaseClient.auth.signOut();
}

async function signInWithGoogle() {
    const redirectUrl = window.location.href.split('#')[0];
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { 
            redirectTo: redirectUrl,
            queryParams: {
                prompt: 'select_account'
            }
        }
    });
}

function signInWithPhone() { 
    alert("Phone Auth requires paid plan/setup. Use Email or Google."); 
}

// US-3: Reset Password
document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reset-email').value;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href,
    });
    if (error) {
        document.getElementById('reset-error').textContent = error.message;
        document.getElementById('reset-error').style.display = 'block';
    } else {
        document.getElementById('reset-success').textContent = "Check your email for the reset link!";
        document.getElementById('reset-success').style.display = 'block';
    }
});

// --- 5. DATA FETCH LOGIC ---
async function loadDashboardData() {
    // Update Cards
    updateStatCard('weight_logs', 'weight', 'val-weight', 'kg');
    updateStatCard('bp_logs', 'systolic', 'val-bp', '');
    updateStatCard('glucose_logs', 'level', 'val-gluc', 'mg/dL');
    updateStatCard('temp_logs', 'temperature', 'val-temp', '°C');
    
    // Init Chart
    updateChart(currentChartTable);
    
    // Load History (US-10)
    loadHistory();
}

async function updateStatCard(table, col, elemId, unit) {
    const { data } = await supabaseClient.from(table).select('*').eq('user_id', currentUser.id).order('date', {ascending:false}).limit(1);
    
    // US-13: Simple Insight Logic
    if(table === 'bp_logs' && data && data.length > 0) {
        checkBPInsight(data[0].systolic, data[0].diastolic);
    }

    if(data && data.length > 0) {
        let val = data[0][col];
        if(table === 'bp_logs') val = `${data[0].systolic}/${data[0].diastolic}`;
        document.getElementById(elemId).textContent = val;
    } else {
        document.getElementById(elemId).textContent = '--';
    }
}

function checkBPInsight(sys, dia) {
    const banner = document.getElementById('insight-banner');
    const text = document.getElementById('insight-text');
    banner.style.display = 'flex';
    
    if (sys > 140 || dia > 90) {
        text.textContent = `Your last BP (${sys}/${dia}) is elevated. Please consult a doctor if it persists.`;
        banner.style.background = 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)';
    } else if (sys < 90 || dia < 60) {
        text.textContent = `Your BP is low. Ensure you are hydrated.`;
        banner.style.background = 'linear-gradient(135deg, #56ab2f 0%, #a8e063 100%)';
    } else {
        text.textContent = `Great! Your Blood Pressure is within the normal range.`;
        banner.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
    }
}

// US-12: Chart Filters
function setChartRange(days, btn) {
    currentChartDays = days;
    document.querySelectorAll('.time-tabs .chart-select').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateChart(currentChartTable);
}

async function updateChart(tableName, btnRef) {
    currentChartTable = tableName;
    if (!currentUser) return;

    // UI: Update Active Tab
    if(btnRef) {
        document.querySelectorAll('.chart-tabs .chart-select').forEach(b => b.classList.remove('active'));
        btnRef.classList.add('active');
    }

    // DATA FETCH (Filtered by Date)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - currentChartDays);
    const dateStr = cutoffDate.toISOString().split('T')[0];

    const { data } = await supabaseClient.from(tableName)
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('date', dateStr)
        .order('date', { ascending: true }); // Get oldest first for chart

    if (!data) return;

    const labels = data.map(d => new Date(d.date).toLocaleDateString(undefined, {month:'short', day:'numeric'}));
    
    let dataset = [];
    const ctx = document.getElementById('healthChart').getContext('2d');
    let gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(46, 204, 113, 0.2)');
    gradient.addColorStop(1, 'rgba(46, 204, 113, 0)');

    if (tableName === 'bp_logs') {
        dataset = [
            { label: 'Systolic', data: data.map(d => d.systolic), borderColor: '#dc2626', tension: 0.4 },
            { label: 'Diastolic', data: data.map(d => d.diastolic), borderColor: '#2563eb', tension: 0.4 }
        ];
    } else {
        let key = 'weight';
        if (tableName === 'glucose_logs') key = 'level';
        if (tableName === 'temp_logs') key = 'temperature';
        
        dataset = [{ 
            label: key.toUpperCase(), 
            data: data.map(d => d[key]), 
            borderColor: '#2ecc71', 
            backgroundColor: gradient,
            borderWidth: 3,
            tension: 0.4,
            fill: true
        }];
    }

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: dataset },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                x: { grid: { display: false } },
                y: { grid: { borderDash: [5, 5] } }
            }
        }
    });
}

// US-10: History Table & Delete/Edit
async function loadHistory() {
    const tables = ['weight_logs', 'bp_logs', 'glucose_logs', 'temp_logs'];
    let combined = [];

    for (let t of tables) {
        const { data } = await supabaseClient.from(t).select('*').eq('user_id', currentUser.id).order('date', {ascending:false}).limit(5);
        if(data) data.forEach(d => { d.type = t; combined.push(d); });
    }

    // Sort by date desc
    combined.sort((a,b) => new Date(b.date) - new Date(a.date));
    allHistoryData = combined; // For export

    const tbody = document.getElementById('history-body');
    tbody.innerHTML = '';

    combined.slice(0, 10).forEach(item => {
        let valStr = '';
        let metricName = '';
        if(item.type === 'weight_logs') { valStr = item.weight + ' kg'; metricName = 'Weight'; }
        else if(item.type === 'bp_logs') { valStr = item.systolic + '/' + item.diastolic; metricName = 'BP'; }
        else if(item.type === 'temp_logs') { valStr = item.temperature + ' °C'; metricName = 'Temp'; }
        else { valStr = item.level + ' mg/dL'; metricName = 'Glucose'; }

        const row = `<tr>
            <td>${item.date}</td>
            <td>${metricName}</td>
            <td>${valStr}</td>
            <td>
                <button class="action-btn" onclick="editEntry('${item.type}', '${item.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="action-btn delete" onclick="deleteEntry('${item.type}', '${item.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

async function deleteEntry(table, id) {
    if(!confirm("Are you sure you want to delete this entry?")) return;
    const { error } = await supabaseClient.from(table).delete().eq('id', id);
    if(!error) loadDashboardData();
}

async function editEntry(table, id) {
    // Fetch single
    const { data } = await supabaseClient.from(table).select('*').eq('id', id).single();
    if(!data) return;

    // Populate Modal based on table
    if(table === 'weight_logs') {
        document.getElementById('weight-id').value = id;
        document.getElementById('weight-val').value = data.weight;
        document.getElementById('weight-date').value = data.date;
        document.getElementById('weight-modal-title').textContent = "Update Weight";
        document.getElementById('weight-btn').textContent = "Update";
        openModal('log-weight');
    } else if(table === 'bp_logs') {
        document.getElementById('bp-id').value = id;
        document.getElementById('bp-sys').value = data.systolic;
        document.getElementById('bp-dia').value = data.diastolic;
        document.getElementById('bp-pulse').value = data.pulse;
        document.getElementById('bp-date').value = data.date;
        document.getElementById('bp-modal-title').textContent = "Update BP";
        document.getElementById('bp-btn').textContent = "Update";
        openModal('log-bp');
    } else if(table === 'glucose_logs') {
        document.getElementById('gluc-id').value = id;
        document.getElementById('gluc-val').value = data.level;
        document.getElementById('gluc-type').value = data.test_type;
        document.getElementById('gluc-date').value = data.date;
        document.getElementById('gluc-modal-title').textContent = "Update Glucose";
        document.getElementById('gluc-btn').textContent = "Update";
        openModal('log-glucose');
    } else if(table === 'temp_logs') {
        document.getElementById('temp-id').value = id;
        document.getElementById('temp-val').value = data.temperature;
        document.getElementById('temp-date').value = data.date;
        document.getElementById('temp-modal-title').textContent = "Update Temp";
        document.getElementById('temp-btn').textContent = "Update";
        openModal('log-temp');
    }
}

// --- 6. DATA SAVING (Create or Update) ---
async function handleSave(tableName, dataObj, idField) {
    const id = document.getElementById(idField).value;
    dataObj.user_id = currentUser.id;
    
    let error;
    if(id) {
        // Update
        const res = await supabaseClient.from(tableName).update(dataObj).eq('id', id);
        error = res.error;
    } else {
        // Insert
        const res = await supabaseClient.from(tableName).insert([dataObj]);
        error = res.error;
    }
    return error;
}

document.getElementById('weight-form').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const err = await handleSave('weight_logs', { weight: document.getElementById('weight-val').value, unit: 'kg', date: document.getElementById('weight-date').value }, 'weight-id');
    finalizeForm(err, 'weight-success', 'weight-error');
});

document.getElementById('bp-form').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const p = document.getElementById('bp-pulse').value;
    const err = await handleSave('bp_logs', { systolic: document.getElementById('bp-sys').value, diastolic: document.getElementById('bp-dia').value, pulse: p?parseInt(p):null, date: document.getElementById('bp-date').value }, 'bp-id');
    finalizeForm(err, 'bp-success', 'bp-error');
});

document.getElementById('temp-form').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const err = await handleSave('temp_logs', { temperature: document.getElementById('temp-val').value, unit: 'C', date: document.getElementById('temp-date').value }, 'temp-id');
    finalizeForm(err, 'temp-success', 'temp-error');
});

document.getElementById('gluc-form').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const err = await handleSave('glucose_logs', { test_type: document.getElementById('gluc-type').value, level: document.getElementById('gluc-val').value, date: document.getElementById('gluc-date').value }, 'gluc-id');
    finalizeForm(err, 'gluc-success', 'gluc-error');
});

function finalizeForm(error, succId, errId) {
    if(error) {
        document.getElementById(errId).textContent = error.message;
        document.getElementById(errId).style.display = 'block';
    } else {
        document.getElementById(succId).textContent = "Saved Successfully!";
        document.getElementById(succId).style.display = 'block';
        loadDashboardData();
        setTimeout(() => closeModals(), 1000);
    }
}

// --- 7. EXPORTS (US-15, US-16) ---
function exportCSV() {
    if(allHistoryData.length === 0) return alert("No data to export");
    
    let csvContent = "data:text/csv;charset=utf-8,Date,Type,Value,Unit\n";
    allHistoryData.forEach(row => {
        let val = row.weight || row.level || (row.systolic + '/' + row.diastolic) || row.temperature;
        let unit = row.unit || (row.systolic ? 'mmHg' : 'mg/dL');
        csvContent += `${row.date},${row.type},${val},${unit}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "instadoc_metrics.csv");
    document.body.appendChild(link);
    link.click();
}

function exportPDF() {
    if(allHistoryData.length === 0) return alert("No data to export");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.text("Instadoc Health Report", 14, 20);
    doc.setFontSize(10);
    doc.text("Generated: " + new Date().toLocaleDateString(), 14, 28);

    const tableData = allHistoryData.map(row => {
         let val = row.weight || row.level || (row.systolic + '/' + row.diastolic) || row.temperature;
         return [row.date, row.type.replace('_logs','').toUpperCase(), val];
    });

    doc.autoTable({
        head: [['Date', 'Metric', 'Value']],
        body: tableData,
        startY: 35,
    });

    doc.save("instadoc_report.pdf");
}

// --- 8. REMINDERS (US-14) ---
function setReminder(e) {
    e.preventDefault();
    const time = document.getElementById('reminder-time').value;
    if(!time) return;
    
    if(Notification.permission === "granted") {
        new Notification("Reminder Set", { body: `We will remind you to log your vitals at ${time}` });
    } else {
        alert("Please enable notifications for reminders.");
    }
    document.getElementById('remind-success').textContent = "Reminder scheduled (Simulation)";
    document.getElementById('remind-success').style.display = 'block';
}

// Auth Form Listeners
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabaseClient.auth.signInWithPassword({ email: document.getElementById('login-email').value, password: document.getElementById('login-password').value });
    if (error) { document.getElementById('login-error').textContent = error.message; document.getElementById('login-error').style.display = 'block'; }
});

document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabaseClient.auth.signUp({ email: document.getElementById('signup-email').value, password: document.getElementById('signup-password').value });
    if (error) { document.getElementById('signup-error').textContent = error.message; document.getElementById('signup-error').style.display = 'block'; }
    else { alert("Check email!"); closeModals(); }
});

// UI Helpers
function openModal(n) { 
    closeModals(); 
    // Reset modal titles/buttons to "Add" mode by default
    const modal = document.getElementById(n + '-modal');
    if(modal) {
        modal.classList.add('active');
        if(n.startsWith('log-')) {
            // Reset ID to ensure "Add" mode unless editEntry changed it
            const idInput = modal.querySelector('input[type="hidden"]');
            if(idInput && idInput.id.endsWith('-id')) idInput.value = ''; 
            
            const title = modal.querySelector('.modal-title');
            if(title) title.textContent = "Log " + n.split('-')[1].charAt(0).toUpperCase() + n.split('-')[1].slice(1);
            
            const btn = modal.querySelector('button[type="submit"]');
            if(btn) btn.textContent = "Save Log";
        }
    }
}

function closeModals() { 
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); 
    document.querySelectorAll('.error-msg, .success-msg').forEach(e => e.style.display = 'none'); 
    document.querySelectorAll('form').forEach(f => f.reset()); 
    resetDates();
}

window.onclick = function(e) { if (e.target.classList.contains('modal-overlay')) closeModals(); }

function toggleUnit(type) { 
    const slider = document.getElementById(type + '-slider');
    const isKg = document.getElementById(type + '-unit').value === 'kg';
    slider.style.transform = isKg ? 'translateX(100%)' : 'translateX(0)';
    document.getElementById(type + '-unit').value = isKg ? 'lbs' : 'kg';
}