// Application State
let appState = {
    currentPage: 'landing',
    userProfile: null,
    workoutRoutine: null,
    workoutSession: null,
    // Gamification (XP & level)
    gamification: {
        xp: 0,
        level: 1
    },
    chatMessages: [],
    workoutProgress: {
        completedWorkouts: 0,
        streak: 0
    }
};

// Timer state for workout session
let timerState = {
    seconds: 0,
    isRunning: false,
    interval: null
};

// Initialize Lucide icons when page loads
document.addEventListener('DOMContentLoaded', function() {
    lucide.createIcons();
    initializeApp();
});

// Firebase detection flags
const hasFirebase = (typeof firebase !== 'undefined' && firebase.apps && (firebase.apps.length > 0));
let firebaseAuth = null;
let firebaseDB = null;
if (hasFirebase) {
    try {
        firebaseAuth = firebase.auth();
        firebaseDB = firebase.firestore();
    } catch (e) {
        console.warn('Firebase modules not available:', e);
    }
}

// Initialize the application
function initializeApp() {
    // Diagnostic: check localStorage availability and log startup state (temporary)
    try {
        localStorage.setItem('__ft_storage_test', '1');
        localStorage.removeItem('__ft_storage_test');
    } catch (err) {
        console.error('LocalStorage unavailable during initializeApp:', err);
    }

    // Check if user data exists in localStorage
    const savedProfile = loadFromLocalStorage('userProfile');
    const savedRoutine = loadFromLocalStorage('workoutRoutine');
    const savedProgress = loadFromLocalStorage('workoutProgress');
    const savedGamification = loadFromLocalStorage('gamification');

    console.info('initializeApp start', {
        hasFirebase: !!hasFirebase,
        firebaseAuthPresent: !!firebaseAuth,
        savedProfileExists: !!savedProfile,
        savedRoutineExists: !!savedRoutine,
        savedGamificationExists: !!savedGamification
    });

    if (savedProfile) {
        appState.userProfile = savedProfile;
    }

    if (savedRoutine) {
        appState.workoutRoutine = savedRoutine;
    }

    if (savedProgress) {
        appState.workoutProgress = savedProgress;
    }
    // Restore gamification (XP/level) from local cache if present
    if (savedGamification) {
        appState.gamification = savedGamification;
    }
    
    // If Firebase is present, wait briefly for auth state to resolve so we don't flash
    // the login/landing UI while Firebase restores the session. If Firebase isn't
    // configured, fall back to using localStorage to determine the initial page.
    let authStateHandled = false;

    const fallbackNavigation = () => {
        // If already handled by auth state, don't run fallback
        if (authStateHandled) return;
        authStateHandled = true;
        if (appState.userProfile) {
            updateProfileUI();
            if (appState.userProfile.age === 0 || appState.userProfile.height === 0) {
                navigateToProfile();
            } else if (appState.workoutRoutine) {
                navigateToDashboard();
            } else {
                navigateToDashboard();
            }
        } else {
            navigateToLanding();
        }
    };

    if (firebaseAuth) {
        // we will rely on onAuthStateChanged below to handle navigation when available
        // but ensure we still fall back after a short delay if the event doesn't fire.
        setTimeout(fallbackNavigation, 900);
    } else {
        // No Firebase: immediately decide based on localStorage
        fallbackNavigation();
    }

    // dashboard username wiring moved to navigateToDashboard() so it's only active when dashboard is shown

    // If Firebase is configured and user is signed in, load their data from Firestore
    if (firebaseAuth) {
        // Ensure auth persistence is set to local so sessions survive reloads when Firebase is used
        try {
            if (firebaseAuth.setPersistence && firebase && firebase.auth && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
                firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
            }
        } catch (err) {
            // non-fatal — continue
            console.debug('Could not set Firebase auth persistence:', err);
        }

        // Wrap onAuthStateChanged to avoid racing with local navigation
        firebaseAuth.onAuthStateChanged(async (user) => {
            // mark that auth state callback ran
            try { window.__ft_auth_state_handled = true; } catch (e) {}

            if (user) {
                // load user data from Firestore
                try {
                    const doc = await firebaseDB.collection('users').doc(user.uid).get();
                    if (doc.exists) {
                        const data = doc.data();
                        // merge server data into appState (prefer server values)
                        appState.userProfile = data.userProfile || appState.userProfile;
                        appState.workoutRoutine = data.workoutRoutine || appState.workoutRoutine;
                        appState.workoutProgress = data.workoutProgress || appState.workoutProgress;

                        // persist locally as cache
                        try { localStorage.setItem('userProfile', JSON.stringify(appState.userProfile)); } catch(e){}
                        try { localStorage.setItem('workoutRoutine', JSON.stringify(appState.workoutRoutine)); } catch(e){}
                        try { localStorage.setItem('workoutProgress', JSON.stringify(appState.workoutProgress)); } catch(e){}

                        // update UI and navigate appropriately
                        updateProfileUI();
                        if (appState.userProfile && (appState.userProfile.age === 0 || appState.userProfile.height === 0)) {
                            navigateToProfile();
                        } else if (appState.workoutRoutine) {
                            navigateToDashboard();
                        } else {
                            navigateToDashboard();
                        }
                    } else {
                        // no server doc but user is signed in; prefer local cache
                        if (appState.userProfile) {
                            updateProfileUI();
                            navigateToDashboard();
                        }
                    }
                } catch (err) {
                    console.error('Error loading user document:', err);
                    // fallback to local cache if available
                    if (appState.userProfile) {
                        updateProfileUI();
                        navigateToDashboard();
                    }
                }
            } else {
                // No firebase user; don't forcibly navigate away if we have local profile
                if (appState.userProfile) {
                    updateProfileUI();
                    navigateToDashboard();
                }
            }
        });
    }

    // Update gamification UI from saved state
    try { updateGamificationUI(); } catch (e) {}

}

// Show profile view page and populate data
function showProfileView() {
    showPage('profile-view-page');
    appState.currentPage = 'profile-view';
    populateProfileView();
}

function populateProfileView() {
    const profile = appState.userProfile || loadFromLocalStorage('userProfile') || {};
    document.getElementById('view-name').textContent = profile.name || '-';
    document.getElementById('view-email').textContent = profile.email || '-';
    document.getElementById('view-age').textContent = profile.age || '-';
    document.getElementById('view-height').textContent = profile.height || '-';
    document.getElementById('view-experience').textContent = profile.experience || '-';
}

// Navigation Functions
function navigateToLanding() {
    showPage('landing-page');
    appState.currentPage = 'landing';
}

function navigateToAuth() {
    showPage('auth-page');
    appState.currentPage = 'auth';
    resetAuthForms();
}

function navigateToProfile() {
    showPage('profile-page');
    appState.currentPage = 'profile';
    if (appState.userProfile) {
        populateProfileForm();
    }

    // Populate email suggestion list from localStorage
    populateEmailSuggestions();
}

function navigateToRoutine() {
    showPage('routine-page');
    appState.currentPage = 'routine';
}

