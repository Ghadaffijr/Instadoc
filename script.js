// --- 1. CONFIGURATION ---
var SUPABASE_URL = 'https://ioaqlcltvakuqqehkyor.supabase.co'; 
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYXFsY2x0dmFrdXFxZWhreW9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNTk1MzksImV4cCI6MjA4MTczNTUzOX0._7ISJbfJzryBJWmtRuN72F-JZpYdvJxsltwwhombPtE';

var supabaseClient;
var currentUser = null;
var myChart = null; 
var doctorCharts = {};
var currentChartTable = 'weight_logs'; 
var currentChartDays = 7; 
var allHistoryData = []; 
var allAppointments = []; 
var userRole = 'patient'; // Default role

const countriesList = [
    "United States", "Canada", "United Kingdom", "Australia", "Germany", "France", "Italy", "Spain", "Brazil", "India", 
    "China", "Japan", "South Korea", "Mexico", "Russia", "South Africa", "Nigeria", "Egypt", "Kenya", "Ghana"
];

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

        console.log("Auth Event:", event);

        // US-3: Password Recovery Handling
        if (event === 'PASSWORD_RECOVERY') {
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
            const updateModal = document.getElementById('update-password-modal');
            if (updateModal) updateModal.classList.add('active');
            return; // Stop further routing logic
        }

        if (session && session.user) {
            // LOGGED IN
            currentUser = session.user;
            
            // US-1 & US-2: Role-Based Routing
            // Source of Truth: user_metadata.role
            const metaRole = (session.user.user_metadata && session.user.user_metadata.role) ? session.user.user_metadata.role : 'patient';
            
            // Set Global Role
            userRole = metaRole; 
            
            console.log("User Role Detected:", userRole);

            landing.style.display = 'none';
            dashboard.style.display = 'grid'; 
            if(deco) deco.style.display = 'none';
            
            closeModals();
            resetDates();
            populateCountries();
            
            if (Notification.permission !== "granted") Notification.requestPermission();

            // Setup Interface based on Role
            setupSidebar();
            
            if(userRole === 'doctor') {
                switchView('doctor-dashboard');
                loadDoctorStatus(); 
                renderScheduleGrid(); 
                loadDoctorDashboardData(); 
            } else {
                loadDashboardData();
                loadProfileSettings(); 
                switchView('dashboard');
            }
            
            updateWelcomeMessage();
            updateAvatarUI(session.user.user_metadata?.avatar_url);

        } else {
            // LOGGED OUT
            currentUser = null;
            userRole = 'patient';
            landing.style.display = 'block'; 
            dashboard.style.display = 'none';
            if(deco) deco.style.display = 'block';
        }
    });
}

// NEW: Dynamic Sidebar Setup
function setupSidebar() {
    const list = document.getElementById('nav-list-container');
    list.innerHTML = '';

    if(userRole === 'patient') {
        list.innerHTML = `
            <li class="nav-item active">
                <a href="#" class="nav-link" onclick="switchView('dashboard', this); return false;">
                    <i class="fa-solid fa-house"></i><span>Dashboard</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="#" class="nav-link" onclick="switchView('metrics', this); return false;">
                    <i class="fa-solid fa-heart-pulse"></i><span>Health Metrics</span>
                </a>
            </li>
            <li class="nav-item"><a href="#" class="nav-link" onclick="openModal('log-bp'); return false;"><i class="fa-solid fa-heart-pulse text-gray-500"></i><span>Log BP</span></a></li>
            <li class="nav-item"><a href="#" class="nav-link" onclick="openModal('log-weight'); return false;"><i class="fa-solid fa-weight-scale text-gray-500"></i><span>Log Weight</span></a></li>
            <li class="nav-item"><a href="#" class="nav-link" onclick="openModal('log-glucose'); return false;"><i class="fa-solid fa-droplet text-gray-500"></i><span>Log Glucose</span></a></li>
            <li class="nav-item"><a href="#" class="nav-link" onclick="openModal('log-temp'); return false;"><i class="fa-solid fa-temperature-half text-gray-500"></i><span>Log Temp</span></a></li>
            <li class="nav-item">
                <a href="#" class="nav-link" onclick="switchView('appointments', this); return false;">
                    <i class="fa-regular fa-calendar-check"></i><span>Appointments</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="#" class="nav-link" onclick="switchView('settings', this); return false;">
                    <i class="fa-solid fa-gear"></i><span>Settings</span>
                </a>
            </li>
        `;
    } else {
        // DOCTOR SIDEBAR
        list.innerHTML = `
            <li class="nav-item active">
                <a href="#" class="nav-link" onclick="switchView('doctor-dashboard', this); return false;">
                    <i class="fa-solid fa-house"></i><span>Dashboard</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="#" class="nav-link" onclick="switchView('doctor-appointments', this); return false;">
                    <i class="fa-regular fa-calendar-check"></i><span>Appointments</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="#" class="nav-link" onclick="switchView('doctor-settings', this); return false;">
                    <i class="fa-solid fa-gear"></i><span>Settings</span>
                </a>
            </li>
        `;
    }
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
    // Hide all views first
    document.querySelectorAll('.patient-view, .doctor-view').forEach(el => el.style.display = 'none');
    
    // Handle Sidebar Active State
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (element && element.parentElement) {
        element.parentElement.classList.add('active');
    } else {
        // Auto-highlight if triggered programmatically
        const link = document.querySelector(`.nav-link[onclick*="'${viewName}'"]`);
        if(link) link.parentElement.classList.add('active');
    }

    // Show requested view
    const target = document.getElementById('view-' + viewName);
    if(target) {
        target.style.display = 'block';
        if (viewName === 'metrics' && myChart) myChart.resize();
        if (viewName === 'doctor-dashboard') {
            setTimeout(() => {
                if(doctorCharts.weekly) doctorCharts.weekly.resize();
                if(doctorCharts.growth) doctorCharts.growth.resize();
            }, 100);
        }
        if (viewName === 'doctor-appointments') {
            loadDoctorAppointmentsTab();
        }
    }
}

// --- 4. AUTH LOGIC ---
async function logout() {
    if (!supabaseClient) { window.location.reload(); return; }
    try {
        await supabaseClient.auth.signOut();
    } catch (error) {
        console.error("Error signing out:", error);
    } finally {
        currentUser = null;
        userRole = 'patient';
        
        const landing = document.getElementById('landing-view');
        const dashboard = document.getElementById('dashboard-view');
        const deco = document.getElementById('decorations');
        
        if (landing) landing.style.display = 'block';
        if (dashboard) dashboard.style.display = 'none';
        if (deco) deco.style.display = 'block';
        closeModals();
    }
}

async function signInWithGoogle() {
    const redirectUrl = window.location.href.split('#')[0];
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, queryParams: { prompt: 'select_account' } }
    });
}

function signInWithPhone() { alert("Phone Auth requires paid plan/setup. Use Email or Google."); }

// Toggle logic for Doctor Signup fields
function toggleDoctorSignupFields() {
    const isDoc = document.getElementById('signup-as-doctor').checked;
    document.getElementById('doctor-signup-fields').style.display = isDoc ? 'block' : 'none';
}

