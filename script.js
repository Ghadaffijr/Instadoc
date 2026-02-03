// --- 1. CONFIGURATION ---
var SUPABASE_URL = 'https://ioaqlcltvakuqqehkyor.supabase.co'; 
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYXFsY2x0dmFrdXFxZWhreW9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNTk1MzksImV4cCI6MjA4MTczNTUzOX0._7ISJbfJzryBJWmtRuN72F-JZpYdvJxsltwwhombPtE';

var supabaseClient;
var currentUser = null;
var myChart = null; 
var currentChartTable = 'weight_logs'; // Default
var currentChartDays = 7; // Default range
var allHistoryData = []; // Store for export
var allAppointments = []; // Store apps

const countriesList = [
    "United States", "Canada", "United Kingdom", "Australia", "Germany", "France", "Italy", "Spain", "Brazil", "India", 
    "China", "Japan", "South Korea", "Mexico", "Russia", "South Africa", "Nigeria", "Egypt", "Kenya", "Ghana"
];

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
            populateCountries();
            
            if (Notification.permission !== "granted") Notification.requestPermission();

            // Initial Data Load
            loadDashboardData();
            loadProfileSettings(); // New
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

function populateCountries() {
    const select = document.getElementById('settings-address-country');
    if(select && select.options.length <= 1) {
        countriesList.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            select.appendChild(opt);
        });
    }
}

// --- 3. UI LOGIC ---
function switchView(viewName, element) {
    const views = ['view-dashboard', 'view-metrics', 'view-appointments', 'view-settings'];
    views.forEach(id => document.getElementById(id).style.display = 'none');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (element && element.parentElement) {
        element.parentElement.classList.add('active');
    }

    document.getElementById('view-' + viewName).style.display = 'block';
    
    if (viewName === 'metrics' && myChart) myChart.resize();
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
            queryParams: { prompt: 'select_account' }
        }
    });
}

function signInWithPhone() { 
    alert("Phone Auth requires paid plan/setup. Use Email or Google."); 
}

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

function updateWelcomeMessage() {
    if (!currentUser) return;
    const now = new Date();
    const hour = now.getHours();
    let greeting = "Good Morning";
    if (hour >= 12 && hour < 18) greeting = "Good Afternoon";
    else if (hour >= 18) greeting = "Good Evening";

    let name = "User";
    if (currentUser.user_metadata && currentUser.user_metadata.full_name) {
        name = currentUser.user_metadata.full_name.split(' ')[0];
    } else if (currentUser.email) {
        name = currentUser.email.split('@')[0];
        name = name.charAt(0).toUpperCase() + name.slice(1);
    }

    const el = document.getElementById('welcome-msg');
    if (el) el.textContent = `${greeting}, ${name}`;
}

// --- 5. DATA FETCH LOGIC ---
async function loadDashboardData() {
    updateStatCard('weight_logs', 'weight', 'val-weight', 'kg');
    updateStatCard('bp_logs', 'systolic', 'val-bp', '');
    updateStatCard('glucose_logs', 'level', 'val-gluc', 'mg/dL');
    updateStatCard('temp_logs', 'temperature', 'val-temp', '°C');
    updateChart(currentChartTable);
    loadHistory();
    loadAppointments(); // Loads data for Dash & Appt Tab
    countMedicalRecords();
    loadHealthTrends();
    loadHealthAlerts();
}

// APPOINTMENTS: Consolidated Logic
async function loadAppointments() {
    if(!currentUser) return;
    try {
        // Fetch ALL appointments (Past & Future)
        const { data, error } = await supabaseClient
            .from('appointments')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('appointment_date', { ascending: true });

        if (error || !data) {
            console.warn("No appt table or data");
            return; 
        }

        allAppointments = data;
        const now = new Date();
        
        const futureAppts = data.filter(a => new Date(a.appointment_date) >= now);
        const pastAppts = data.filter(a => new Date(a.appointment_date) < now);
        const virtualCount = data.filter(a => a.type.toLowerCase().includes('video') || a.type.toLowerCase().includes('virtual')).length;
        const inPersonCount = data.filter(a => !a.type.toLowerCase().includes('video')).length;

        // 1. Update Dashboard Card Count
        const dashCount = document.getElementById('upcoming-count');
        if(dashCount) dashCount.textContent = futureAppts.length;

        // 2. Update Appointments Tab Stats
        document.getElementById('appt-stat-total').textContent = futureAppts.length;
        document.getElementById('appt-stat-virtual').textContent = virtualCount;
        document.getElementById('appt-stat-inperson').textContent = inPersonCount;
        document.getElementById('appt-stat-past').textContent = pastAppts.length;

        // 3. Render Dashboard List (Limit 3)
        const dashList = document.getElementById('dashboard-appointment-list');
        if(dashList) renderAppointmentList(dashList, futureAppts.slice(0,3));

        // 4. Render Appointments Tab List (All Upcoming)
        const mainList = document.getElementById('detailed-appointment-list');
        if(mainList) renderDetailedList(mainList, futureAppts);

        // 5. Render Past Appointments List
        const pastList = document.getElementById('past-appointment-list');
        if(pastList) renderPastList(pastList, pastAppts.slice(0, 5)); // Limit 5 for cleanliness

    } catch (e) {
        console.error("Appt Load Error", e);
    }
}