function navigateToDashboard() {
    showPage('dashboard-page');
    appState.currentPage = 'dashboard';
    updateDashboard();
    // Wire dashboard username to open profile view (attach once)
    // Username is display-only now; profile menu is opened via avatar button

    // Bind UI event listeners that rely on DOM elements being present
    bindUIEventListeners();
}

// Bind programmatic event listeners to avoid timing issues with inline onclicks
function bindUIEventListeners() {
    // Dashboard Edit/Randomize buttons (programmatic fallback)
    const editBtn = document.getElementById('edit-routine-btn');
    if (editBtn && !editBtn.dataset.bound) {
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openRoutineForEdit();
        });
        editBtn.dataset.bound = 'true';
    }

    const dashRand = document.getElementById('dashboard-randomize-btn');
    if (dashRand && !dashRand.dataset.bound) {
        dashRand.addEventListener('click', (e) => {
            e.preventDefault();
            // navigate to routine builder and ensure builder visible
            navigateToRoutine();
            // give a slight delay for page show then randomize and auto-complete
            setTimeout(() => randomizeRoutine(true), 150);
        });
        dashRand.dataset.bound = 'true';
    }

    // Profile button dropdown
    const profileBtn = document.getElementById('profile-btn');
    const profileMenu = document.getElementById('profile-menu');
    if (profileBtn && profileMenu && !profileBtn.dataset.bound) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const expanded = profileBtn.getAttribute('aria-expanded') === 'true';
            profileBtn.setAttribute('aria-expanded', (!expanded).toString());
            profileMenu.classList.toggle('hidden');
        });
        profileBtn.dataset.bound = 'true';
    }

    // Close profile menu when clicking elsewhere
    document.addEventListener('click', (e) => {
        const profileMenu = document.getElementById('profile-menu');
        const profileBtn = document.getElementById('profile-btn');
        if (!profileMenu || !profileBtn) return;
        if (!profileMenu.classList.contains('hidden')) {
            // if click outside menu and button, hide
            if (!profileMenu.contains(e.target) && !profileBtn.contains(e.target)) {
                profileMenu.classList.add('hidden');
                profileBtn.setAttribute('aria-expanded', 'false');
            }
        }
    });

    // Profile picture input
    const picInput = document.getElementById('profile-pic-input');
    if (picInput && !picInput.dataset.bound) {
        picInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(evt) {
                const dataUrl = evt.target.result;
                // set avatar in UI
                const avatar = document.getElementById('profile-avatar');
                const menuAvatar = document.getElementById('profile-menu-avatar');
                if (avatar) avatar.src = dataUrl;
                if (menuAvatar) menuAvatar.src = dataUrl;
                // persist in user profile (local only)
                appState.userProfile = appState.userProfile || {};
                appState.userProfile.photoDataUrl = dataUrl;
                try { localStorage.setItem('userProfile', JSON.stringify(appState.userProfile)); } catch (e) {}
                // If Firebase user exists, attempt to save to Firestore
                try { saveUserDataToFirestore(); } catch (e) { console.debug('save photo to firestore failed', e); }
            };
            reader.readAsDataURL(file);
        });
        picInput.dataset.bound = 'true';
    }

    // Also bind the visible dashboard Edit/Randomize buttons as fallback (in case markup uses them)
    const inlineEdit = document.querySelector('#dashboard-page .routine-overview button[onclick*="openRoutineForEdit"]');
    if (inlineEdit && !inlineEdit.dataset.bound) {
        inlineEdit.addEventListener('click', (e) => { e.preventDefault(); openRoutineForEdit(); });
        inlineEdit.dataset.bound = 'true';
    }
    const inlineRand = document.querySelector('#dashboard-page .routine-overview button[onclick*="randomizeRoutine"]');
    if (inlineRand && !inlineRand.dataset.bound) {
        inlineRand.addEventListener('click', (e) => { e.preventDefault(); navigateToRoutine(); setTimeout(() => randomizeRoutine(), 150); });
        inlineRand.dataset.bound = 'true';
    }

    // Update profile UI with any existing profile
    updateProfileUI();
}

function updateProfileUI() {
    const nameEl = document.getElementById('user-name');
    const menuName = document.getElementById('profile-menu-name');
    const menuEmail = document.getElementById('profile-menu-email');
    const avatar = document.getElementById('profile-avatar');
    const menuAvatar = document.getElementById('profile-menu-avatar');

    const profile = appState.userProfile || loadFromLocalStorage('userProfile') || {};
    if (profile.name) {
        if (nameEl) nameEl.textContent = `Welcome back, ${profile.name}!`;
        if (menuName) menuName.textContent = profile.name;
    }
    if (profile.email) {
        if (menuEmail) menuEmail.textContent = profile.email;
    }
    if (profile.photoDataUrl) {
        if (avatar) avatar.src = profile.photoDataUrl;
        if (menuAvatar) menuAvatar.src = profile.photoDataUrl;
    }
}

function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    const el = document.getElementById(pageId);
    if (!el) {
        console.warn(`showPage: element with id ${pageId} not found`);
        return;
    }
    el.classList.add('active');
    
    // Add to browser history and refresh Lucide icons for the new page
    try { addToHistory(pageId); } catch (e) { /* non-fatal */ }
    setTimeout(() => {
        lucide.createIcons();
    }, 100);
}

// Smooth scroll to features section
function scrollToFeatures() {
    document.getElementById('features').scrollIntoView({ 
        behavior: 'smooth' 
    });
}

// Smooth scroll to tips section
function scrollToTips() {
    document.querySelector('.tips-section').scrollIntoView({ 
        behavior: 'smooth' 
    });
}