// LOGIN FORM HANDLER
document.getElementById('login-form').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const btn = document.getElementById('btn-login-submit');
    const originalText = btn.textContent;
    
    try {
        btn.textContent = "Logging in...";
        btn.disabled = true;
        
        const { error } = await supabaseClient.auth.signInWithPassword({ 
            email: document.getElementById('login-email').value, 
            password: document.getElementById('login-password').value 
        }); 
        
        if (error) { 
            document.getElementById('login-error').textContent = error.message; 
            document.getElementById('login-error').style.display = 'block'; 
        }
    } catch (err) {
        console.error(err);
    } finally {
        if(document.getElementById('login-error').style.display === 'block') {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }
});

// SIGNUP FORM HANDLER
document.getElementById('signup-form').addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPass = document.getElementById('signup-confirm-password').value;

    if (password !== confirmPass) {
        document.getElementById('signup-error').textContent = "Passwords do not match."; 
        document.getElementById('signup-error').style.display = 'block'; 
        return;
    }
    
    // Logic to prevent Database Trigger Errors (NOT NULL constraints)
    const isDoc = document.getElementById('signup-as-doctor').checked;
    let metadata = {};

    if (isDoc) {
        // Validate Doctor Fields
        const fullName = document.getElementById('signup-fullname').value;
        const license = document.getElementById('signup-license').value;
        
        if (!fullName || !license) {
            document.getElementById('signup-error').textContent = "Doctors must provide Name and License Number.";
            document.getElementById('signup-error').style.display = 'block';
            return;
        }

        metadata = {
            role: 'doctor',
            full_name: fullName,
            license_number: license,
            specialty: document.getElementById('signup-specialty').value
        };
    } else {
        const fallbackName = email.split('@')[0]; 
        metadata = { 
            role: 'patient',
            full_name: fallbackName
        };
    }

    const { error } = await supabaseClient.auth.signUp({ 
        email: email, 
        password: password,
        options: {
            data: metadata
        }
    }); 
    
    if (error) { 
        document.getElementById('signup-error').textContent = error.message; 
        document.getElementById('signup-error').style.display = 'block'; 
    } else { 
        alert("Signup successful! Please check your email for verification."); 
        closeModals(); 
    } 
});

// PASSWORD RESET REQUEST
document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reset-email').value;
    const btn = e.target.querySelector('button');
    btn.textContent = "Sending...";
    
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href, 
    });

    if (error) {
        document.getElementById('reset-error').textContent = error.message;
        document.getElementById('reset-error').style.display = 'block';
    } else {
        document.getElementById('reset-success').textContent = "Check your email for the reset link.";
        document.getElementById('reset-success').style.display = 'block';
        e.target.reset();
    }
    btn.textContent = "Send Reset Link";
});

// PASSWORD UPDATE HANDLER
document.getElementById('update-pass-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-new-password').value;
    const btn = e.target.querySelector('button');

    if (newPass !== confirmPass) {
        document.getElementById('update-pass-error').textContent = "Passwords do not match.";
        document.getElementById('update-pass-error').style.display = 'block';
        return;
    }

    btn.textContent = "Updating...";
    const { error } = await supabaseClient.auth.updateUser({ password: newPass });

    if (error) {
        document.getElementById('update-pass-error').textContent = error.message;
        document.getElementById('update-pass-error').style.display = 'block';
    } else {
        document.getElementById('update-pass-success').textContent = "Password updated successfully!";
        document.getElementById('update-pass-success').style.display = 'block';
        setTimeout(() => {
            closeModals();
            window.location.hash = ''; 
            logout(); 
        }, 2000);
    }
    btn.textContent = "Update Password";
});

// --- DOCTOR DASHBOARD DATA LOGIC ---

async function loadDoctorDashboardData() {
    if(!currentUser) return;
    const docId = currentUser.id;

    // 1. Fetch All Appointments for this Doctor
    const { data: appts, error } = await supabaseClient
        .from('appointments')
        .select('*')
        .eq('doctor_id', docId);

    if (error) { console.error("Error fetching doctor data", error); return; }

    // --- Calculate Stats ---
    const totalPatients = new Set(appts.map(a => a.user_id)).size;
    
    // Fix: Robust Date matching for Today
    const todayLocalStr = new Date().toLocaleDateString();
    const todayAppts = appts.filter(a => new Date(a.appointment_date).toLocaleDateString() === todayLocalStr && a.status === 'Confirmed').length;
    
    const pending = appts.filter(a => a.status === 'pending').length;
    const completed = appts.filter(a => a.status === 'completed').length;
    const totalCount = appts.length;
    const successRate = totalCount > 0 ? Math.round((completed / totalCount) * 100) : 0;

    // Update Stats UI
    const docStatPatients = document.getElementById('doc-stat-patients');
    if(docStatPatients) docStatPatients.textContent = totalPatients;
    
    const docStatToday = document.getElementById('doc-stat-today');
    if(docStatToday) docStatToday.textContent = todayAppts;
    
    const docStatPending = document.getElementById('doc-stat-pending');
    if(docStatPending) docStatPending.textContent = pending;
    
    const docStatSuccess = document.getElementById('doc-stat-success');
    if(docStatSuccess) docStatSuccess.textContent = successRate + '%';

    // --- Populate Recent Activity ---
    const recentContainer = document.getElementById('doctor-recent-activity');
    if(recentContainer) {
        recentContainer.innerHTML = '';
        
        // Sort by date desc and take top 5
        const recentAppts = [...appts].sort((a,b) => new Date(b.appointment_date) - new Date(a.appointment_date)).slice(0, 5);

        if (recentAppts.length === 0) {
            recentContainer.innerHTML = '<p class="text-xs text-gray-500 text-center">No recent activity.</p>';
        } else {
            recentAppts.forEach(a => {
                const timeAgo = getTimeAgo(new Date(a.appointment_date));
                const initials = getInitials(a.patient_name || a.user_id);
                const displayName = a.patient_name || ("Patient " + a.user_id.substring(0, 4));

                const item = `
                    <div class="flex items-center gap-4 border-b border-gray-100 pb-3">
                        <div class="profile-pic" style="background:#e5e7eb; color:#555;">${initials}</div>
                        <div class="flex-1">
                            <h4 class="font-bold text-sm">${displayName}</h4>
                            <p class="text-xs text-gray-500">${a.type || 'Appointment'}</p>
                        </div>
                        <span class="text-xs text-gray-400">${timeAgo}</span>
                    </div>
                `;
                recentContainer.innerHTML += item;
            });
        }
    }

    // --- Update Charts (Weekly) ---
    updateDoctorWeeklyChart(appts);
    // --- Update Charts (Growth) ---
    updateDoctorGrowthChart(appts);
}