function renderAppointmentList(container, data) {
     if (!data.length) {
        container.innerHTML = `<div class="loading-cell text-xs text-gray-500">No upcoming appointments.</div>`;
        return;
    }
    container.innerHTML = '';
    data.forEach(appt => {
        const dateObj = new Date(appt.appointment_date);
        const timeStr = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const dateStr = formatAppointmentDate(dateObj);
        const initials = getInitials(appt.doctor_name);
        let typeHtml = appt.type.toLowerCase().includes('video') 
            ? `<p class="text-xs text-green-500"><i class="fa-solid fa-video"></i> Video Call</p>` 
            : `<p class="text-xs text-gray-500"><i class="fa-regular fa-building"></i> In-person</p>`;
        const colors = ['bg-green-500', 'bg-yellow-500', 'bg-blue-500'];
        const colorClass = colors[Math.floor(Math.random() * colors.length)];
        
        container.innerHTML += `
        <div class="appointment-item">
            <div class="doctor-avatar ${colorClass} text-white">${initials}</div>
            <div class="flex-1"><h4 class="font-bold text-sm">${appt.doctor_name}</h4><p class="text-xs text-gray-500">${appt.specialty}</p></div>
            <div class="text-right"><p class="text-xs font-bold">${dateStr} - ${timeStr}</p>${typeHtml}</div>
        </div>`;
    });
}

function renderDetailedList(container, data) {
    if (!data.length) {
        container.innerHTML = `<p class="text-center-muted">No upcoming appointments scheduled.</p>`;
        return;
    }
    container.innerHTML = '';
    data.forEach(appt => {
        const dateObj = new Date(appt.appointment_date);
        const timeStr = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const dateStr = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const initials = getInitials(appt.doctor_name);
        const isVirtual = appt.type.toLowerCase().includes('video');
        const colors = ['bg-green-500', 'bg-yellow-500', 'bg-blue-500'];
        const colorClass = colors[Math.floor(Math.random() * colors.length)];

        container.innerHTML += `
        <div class="detailed-appt-card">
            <div class="doctor-avatar ${colorClass}" style="width: 60px; height: 60px; font-size: 1.2rem;">${initials}</div>
            <div>
                <div class="flex justify-between items-start">
                    <div><h4 class="font-bold text-md">${appt.doctor_name}</h4><p class="text-sm text-gray-500">${appt.specialty}</p></div>
                    <span class="appt-status-badge status-confirmed">Confirmed</span>
                </div>
                <div class="appt-details-grid">
                    <div class="appt-detail-item"><i class="fa-regular fa-calendar"></i> ${dateStr}</div>
                    <div class="appt-detail-item"><i class="fa-regular fa-clock"></i> ${timeStr}</div>
                    <div class="appt-detail-item">${isVirtual ? '<i class="fa-solid fa-video"></i> Virtual' : '<i class="fa-solid fa-location-dot"></i> Clinic'}</div>
                </div>
                <p class="text-sm text-gray-500 mb-4">Reason: Consultation</p>
                <div class="appt-actions">
                    ${isVirtual ? '<button class="btn-sm btn-green-solid" onclick="alert(\'Joining call...\')"><i class="fa-solid fa-video"></i> Join Call</button>' : ''}
                    <button class="btn-sm btn-gray-light"><i class="fa-regular fa-message"></i> Message</button>
                    <button class="btn-sm btn-gray-light"><i class="fa-solid fa-phone"></i> Call</button>
                </div>
            </div>
            <div><button class="btn-cancel" onclick="alert('Cancel feature coming soon')"><i class="fa-solid fa-xmark"></i> Cancel</button></div>
        </div>`;
    });
}