// Auth Functions
function switchAuthTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.auth-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.auth-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tab}-form`).classList.add('active');
}

function resetAuthForms() {
    const ids = ['login-email','login-password','signup-name','signup-email','signup-password','confirm-password'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    // Reset to login tab
    switchAuthTab('login');
}

async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    setButtonLoading('login-btn', true);
    
    // If Firebase Auth is available, use it
    if (firebaseAuth) {
        try {
            const userCred = await firebaseAuth.signInWithEmailAndPassword(email, password);
            // load Firestore user doc
            const uid = userCred.user.uid;
            const doc = await firebaseDB.collection('users').doc(uid).get();
            let profile = { name: email, email };
            if (doc.exists) {
                const data = doc.data();
                profile = data.userProfile || profile;
                // load routine/progress if present
                if (data.workoutRoutine) appState.workoutRoutine = data.workoutRoutine;
                if (data.workoutProgress) appState.workoutProgress = data.workoutProgress;
            }
            // cache locally
            try { localStorage.setItem('userProfile', JSON.stringify(profile)); } catch(e){}
            try { localStorage.setItem('workoutRoutine', JSON.stringify(appState.workoutRoutine)); } catch(e){}
            try { localStorage.setItem('workoutProgress', JSON.stringify(appState.workoutProgress)); } catch(e){}
            setButtonLoading('login-btn', false);
            handleAuthSuccess(profile);
        } catch (err) {
            setButtonLoading('login-btn', false);
            alert('Login failed: ' + err.message);
        }
        return;
    }

    // Fallback: simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    const mockProfile = { name: 'John Doe', email: email, age: 25, height: 175, experience: 'intermediate' };
    setButtonLoading('login-btn', false);
    handleAuthSuccess(mockProfile);
}

async function handleSignup(event) {
    event.preventDefault();
    
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }
    
    setButtonLoading('signup-btn', true);

    if (firebaseAuth) {
        try {
            const userCred = await firebaseAuth.createUserWithEmailAndPassword(email, password);
            const uid = userCred.user.uid;
            // create user document
            const profile = { name, email, age: 0, height: 0, experience: 'beginner' };
            await firebaseDB.collection('users').doc(uid).set({ userProfile: profile });
            setButtonLoading('signup-btn', false);
            document.getElementById('verification-email').textContent = email;
            document.querySelectorAll('.auth-content').forEach(content => content.classList.remove('active'));
            document.getElementById('email-verification').classList.add('active');
        } catch (err) {
            setButtonLoading('signup-btn', false);
            alert('Signup failed: ' + err.message);
        }
        return;
    }

    // Fallback: simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    setButtonLoading('signup-btn', false);
    document.getElementById('verification-email').textContent = email;
    document.querySelectorAll('.auth-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById('email-verification').classList.add('active');
}

// Google Sign-In (Firebase compat)
async function handleGoogleSignIn() {
    if (!firebaseAuth || !firebaseDB) {
        alert('Google Sign-In not available (Firebase not configured).');
        return;
    }
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await firebaseAuth.signInWithPopup(provider);
        const user = result.user;
        const uid = user.uid;
        const docRef = firebaseDB.collection('users').doc(uid);
        const doc = await docRef.get();
        if (!doc.exists) {
            const profile = { name: user.displayName || user.email, email: user.email, age: 0, height: 0, experience: 'beginner' };
            await docRef.set({ userProfile: profile });
            handleAuthSuccess(profile);
                try { saveRecentEmail(profile.email); } catch (e) {}
        } else {
            const data = doc.data();
            appState.workoutRoutine = data.workoutRoutine || appState.workoutRoutine;
            appState.workoutProgress = data.workoutProgress || appState.workoutProgress;
            handleAuthSuccess(data.userProfile || { name: user.email, email: user.email });
                try { saveRecentEmail(user.email); } catch (e) {}
        }
    } catch (err) {
        console.error('Google Sign-In error', err);
        alert('Google Sign-In failed: ' + (err.message || err));
    }
}

function proceedAfterVerification() {
    const email = document.getElementById('verification-email').textContent;
    const name = document.getElementById('signup-name').value;
    
    const newProfile = {
        name: name,
        email: email,
        age: 0,
        height: 0,
        experience: 'beginner'
    };
    
    // If Firebase is configured, link the created profile to the signed-in user if present
    if (firebaseAuth && firebaseAuth.currentUser) {
        const uid = firebaseAuth.currentUser.uid;
        firebaseDB.collection('users').doc(uid).set({ userProfile: newProfile }, { merge: true })
            .then(() => handleAuthSuccess(newProfile))
            .catch(err => { console.error('Error saving profile:', err); handleAuthSuccess(newProfile); });
        return;
    }

    handleAuthSuccess(newProfile);
}

// Save recent email to localStorage (keep up to 10 unique recent emails)
function saveRecentEmail(email) {
    if (!email) return;
    try {
        const raw = localStorage.getItem('recentEmails');
        const arr = raw ? JSON.parse(raw) : [];
        // remove if exists
        const filtered = arr.filter(e => e !== email);
        filtered.unshift(email);
        const limited = filtered.slice(0, 10);
        localStorage.setItem('recentEmails', JSON.stringify(limited));
        populateEmailSuggestions();
    } catch (e) { console.error('saveRecentEmail error', e); }
}

function populateEmailSuggestions() {
    try {
        const raw = localStorage.getItem('recentEmails');
        const arr = raw ? JSON.parse(raw) : [];
        const datalist = document.getElementById('recent-emails');
        if (!datalist) return;
        datalist.innerHTML = '';
        arr.forEach(email => {
            const option = document.createElement('option');
            option.value = email;
            datalist.appendChild(option);
        });
    } catch (e) { console.error('populateEmailSuggestions error', e); }
}

function handleAuthSuccess(profile) {
    appState.userProfile = profile;
    localStorage.setItem('userProfile', JSON.stringify(profile));
    console.info('handleAuthSuccess: profile saved to localStorage', { profile });
    // save this email for suggestion convenience
    try { saveRecentEmail(profile.email); } catch (e) {}
    // If Firebase is present and user is signed in, save profile to Firestore
    if (firebaseAuth && firebaseAuth.currentUser) {
        const uid = firebaseAuth.currentUser.uid;
        firebaseDB.collection('users').doc(uid).set({ userProfile: profile }, { merge: true })
            .catch(err => console.error('Error saving profile to Firestore:', err));
    }
    
    // If profile is incomplete, go to profile setup
    if (profile.age === 0 || profile.height === 0) {
        navigateToProfile();
    } else if (!appState.workoutRoutine) {
        navigateToRoutine();
    } else {
        navigateToDashboard();
    }
    try { updateGamificationUI(); } catch (e) {}
}

function setButtonLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (!button) {
        console.warn(`setButtonLoading: button ${buttonId} not found`);
        return;
    }

    const text = button.querySelector('.btn-text');
    const spinner = button.querySelector('.btn-spinner');

    if (loading) {
        if (text) text.style.opacity = '0.5';
        if (spinner) spinner.classList.remove('hidden');
        button.disabled = true;
    } else {
        if (text) text.style.opacity = '1';
        if (spinner) spinner.classList.add('hidden');
        button.disabled = false;
    }
}

// Profile Setup Functions
function populateProfileForm() {
    if (appState.userProfile) {
        document.getElementById('profile-age').value = appState.userProfile.age || '';
        document.getElementById('profile-height').value = appState.userProfile.height || '';
        
        if (appState.userProfile.experience) {
            const experienceRadio = document.querySelector(`input[name="experience"][value="${appState.userProfile.experience}"]`);
            if (experienceRadio) {
                experienceRadio.checked = true;
            }
        }
    }
}

function handleProfileSubmit(event) {
    event.preventDefault();
    
    const age = parseInt(document.getElementById('profile-age').value);
    const height = parseInt(document.getElementById('profile-height').value);
    const experience = document.querySelector('input[name="experience"]:checked').value;
    
    appState.userProfile = {
        ...appState.userProfile,
        age: age,
        height: height,
        experience: experience
    };
    
    localStorage.setItem('userProfile', JSON.stringify(appState.userProfile));
    // persist profile to server if available
    try { saveUserDataToFirestore(); } catch (e) { /* non-fatal */ }
    
    if (!appState.workoutRoutine) {
        navigateToRoutine();
    } else {
        navigateToDashboard();
    }
}

// Routine Builder Functions
let selectedDays = 0;
let routineData = {};

function selectDays(days) {
    selectedDays = days;
    
    // Update button states
    document.querySelectorAll('.day-option').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.querySelector(`[data-days="${days}"]`).classList.add('selected');
    
    // Show routine builder
    buildRoutineInterface();
}

function buildRoutineInterface() {
    const builder = document.getElementById('routine-builder');
    builder.innerHTML = '';
    builder.classList.remove('hidden');
    
    const muscleGroups = [
        'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Cardio'
    ];
    
    const exercises = {
        'Chest': ['Push-ups', 'Bench Press', 'Dumbbell Flyes', 'Chest Dips'],
        'Back': ['Pull-ups', 'Lat Pulldowns', 'Rows', 'Deadlifts'],
        'Shoulders': ['Shoulder Press', 'Lateral Raises', 'Front Raises', 'Shrugs'],
        'Arms': ['Bicep Curls', 'Tricep Dips', 'Hammer Curls', 'Tricep Extensions'],
        'Legs': ['Squats', 'Lunges', 'Leg Press', 'Calf Raises'],
        'Core': ['Planks', 'Crunches', 'Russian Twists', 'Mountain Climbers'],
        'Cardio': ['Running', 'Cycling', 'Jump Rope', 'Burpees']
    };
    
    for (let i = 1; i <= selectedDays; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'routine-day';
        dayDiv.innerHTML = `
            <div style="background: white; border-radius: 1rem; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);">
                <h4 style="margin-bottom: 1rem; font-size: 1.125rem; font-weight: 600;">Day ${i}</h4>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Focus</label>
                    <select class="form-input" onchange="updateDayExercises(${i}, this.value)">
                        <option value="">Select muscle group</option>
                        ${muscleGroups.map(group => `<option value="${group}">${group}</option>`).join('')}
                    </select>
                </div>
                <div id="exercises-${i}" class="exercises-list"></div>
            </div>
        `;
        builder.appendChild(dayDiv);
    }
    
    document.getElementById('complete-routine').classList.remove('hidden');
    // show randomize button when builder is visible
    const randBtn = document.getElementById('randomize-routine');
    if (randBtn) randBtn.classList.remove('hidden');
}

// When user clicks to edit existing routine from dashboard
function openRoutineForEdit() {
    if (!appState.workoutRoutine) return navigateToRoutine();
    selectedDays = appState.workoutRoutine.daysPerWeek || 3;
    // highlight selected days button UI
    document.querySelectorAll('.day-option').forEach(btn => btn.classList.remove('selected'));
    const sel = document.querySelector(`[data-days="${selectedDays}"]`);
    if (sel) sel.classList.add('selected');
    buildRoutineInterface();
    // populate builder with existing routine
    try {
        populateRoutineFromState();
    } catch (err) {
        console.error('populateRoutineFromState failed:', err);
        alert('Could not load routine into the builder. Check console for details.');
    }
}

function populateRoutineFromState() {
    if (!appState.workoutRoutine || !appState.workoutRoutine.days) return;
    for (let i = 1; i <= selectedDays; i++) {
        const day = appState.workoutRoutine.days[i];
        if (!day) continue;
        // set muscle group select
        const select = document.querySelector(`#routine-builder select[onchange*="updateDayExercises(${i},"]`);
        if (select) select.value = day.muscleGroup;
        // trigger exercise population
        updateDayExercises(i, day.muscleGroup);
        // check matching exercise checkboxes immediately (markup created synchronously)
        const checkboxes = document.querySelectorAll(`#exercises-${i} input[type="checkbox"]`);
        checkboxes.forEach(cb => {
            if (day.exercises && day.exercises.includes(cb.value)) cb.checked = true;
        });
        // ensure routineData updated
        updateRoutineData(i, day.muscleGroup);
    }
}