// --- UPDATED: DOCTOR APPOINTMENTS TAB LOGIC ---
async function loadDoctorAppointmentsTab() {
    if(!currentUser) return;
    const docId = currentUser.id;

    // Fetch Appointments
    const { data: appts, error } = await supabaseClient
        .from('appointments')
        .select('*')
        .eq('doctor_id', docId)
        .order('appointment_date', { ascending: true });

    if(error) return;

    // Time Logic
    const now = new Date();
    const todayLocalStr = now.toLocaleDateString();

    // 1. Pending: Strictly 'pending' status
    const pendingList = appts.filter(a => a.status === 'pending');
    
    // 2. Upcoming: Strictly 'confirmed' status
    const upcomingList = appts.filter(a => a.status === 'Confirmed' || a.status === 'confirmed');

    // 3. Past: ONLY completed (Fix 1: hiding cancelled/declined)
    const pastList = appts.filter(a => a.status === 'completed');

    // Update Stats (Fix 4: accurate local date count for Today)
    const todayCount = appts.filter(a => new Date(a.appointment_date).toLocaleDateString() === todayLocalStr && (a.status === 'Confirmed' || a.status === 'confirmed')).length;
    
    document.getElementById('doc-appt-today-count').textContent = todayCount;
    document.getElementById('doc-appt-pending-count').textContent = pendingList.length;
    document.getElementById('doc-appt-total-count').textContent = upcomingList.length;

    // Render Lists
    renderDocSection('doc-pending-list', pendingList, 'pending');
    renderDocSection('doc-upcoming-list', upcomingList, 'upcoming');
    renderDocSection('doc-past-list', pastList, 'past');
}


function updateDoctorWeeklyChart(appts) {
    if (!doctorCharts.weekly) initDoctorCharts();
    
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    
    appts.forEach(a => {
        const d = new Date(a.appointment_date);
        const dayIndex = d.getDay(); 
        const chartIndex = (dayIndex + 6) % 7; 
        dayCounts[chartIndex]++;
    });

    doctorCharts.weekly.data.datasets[0].data = dayCounts;
    doctorCharts.weekly.update();
}

function updateDoctorGrowthChart(appts) {
    if (!doctorCharts.growth) initDoctorCharts();

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const today = new Date();
    const labels = [];
    const dataPoints = [];

    for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        labels.push(monthNames[d.getMonth()]);
        
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() - i + 1, 0, 23, 59, 59);
        
        const uniquePatients = new Set(
            appts
            .filter(a => new Date(a.appointment_date) <= endOfMonth)
            .map(a => a.user_id)
        );
        dataPoints.push(uniquePatients.size);
    }

    doctorCharts.growth.data.labels = labels;
    doctorCharts.growth.data.datasets[0].data = dataPoints;
    doctorCharts.growth.update();
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return "Just now";
}

// --- DOCTOR DASHBOARD CHARTS ---
function initDoctorCharts() {
    if(doctorCharts.weekly) return; // Already init

    const ctx1 = document.getElementById('doctorWeeklyChart').getContext('2d');
    doctorCharts.weekly = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Appointments',
                data: [0, 0, 0, 0, 0, 0, 0], // Init empty
                backgroundColor: '#2ecc71',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { grid: { borderDash: [5, 5] }, beginAtZero: true, ticks: { stepSize: 1 } },
                x: { grid: { display: false } }
            }
        }
    });

    const ctx2 = document.getElementById('doctorGrowthChart').getContext('2d');
    doctorCharts.growth = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: [], 
            datasets: [{
                label: 'Total Patients',
                data: [], 
                borderColor: '#2ecc71',
                tension: 0.4,
                pointBackgroundColor: '#2ecc71',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { 
                y: { grid: { borderDash: [5, 5] }, min: 0, ticks: { stepSize: 1 } }, 
                x: { grid: { display: false } }
            }
        }
    });
}

// --- SHARED UI LOGIC ---
function updateWelcomeMessage() {
    if (!currentUser) return;
    const now = new Date();
    const hour = now.getHours();
    let greeting = "Good Morning";
    if (hour >= 12 && hour < 18) greeting = "Good Afternoon";
    else if (hour >= 18) greeting = "Good Evening";

    let name = "User";
    if (currentUser.user_metadata && currentUser.user_metadata.full_name) {
        name = currentUser.user_metadata.full_name;
    } else if (currentUser.email) {
        name = currentUser.email.split('@')[0];
    }
    
    if(userRole === 'doctor' && !name.toLowerCase().includes('dr.')) {
        name = "Dr. " + name.charAt(0).toUpperCase() + name.slice(1);
    }

    const el = document.getElementById('welcome-msg');
    if (el) el.textContent = `${greeting}, ${name}`;
}

function updateAvatarUI(avatarUrl) {
    const headerAvatar = document.getElementById('header-avatar');
    const topProfilePic = document.querySelector('.dash-header-area .profile-pic');
    const name = (currentUser.user_metadata && currentUser.user_metadata.full_name) || (currentUser.email ? currentUser.email.split('@')[0] : "User");
    const initials = getInitials(name);

    const content = avatarUrl ? `<img src="${avatarUrl}" alt="Profile">` : initials;

    if (headerAvatar) headerAvatar.innerHTML = content;
    if (topProfilePic) topProfilePic.innerHTML = content;
}

// --- 5. DATA FETCH LOGIC (PATIENT) ---
async function loadDashboardData() {
    updateStatCard('weight_logs', 'weight', 'val-weight', 'kg');
    updateStatCard('bp_logs', 'systolic', 'val-bp', '');
    updateStatCard('glucose_logs', 'level', 'val-gluc', 'mg/dL');
    updateStatCard('temp_logs', 'temperature', 'val-temp', '°C');
    updateChart(currentChartTable);
    loadHistory();
    loadAppointments(); 
    countMedicalRecords();
    loadHealthTrends();
    loadHealthAlerts(); 
}

// Consolidated Patient Appt Logic
async function loadAppointments() {
    if(!currentUser) return;
    try {
        const { data, error } = await supabaseClient.from('appointments').select('*').eq('user_id', currentUser.id).order('appointment_date', { ascending: true });
        if (error || !data) return; 
        allAppointments = data;
        
        const now = new Date();
        const futureAppts = data.filter(a => new Date(a.appointment_date) >= now && a.status !== 'cancelled' && a.status !== 'declined');
        const pastAppts = data.filter(a => new Date(a.appointment_date) < now && a.status === 'completed');
        
        const virtualCount = data.filter(a => a.type.toLowerCase().includes('video') || a.type.toLowerCase().includes('audio')).length;
        const inPersonCount = data.filter(a => a.type.toLowerCase().includes('in-person')).length;

        const dashCount = document.getElementById('upcoming-count');
        if(dashCount) dashCount.textContent = futureAppts.length;

        document.getElementById('appt-stat-total').textContent = futureAppts.length;
        document.getElementById('appt-stat-virtual').textContent = virtualCount;
        document.getElementById('appt-stat-inperson').textContent = inPersonCount;
        document.getElementById('appt-stat-past').textContent = pastAppts.length;

        const dashList = document.getElementById('dashboard-appointment-list');
        if(dashList) renderAppointmentList(dashList, futureAppts.slice(0,3));

        const mainList = document.getElementById('detailed-appointment-list');
        if(mainList) renderDetailedList(mainList, futureAppts);

        const pastList = document.getElementById('past-appointment-list');
        if(pastList) renderPastList(pastList, pastAppts.slice(0, 5));
    } catch (e) { console.error("Appt Load Error", e); }
}