function renderPastList(container, data) {
     if (!data.length) {
        container.innerHTML = `<p class="text-center-muted">No past appointments.</p>`;
        return;
    }
    container.innerHTML = '';
    data.forEach(appt => {
         const dateObj = new Date(appt.appointment_date);
         const dateStr = dateObj.toLocaleDateString();
         const initials = getInitials(appt.doctor_name);
         
         container.innerHTML += `
         <div class="card p-6 mb-4 flex justify-between items-center">
             <div class="flex gap-4 items-center">
                <div class="doctor-avatar" style="background:#e5e7eb; color:#6b7280;">${initials}</div>
                <div><h4 class="font-bold text-sm">${appt.doctor_name}</h4><p class="text-xs text-gray-500">${appt.specialty}</p></div>
             </div>
             <div class="text-right"><p class="text-sm text-gray-500">${dateStr}</p><p class="text-xs text-gray-400">Completed</p></div>
             <button class="btn-sm btn-gray-light">View Details</button>
        </div>`;
    });
}

function searchAppointments() {
    const query = document.getElementById('appt-search').value.toLowerCase();
    const filtered = allAppointments.filter(a => 
        a.doctor_name.toLowerCase().includes(query) || 
        a.specialty.toLowerCase().includes(query)
    );
    // Re-render upcoming only (simplified for demo)
    const now = new Date();
    const future = filtered.filter(a => new Date(a.appointment_date) >= now);
    renderDetailedList(document.getElementById('detailed-appointment-list'), future);
}


// SETTINGS LOGIC
function loadProfileSettings() {
    if(!currentUser) return;
    // Pre-fill email (read-only)
    document.getElementById('settings-email').value = currentUser.email;
    
    // Try load metadata
    const meta = currentUser.user_metadata || {};
    
    // Basic Info
    if(meta.full_name) document.getElementById('settings-fullname').value = meta.full_name;
    if(meta.phone) document.getElementById('settings-phone').value = meta.phone;
    if(meta.dob) document.getElementById('settings-dob').value = meta.dob;
    
    // Address Info
    if(meta.address) document.getElementById('settings-address-street').value = meta.address;
    if(meta.city) document.getElementById('settings-address-city').value = meta.city;
    if(meta.state) document.getElementById('settings-address-state').value = meta.state;
    if(meta.zip) document.getElementById('settings-address-zip').value = meta.zip;
    if(meta.country) document.getElementById('settings-address-country').value = meta.country;

    // Health Info
    if(meta.blood_type) document.getElementById('settings-blood').value = meta.blood_type;
    if(meta.height) document.getElementById('settings-height').value = meta.height;
    if(meta.weight) document.getElementById('settings-weight').value = meta.weight;
    if(meta.allergies) document.getElementById('settings-allergies').value = meta.allergies;

    // Emergency Contact
    if(meta.em_name) document.getElementById('settings-em-name').value = meta.em_name;
    if(meta.em_rel) document.getElementById('settings-em-rel').value = meta.em_rel;
    if(meta.em_phone) document.getElementById('settings-em-phone').value = meta.em_phone;
    if(meta.em_email) document.getElementById('settings-em-email').value = meta.em_email;
    
    // Preferences
    if(meta.dark_mode) {
        const toggle = document.getElementById('dark-mode-toggle');
        if(toggle && !toggle.classList.contains('checked')) {
            toggle.classList.add('checked');
            document.body.classList.add('dark-mode');
        }
    }

    // Update Profile Header
    updateWelcomeMessage();
    const headerName = document.getElementById('header-name');
    const headerEmail = document.getElementById('header-email');
    const headerDetails = document.getElementById('header-details');
    const headerAvatar = document.getElementById('header-avatar');
    
    if(headerName) headerName.textContent = meta.full_name || "User";
    if(headerAvatar) headerAvatar.textContent = getInitials(meta.full_name || "User");
    if(headerEmail) headerEmail.textContent = currentUser.email;
    if(headerDetails) headerDetails.textContent = `${meta.phone || ''} ${meta.dob ? '• Born: ' + meta.dob : ''}`;
}

async function saveSettings() {
    // Gather all data
    const meta = {
        full_name: document.getElementById('settings-fullname').value,
        phone: document.getElementById('settings-phone').value,
        dob: document.getElementById('settings-dob').value,
        
        address: document.getElementById('settings-address-street').value,
        city: document.getElementById('settings-address-city').value,
        state: document.getElementById('settings-address-state').value,
        zip: document.getElementById('settings-address-zip').value,
        country: document.getElementById('settings-address-country').value,
        
        blood_type: document.getElementById('settings-blood').value,
        height: document.getElementById('settings-height').value,
        weight: document.getElementById('settings-weight').value,
        allergies: document.getElementById('settings-allergies').value,
        
        em_name: document.getElementById('settings-em-name').value,
        em_rel: document.getElementById('settings-em-rel').value,
        em_phone: document.getElementById('settings-em-phone').value,
        em_email: document.getElementById('settings-em-email').value,
        
        dark_mode: document.body.classList.contains('dark-mode')
    };
    
    const { data, error } = await supabaseClient.auth.updateUser({
        data: meta
    });
    
    if(error) {
        alert("Error saving settings: " + error.message);
    } else {
        alert("Settings saved successfully!");
        currentUser = data.user;
        loadProfileSettings();
    }
}