// Randomize a routine according to experience and selected days
function randomizeRoutine(autoComplete = false) {
    const experience = (appState.userProfile && appState.userProfile.experience) || 'beginner';
    const days = selectedDays || 3;
    // ensure the builder is set to the desired days and UI is built
    try {
        selectDays(days);
    } catch (e) {
        // fallback: set selectedDays and build interface
        selectedDays = days;
        buildRoutineInterface();
    }
    // Use the same muscle groups as the routine builder so selects and exercises match
    const muscleGroups = ['Chest','Back','Shoulders','Arms','Legs','Core','Cardio'];
    const exercisesMap = {
        'Chest': ['Push-ups', 'Bench Press', 'Dumbbell Flyes', 'Chest Dips'],
        'Back': ['Pull-ups', 'Lat Pulldowns', 'Rows', 'Deadlifts'],
        'Shoulders': ['Shoulder Press', 'Lateral Raises', 'Front Raises', 'Shrugs'],
        'Arms': ['Bicep Curls', 'Tricep Dips', 'Hammer Curls', 'Tricep Extensions'],
        'Legs': ['Squats', 'Lunges', 'Leg Press', 'Calf Raises'],
        'Core': ['Planks', 'Crunches', 'Russian Twists', 'Mountain Climbers'],
        'Cardio': ['Running', 'Cycling', 'Jump Rope', 'Burpees']
    };

    // Pick muscle groups for the routine — rotate or shuffle for variety
    const routine = {};
    // create a shuffled copy of muscleGroups to vary selection
    const shuffled = [...muscleGroups];
    for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }

    for (let i = 1; i <= days; i++) {
        const focus = shuffled[(i - 1) % shuffled.length];
        // pick 3 exercises from the map for that focus
        const candidates = [...(exercisesMap[focus] || [])];
        for (let j = candidates.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [candidates[j], candidates[k]] = [candidates[k], candidates[j]];
        }
        routine[i] = { muscleGroup: focus, exercises: candidates.slice(0, 3) };
    }

    // set routineData and update UI
    routineData = {};
    for (let i=1;i<=days;i++) routineData[i] = { muscleGroup: routine[i].muscleGroup, exercises: routine[i].exercises };
    appState.workoutRoutine = { daysPerWeek: days, days: routine };
    // ensure selectedDays reflects the new routine
    selectedDays = days;
    try { localStorage.setItem('workoutRoutine', JSON.stringify(appState.workoutRoutine)); } catch (e) {}
    // populate UI immediately
    try {
        populateRoutineFromState();
        // If caller requested, finalize the routine automatically
        if (autoComplete) {
            // ensure routineData is up-to-date and then complete
            try { completeRoutine(); showToast('Randomized routine applied'); } catch (err) { console.error('auto-complete failed:', err); }
        }
    } catch (err) {
        console.error('populateRoutineFromState failed after randomize:', err);
        alert('Could not populate randomized routine into the builder. Check console for details.');
    }
}

