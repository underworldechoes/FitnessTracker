// MongoDB API Configuration
const API_BASE_URL = 'http://localhost:3000/api';
let currentToken = null;
let currentUser = null;

// Application State
let appState = {
    currentPage: 'landing',
    userProfile: null,
    workoutRoutine: null,
    workoutSession: null,
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

// API Helper Functions
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(currentToken && { 'Authorization': `Bearer ${currentToken}` }),
            ...options.headers,
        },
        ...options,
    };

    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }

    try {
        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'API request failed');
        }

        return data;
    } catch (error) {
        console.error('API request error:', error);
        throw error;
    }
}

// Initialize the application
async function initializeApp() {
    // Check for existing token
    const savedToken = localStorage.getItem('authToken');
    if (savedToken) {
        currentToken = savedToken;
        await loadUserDataFromMongoDB();
    } else {
        navigateToLanding();
    }

    // Update gamification UI from saved state
    try { updateGamificationUI(); } catch (e) {}
}

// Load user data from MongoDB
async function loadUserDataFromMongoDB() {
    try {
        const data = await apiRequest('/user/profile');
        const user = data.user;

        currentUser = user;
        appState.userProfile = user.profile;
        appState.workoutRoutine = user.workoutRoutine;
        appState.workoutProgress = user.workoutProgress;
        appState.gamification = user.gamification;
        appState.chatMessages = user.chatMessages || [];

        updateProfileUI();
        
        if (appState.userProfile && (appState.userProfile.age === 0 || appState.userProfile.height === 0)) {
            navigateToProfile();
        } else if (appState.workoutRoutine) {
            navigateToDashboard();
        } else {
            navigateToDashboard();
        }

    } catch (error) {
        console.error('Error loading user data:', error);
        localStorage.removeItem('authToken');
        navigateToLanding();
    }
}

// Save user data to MongoDB
async function saveUserDataToMongoDB() {
    if (!currentToken) return;

    try {
        // Save profile
        if (appState.userProfile) {
            await apiRequest('/user/profile', {
                method: 'PUT',
                body: {
                    age: appState.userProfile.age || 0,
                    height: appState.userProfile.height || 0,
                    experience: appState.userProfile.experience || 'beginner',
                    photoDataUrl: appState.userProfile.photoDataUrl || ''
                }
            });
        }

        // Save routine
        if (appState.workoutRoutine) {
            await apiRequest('/user/routine', {
                method: 'POST',
                body: { routine: appState.workoutRoutine }
            });
        }

        // Save progress and gamification
        await apiRequest('/user/progress', {
            method: 'POST',
            body: {
                progress: appState.workoutProgress,
                gamification: appState.gamification
            }
        });

        // Save chat messages
        if (appState.chatMessages.length > 0) {
            await apiRequest('/user/chat', {
                method: 'POST',
                body: { messages: appState.chatMessages }
            });
        }

    } catch (error) {
        console.error('Error saving data to MongoDB:', error);
    }
}

// Auth Functions
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    setButtonLoading('login-btn', true);

    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: { email, password }
        });

        currentToken = data.token;
        localStorage.setItem('authToken', data.token);
        handleAuthSuccess(data.user);
        
    } catch (error) {
        alert('Login failed: ' + error.message);
    } finally {
        setButtonLoading('login-btn', false);
    }
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

    try {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: { name, email, password }
        });

        currentToken = data.token;
        localStorage.setItem('authToken', data.token);
        handleAuthSuccess(data.user);
        
    } catch (error) {
        alert('Signup failed: ' + error.message);
    } finally {
        setButtonLoading('signup-btn', false);
    }
}

function handleAuthSuccess(user) {
    currentUser = user;
    appState.userProfile = user.profile;
    
    // Save this email for suggestion convenience
    try { saveRecentEmail(user.email); } catch (e) {}
    
    // If profile is incomplete, go to profile setup
    if (user.profile.age === 0 || user.profile.height === 0) {
        navigateToProfile();
    } else if (!user.workoutRoutine) {
        navigateToRoutine();
    } else {
        navigateToDashboard();
    }
    
    try { updateGamificationUI(); } catch (e) {}
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
    bindUIEventListeners();
}