function toggleDarkMode(el) {
    el.classList.toggle('checked');
    document.body.classList.toggle('dark-mode');
}

// ... (Existing Charts & Alerts Logic - Preserved) ...
async function countMedicalRecords() {
    if(!currentUser) return;
    try {
        const [w, b, g, t] = await Promise.all([
            supabaseClient.from('weight_logs').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id),
            supabaseClient.from('bp_logs').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id),
            supabaseClient.from('glucose_logs').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id),
            supabaseClient.from('temp_logs').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id)
        ]);
        const total = (w.count || 0) + (b.count || 0) + (g.count || 0) + (t.count || 0);
        const el = document.getElementById('record-count');
        if(el) el.textContent = total;
    } catch (e) {
        const el = document.getElementById('record-count');
        if(el) el.textContent = "--";
    }
}

async function loadHealthTrends() {
    if (!currentUser) return;
    try {
        const [bpData, glucoseData] = await Promise.all([
             supabaseClient.from('bp_logs').select('systolic, pulse').eq('user_id', currentUser.id).order('date', {ascending:false}).limit(7),
             supabaseClient.from('glucose_logs').select('level').eq('user_id', currentUser.id).order('date', {ascending:false}).limit(7)
        ]);
        
        // --- Heart Rate ---
        const hrData = bpData.data || [];
        const hrEl = document.getElementById('trend-hr-val');
        const hrStatus = document.getElementById('trend-hr-status');
        const hrBars = document.getElementById('trend-hr-bars');
        
        // Show LATEST value (index 0) instead of average
        let latestHr = (hrData.length > 0) ? (hrData[0].pulse || '--') : '--';
        if(hrEl) hrEl.innerHTML = `${latestHr} <span class="text-xs text-gray-500 font-normal">bpm</span>`;
        
        if(hrStatus && hrData.length > 0) {
            const val = hrData[0].pulse;
            if(val > 100) { hrStatus.textContent = 'High'; hrStatus.className = 'text-xs text-red-500 font-bold'; }
            else if(val > 0) { hrStatus.textContent = 'Normal'; hrStatus.className = 'text-xs text-green-500 font-bold'; }
            else hrStatus.textContent = '--';
        }

        if(hrBars) {
            hrBars.innerHTML = '';
            for(let i=0; i<7; i++) {
                let h = 10; 
                if (i < hrData.length) {
                     let val = hrData[hrData.length - 1 - i].pulse || 0; 
                     h = Math.min(100, Math.max(10, (val / 150) * 100));
                }
                hrBars.innerHTML += `<div class="trend-bar" style="height: ${h}%"></div>`;
            }
        }
        
        // --- BP (Systolic) ---
        const bpEl = document.getElementById('trend-bp-val');
        const bpStatus = document.getElementById('trend-bp-status');
        const bpBars = document.getElementById('trend-bp-bars');
        
        const { data: bpFull } = await supabaseClient.from('bp_logs').select('systolic, diastolic, pulse').eq('user_id', currentUser.id).order('date', {ascending:false}).limit(7);
        const fullBP = bpFull || [];
        
        // Show LATEST value
        let latestSys = (fullBP.length > 0) ? fullBP[0].systolic : '--';
        let latestDia = (fullBP.length > 0) ? fullBP[0].diastolic : '--';
        
        if(bpEl) bpEl.innerHTML = `${latestSys}/${latestDia} <span class="text-xs text-gray-500 font-normal">mmHg</span>`;
        
        if(bpStatus && fullBP.length > 0) {
             const sys = fullBP[0].systolic;
             const dia = fullBP[0].diastolic;
             if(sys > 130 || dia > 85) { bpStatus.textContent = 'High'; bpStatus.className = 'text-xs text-red-500 font-bold'; }
             else if (sys > 0) { bpStatus.textContent = 'Normal'; bpStatus.className = 'text-xs text-green-500 font-bold'; }
             else bpStatus.textContent = '--';
        }
        
        if(bpBars) {
            bpBars.innerHTML = '';
            for(let i=0; i<7; i++) {
                let h = 10;
                if(i < fullBP.length) {
                     let val = fullBP[fullBP.length - 1 - i].systolic || 0;
                     h = Math.min(100, Math.max(10, (val / 180) * 100));
                }
                bpBars.innerHTML += `<div class="trend-bar" style="height: ${h}%"></div>`;
            }
        }
        
        // --- Glucose ---
        const glData = glucoseData.data || [];
        const glEl = document.getElementById('trend-gl-val');
        const glStatus = document.getElementById('trend-gl-status');
        const glBars = document.getElementById('trend-gl-bars');
        
        // Show LATEST value
        let latestGl = (glData.length > 0) ? glData[0].level : '--';
        
        if(glEl) glEl.innerHTML = `${latestGl} <span class="text-xs text-gray-500 font-normal">mg/dL</span>`;
        
        if(glStatus && glData.length > 0) {
            const val = glData[0].level;
            if(val > 140) { glStatus.textContent = 'High'; glStatus.className = 'text-xs text-yellow-600 font-bold'; }
            else if (val > 0) { glStatus.textContent = 'Normal'; glStatus.className = 'text-xs text-green-500 font-bold'; }
            else glStatus.textContent = '--';
        }
        
        if(glBars) {
            glBars.innerHTML = '';
            for(let i=0; i<7; i++) {
                 let h = 10;
                 if(i < glData.length) {
                     let val = glData[glData.length - 1 - i].level || 0;
                     h = Math.min(100, Math.max(10, (val / 200) * 100));
                 }
                 glBars.innerHTML += `<div class="trend-bar" style="height: ${h}%"></div>`;
            }
        }
        
    } catch(e) { console.error("Trend Error", e); }
}