function updateDayExercises(day, muscleGroup) {
    const exercisesDiv = document.getElementById(`exercises-${day}`);
    
    if (!muscleGroup) {
        exercisesDiv.innerHTML = '';
        return;
    }
    
    const exercises = {
        'Chest': ['Push-ups', 'Bench Press', 'Dumbbell Flyes', 'Chest Dips'],
        'Back': ['Pull-ups', 'Lat Pulldowns', 'Rows', 'Deadlifts'],
        'Shoulders': ['Shoulder Press', 'Lateral Raises', 'Front Raises', 'Shrugs'],
        'Arms': ['Bicep Curls', 'Tricep Dips', 'Hammer Curls', 'Tricep Extensions'],
        'Legs': ['Squats', 'Lunges', 'Leg Press', 'Calf Raises'],
        'Core': ['Planks', 'Crunches', 'Russian Twists', 'Mountain Climbers'],
        'Cardio': ['Running', 'Cycling', 'Jump Rope', 'Burpees']
    };
    
    const exerciseList = exercises[muscleGroup] || [];
    
    exercisesDiv.innerHTML = `
        <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Exercises</label>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem;">
            ${exerciseList.map(exercise => `
                <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border: 1px solid #e5e7eb; border-radius: 0.375rem; cursor: pointer; transition: all 0.2s ease;">
                    <input type="checkbox" value="${exercise}" onchange="updateRoutineData(${day}, '${muscleGroup}')">
                    <span style="font-size: 0.875rem;">${exercise}</span>
                </label>
            `).join('')}
        </div>
    `;
    
    if (!routineData[day]) {
        routineData[day] = {};
    }
    routineData[day].muscleGroup = muscleGroup;
    routineData[day].exercises = [];
}

function updateRoutineData(day, muscleGroup) {
    const checkboxes = document.querySelectorAll(`#exercises-${day} input[type="checkbox"]:checked`);
    const selectedExercises = Array.from(checkboxes).map(cb => cb.value);
    
    if (!routineData[day]) {
        routineData[day] = {};
    }
    
    routineData[day].muscleGroup = muscleGroup;
    routineData[day].exercises = selectedExercises;
}

function completeRoutine() {
    // Validate that all days have at least one exercise
    let isValid = true;
    for (let i = 1; i <= selectedDays; i++) {
        if (!routineData[i] || !routineData[i].exercises || routineData[i].exercises.length === 0) {
            isValid = false;
            break;
        }
    }
    
    if (!isValid) {
        alert('Please select at least one exercise for each day.');
        return;
    }
    
    appState.workoutRoutine = {
        daysPerWeek: selectedDays,
        days: routineData
    };
    
    localStorage.setItem('workoutRoutine', JSON.stringify(appState.workoutRoutine));
    // persist routine to server
    try { saveUserDataToFirestore(); } catch (e) { console.debug('saveUserDataToFirestore failed', e); }
    navigateToDashboard();
}

// Dashboard Functions
function updateDashboard() {
    if (appState.userProfile) {
        document.getElementById('user-name').textContent = `Welcome back, ${appState.userProfile.name}!`;
    }
    
    // Update progress stats
    document.getElementById('workouts-completed').textContent = appState.workoutProgress.completedWorkouts;
    document.getElementById('streak-count').textContent = appState.workoutProgress.streak;
    
    // Update today's workout
    updateTodaysWorkout();
    
    // Display routine
    displayRoutine();
}

function updateTodaysWorkout() {
    const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
    const todaysWorkoutDiv = document.getElementById('todays-workout');
    
    if (appState.workoutRoutine && appState.workoutRoutine.days) {
        // Map day of week to workout day (simplified)
        const workoutDay = ((today - 1) % appState.workoutRoutine.daysPerWeek) + 1;
        const todaysRoutine = appState.workoutRoutine.days[workoutDay];
        
        if (todaysRoutine) {
            todaysWorkoutDiv.innerHTML = `
                <div style="margin-bottom: 1rem;">
                    <strong>${todaysRoutine.muscleGroup}</strong>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    ${todaysRoutine.exercises.map(exercise => 
                        `<span style="background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.875rem;">${exercise}</span>`
                    ).join('')}
                </div>
            `;
            document.getElementById('start-workout').style.display = 'block';
        } else {
            todaysWorkoutDiv.innerHTML = '<p>Rest Day</p>';
            document.getElementById('start-workout').style.display = 'none';
        }
    }
}

function displayRoutine() {
    const routineDisplay = document.getElementById('routine-display');
    
    if (appState.workoutRoutine && appState.workoutRoutine.days) {
        routineDisplay.innerHTML = '';
        
        for (let i = 1; i <= appState.workoutRoutine.daysPerWeek; i++) {
            const day = appState.workoutRoutine.days[i];
            if (day) {
                const dayDiv = document.createElement('div');
                dayDiv.style.cssText = 'background: #f9fafb; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #7c3aed;';
                dayDiv.innerHTML = `
                    <div style="font-weight: 600; margin-bottom: 0.5rem;">Day ${i}: ${day.muscleGroup}</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                        ${day.exercises.map(exercise => 
                            `<span style="background: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.875rem; border: 1px solid #e5e7eb;">${exercise}</span>`
                        ).join('')}
                    </div>
                `;
                routineDisplay.appendChild(dayDiv);
            }
        }
    }
}

function logout() {
    // Sign out from Firebase if available
    if (firebaseAuth && firebaseAuth.signOut) {
        firebaseAuth.signOut().catch(err => console.error('Error signing out:', err));
    }
    // Clear local cache and reset state
    localStorage.clear();
    appState = {
        currentPage: 'landing',
        userProfile: null,
        workoutRoutine: null,
        workoutSession: null,
        chatMessages: [],
        workoutProgress: {
            completedWorkouts: 0,
            streak: 0
        }
    };
    navigateToLanding();
}

// Workout Session Functions
function startWorkout() {
    if (!appState.workoutRoutine || !appState.workoutRoutine.daysPerWeek) {
        alert('You do not have a workout routine yet. Please complete the routine builder first.');
        navigateToRoutine();
        return;
    }

    const today = new Date().getDay();
    const workoutDay = ((today - 1) % appState.workoutRoutine.daysPerWeek) + 1;
    const todaysRoutine = appState.workoutRoutine.days && appState.workoutRoutine.days[workoutDay];
    
    if (!todaysRoutine || !todaysRoutine.exercises || todaysRoutine.exercises.length === 0) {
        alert('No workout scheduled for today! Please select exercises for this day in the routine builder.');
        navigateToRoutine();
        return;
    }
    
    appState.workoutSession = {
        day: workoutDay,
        routine: todaysRoutine,
        currentExerciseIndex: 0,
        completedExercises: []
    };
    
    showPage('workout-session');
    appState.currentPage = 'workout-session';
    updateWorkoutSession();
}

function updateWorkoutSession() {
    const session = appState.workoutSession;
    const currentExercise = session.routine.exercises[session.currentExerciseIndex];
    
    document.getElementById('workout-title').textContent = `${session.routine.muscleGroup} Workout`;
    document.getElementById('current-exercise').textContent = currentExercise;
    document.getElementById('current-sets').textContent = '3';
    document.getElementById('current-reps').textContent = '12';
    
    // Update progress
    const progress = ((session.currentExerciseIndex) / session.routine.exercises.length) * 100;
    document.getElementById('workout-progress-fill').style.width = `${progress}%`;
    document.getElementById('exercise-counter').textContent = 
        `Exercise ${session.currentExerciseIndex + 1} of ${session.routine.exercises.length}`;
    
    // Show/hide complete workout button
    if (session.currentExerciseIndex >= session.routine.exercises.length - 1) {
        document.getElementById('complete-workout').classList.remove('hidden');
    } else {
        document.getElementById('complete-workout').classList.add('hidden');
    }
}