function showProfileView() {
    showPage('profile-view-page');
    appState.currentPage = 'profile-view';
    populateProfileView();
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const el = document.getElementById(pageId);
    if (!el) {
        console.warn(`showPage: element with id ${pageId} not found`);
        return;
    }
    el.classList.add('active');
    
    try { addToHistory(pageId); } catch (e) { }
    setTimeout(() => {
        lucide.createIcons();
    }, 100);
}

// UI Functions
function updateProfileUI() {
    const nameEl = document.getElementById('user-name');
    const menuName = document.getElementById('profile-menu-name');
    const menuEmail = document.getElementById('profile-menu-email');
    const avatar = document.getElementById('profile-avatar');
    const menuAvatar = document.getElementById('profile-menu-avatar');

    const profile = appState.userProfile || {};
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

function populateProfileView() {
    const profile = appState.userProfile || {};
    document.getElementById('view-name').textContent = profile.name || '-';
    document.getElementById('view-email').textContent = profile.email || '-';
    document.getElementById('view-age').textContent = profile.age || '-';
    document.getElementById('view-height').textContent = profile.height || '-';
    document.getElementById('view-experience').textContent = profile.experience || '-';
}

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

// Auth UI Functions
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    
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
    switchAuthTab('login');
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

// Profile Functions
async function handleProfileSubmit(event) {
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
    
    try {
        await saveUserDataToMongoDB();
    } catch (e) { console.debug('save profile failed', e); }
    
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
    
    document.querySelectorAll('.day-option').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.querySelector(`[data-days="${days}"]`).classList.add('selected');
    
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
    const randBtn = document.getElementById('randomize-routine');
    if (randBtn) randBtn.classList.remove('hidden');
}

function openRoutineForEdit() {
    if (!appState.workoutRoutine) return navigateToRoutine();
    selectedDays = appState.workoutRoutine.daysPerWeek || 3;
    document.querySelectorAll('.day-option').forEach(btn => btn.classList.remove('selected'));
    const sel = document.querySelector(`[data-days="${selectedDays}"]`);
    if (sel) sel.classList.add('selected');
    buildRoutineInterface();
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
        const select = document.querySelector(`#routine-builder select[onchange*="updateDayExercises(${i},"]`);
        if (select) select.value = day.muscleGroup;
        updateDayExercises(i, day.muscleGroup);
        const checkboxes = document.querySelectorAll(`#exercises-${i} input[type="checkbox"]`);
        checkboxes.forEach(cb => {
            if (day.exercises && day.exercises.includes(cb.value)) cb.checked = true;
        });
        updateRoutineData(i, day.muscleGroup);
    }
}