async function loadHealthAlerts() {
    if(!currentUser) return;
    // Insight Banner Logic
    const banner = document.getElementById('insight-banner');
    const text = document.getElementById('insight-text');
    
    try {
        // Check BP for Insight
        const { data: bpData } = await supabaseClient.from('bp_logs').select('*').eq('user_id', currentUser.id).order('date', {ascending:false}).limit(1);
        
        if(bpData && bpData.length > 0) {
            banner.style.display = 'flex'; // Make visible
            const last = bpData[0];
            // Also update the dashboard Alert Card
            const bpCard = document.getElementById('alert-bp-card');
            const bpTitle = document.getElementById('alert-bp-title');
            const bpText = document.getElementById('alert-bp-text');
            const bpIcon = document.getElementById('alert-bp-icon');
            
            if(bpCard) {
                bpText.textContent = `Last reading: ${last.systolic}/${last.diastolic}`;
                if(last.systolic > 130 || last.diastolic > 85) {
                    bpCard.className = "alert-item alert-yellow"; 
                    if(last.systolic > 160 || last.diastolic > 100) bpCard.className = "alert-item alert-red"; 
                    bpTitle.textContent = "Elevated BP";
                    bpIcon.className = "alert-icon bg-red-500 text-white";
                    bpIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                } else {
                    bpCard.className = "alert-item alert-green";
                    bpTitle.textContent = "BP Normal";
                    bpIcon.className = "alert-icon bg-green-500 text-white";
                    bpIcon.innerHTML = '<i class="fa-solid fa-check"></i>';
                }
            }

            // Update the Insight Banner Text/Color
            if (last.systolic > 140 || last.diastolic > 90) {
                text.textContent = `Your last BP (${last.systolic}/${last.diastolic}) is elevated. Please consult a doctor if it persists.`;
                banner.style.background = 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)';
            } else if (last.systolic < 90 || last.diastolic < 60) {
                text.textContent = `Your BP is low. Ensure you are hydrated.`;
                banner.style.background = 'linear-gradient(135deg, #56ab2f 0%, #a8e063 100%)';
            } else {
                text.textContent = `Great! Your Blood Pressure is within the normal range.`;
                // User requested GREEN uniform color
                banner.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
            }
        } else {
             // No Data State for Banner
             banner.style.display = 'flex';
             banner.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'; // Default Green
             text.textContent = "Welcome! Start logging your health metrics to see insights.";
        }
    } catch(e) {
         // Error state fallback
         if(banner) {
             banner.style.display = 'flex';
             text.textContent = "Welcome! Start logging your health metrics to see insights.";
             banner.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';
         }
    }
    
    // Appointment Alert Logic
    try {
        const now = new Date().toISOString();
        const { data: apptData } = await supabaseClient.from('appointments').select('*').eq('user_id', currentUser.id).gte('appointment_date', now).order('appointment_date', {ascending:true}).limit(1);
        const apptCard = document.getElementById('alert-appt-card');
        const apptTitle = document.getElementById('alert-appt-title');
        const apptText = document.getElementById('alert-appt-text');
        if(apptData && apptData.length > 0) {
            const next = apptData[0];
            const diffMs = new Date(next.appointment_date) - new Date();
            const diffHrs = Math.round(diffMs / (1000 * 60 * 60));
            let timeText = "";
            if(diffHrs < 24) timeText = `in ${Math.ceil(diffHrs)} hours`;
            else timeText = `in ${Math.ceil(diffHrs/24)} days`;
            apptTitle.textContent = "Upcoming Appointment";
            apptText.textContent = `${next.doctor_name} ${timeText}`;
            apptCard.style.display = "flex";
        } else {
            apptCard.style.display = "none"; 
        }
    } catch(e) {}
}