function nextExercise() {
    const session = appState.workoutSession;
    
    if (session.currentExerciseIndex < session.routine.exercises.length - 1) {
        session.currentExerciseIndex++;
        updateWorkoutSession();
        resetTimer();
        // If this moved to the last exercise, show complete button
        if (session.currentExerciseIndex >= session.routine.exercises.length - 1) {
            document.getElementById('complete-workout').classList.remove('hidden');
        }
    } else {
        // Already at last exercise and user pressed Complete Set -> finalize workout
        completeWorkout();
    }
}

function previousExercise() {
    const session = appState.workoutSession;
    
    if (session.currentExerciseIndex > 0) {
        session.currentExerciseIndex--;
        updateWorkoutSession();
        resetTimer();
    }
}

function exitWorkout() {
    appState.workoutSession = null;
    resetTimer();
    navigateToDashboard();
}

function completeWorkout() {
    // increment completed workouts
    appState.workoutProgress.completedWorkouts = (appState.workoutProgress.completedWorkouts || 0) + 1;

        // compute streak based on dates (timezone-safe)
        const todayISO = new Date().toISOString().slice(0,10);
        const last = appState.workoutProgress.lastCompleted || null;
        // flag to indicate continued streak (used to award bonus XP)
        let didContinueStreak = false;
        if (!last) {
            appState.workoutProgress.streak = 1;
        } else {
            const today = new Date();
            const lastDate = new Date(last);
            const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
            const lastUTC = Date.UTC(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
            const diffDays = Math.round((todayUTC - lastUTC) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
                appState.workoutProgress.streak = (appState.workoutProgress.streak || 0) + 1;
                didContinueStreak = true;
            } else if (diffDays === 0) {
                // same day - don't increment
            } else {
                // missed one or more days: reset streak
                appState.workoutProgress.streak = 1;
            }
        }
        appState.workoutProgress.lastCompleted = todayISO;

    // persist
    try { localStorage.setItem('workoutProgress', JSON.stringify(appState.workoutProgress)); } catch (e) {}
    try { saveUserDataToFirestore(); } catch (e) { console.debug('save progress failed', e); }

    // Award XP: estimate calories per exercise and treat that as XP
    try {
        const exercises = appState.workoutSession && appState.workoutSession.routine && appState.workoutSession.routine.exercises ? appState.workoutSession.routine.exercises : [];
        const xpGained = exercises.reduce((sum, ex) => sum + estimateCaloriesForExercise(ex), 0);
            if (xpGained > 0) {
                awardXP(xpGained);
                showToast(`+${xpGained} XP earned!`);
            }
    } catch (e) {
        console.debug('Error awarding XP:', e);
    }

        // If the user continued their streak (didContinueStreak), award a streak bonus: streak * 10 XP
        try {
            if (didContinueStreak) {
                const streakBonus = (appState.workoutProgress.streak || 1) * 10;
                awardXP(streakBonus);
                showToast(`Streak bonus: +${streakBonus} XP`);
            }
        } catch (e) { console.debug('Streak bonus awarding failed', e); }
    appState.workoutSession = null;
    resetTimer();
    alert('Workout completed! Great job!');
    navigateToDashboard();
}

// Timer Functions
function toggleTimer() {
    if (timerState.isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    timerState.isRunning = true;
    document.getElementById('timer-btn').textContent = 'Pause';
    
    timerState.interval = setInterval(() => {
        timerState.seconds++;
        updateTimerDisplay();
    }, 1000);
}

function pauseTimer() {
    timerState.isRunning = false;
    document.getElementById('timer-btn').textContent = 'Start';
    clearInterval(timerState.interval);
}

function resetTimer() {
    timerState.isRunning = false;
    timerState.seconds = 0;
    clearInterval(timerState.interval);
    document.getElementById('timer-btn').textContent = 'Start';
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const minutes = Math.floor(timerState.seconds / 60);
    const seconds = timerState.seconds % 60;
    const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('timer-display').textContent = display;
}

// Chatbot Functions
function toggleChatbot() {
    const chatbot = document.getElementById('chatbot');
    chatbot.classList.toggle('hidden');
    
    if (!chatbot.classList.contains('hidden')) {
        document.getElementById('chat-input').focus();
    }
}

function handleChatKeypress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    // Add user message
    addChatMessage(message, 'user');
    // persist chat
    appState.chatMessages.push({ sender: 'user', text: message, time: Date.now() });
    try { localStorage.setItem('chatMessages', JSON.stringify(appState.chatMessages)); } catch (e) {}
    input.value = '';

    // Use an improved local-only smart responder (best free option)
    addChatMessage('...', 'bot-typing');
    // small processing delay to feel responsive
    setTimeout(async () => {
        const container = document.getElementById('chatbot-messages');
        const typingEl = container.querySelector('.bot-typing-message');
        if (typingEl) typingEl.remove();

        const response = await generateSmartResponse(message);

        // display with typing effect
        await typeOutBotMessage(response);

        appState.chatMessages.push({ sender: 'bot', text: response, time: Date.now() });
        try { localStorage.setItem('chatMessages', JSON.stringify(appState.chatMessages)); } catch (e) {}
    }, 500);
}

// Typing animation: gradually append text into a bot message node
function typeOutBotMessage(text, speed = 14) {
    return new Promise(resolve => {
        const messagesContainer = document.getElementById('chatbot-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'bot-message';
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        let i = 0;
        const interval = setInterval(() => {
            messageDiv.textContent = text.slice(0, i + 1);
            i++;
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            if (i >= text.length) {
                clearInterval(interval);
                resolve();
            }
        }, speed);
    });
}

// Call server-side chat proxy. Returns reply string or throws.
async function callChatProxy(message, history = []) {
    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, history })
        });
        if (!resp.ok) {
            const errBody = await resp.json().catch(() => ({}));
            throw new Error(errBody.error || 'Proxy error');
        }
        const data = await resp.json();
        return data.reply;
    } catch (err) {
        throw err;
    }
}