function randomizeRoutine(autoComplete = false) {
    const experience = (appState.userProfile && appState.userProfile.experience) || 'beginner';
    const days = selectedDays || 3;
    try {
        selectDays(days);
    } catch (e) {
        selectedDays = days;
        buildRoutineInterface();
    }
    
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

    const routine = {};
    const shuffled = [...muscleGroups];
    for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }

    for (let i = 1; i <= days; i++) {
        const focus = shuffled[(i - 1) % shuffled.length];
        const candidates = [...(exercisesMap[focus] || [])];
        for (let j = candidates.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [candidates[j], candidates[k]] = [candidates[k], candidates[j]];
        }
        routine[i] = { muscleGroup: focus, exercises: candidates.slice(0, 3) };
    }

    routineData = {};
    for (let i=1;i<=days;i++) routineData[i] = { muscleGroup: routine[i].muscleGroup, exercises: routine[i].exercises };
    appState.workoutRoutine = { daysPerWeek: days, days: routine };
    selectedDays = days;
    try {
        populateRoutineFromState();
        if (autoComplete) {
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

async function completeRoutine() {
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
    
    try {
        await saveUserDataToMongoDB();
    } catch (e) { console.debug('saveUserDataToMongoDB failed', e); }
    navigateToDashboard();
}

// Dashboard Functions
function updateDashboard() {
    if (appState.userProfile) {
        document.getElementById('user-name').textContent = `Welcome back, ${appState.userProfile.name}!`;
    }
    
    document.getElementById('workouts-completed').textContent = appState.workoutProgress.completedWorkouts;
    document.getElementById('streak-count').textContent = appState.workoutProgress.streak;
    
    updateTodaysWorkout();
    displayRoutine();
}

function updateTodaysWorkout() {
    const today = new Date().getDay();
    const todaysWorkoutDiv = document.getElementById('todays-workout');
    
    if (appState.workoutRoutine && appState.workoutRoutine.days) {
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
    
    const progress = ((session.currentExerciseIndex) / session.routine.exercises.length) * 100;
    document.getElementById('workout-progress-fill').style.width = `${progress}%`;
    document.getElementById('exercise-counter').textContent = 
        `Exercise ${session.currentExerciseIndex + 1} of ${session.routine.exercises.length}`;
    
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
        if (session.currentExerciseIndex >= session.routine.exercises.length - 1) {
            document.getElementById('complete-workout').classList.remove('hidden');
        }
    } else {
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

async function completeWorkout() {
    appState.workoutProgress.completedWorkouts = (appState.workoutProgress.completedWorkouts || 0) + 1;

    const todayISO = new Date().toISOString().slice(0,10);
    const last = appState.workoutProgress.lastCompleted || null;
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
            appState.workoutProgress.streak = 1;
        }
    }
    appState.workoutProgress.lastCompleted = todayISO;

    try {
        await saveUserDataToMongoDB();
    } catch (e) { console.debug('save progress failed', e); }

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

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    addChatMessage(message, 'user');
    appState.chatMessages.push({ sender: 'user', text: message, time: Date.now() });
    input.value = '';

    addChatMessage('...', 'bot-typing');
    
    setTimeout(async () => {
        const container = document.getElementById('chatbot-messages');
        const typingEl = container.querySelector('.bot-typing-message');
        if (typingEl) typingEl.remove();

        try {
            const data = await apiRequest('/chat', {
                method: 'POST',
                body: { 
                    message,
                    userData: currentUser 
                }
            });

            await typeOutBotMessage(data.reply);

            appState.chatMessages.push({ sender: 'bot', text: data.reply, time: Date.now() });
            await saveUserDataToMongoDB();
            
        } catch (error) {
            const fallbackResponse = "I'm having trouble connecting right now. Please try again later.";
            await typeOutBotMessage(fallbackResponse);
            appState.chatMessages.push({ sender: 'bot', text: fallbackResponse, time: Date.now() });
        }
    }, 500);
}

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

function addChatMessage(message, sender) {
    const messagesContainer = document.getElementById('chatbot-messages');
    const messageDiv = document.createElement('div');
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

// Gamification Functions
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
    updateGamificationUI();

    if (level > prevLevel) {
        const xpCard = document.querySelector('.xp-card');
        if (xpCard) {
            xpCard.classList.add('level-up-glow');
            setTimeout(() => xpCard.classList.remove('level-up-glow'), 900);
        }
    }
}

function updateGamificationUI() {
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
}

// Utility Functions
function scrollToFeatures() {
    document.getElementById('features').scrollIntoView({ 
        behavior: 'smooth' 
    });
}

function scrollToTips() {
    document.querySelector('.tips-section').scrollIntoView({ 
        behavior: 'smooth' 
    });
}

function saveRecentEmail(email) {
    if (!email) return;
    try {
        const raw = localStorage.getItem('recentEmails');
        const arr = raw ? JSON.parse(raw) : [];
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

function bindUIEventListeners() {
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
            navigateToRoutine();
            setTimeout(() => randomizeRoutine(true), 150);
        });
        dashRand.dataset.bound = 'true';
    }

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

    document.addEventListener('click', (e) => {
        const profileMenu = document.getElementById('profile-menu');
        const profileBtn = document.getElementById('profile-btn');
        if (!profileMenu || !profileBtn) return;
        if (!profileMenu.classList.contains('hidden')) {
            if (!profileMenu.contains(e.target) && !profileBtn.contains(e.target)) {
                profileMenu.classList.add('hidden');
                profileBtn.setAttribute('aria-expanded', 'false');
            }
        }
    });

    const picInput = document.getElementById('profile-pic-input');
    if (picInput && !picInput.dataset.bound) {
        picInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(evt) {
                const dataUrl = evt.target.result;
                const avatar = document.getElementById('profile-avatar');
                const menuAvatar = document.getElementById('profile-menu-avatar');
                if (avatar) avatar.src = dataUrl;
                if (menuAvatar) menuAvatar.src = dataUrl;
                appState.userProfile = appState.userProfile || {};
                appState.userProfile.photoDataUrl = dataUrl;
                saveUserDataToMongoDB();
            };
            reader.readAsDataURL(file);
        });
        picInput.dataset.bound = 'true';
    }

    updateProfileUI();
}