// Patient Renderers
function renderAppointmentList(container, data) {
    if (!data.length) { container.innerHTML = `<div class="loading-cell text-xs text-gray-500">No upcoming appointments.</div>`; return; }
    container.innerHTML = '';
    data.forEach(appt => {
        const dateStr = formatAppointmentDate(new Date(appt.appointment_date));
        
        // Audio UI handling
        let typeHtml = '';
        if(appt.type.toLowerCase().includes('video')) {
            typeHtml = `<p class="text-xs text-blue-500"><i class="fa-solid fa-video"></i> Video</p>`;
        } else if (appt.type.toLowerCase().includes('audio')) {
            typeHtml = `<p class="text-xs text-purple-500"><i class="fa-solid fa-phone"></i> Audio</p>`;
        } else {
            typeHtml = `<p class="text-xs text-gray-500">In-person</p>`;
        }
        
        container.innerHTML += `<div class="appointment-item"><div class="doctor-avatar bg-green-500 text-white">${getInitials(appt.doctor_name)}</div><div class="flex-1"><h4 class="font-bold text-sm">${appt.doctor_name}</h4><p class="text-xs text-gray-500">${appt.specialty}</p></div><div class="text-right"><p class="text-xs font-bold">${dateStr}</p>${typeHtml}</div></div>`;
    });
}
function renderDetailedList(container, data) {
    if (!data.length) { container.innerHTML = `<p class="text-center-muted">No upcoming appointments.</p>`; return; }
    container.innerHTML = '';
    data.forEach(appt => {
        const dateObj = new Date(appt.appointment_date);
        const dateStr = dateObj.toLocaleDateString();
        const timeStr = dateObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        
        let actionBtn = '';
        if(appt.status === 'Confirmed' || appt.status === 'confirmed') {
            if(appt.type.toLowerCase().includes('video')) {
                actionBtn = `<button class="btn-sm bg-blue-500 text-white border-none mt-2 w-full justify-center" onclick="startVideoCall('${appt.id}')"><i class="fa-solid fa-video"></i> Join Video Call</button>`;
            } else if (appt.type.toLowerCase().includes('audio')) {
                actionBtn = `<button class="btn-sm bg-purple-500 text-white border-none mt-2 w-full justify-center" onclick="startVideoCall('${appt.id}')"><i class="fa-solid fa-phone"></i> Join Audio Call</button>`;
            }
        }

        container.innerHTML += `
            <div class="detailed-appt-card">
                <div class="doctor-avatar bg-green-500" style="width:60px;height:60px;font-size:1.2rem;">${getInitials(appt.doctor_name)}</div>
                <div>
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-md">${appt.doctor_name}</h4>
                            <p class="text-sm text-gray-500">${appt.specialty}</p>
                        </div>
                        <span class="appt-status-badge ${appt.status === 'Confirmed' || appt.status === 'confirmed' ? 'status-confirmed' : 'status-pending'}">${appt.status}</span>
                    </div>
                    <div class="appt-details-grid">
                        <div class="appt-detail-item"><i class="fa-regular fa-calendar"></i> ${dateStr}</div>
                        <div class="appt-detail-item"><i class="fa-regular fa-clock"></i> ${timeStr}</div>
                        <div class="appt-detail-item" style="grid-column: span 3; color: #666; font-size: 0.85rem;"><i class="fa-solid fa-notes-medical"></i> ${appt.type}</div>
                    </div>
                    ${actionBtn}
                </div>
            </div>`;
    });
}
function renderPastList(container, data) {
    if (!data.length) { container.innerHTML = `<p class="text-center-muted">No past appointments.</p>`; return; }
    container.innerHTML = '';
    data.forEach(appt => {
        const dateStr = new Date(appt.appointment_date).toLocaleDateString();
        container.innerHTML += `<div class="card p-6 mb-4 flex justify-between items-center"><div class="flex gap-4 items-center"><div class="doctor-avatar" style="background:#e5e7eb; color:#6b7280;">${getInitials(appt.doctor_name)}</div><div><h4 class="font-bold text-sm">${appt.doctor_name}</h4><p class="text-xs text-gray-500">${appt.specialty}</p></div></div><div class="text-right"><p class="text-sm text-gray-500">${dateStr}</p><p class="text-xs text-green-600 font-bold">Completed</p></div></div>`;
    });
}

// Global Helpers
function getInitials(name) { if(!name) return "DR"; return name.split(" ").map(n=>n[0]).join("").substring(0,2).toUpperCase(); }
function formatAppointmentDate(date) { return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

async function updateStatCard(table, col, elemId, unit) {
    const { data } = await supabaseClient.from(table).select('*').eq('user_id', currentUser.id).order('date', {ascending:false}).limit(1);
    
    const cardContainer = document.getElementById(elemId).parentElement.parentElement; 
    const oldTime = cardContainer.querySelector('.timestamp-label');
    if(oldTime) oldTime.remove();

    if(data && data.length > 0) {
        let val = data[0][col];
        if(table === 'bp_logs') val = `${data[0].systolic}/${data[0].diastolic}`;
        document.getElementById(elemId).textContent = val;
        
        const dbDateString = data[0].date; 
        const logDate = new Date(dbDateString + 'T00:00:00'); 
        const today = new Date();
        today.setHours(0,0,0,0); 
        
        const diffTime = today - logDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        let timeStr = "Today";
        if (diffDays === 1) timeStr = "Yesterday";
        else if (diffDays > 1) timeStr = `${diffDays} days ago`;

        const timeLabel = document.createElement('div');
        timeLabel.className = 'timestamp-label text-xs text-gray-400 mt-1';
        timeLabel.innerHTML = `<i class="fa-regular fa-clock mr-1"></i> ${timeStr}`;
        document.getElementById(elemId).parentElement.appendChild(timeLabel);

    } else { 
        document.getElementById(elemId).textContent = '--'; 
    }
}

function setChartRange(days, btn) { currentChartDays = days; document.querySelectorAll('.time-tabs .chart-select').forEach(b => b.classList.remove('active')); btn.classList.add('active'); updateChart(currentChartTable); }

async function updateChart(tableName, btnRef) {
    currentChartTable = tableName;
    if (!currentUser) return;
    if(btnRef) { document.querySelectorAll('.chart-tabs .chart-select').forEach(b => b.classList.remove('active')); btnRef.classList.add('active'); }
    const cutoffDate = new Date(); cutoffDate.setDate(cutoffDate.getDate() - currentChartDays);
    const dateStr = cutoffDate.toISOString().split('T')[0];
    const { data } = await supabaseClient.from(tableName).select('*').eq('user_id', currentUser.id).gte('date', dateStr).order('date', { ascending: true });
    if (!data) return;
    const labels = data.map(d => new Date(d.date).toLocaleDateString(undefined, {month:'short', day:'numeric'}));
    let dataset = [];
    const ctx = document.getElementById('healthChart').getContext('2d');
    let gradient = ctx.createLinearGradient(0, 0, 0, 400); gradient.addColorStop(0, 'rgba(46, 204, 113, 0.2)'); gradient.addColorStop(1, 'rgba(46, 204, 113, 0)');
    if (tableName === 'bp_logs') { dataset = [ { label: 'Systolic', data: data.map(d => d.systolic), borderColor: '#dc2626', tension: 0.4 }, { label: 'Diastolic', data: data.map(d => d.diastolic), borderColor: '#2563eb', tension: 0.4 } ]; } 
    else { 
        let key = tableName === 'glucose_logs' ? 'level' : (tableName === 'temp_logs' ? 'temperature' : 'weight'); 
        dataset = [{ label: key.toUpperCase(), data: data.map(d => d[key]), borderColor: '#2ecc71', backgroundColor: gradient, borderWidth: 3, tension: 0.4, fill: true }]; 
    }
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: dataset }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { borderDash: [5, 5] } } } } });
}