function addChatMessage(message, sender) {
    const messagesContainer = document.getElementById('chatbot-messages');
    const messageDiv = document.createElement('div');
    // map special typing sender
    if (sender === 'bot-typing') {
        messageDiv.className = 'bot-typing-message';
        messageDiv.textContent = message;
    } else {
        messageDiv.className = `${sender}-message`;
        messageDiv.textContent = message;
    }
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function generateSmartResponse(userMessage) {
    const text = (userMessage || '').trim();
    const lower = text.toLowerCase();

    // Quick heuristic intent matching with prioritization
    const intents = [];
    if (/\b(progress|analysis|stats|completed|streak)\b/.test(lower)) intents.push('progress');
    if (/\b(motivat|encourag|keep going|proud)\b/.test(lower)) intents.push('motivation');
    if (/\b(workout|exercise|routine|train|session|sets|reps)\b/.test(lower)) intents.push('workout');
    if (/\b(create|build|plan|make) (a )?(routine|workout)\b/.test(lower)) intents.push('create_routine');
    if (/\b(diet|food|nutrition|calorie|protein|macros)\b/.test(lower)) intents.push('nutrition');
    if (/\b(rest|sore|recover|tired)\b/.test(lower)) intents.push('recovery');
    if (/\b(help|how|what|why|explain)\b/.test(lower)) intents.push('advice');

    // If no clear intent, try to answer conversationally or ask clarifying question
    if (intents.length === 0) {
        // If user mentions an exercise name, explain it
        const knownExercises = ['squats','push-ups','pushups','bench press','deadlifts','planks','lunges','pull-ups','pullups'];
        for (const ex of knownExercises) {
            if (lower.includes(ex)) return explainExercise(ex);
        }
        // fallback: generic helpful response
        return `I'm here to help — you can ask about workouts, nutrition, your progress, or say "create a workout" to get a routine.`;
    }

    // Handle intents in priority order
    if (intents.includes('progress')) {
        const workouts = appState.workoutProgress.completedWorkouts || 0;
        const streak = appState.workoutProgress.streak || 0;
        return `You've completed ${workouts} workouts and have a ${streak}-day streak. Great work! Keep focusing on consistency — try increasing one extra rep or 5% more load this week.`;
    }

    if (intents.includes('motivation')) {
        const streak = appState.workoutProgress.streak || 0;
        if (streak >= 7) return `Amazing — ${streak} days is a real habit. Celebrate it and set a new mini-goal for the week!`; 
        return `You're doing great! Small, consistent actions build long-term results. Keep it up — even a short workout counts.`;
    }

    if (intents.includes('create_routine')) {
        // Generate a small routine based on profile experience
        const experience = (appState.userProfile && appState.userProfile.experience) || 'beginner';
        const days = 3;
        const routine = generateSimpleRoutine(experience, days);
        // store temp routine in state (not persisted) so user can adopt it
        appState.workoutRoutine = appState.workoutRoutine || { daysPerWeek: days, days: {} };
        for (let i=1;i<=days;i++) appState.workoutRoutine.days[i] = { muscleGroup: routine[i].focus, exercises: routine[i].exercises };
        try { localStorage.setItem('workoutRoutine', JSON.stringify(appState.workoutRoutine)); } catch(e){}
        return `I've created a ${days}-day routine for a ${experience} — Day 1: ${routine[1].focus} (${routine[1].exercises.join(', ')}). Day 2: ${routine[2].focus} (${routine[2].exercises.join(', ')}). Day 3: ${routine[3].focus} (${routine[3].exercises.join(', ')}). You can customize it in the Routine Builder.`;
    }

    if (intents.includes('workout')) {
        // If user has a routine, offer today's plan
        if (appState.workoutRoutine && appState.workoutRoutine.days) {
            // pick today's day or first day
            const todayIndex = 1;
            const day = appState.workoutRoutine.days[todayIndex];
            if (day) return `Today focus: ${day.muscleGroup}. Try ${day.exercises.join(', ')} — 3 sets of 8-12 reps.`;
        }
        return `Try a simple full-body session: Squats, Push-ups, Planks, Lunges. 3 sets of 8-12 reps each. Warm up 5-10 minutes.`;
    }

    if (intents.includes('nutrition')) {
        // Basic nutrition guidance without personal data
        return `Nutrition basics: aim for a balance — lean protein (chicken, fish, legumes), complex carbs (rice, oats, potatoes), and veggies. Post-workout protein (20-30g) helps recovery.`;
    }

    if (intents.includes('recovery')) {
        return `If you're sore, focus on sleep, hydration, light mobility, and a protein-rich meal after training. Consider an easy active recovery session (walking, stretching).`;
    }

    if (intents.includes('advice')) {
        return `Want a quick plan? Say "create a workout" or ask "what should I do today?" and I'll suggest a session tailored to your experience level.`;
    }

    // default fallback
    return `I'm here to help — please tell me if you want a workout plan, tips, or to review your progress.`;
}

function explainExercise(ex) {
    const map = {
        'squats': 'Squats target your quads, glutes, and hamstrings. Keep chest up, weight on your heels, and drive through your heels to stand.',
        'push-ups': 'Push-ups target chest and triceps. Keep a straight line from head to heels and go as deep as your form allows.',
        'bench press': 'Bench press builds chest strength. Use a spotter for heavy sets and keep shoulder blades retracted.',
        'deadlifts': 'Deadlifts train posterior chain. Keep a neutral spine and hinge at the hips; avoid rounding your back.',
        'planks': 'Planks strengthen core. Keep hips level and hold a straight line; start with 20-40s and progress.'
    };
    return map[ex] || `Here's how to do ${ex}: keep good form, start light, and increase load progressively.`;
}

function generateSimpleRoutine(experience, daysPerWeek) {
    // Very small templated routines
    const templates = {
        beginner: {
            1: { focus: 'Full Body', exercises: ['Squats', 'Push-ups', 'Plank'] },
            2: { focus: 'Upper Body', exercises: ['Push-ups', 'Rows (or inverted rows)', 'Bicep Curls'] },
            3: { focus: 'Lower Body & Core', exercises: ['Lunges', 'Glute Bridges', 'Planks'] }
        },
        intermediate: {
            1: { focus: 'Push', exercises: ['Bench Press', 'Shoulder Press', 'Tricep Dips'] },
            2: { focus: 'Pull', exercises: ['Pull-ups', 'Rows', 'Hammer Curls'] },
            3: { focus: 'Legs', exercises: ['Squats', 'Deadlifts', 'Calf Raises'] }
        },
        advanced: {
            1: { focus: 'Upper Strength', exercises: ['Bench Press', 'Weighted Pull-ups', 'Overhead Press'] },
            2: { focus: 'Lower Strength', exercises: ['Back Squat', 'Romanian Deadlift', 'Lunges'] },
            3: { focus: 'Power & Conditioning', exercises: ['Power Cleans', 'Sprints', 'Plyometrics'] }
        }
    };
    const pick = templates[experience] || templates.beginner;
    const out = {};
    for (let i=1;i<=daysPerWeek;i++) out[i] = pick[i] || pick[(i%3)||3];
    return out;
}

// Utility Functions
function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

// Small toast helper
function showToast(message, ms = 2200) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('show'), 20);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 220);
    }, ms);
}

function loadFromLocalStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Error loading from localStorage:', error);
        return null;
    }
}