function logout() {
    localStorage.removeItem('authToken');
    currentToken = null;
    currentUser = null;
    
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

function addToHistory(page) {
    const state = { page: page };
    const title = `FitTracker - ${page.replace('-page', '').charAt(0).toUpperCase() + page.replace('-page', '').slice(1)}`;
    history.pushState(state, title, `#${page.replace('-page', '')}`);
}

window.addEventListener('popstate', function(event) {
    if (event.state && event.state.page) {
        showPage(event.state.page);
        appState.currentPage = event.state.page.replace('-page', '');
    }
});
// Application State




// Initialize Lucide icons when page loads
document.addEventListener('DOMContentLoaded', function() {
    lucide.createIcons();
    initializeApp();
});

// Initialize the application
function initializeApp() {
    // Check if user data exists in localStorage
    const token = localStorage.getItem('authToken');
    const savedProfile = loadFromLocalStorage('userProfile');
    const savedRoutine = loadFromLocalStorage('workoutRoutine');
    const savedProgress = loadFromLocalStorage('workoutProgress');
    const savedGamification = loadFromLocalStorage('gamification');

    console.info('initializeApp start', {
        hasToken: !!token,
        savedProfileExists: !!savedProfile,
        savedRoutineExists: !!savedRoutine
    });

    if (savedProfile && token) {
        appState.userProfile = savedProfile;
        // Load fresh data from backend
        loadUserData();
    } else if (savedProfile) {
        // Fallback to localStorage only
        appState.userProfile = savedProfile;
        appState.workoutRoutine = savedRoutine;
        appState.workoutProgress = savedProgress;
        appState.gamification = savedGamification;
        
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
    } else {
        navigateToLanding();
    }

    // Update gamification UI from saved state
    try { updateGamificationUI(); } catch (e) {}
}

// API Helper Functions
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers,
        },
        ...options
    };

    if (options.body) {
        config.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    return response;
}

// Load User Data from Backend
async function loadUserData() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
        const response = await apiCall('/user/profile');
        
        if (response.ok) {
            const data = await response.json();
            appState.userProfile = data.user;
            appState.workoutRoutine = data.user.workoutRoutine || null;
            appState.workoutProgress = data.user.workoutProgress || { completedWorkouts: 0, streak: 0 };
            appState.gamification = data.user.gamification || { xp: 0, level: 1 };
            
            // Update local storage
            localStorage.setItem('userProfile', JSON.stringify(data.user));
            if (appState.workoutRoutine) localStorage.setItem('workoutRoutine', JSON.stringify(appState.workoutRoutine));
            if (appState.workoutProgress) localStorage.setItem('workoutProgress', JSON.stringify(appState.workoutProgress));
            if (appState.gamification) localStorage.setItem('gamification', JSON.stringify(appState.gamification));
            
            updateProfileUI();
            
            // Navigate to appropriate page
            if (data.user.profile && (data.user.profile.age === 0 || data.user.profile.height === 0)) {
                navigateToProfile();
            } else if (!appState.workoutRoutine) {
                navigateToRoutine();
            } else {
                navigateToDashboard();
            }
        } else {
            // Token might be invalid, clear it
            localStorage.removeItem('authToken');
            navigateToLanding();
        }
    } catch (error) {
        console.debug('Failed to load user data from backend, using local data:', error);
        // Continue with local data
        if (appState.userProfile) {
            updateProfileUI();
            navigateToDashboard();
        }
    }
}