async function loadHistory() {
    const tables = ['weight_logs', 'bp_logs', 'glucose_logs', 'temp_logs']; let combined = [];
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
            let valStr = item.type === 'bp_logs' ? `${item.systolic}/${item.diastolic}` : (item.weight || item.level || item.temperature); 
            tbody.innerHTML += `
                <tr>
                    <td>${item.date}</td>
                    <td>${item.type.replace('_logs','').toUpperCase()}</td>
                    <td>${valStr}</td>
                    <td>
                        <button class="action-btn" onclick="editEntry('${item.type}', '${item.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn delete" onclick="deleteEntry('${item.type}', '${item.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>`; 
        }); 
    }
}

async function deleteEntry(table, id) {
    if(confirm("Are you sure you want to delete this record? This cannot be undone.")) {
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if(error) {
            alert("Error deleting: " + error.message);
        } else {
            loadDashboardData();
        }
    }
}

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
    const banner = document.getElementById('insight-banner');
    const text = document.getElementById('insight-text');
    const icon = banner.querySelector('.insight-icon');
    
    banner.style.display = 'none'; // Reset

    try {
        const { data: weightData } = await supabaseClient.from('weight_logs').select('weight').eq('user_id', currentUser.id).order('date', {ascending:false}).limit(1);
        const meta = currentUser.user_metadata || {};
        
        if (meta.height && weightData && weightData.length > 0) {
            const h_m = meta.height / 100;
            const w_kg = weightData[0].weight;
            const bmi = (w_kg / (h_m * h_m)).toFixed(1);
            
            let bmiMsg = `Your BMI is ${bmi} (Normal).`;
            let bmiColor = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)';

            if (bmi >= 25 && bmi < 30) { 
                bmiMsg = `Your BMI is ${bmi} (Overweight). Consider a balanced diet.`;
                bmiColor = 'linear-gradient(135deg, #fceabb 0%, #f8b500 100%)'; 
            } else if (bmi >= 30) {
                bmiMsg = `Your BMI is ${bmi} (Obese). Please consult a doctor.`;
                bmiColor = 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)'; 
            }

            banner.style.background = bmiColor;
            text.textContent = bmiMsg;
            icon.className = "fa-solid fa-weight-scale insight-icon";
            banner.style.display = 'flex';
            return; 
        }

        const { data: glData } = await supabaseClient.from('glucose_logs').select('*').eq('user_id', currentUser.id).order('date', {ascending:false}).limit(1);
        if(glData && glData.length > 0) {
            const g = glData[0];
            if(g.test_type === 'Fasting' && g.level > 100) { 
                banner.style.background = 'linear-gradient(135deg, #fceabb 0%, #f8b500 100%)';
                text.textContent = `Fasting glucose (${g.level}) is high. Monitor carb intake.`;
                icon.className = "fa-solid fa-droplet insight-icon";
                banner.style.display = 'flex';
                return;
            }
        }

        const { data: bpData } = await supabaseClient.from('bp_logs').select('*').eq('user_id', currentUser.id).order('date', {ascending:false}).limit(1);
        
        if(bpData && bpData.length > 0) {
            const last = bpData[0];
            const sys = last.systolic;
            const dia = last.diastolic;
            const bpCard = document.getElementById('alert-bp-card');
            const bpTitle = document.getElementById('alert-bp-title');
            const bpText = document.getElementById('alert-bp-text');
            const bpIcon = document.getElementById('alert-bp-icon');
            
            let status = "Normal";
            let message = "Great job! Your BP is within the healthy range.";
            let colorClass = "alert-green";
            let iconHtml = '<i class="fa-solid fa-check"></i>';
            let bannerBg = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'; 

            if (sys > 180 || dia > 120) {
                status = "Hypertensive Crisis";
                message = "WARNING: Hypertensive Crisis. Consult a doctor immediately.";
                colorClass = "alert-red";
                iconHtml = '<i class="fa-solid fa-truck-medical"></i>';
                bannerBg = 'linear-gradient(135deg, #cb2d3e 0%, #ef473a 100%)'; 
            } else if (sys >= 140 || dia >= 90) {
                status = "Hypertension Stage 2";
                message = "Stage 2 Hypertension detected. Please monitor closely.";
                colorClass = "alert-red";
                iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';
                bannerBg = 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)'; 
            } else if ((sys >= 130 && sys <= 139) || (dia >= 80 && dia <= 89)) {
                status = "Hypertension Stage 1";
                message = "Stage 1 Hypertension. Lifestyle changes recommended.";
                colorClass = "alert-yellow";
                iconHtml = '<i class="fa-solid fa-circle-exclamation"></i>';
                bannerBg = 'linear-gradient(135deg, #fceabb 0%, #f8b500 100%)'; 
            } else if (sys >= 120 && sys <= 129 && dia < 80) {
                status = "Elevated";
                message = "Blood Pressure is Elevated.";
                colorClass = "alert-yellow";
                iconHtml = '<i class="fa-solid fa-arrow-trend-up"></i>';
                bannerBg = 'linear-gradient(135deg, #fceabb 0%, #f8b500 100%)'; 
            } else if (sys < 90 || dia < 60) {
                status = "Hypotension";
                message = "Low Blood Pressure detected.";
                colorClass = "alert-yellow";
                iconHtml = '<i class="fa-solid fa-arrow-trend-down"></i>';
                bannerBg = 'linear-gradient(135deg, #56ab2f 0%, #a8e063 100%)'; 
            }

            if(bpCard) {
                bpCard.className = `alert-item ${colorClass}`;
                bpTitle.textContent = status;
                bpText.textContent = `Last reading: ${sys}/${dia}`;
                
                let bgClass = "bg-green-500";
                if(colorClass === "alert-red") bgClass = "bg-red-500";
                if(colorClass === "alert-yellow") bgClass = "bg-yellow-500";
                
                bpIcon.className = `alert-icon ${bgClass} text-white`;
                bpIcon.innerHTML = iconHtml;
            }

            text.textContent = message;
            banner.style.background = bannerBg;
            if(status === "Normal") icon.className = "fa-solid fa-thumbs-up insight-icon";
            else icon.className = "fa-solid fa-heart-pulse insight-icon";
            
            banner.style.display = 'flex';

        } else {
             banner.style.display = 'flex';
             banner.style.background = 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'; 
             text.textContent = "Welcome! Start logging your health metrics to see insights.";
        }
    } catch(e) { console.error(e); }
    
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