// Add smooth scrolling for anchor links
document.addEventListener('click', function(e) {
    if (e.target.matches('a[href^="#"]')) {
        e.preventDefault();
        const target = document.querySelector(e.target.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }
});

// Add loading states for buttons
function addButtonLoadingState(button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.innerHTML = `
        <span style="opacity: 0.5;">${originalText}</span>
        <div style="width: 1rem; height: 1rem; border: 2px solid transparent; border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite; margin-left: 0.5rem;"></div>
    `;
    
    return () => {
        button.disabled = false;
        button.textContent = originalText;
    };
}

// Handle browser back/forward buttons
window.addEventListener('popstate', function(event) {
    if (event.state && event.state.page) {
        showPage(event.state.page);
        appState.currentPage = event.state.page.replace('-page', '');
    }
});

// Add page state to browser history
function addToHistory(page) {
    const state = { page: page };
    const title = `FitTracker - ${page.replace('-page', '').charAt(0).toUpperCase() + page.replace('-page', '').slice(1)}`;
    history.pushState(state, title, `#${page.replace('-page', '')}`);
}

// Error handling for localStorage
function safeLocalStorageOperation(operation, key, data = null) {
    try {
        if (operation === 'get') {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } else if (operation === 'set') {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } else if (operation === 'remove') {
            localStorage.removeItem(key);
            return true;
        }
    } catch (error) {
        console.error(`LocalStorage ${operation} error:`, error);
        if (operation === 'get') return null;
        return false;
    }
}

// Performance optimization: debounce scroll events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Prevent form submission on enter key for search inputs
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target.type === 'search') {
        e.preventDefault();
    }
});

// Add touch support for mobile devices
if ('ontouchstart' in window) {
    document.body.classList.add('touch-device');
    
    // Add touch-specific styles
    const style = document.createElement('style');
    style.textContent = `
        .touch-device .nav-button:hover,
        .touch-device .btn-primary:hover,
        .touch-device .btn-outline:hover {
            transform: none;
        }
        
        .touch-device .feature-card:hover {
            transform: none;
        }
    `;
    document.head.appendChild(style);
}

// --- Gamification helpers ---
function estimateCaloriesForExercise(exercise) {
    const name = (exercise || '').toLowerCase();
    if (/run|sprint|burpee|jump rope|cycling|jumping/.test(name)) return 40;
    if (/squat|deadlift|bench|press|pull|lunge|pull-ups|push-ups|pushups/.test(name)) return 30;
    if (/plank|crunch|twist|core|planks|crunches/.test(name)) return 15;
    if (/curl|raise|extension|flyes|dips/.test(name)) return 20;
    return 20;
}

function xpToNext(level) {
    return 100 * level;
}

function awardXP(amount) {
    if (!amount || amount <= 0) return;
    appState.gamification = appState.gamification || { xp: 0, level: 1 };
    const prevLevel = appState.gamification.level || 1;
    appState.gamification.xp = (appState.gamification.xp || 0) + amount;
    let level = appState.gamification.level || 1;
    while (appState.gamification.xp >= xpToNext(level)) {
        appState.gamification.xp -= xpToNext(level);
        level++;
    }
    appState.gamification.level = level;
    try { localStorage.setItem('gamification', JSON.stringify(appState.gamification)); } catch (e) {}
    try { saveUserDataToFirestore(); } catch (e) {}
    updateGamificationUI();

    // If level increased, show a short animation and handle badge unlocks
    if (level > prevLevel) {
        const xpCard = document.querySelector('.xp-card');
        if (xpCard) {
            xpCard.classList.add('level-up-glow');
            setTimeout(() => xpCard.classList.remove('level-up-glow'), 900);
        }

        // Unlock a badge at level 5
        const badges = loadFromLocalStorage('badges') || {};
        if (level >= 5 && !badges.level5) {
            badges.level5 = { unlockedAt: Date.now(), name: 'Rising Star' };
            try { localStorage.setItem('badges', JSON.stringify(badges)); } catch (e) {}
            // update badge UI
            const badgeEl = document.getElementById('badge-level5');
            if (badgeEl) {
                badgeEl.classList.remove('locked');
                badgeEl.classList.add('unlocked');
                // pulse visual and fire confetti
                badgeEl.classList.add('badge-pulse');
                setTimeout(() => badgeEl.classList.remove('badge-pulse'), 900);
                try { fireConfetti(); } catch (e) { console.debug('confetti failed', e); }
            }
            showToast('Badge unlocked: Rising Star');
        }
    }
}

// Lightweight confetti implementation
function createConfettiPiece(color, left, delay, duration) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.left = left + 'px';
    el.style.top = '-10vh';
    el.style.background = color;
    el.style.transform = `translateY(-10vh) rotate(${Math.random()*360}deg)`;
    el.style.animation = `confettiFall ${duration}ms ${delay}ms cubic-bezier(.2,.7,.2,1)`;
    el.style.opacity = '0.95';
    el.style.zIndex = 3000;
    return el;
}

function fireConfetti(count = 28) {
    try {
        const container = document.getElementById('confetti-container');
        if (!container) return;
        const colors = ['#f97316', '#fb923c', '#fef08a', '#34d399', '#60a5fa', '#c084fc', '#f472b6'];
        const width = window.innerWidth;
        const duration = 1600;
        for (let i = 0; i < count; i++) {
            const left = Math.floor(Math.random() * width);
            const color = colors[Math.floor(Math.random() * colors.length)];
            const delay = Math.floor(Math.random() * 120);
            const piece = createConfettiPiece(color, left, delay, duration + Math.floor(Math.random() * 600));
            container.appendChild(piece);
            // remove after animation ends
            setTimeout(() => {
                if (piece && piece.parentNode) piece.parentNode.removeChild(piece);
            }, duration + delay + 200);
        }
    } catch (e) { console.debug('fireConfetti error', e); }
}

function updateGamificationUI() {
    // Load saved gamification if appState doesn't have it
    appState.gamification = appState.gamification || loadFromLocalStorage('gamification') || { xp: 0, level: 1 };
    const g = appState.gamification;
    const xpDisplay = document.getElementById('user-xp-display');
    const xpCount = document.getElementById('user-xp');
    const levelEl = document.getElementById('user-level');
    const xpToNextEl = document.getElementById('xp-to-next');
    const xpFill = document.getElementById('xp-fill');
    if (xpDisplay) xpDisplay.textContent = g.xp;
    if (xpCount) xpCount.textContent = g.xp;
    if (levelEl) levelEl.textContent = g.level;
    if (xpToNextEl) xpToNextEl.textContent = xpToNext(g.level);
    if (xpFill) {
        const pct = Math.min(100, Math.round((g.xp / xpToNext(g.level)) * 100));
        xpFill.style.width = `${pct}%`;
    }
    // render badges
    try {
        const badges = loadFromLocalStorage('badges') || {};
        const badgeEl = document.getElementById('badge-level5');
        if (badgeEl) {
            if (badges.level5) {
                badgeEl.classList.remove('locked');
                badgeEl.classList.add('unlocked');
            } else {
                badgeEl.classList.add('locked');
                badgeEl.classList.remove('unlocked');
            }
        }
    } catch (e) {}
}

// Helper: save full appState user-related data to Firestore when available
async function saveUserDataToFirestore() {
    if (!firebaseAuth || !firebaseAuth.currentUser || !firebaseDB) return;
    try {
        const uid = firebaseAuth.currentUser.uid;
        await firebaseDB.collection('users').doc(uid).set({
            userProfile: appState.userProfile,
            workoutRoutine: appState.workoutRoutine,
            workoutProgress: appState.workoutProgress,
            gamification: appState.gamification
        }, { merge: true });
    } catch (err) {
        console.error('Error saving user data to Firestore:', err);
    }
}