// Navigation Functions (keep your existing ones, they're fine)
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
    bindUIEventListeners();
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const el = document.getElementById(pageId);
    if (!el) {
        console.warn(`showPage: element with id ${pageId} not found`);
        return;
    }
    el.classList.add('active');
    
    try { addToHistory(pageId); } catch (e) { /* non-fatal */ }
    setTimeout(() => {
        lucide.createIcons();
    }, 100);
}

// Authentication Functions with Backend Connection
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    setButtonLoading('login-btn', true);
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        // Save token and user data
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userProfile', JSON.stringify(data.user));
        
        appState.userProfile = data.user;
        appState.workoutRoutine = data.user.workoutRoutine || null;
        appState.workoutProgress = data.user.workoutProgress || { completedWorkouts: 0, streak: 0 };
        appState.gamification = data.user.gamification || { xp: 0, level: 1 };

        setButtonLoading('login-btn', false);
        handleAuthSuccess(data.user);
        
    } catch (error) {
        setButtonLoading('login-btn', false);
        alert(error.message);
    }
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

    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        // Save token and user data
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userProfile', JSON.stringify(data.user));
        
        appState.userProfile = data.user;
        
        setButtonLoading('signup-btn', false);
        handleAuthSuccess(data.user);
        
    } catch (error) {
        setButtonLoading('signup-btn', false);
        alert(error.message);
    }
}

function handleAuthSuccess(profile) {
    appState.userProfile = profile;
    localStorage.setItem('userProfile', JSON.stringify(profile));
    
    try { saveRecentEmail(profile.email); } catch (e) {}
    
    // Preserve gamification from localStorage if returning user
    const savedGamification = loadFromLocalStorage('gamification');
    if (savedGamification && savedGamification.xp > 0) {
        appState.gamification = savedGamification;
    }
    
    // If profile is incomplete, go to profile setup
    if ((profile.profile && (profile.profile.age === 0 || profile.profile.height === 0)) || 
        (!profile.profile && (profile.age === 0 || profile.height === 0))) {
        navigateToProfile();
    } else if (!appState.workoutRoutine) {
        navigateToRoutine();
    } else {
        navigateToDashboard();
    }
    
    try { updateGamificationUI(); } catch (e) {}
}

// Profile Functions with Backend Connection
async function handleProfileSubmit(event) {
    event.preventDefault();
    
    const age = parseInt(document.getElementById('profile-age').value);
    const height = parseInt(document.getElementById('profile-height').value);
    const experience = document.querySelector('input[name="experience"]:checked').value;
    
    try {
        const response = await apiCall('/user/profile', {
            method: 'PUT',
            body: { age, height, experience }
        });

        if (!response.ok) {
            throw new Error('Failed to update profile');
        }

        // Update local state
        appState.userProfile = {
            ...appState.userProfile,
            profile: {
                ...appState.userProfile.profile,
                age,
                height,
                experience
            }
        };
        
        localStorage.setItem('userProfile', JSON.stringify(appState.userProfile));
        
        if (!appState.workoutRoutine) {
            navigateToRoutine();
        } else {
            navigateToDashboard();
        }
        
    } catch (error) {
        alert('Error updating profile: ' + error.message);
    }
}

// Workout Routine Functions with Backend Connection
async function completeRoutine() {
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
    
    const routine = {
        daysPerWeek: selectedDays,
        days: routineData
    };
    
    try {
        const response = await apiCall('/user/routine', {
            method: 'POST',
            body: { routine }
        });

        if (!response.ok) {
            throw new Error('Failed to save routine');
        }

        appState.workoutRoutine = routine;
        localStorage.setItem('workoutRoutine', JSON.stringify(routine));
        navigateToDashboard();
        
    } catch (error) {
        alert('Error saving routine: ' + error.message);
    }
}