function loadProfileSettings() {
    if(!currentUser) return;
    document.getElementById('settings-email').value = currentUser.email;
    
    const meta = currentUser.user_metadata || {};
    
    if(meta.full_name) document.getElementById('settings-fullname').value = meta.full_name;
    if(meta.phone) document.getElementById('settings-phone').value = meta.phone;
    if(meta.dob) document.getElementById('settings-dob').value = meta.dob;
    
    if(meta.address) document.getElementById('settings-address-street').value = meta.address;
    if(meta.city) document.getElementById('settings-address-city').value = meta.city;
    if(meta.state) document.getElementById('settings-address-state').value = meta.state;
    if(meta.zip) document.getElementById('settings-address-zip').value = meta.zip;
    if(meta.country) document.getElementById('settings-address-country').value = meta.country;

    if(meta.blood_type) document.getElementById('settings-blood').value = meta.blood_type;
    if(meta.height) document.getElementById('settings-height').value = meta.height;
    if(meta.weight) document.getElementById('settings-weight').value = meta.weight;
    if(meta.allergies) document.getElementById('settings-allergies').value = meta.allergies;

    if(meta.em_name) document.getElementById('settings-em-name').value = meta.em_name;
    if(meta.em_rel) document.getElementById('settings-em-rel').value = meta.em_rel;
    if(meta.em_phone) document.getElementById('settings-em-phone').value = meta.em_phone;
    if(meta.em_email) document.getElementById('settings-em-email').value = meta.em_email;
    
    if(meta.dark_mode) {
        const toggle = document.getElementById('dark-mode-toggle');
        if(toggle && !toggle.classList.contains('checked')) {
            toggle.classList.add('checked');
            document.body.classList.add('dark-mode');
        }
    }

    updateWelcomeMessage();
    const headerName = document.getElementById('header-name');
    const headerEmail = document.getElementById('header-email');
    const headerDetails = document.getElementById('header-details');
    
    if(headerName) headerName.textContent = meta.full_name || "User";
    if(headerEmail) headerEmail.textContent = currentUser.email;
    if(headerDetails) headerDetails.textContent = `${meta.phone || ''} ${meta.dob ? '• Born: ' + meta.dob : ''}`;

    updateAvatarUI(meta.avatar_url);
}

async function handleSave(tableName, dataObj, idField) { const id = document.getElementById(idField).value; dataObj.user_id = currentUser.id; if(id) return (await supabaseClient.from(tableName).update(dataObj).eq('id', id)).error; return (await supabaseClient.from(tableName).insert([dataObj])).error; }
document.getElementById('weight-form').addEventListener('submit', async (e) => { e.preventDefault(); finalizeForm(await handleSave('weight_logs', { weight: document.getElementById('weight-val').value, unit: 'kg', date: document.getElementById('weight-date').value }, 'weight-id'), 'weight-success', 'weight-error'); });
document.getElementById('bp-form').addEventListener('submit', async (e) => { e.preventDefault(); const p = document.getElementById('bp-pulse').value; finalizeForm(await handleSave('bp_logs', { systolic: document.getElementById('bp-sys').value, diastolic: document.getElementById('bp-dia').value, pulse: p?parseInt(p):null, date: document.getElementById('bp-date').value }, 'bp-id'), 'bp-success', 'bp-error'); });
document.getElementById('temp-form').addEventListener('submit', async (e) => { e.preventDefault(); finalizeForm(await handleSave('temp_logs', { temperature: document.getElementById('temp-val').value, unit: 'C', date: document.getElementById('temp-date').value }, 'temp-id'), 'temp-success', 'temp-error'); });
document.getElementById('gluc-form').addEventListener('submit', async (e) => { e.preventDefault(); finalizeForm(await handleSave('glucose_logs', { test_type: document.getElementById('gluc-type').value, level: document.getElementById('gluc-val').value, date: document.getElementById('gluc-date').value }, 'gluc-id'), 'gluc-success', 'gluc-error'); });

function finalizeForm(error, succId, errId) { if(error) { document.getElementById(errId).textContent = error.message; document.getElementById(errId).style.display = 'block'; } else { document.getElementById(succId).textContent = "Saved Successfully!"; document.getElementById(succId).style.display = 'block'; loadDashboardData(); setTimeout(closeModals, 1000); } }
function closeModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); document.querySelectorAll('.error-msg, .success-msg').forEach(e => e.style.display = 'none'); document.querySelectorAll('form').forEach(f => f.reset()); resetDates(); }
function openModal(n) { 
    if(n === 'reports') loadReportPreview();
    if(n === 'booking') loadDoctorsForBooking();
    const m = document.getElementById(n + '-modal'); if(m) m.classList.add('active'); 
    if(n.startsWith('log-')) { const idIn = m.querySelector('input[type=hidden]'); if(idIn && idIn.id.endsWith('-id')) idIn.value=''; }
}
function toggleUnit(type) { const s = document.getElementById(type + '-slider'); const k = document.getElementById(type + '-unit'); const isK = k.value === 'kg'; s.style.transform = isK ? 'translateX(100%)' : 'translateX(0)'; k.value = isK ? 'lbs' : 'kg'; }
window.onclick = function(e) { if(e.target.classList.contains('modal-overlay')) closeModals(); }