// Helpers
function getInitials(name) {
    if(!name) return "DR";
    return name.split(" ").map((n)=>n[0]).join("").substring(0,2).toUpperCase();
}
function formatAppointmentDate(date) {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
async function updateStatCard(table, col, elemId, unit) {
    const { data } = await supabaseClient.from(table).select('*').eq('user_id', currentUser.id).order('date', {ascending:false}).limit(1);
    // Removed checkBPInsight here, moved to loadHealthAlerts to centralize logic
    if(data && data.length > 0) {
        let val = data[0][col];
        if(table === 'bp_logs') val = `${data[0].systolic}/${data[0].diastolic}`;
        document.getElementById(elemId).textContent = val;
    } else {
        document.getElementById(elemId).textContent = '--';
    }
}
function setChartRange(days, btn) {
    currentChartDays = days;
    document.querySelectorAll('.time-tabs .chart-select').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateChart(currentChartTable);
}
async function updateChart(tableName, btnRef) {
    currentChartTable = tableName;
    if (!currentUser) return;
    if(btnRef) {
        document.querySelectorAll('.chart-tabs .chart-select').forEach(b => b.classList.remove('active'));
        btnRef.classList.add('active');
    }
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - currentChartDays);
    const dateStr = cutoffDate.toISOString().split('T')[0];
    const { data } = await supabaseClient.from(tableName).select('*').eq('user_id', currentUser.id).gte('date', dateStr).order('date', { ascending: true });
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
        dataset = [{ label: key.toUpperCase(), data: data.map(d => d[key]), borderColor: '#2ecc71', backgroundColor: gradient, borderWidth: 3, tension: 0.4, fill: true }];
    }
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: dataset }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { borderDash: [5, 5] } } } } });
}
async function loadHistory() {
    const tables = ['weight_logs', 'bp_logs', 'glucose_logs', 'temp_logs'];
    let combined = [];
    for (let t of tables) {
        const { data } = await supabaseClient.from(t).select('*').eq('user_id', currentUser.id).order('date', {ascending:false}).limit(5);
        if(data) data.forEach(d => { d.type = t; combined.push(d); });
    }
    combined.sort((a,b) => new Date(b.date) - new Date(a.date));
    allHistoryData = combined; 
    const tbody = document.getElementById('history-body');
    if(tbody) {
        tbody.innerHTML = '';
        combined.slice(0, 10).forEach(item => {
            let valStr = '';
            let metricName = '';
            if(item.type === 'weight_logs') { valStr = item.weight + ' kg'; metricName = 'Weight'; }
            else if(item.type === 'bp_logs') { valStr = item.systolic + '/' + item.diastolic; metricName = 'BP'; }
            else if(item.type === 'temp_logs') { valStr = item.temperature + ' °C'; metricName = 'Temp'; }
            else { valStr = item.level + ' mg/dL'; metricName = 'Glucose'; }
            const row = `<tr><td>${item.date}</td><td>${metricName}</td><td>${valStr}</td><td><button class="action-btn" onclick="editEntry('${item.type}', '${item.id}')"><i class="fa-solid fa-pen"></i></button><button class="action-btn delete" onclick="deleteEntry('${item.type}', '${item.id}')"><i class="fa-solid fa-trash"></i></button></td></tr>`;
            tbody.innerHTML += row;
        });
    }
}
async function loadReportPreview() {
    const tbody = document.getElementById('report-preview-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" class="loading-cell">Loading complete history...</td></tr>';
    const tables = ['weight_logs', 'bp_logs', 'glucose_logs', 'temp_logs'];
    let combined = [];
    for (let t of tables) {
        const { data } = await supabaseClient.from(t).select('*').eq('user_id', currentUser.id);
        if(data) data.forEach(d => { d.type = t; combined.push(d); });
    }
    combined.sort((a,b) => new Date(b.date) - new Date(a.date));
    allHistoryData = combined;
    tbody.innerHTML = '';
    if (combined.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="loading-cell">No records found.</td></tr>'; return; }
    combined.forEach(item => {
        let valStr = '';
        let metricName = '';
        if(item.type === 'weight_logs') { valStr = item.weight + ' kg'; metricName = 'Weight'; }
        else if(item.type === 'bp_logs') { valStr = item.systolic + '/' + item.diastolic + ' mmHg'; metricName = 'BP'; }
        else if(item.type === 'temp_logs') { valStr = item.temperature + ' °C'; metricName = 'Temp'; }
        else { valStr = item.level + ' mg/dL'; metricName = 'Glucose'; }
        const row = `<tr><td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;">${item.date}</td><td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;">${metricName}</td><td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;">${valStr}</td></tr>`;
        tbody.innerHTML += row;
    });
}
async function deleteEntry(table, id) { 
    if(!confirm("Are you sure?")) return; 
    const { error } = await supabaseClient.from(table).delete().eq('id', id); 
    if(error) {
        alert("Error deleting: " + error.message);
    } else {
        loadDashboardData(); 
    }
}
async function editEntry(table, id) {
    const { data } = await supabaseClient.from(table).select('*').eq('id', id).single();
    if(!data) return;
    if(table === 'weight_logs') { document.getElementById('weight-id').value = id; document.getElementById('weight-val').value = data.weight; document.getElementById('weight-date').value = data.date; document.getElementById('weight-modal-title').textContent = "Update Weight"; document.getElementById('weight-btn').textContent = "Update"; openModal('log-weight'); }
    else if(table === 'bp_logs') { document.getElementById('bp-id').value = id; document.getElementById('bp-sys').value = data.systolic; document.getElementById('bp-dia').value = data.diastolic; document.getElementById('bp-pulse').value = data.pulse; document.getElementById('bp-date').value = data.date; document.getElementById('bp-modal-title').textContent = "Update BP"; document.getElementById('bp-btn').textContent = "Update"; openModal('log-bp'); }
    else if(table === 'glucose_logs') { document.getElementById('gluc-id').value = id; document.getElementById('gluc-val').value = data.level; document.getElementById('gluc-type').value = data.test_type; document.getElementById('gluc-date').value = data.date; document.getElementById('gluc-modal-title').textContent = "Update Glucose"; document.getElementById('gluc-btn').textContent = "Update"; openModal('log-glucose'); }
    else if(table === 'temp_logs') { document.getElementById('temp-id').value = id; document.getElementById('temp-val').value = data.temperature; document.getElementById('temp-date').value = data.date; document.getElementById('temp-modal-title').textContent = "Update Temp"; document.getElementById('temp-btn').textContent = "Update"; openModal('log-temp'); }
}
async function handleSave(tableName, dataObj, idField) {
    const id = document.getElementById(idField).value;
    dataObj.user_id = currentUser.id;
    let error;
    if(id) { const res = await supabaseClient.from(tableName).update(dataObj).eq('id', id); error = res.error; }
    else { const res = await supabaseClient.from(tableName).insert([dataObj]); error = res.error; }
    return error;
}
document.getElementById('weight-form').addEventListener('submit', async (e) => { e.preventDefault(); const err = await handleSave('weight_logs', { weight: document.getElementById('weight-val').value, unit: 'kg', date: document.getElementById('weight-date').value }, 'weight-id'); finalizeForm(err, 'weight-success', 'weight-error'); });
document.getElementById('bp-form').addEventListener('submit', async (e) => { e.preventDefault(); const p = document.getElementById('bp-pulse').value; const err = await handleSave('bp_logs', { systolic: document.getElementById('bp-sys').value, diastolic: document.getElementById('bp-dia').value, pulse: p?parseInt(p):null, date: document.getElementById('bp-date').value }, 'bp-id'); finalizeForm(err, 'bp-success', 'bp-error'); });
document.getElementById('temp-form').addEventListener('submit', async (e) => { e.preventDefault(); const err = await handleSave('temp_logs', { temperature: document.getElementById('temp-val').value, unit: 'C', date: document.getElementById('temp-date').value }, 'temp-id'); finalizeForm(err, 'temp-success', 'temp-error'); });
document.getElementById('gluc-form').addEventListener('submit', async (e) => { e.preventDefault(); const err = await handleSave('glucose_logs', { test_type: document.getElementById('gluc-type').value, level: document.getElementById('gluc-val').value, date: document.getElementById('gluc-date').value }, 'gluc-id'); finalizeForm(err, 'gluc-success', 'gluc-error'); });
function finalizeForm(error, succId, errId) {
    if(error) { document.getElementById(errId).textContent = error.message; document.getElementById(errId).style.display = 'block'; }
    else { document.getElementById(succId).textContent = "Saved Successfully!"; document.getElementById(succId).style.display = 'block'; loadDashboardData(); setTimeout(() => closeModals(), 1000); }
}
function exportCSV() {
    if(allHistoryData.length === 0) return alert("No data to export");
    let csvContent = "data:text/csv;charset=utf-8,Date,Type,Value\n";
    allHistoryData.forEach(row => {
        let val = '';
        if(row.type === 'weight_logs') val = row.weight + ' kg';
        else if(row.type === 'bp_logs') val = `${row.systolic}/${row.diastolic} mmHg`;
        else if(row.type === 'temp_logs') val = row.temperature + ' °C';
        else val = row.level + ' mg/dL';
        
        csvContent += `${row.date},${row.type.replace('_logs','').toUpperCase()},${val}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", "instadoc_metrics.csv"); document.body.appendChild(link); link.click();
}
function exportPDF() {
    if(allHistoryData.length === 0) return alert("No data to export");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Instadoc Health Report", 14, 20);
    doc.setFontSize(10);
    doc.text("Generated: " + new Date().toLocaleDateString(), 14, 28);
    const tableData = allHistoryData.map(row => {
         let val = '';
         if(row.type === 'weight_logs') val = row.weight + ' kg';
         else if(row.type === 'bp_logs') val = `${row.systolic}/${row.diastolic} mmHg`;
         else if(row.type === 'temp_logs') val = row.temperature + ' °C';
         else val = row.level + ' mg/dL';
         
         return [row.date, row.type.replace('_logs','').toUpperCase(), val];
    });
    doc.autoTable({ head: [['Date', 'Metric', 'Value']], body: tableData, startY: 35, });
    doc.save("instadoc_report.pdf");
}
function setReminder(e) {
    e.preventDefault();
    const time = document.getElementById('reminder-time').value;
    if(!time) return;
    if(Notification.permission === "granted") { new Notification("Reminder Set", { body: `We will remind you to log your vitals at ${time}` }); }
    else { alert("Please enable notifications for reminders."); }
    document.getElementById('remind-success').textContent = "Reminder scheduled (Simulation)"; document.getElementById('remind-success').style.display = 'block';
}

// Updated Login Listener with Loading State
document.getElementById('login-form').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const btn = document.getElementById('btn-login-submit');
    const originalText = btn.textContent;
    
    try {
        btn.textContent = "Logging in...";
        btn.disabled = true;
        const { error } = await supabaseClient.auth.signInWithPassword({ email: document.getElementById('login-email').value, password: document.getElementById('login-password').value }); 
        if (error) { 
            document.getElementById('login-error').textContent = error.message; 
            document.getElementById('login-error').style.display = 'block'; 
        }
    } catch (err) {
        console.error(err);
    } finally {
        // If auth is successful, the onAuthStateChange will redirect, so this reset only matters on error
        if(document.getElementById('login-error').style.display === 'block') {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
});

document.getElementById('signup-form').addEventListener('submit', async (e) => { e.preventDefault(); const { error } = await supabaseClient.auth.signUp({ email: document.getElementById('signup-email').value, password: document.getElementById('signup-password').value }); if (error) { document.getElementById('signup-error').textContent = error.message; document.getElementById('signup-error').style.display = 'block'; } else { alert("Check email!"); closeModals(); } });
function openModal(n) { 
    closeModals(); 
    const modal = document.getElementById(n + '-modal');
    if(modal) {
        modal.classList.add('active');
        if(n === 'reports') loadReportPreview();
        if(n.startsWith('log-')) {
            const idInput = modal.querySelector('input[type="hidden"]');
            if(idInput && idInput.id.endsWith('-id')) idInput.value = ''; 
            const title = modal.querySelector('.modal-title');
            if(title) title.textContent = "Log " + n.split('-')[1].charAt(0).toUpperCase() + n.split('-')[1].slice(1);
            const btn = modal.querySelector('button[type="submit"]');
            if(btn) btn.textContent = "Save Log";
        }
    }
}
function closeModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); document.querySelectorAll('.error-msg, .success-msg').forEach(e => e.style.display = 'none'); document.querySelectorAll('form').forEach(f => f.reset()); resetDates(); }
window.onclick = function(e) { if (e.target.classList.contains('modal-overlay')) closeModals(); }
function toggleUnit(type) { const slider = document.getElementById(type + '-slider'); const isKg = document.getElementById(type + '-unit').value === 'kg'; slider.style.transform = isKg ? 'translateX(100%)' : 'translateX(0)'; document.getElementById(type + '-unit').value = isKg ? 'lbs' : 'kg'; }