// Workout Progress with Backend Connection
async function completeWorkout() {
    // Increment completed workouts
    appState.workoutProgress.completedWorkouts = (appState.workoutProgress.completedWorkouts || 0) + 1;
    
    // Calculate XP gain
    try {
        const exercises = appState.workoutSession?.routine?.exercises || [];
        const xpGained = exercises.reduce((sum, ex) => sum + estimateCaloriesForExercise(ex), 0);
        
        if (xpGained > 0) {
            awardXP(xpGained);
        }
    } catch (e) {
        console.debug('Error calculating XP:', e);
    }

    try {
        const response = await apiCall('/user/progress', {
            method: 'POST',
            body: {
                progress: appState.workoutProgress,
                gamification: appState.gamification
            }
        });

        if (!response.ok) {
            throw new Error('Failed to save progress');
        }

        // Update local storage
        localStorage.setItem('workoutProgress', JSON.stringify(appState.workoutProgress));
        localStorage.setItem('gamification', JSON.stringify(appState.gamification));
        
        appState.workoutSession = null;
        resetTimer();
        
        // Advance routine day
        if (appState.workoutRoutine) {
            const daysCount = appState.workoutRoutine.daysPerWeek || Object.keys(appState.workoutRoutine.days).length || 3;
            if (daysCount > 0) {
                const cur = appState.workoutProgress.currentRoutineDay || 1;
                const next = (cur % daysCount) + 1;
                appState.workoutProgress.currentRoutineDay = next;
                localStorage.setItem('workoutProgress', JSON.stringify(appState.workoutProgress));
                
                // Update backend with new progress
                await apiCall('/user/progress', {
                    method: 'POST',
                    body: {
                        progress: appState.workoutProgress,
                        gamification: appState.gamification
                    }
                });
            }
        }
        
        alert('Workout completed! Great job!');
        navigateToDashboard();
        
    } catch (error) {
        alert('Error saving workout progress: ' + error.message);
    }
}

// Enhanced Chat Function with Backend Connection
async function generateSmartResponse(userMessage) {
    try {
        const response = await apiCall('/chat', {
            method: 'POST',
            body: { 
                message: userMessage,
                userData: {
                    workoutProgress: appState.workoutProgress,
                    gamification: appState.gamification
                }
            }
        });

        if (response.ok) {
            const data = await response.json();
            return data.reply;
        }
    } catch (error) {
        console.debug('Chat API not available, using fallback:', error);
    }

    // Fallback to local responses if API is unavailable
    return generateLocalResponse(userMessage);
}

function generateLocalResponse(userMessage) {
    const text = (userMessage || '').trim();
    const lower = text.toLowerCase();

    // Simple intent matching for fallback
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
        return "Hello! I'm your AI fitness coach. Ready to crush your goals today? 💪";
    } else if (lower.includes('workout') || lower.includes('exercise')) {
        return "I recommend starting with compound exercises like squats, push-ups, and planks. Focus on proper form!";
    } else if (lower.includes('progress')) {
        const workouts = appState.workoutProgress.completedWorkouts || 0;
        const streak = appState.workoutProgress.streak || 0;
        return `You've completed ${workouts} workouts with a ${streak}-day streak. Keep up the great work!`;
    } else {
        return "I'm here to help with your fitness journey! Ask me about workouts, nutrition, or motivation.";
    }
}

// Utility Functions (keep all your existing utility functions)
function setButtonLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (!button) return;

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

function loadFromLocalStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Error loading from localStorage:', error);
        return null;
    }
}

function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

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

// Keep all your other existing functions exactly as they were:
// - updateProfileUI()
// - bindUIEventListeners() 
// - populateProfileForm()
// - workout functions (startWorkout, nextExercise, etc.)
// - timer functions
// - gamification functions
// - routine builder functions
// - chatbot functions
// - etc.

// The only changes are in the API-connected functions above.
// All other functions remain exactly the same as in your original script.js