function handleFileUpload(input) { const f = input.files[0]; if(f) { const r = new FileReader(); r.onload = async function(e) { updateAvatarUI(e.target.result); await supabaseClient.auth.updateUser({data:{avatar_url:e.target.result}}); }; r.readAsDataURL(f); } }
function searchAppointments() { 
    const query = document.getElementById('appt-search').value.toLowerCase();
    const filtered = allAppointments.filter(a => 
        a.doctor_name.toLowerCase().includes(query) || 
        a.specialty.toLowerCase().includes(query)
    );
    const now = new Date();
    const future = filtered.filter(a => new Date(a.appointment_date) >= now);
    renderDetailedList(document.getElementById('detailed-appointment-list'), future);
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
        const row = `<tr><td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;">${item.date}</td><td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;">${metricName}</td><td style="padding: 0.75rem; border-bottom: 1px solid #f3f4f6;">${valStr}</td>
        <td>
            <button class="action-btn" onclick="editEntry('${item.type}', '${item.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
            <button class="action-btn delete" onclick="deleteEntry('${item.type}', '${item.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </td></tr>`;
        tbody.innerHTML += row;
    });
}
async function editEntry(table, id) {
    const { data } = await supabaseClient.from(table).select('*').eq('id', id).single();
    if(!data) return;
    if(table === 'weight_logs') { document.getElementById('weight-id').value = id; document.getElementById('weight-val').value = data.weight; document.getElementById('weight-date').value = data.date; document.getElementById('weight-modal-title').textContent = "Update Weight"; document.getElementById('weight-btn').textContent = "Update"; openModal('log-weight'); }
    else if(table === 'bp_logs') { document.getElementById('bp-id').value = id; document.getElementById('bp-sys').value = data.systolic; document.getElementById('bp-dia').value = data.diastolic; document.getElementById('bp-pulse').value = data.pulse; document.getElementById('bp-date').value = data.date; document.getElementById('bp-modal-title').textContent = "Update BP"; document.getElementById('bp-btn').textContent = "Update"; openModal('log-bp'); }
    else if(table === 'glucose_logs') { document.getElementById('gluc-id').value = id; document.getElementById('gluc-val').value = data.level; document.getElementById('gluc-type').value = data.test_type; document.getElementById('gluc-date').value = data.date; document.getElementById('gluc-modal-title').textContent = "Update Glucose"; document.getElementById('gluc-btn').textContent = "Update"; openModal('log-glucose'); }
    else if(table === 'temp_logs') { document.getElementById('temp-id').value = id; document.getElementById('temp-val').value = data.temperature; document.getElementById('temp-date').value = data.date; document.getElementById('temp-modal-title').textContent = "Update Temp"; document.getElementById('temp-btn').textContent = "Update"; openModal('log-temp'); }
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
function setReminder(e) { e.preventDefault(); document.getElementById('remind-success').textContent="Reminder Set!"; document.getElementById('remind-success').style.display='block'; }
function saveSettings() { alert("Settings saved!"); }

// --- DOCTOR LOGIC ---

async function toggleDoctorStatus(el) {
    if(!currentUser) return;
    const isChecked = el.classList.toggle('checked');
    const statusText = document.getElementById('doctor-status-text');
    
    statusText.textContent = isChecked ? "Online" : "Offline";
    statusText.className = isChecked ? "text-xs ml-2 text-green-500" : "text-xs ml-2 text-gray-500";

    const { error } = await supabaseClient.from('doctor_profiles').upsert({
        id: currentUser.id,
        is_online: isChecked,
        updated_at: new Date()
    });
    if(error) console.error("Status Update Error", error);
}

const defaultSchedule = {
    "Mon": { active: true, start: "09:00", end: "17:00" },
    "Tue": { active: true, start: "09:00", end: "17:00" },
    "Wed": { active: true, start: "09:00", end: "17:00" },
    "Thu": { active: true, start: "09:00", end: "17:00" },
    "Fri": { active: true, start: "09:00", end: "17:00" },
    "Sat": { active: false, start: "10:00", end: "14:00" },
    "Sun": { active: false, start: "", end: "" }
};

function renderScheduleGrid(savedSchedule) {
    const container = document.getElementById('doctor-schedule-container');
    if(!container) return;
    container.innerHTML = '';
    
    const schedule = savedSchedule || defaultSchedule;
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    days.forEach(day => {
        const data = schedule[day] || defaultSchedule[day];
        const isChecked = data.active ? 'checked' : '';
        
        const row = `
            <div class="schedule-row" id="row-${day}">
                <span class="schedule-day">${day}</span>
                <input type="time" class="schedule-time" value="${data.start}" ${!data.active ? 'disabled' : ''}>
                <input type="time" class="schedule-time" value="${data.end}" ${!data.active ? 'disabled' : ''}>
                <div class="schedule-toggle">
                    <div class="toggle-switch ${isChecked}" onclick="toggleScheduleRow(this, '${day}')">
                        <div class="toggle-thumb"></div>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += row;
    });
}

function toggleScheduleRow(el, day) {
    el.classList.toggle('checked');
    const isActive = el.classList.contains('checked');
    const row = document.getElementById('row-' + day);
    const inputs = row.querySelectorAll('input');
    inputs.forEach(inp => inp.disabled = !isActive);
}

async function saveDoctorSettings() {
    const fullName = (currentUser.user_metadata && currentUser.user_metadata.full_name) || "Doctor";
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let schedule = {};

    days.forEach(day => {
        const row = document.getElementById('row-' + day);
        const inputs = row.querySelectorAll('input');
        const toggle = row.querySelector('.toggle-switch');
        
        schedule[day] = {
            active: toggle.classList.contains('checked'),
            start: inputs[0].value,
            end: inputs[1].value
        };
    });

    const { error } = await supabaseClient.from('doctor_profiles').upsert({
        id: currentUser.id,
        schedule: schedule,
        full_name: fullName
    });
    
    if(!error) alert("Settings & Schedule Saved!");
    else alert("Error: " + error.message);
}

async function loadDoctorStatus() {
    const { data } = await supabaseClient.from('doctor_profiles').select('*').eq('id', currentUser.id).single();
    if(data) {
        const toggle = document.getElementById('doctor-status-toggle');
        const statusText = document.getElementById('doctor-status-text');
        if(data.is_online) {
            toggle.classList.add('checked');
            statusText.textContent = "Online";
            statusText.className = "text-xs ml-2 text-green-500";
        } else {
            toggle.classList.remove('checked');
            statusText.textContent = "Offline";
            statusText.className = "text-xs ml-2 text-gray-500";
        }
        renderScheduleGrid(data.schedule);
    } else {
        renderScheduleGrid(defaultSchedule);
    }
}

async function loadDoctorsForBooking() {
    const container = document.getElementById('doctor-list-container');
    container.innerHTML = '<div class="loading-cell text-sm">Loading doctors...</div>';
    
    const { data: doctors, error } = await supabaseClient.from('doctor_profiles').select('*');
    
    if(error || !doctors || doctors.length === 0) {
        container.innerHTML = '<p class="text-center-muted">No doctors found.</p>';
        return;
    }

    container.innerHTML = '';
    doctors.forEach(doc => {
        const statusBadge = doc.is_online 
            ? '<span class="text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full font-bold">Online</span>'
            : '<span class="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-bold">Offline</span>';
        
        const safeSchedule = doc.schedule ? encodeURIComponent(JSON.stringify(doc.schedule)) : "";

        const card = `
            <div class="card p-3 flex justify-between items-center cursor-pointer hover:shadow-md transition-all" onclick="openScheduleForm('${doc.id}', '${doc.full_name}', '${safeSchedule}')">
                <div class="flex gap-3 items-center">
                    <div class="doctor-avatar bg-gray-200 text-gray-600" style="width:40px;height:40px;font-size:0.9rem;">${getInitials(doc.full_name || 'Dr')}</div>
                    <div>
                        <h4 class="font-bold text-sm">${doc.full_name || 'Doctor'}</h4>
                        <p class="text-xs text-gray-500">${doc.specialty || 'General'}</p>
                    </div>
                </div>
                ${statusBadge}
            </div>
        `;
        container.innerHTML += card;
    });
}

function openScheduleForm(docId, docName, encodedSchedule) {
    closeModals(); 
    document.getElementById('schedule-appointment-modal').classList.add('active');
    document.getElementById('schedule-doc-name').textContent = "With " + docName;
    document.getElementById('schedule-doc-id').value = docId;
    
    if(encodedSchedule) {
        document.getElementById('schedule-doc-json').value = decodeURIComponent(encodedSchedule);
    } else {
        document.getElementById('schedule-doc-json').value = ""; 
    }
    
    document.getElementById('schedule-date').value = "";
    document.getElementById('schedule-time').value = "";
    document.getElementById('schedule-time').disabled = true;
    document.getElementById('schedule-error').style.display = 'none';
    document.getElementById('schedule-success').style.display = 'none';
    document.getElementById('schedule-time-hint').style.display = 'none';
}

function validateDoctorSchedule() {
    const dateInput = document.getElementById('schedule-date');
    const timeInput = document.getElementById('schedule-time');
    const hintText = document.getElementById('schedule-time-hint');
    const scheduleJson = document.getElementById('schedule-doc-json').value;

    if (!dateInput.value) return;

    const date = new Date(dateInput.value);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = days[date.getDay()];

    let isAvailable = false;
    let start = "09:00";
    let end = "17:00";

    if (scheduleJson) {
        const schedule = JSON.parse(scheduleJson);
        const dayConfig = schedule[dayName];
        
        if (dayConfig && dayConfig.active) {
            isAvailable = true;
            start = dayConfig.start;
            end = dayConfig.end;
        }
    } else {
        if (dayName !== "Sat" && dayName !== "Sun") isAvailable = true;
    }

    if (isAvailable) {
        timeInput.disabled = false;
        timeInput.min = start;
        timeInput.max = end;
        hintText.style.display = 'none';
        hintText.textContent = "";
    } else {
        timeInput.disabled = true;
        timeInput.value = "";
        hintText.style.display = 'block';
        hintText.textContent = `Doctor is not available on ${dayName}s.`;
    }
}

// 4. Submit Appointment (Saves to DB)
document.getElementById('schedule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const docId = document.getElementById('schedule-doc-id').value;
    const date = document.getElementById('schedule-date').value;
    const time = document.getElementById('schedule-time').value;
    const type = document.getElementById('schedule-type').value;
    
    // FIX 2: Check for Method drop-down value, fallback to default if missing
    const methodEl = document.getElementById('schedule-method');
    const method = methodEl ? methodEl.value : 'In-Person'; 
    
    const patientName = (currentUser.user_metadata && currentUser.user_metadata.full_name) || "Patient";

    // FIX 2 & 3: Combine Method and Reason (e.g. "Audio Consultation • General Checkup")
    const combinedType = `${method} • ${type}`;

    // FIX 5: Convert local time specifically to ISO String to prevent timezone shifting
    const localDateTime = new Date(`${date}T${time}`);
    const fullDateTime = localDateTime.toISOString();

    const { error } = await supabaseClient.from('appointments').insert({
        user_id: currentUser.id,
        doctor_id: docId, 
        doctor_name: document.getElementById('schedule-doc-name').textContent.replace('With ', ''), 
        patient_name: patientName, 
        appointment_date: fullDateTime,
        type: combinedType, 
        status: 'pending',
        specialty: 'General' 
    });

    if (error) {
        document.getElementById('schedule-error').textContent = error.message;
        document.getElementById('schedule-error').style.display = 'block';
    } else {
        document.getElementById('schedule-success').textContent = "Appointment Scheduled!";
        document.getElementById('schedule-success').style.display = 'block';
        setTimeout(() => {
            closeModals();
            loadAppointments(); // Refresh Dashboard
        }, 1500);
    }
});

// Helper to render specific sections (Doctor View)
function renderDocSection(containerId, data, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    if (data.length === 0) {
        container.innerHTML = `<p class="text-xs text-gray-400 italic">No ${type} appointments.</p>`;
        return;
    }

    data.forEach(a => {
        const dateObj = new Date(a.appointment_date);
        const dateStr = dateObj.toLocaleDateString();
        const timeStr = dateObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        const displayName = a.patient_name || "Patient";
        const initials = getInitials(displayName);

        let actions = '';
        let badgeColor = 'bg-gray-100 text-gray-500';

        if (type === 'pending') {
            badgeColor = 'bg-yellow-100 text-yellow-700';
            actions = `
                <div class="flex gap-2">
                    <button class="btn-sm bg-green-500 text-white border-none" onclick="updateAppointmentStatus('${a.id}', 'Confirmed')">
                        <i class="fa-solid fa-check"></i> Accept
                    </button>
                    <button class="btn-sm bg-gray-100 text-gray-600 border border-gray-200" onclick="updateAppointmentStatus('${a.id}', 'cancelled')">
                        <i class="fa-solid fa-xmark"></i> Decline
                    </button>
                </div>
            `;
        } else if (type === 'upcoming') {
            badgeColor = 'bg-green-100 text-green-700';
            
            // Fix 3: Handle Audio and Video Buttons dynamically
            let actionBtn = '';
            if(a.type.toLowerCase().includes('video')) {
                actionBtn = `<button class="btn-sm bg-blue-500 text-white border-none" onclick="startVideoCall('${a.id}')"><i class="fa-solid fa-video"></i> Start Call</button>`;
            } else if(a.type.toLowerCase().includes('audio')) {
                actionBtn = `<button class="btn-sm bg-purple-500 text-white border-none" onclick="startVideoCall('${a.id}')"><i class="fa-solid fa-phone"></i> Audio Call</button>`;
            }
            
            actions = `
                <div class="flex gap-2">
                    ${actionBtn}
                    <button class="btn-sm bg-white text-green-600 border border-green-500" onclick="updateAppointmentStatus('${a.id}', 'completed')">
                        <i class="fa-solid fa-check-double"></i> Complete
                    </button>
                </div>
            `;
        } else {
            // Past
            if(a.status === 'completed') badgeColor = 'bg-blue-100 text-blue-700';
            else if(a.status === 'cancelled') badgeColor = 'bg-red-100 text-red-700';
            
            actions = `<span class="text-xs text-gray-400 font-medium">${a.status.toUpperCase()}</span>`;
        }

        const html = `
            <div class="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-100 hover:shadow-sm transition-all">
                <div class="flex items-center gap-3">
                    <div class="profile-pic" style="width:40px;height:40px; font-size:0.8rem; background:#f3f4f6; color:#555;">${initials}</div>
                    <div>
                        <h4 class="font-bold text-sm text-gray-800">${displayName}</h4>
                        <div class="flex gap-3 text-xs text-gray-500 mt-1">
                            <span><i class="fa-regular fa-calendar"></i> ${dateStr}</span>
                            <span><i class="fa-regular fa-clock"></i> ${timeStr}</span>
                            <span>${a.type}</span>
                        </div>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badgeColor}">${a.status}</span>
                    ${actions}
                </div>
            </div>
        `;
        container.innerHTML += html;
    });
}

async function updateAppointmentStatus(id, newStatus) {
    if(!confirm(`Are you sure you want to mark this appointment as ${newStatus}?`)) return;

    const { data, error } = await supabaseClient
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', id)
        .select(); 

    if(error) {
        alert("Database Error: " + error.message);
    } else if (data.length === 0) {
        alert("Update Failed: You do not have permission to modify this appointment. Please check your Supabase RLS policies.");
    } else {
        await loadDoctorAppointmentsTab(); 
        await loadDoctorDashboardData(); 
    }
}
// --- VIDEO CALL FUNCTION (Jitsi) ---
let jitsiApi = null;

function startVideoCall(appointmentId) {
    // Show modal
    document.getElementById('video-modal').classList.add('active');

    const domain = "meet.jit.si";
    
    // Safety check for user name to prevent initialization crashes
    const userName = (currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name) 
        ? currentUser.user_metadata.full_name 
        : "Instadoc User";

    const options = {
        roomName: "Instadoc-Consult-" + appointmentId,
        width: "100%",
        height: "100%",
        parentNode: document.querySelector('#jitsi-container'),
        userInfo: {
            displayName: userName
        },
        configOverwrite: {
            startWithAudioMuted: false,
            disableDeepLinking: true,
            prejoinPageEnabled: false
        },
        interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [
                'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
                'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
                'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
                'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts',
                'tileview', 'videobackgroundblur', 'download', 'help', 'mute-everyone',
                'security'
            ],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false
        }
    };

    // Dispose previous instance if any
    if (jitsiApi) {
        jitsiApi.dispose();
    }

    try {
        jitsiApi = new JitsiMeetExternalAPI(domain, options);
        
        jitsiApi.addEventListeners({
            videoConferenceLeft: function () {
                closeVideoCall();
            }
        });
    } catch (err) {
        console.error("Failed to initialize Jitsi:", err);
        alert("Could not start the video call. Please check your internet connection and try again.");
        closeVideoCall();
    }
}

function closeVideoCall() {
    if (jitsiApi) {
        jitsiApi.dispose();
        jitsiApi = null;
    }
    document.getElementById('video-modal').classList.remove('active');
    document.querySelector('#jitsi-container').innerHTML = "";
}