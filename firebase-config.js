// Your Firebase configuration (converted to compat initialization)
const firebaseConfig = {
  apiKey: "AIzaSyCy1OBLY8-yFLB9mSt3yJdMU8beszmmNnU",
  authDomain: "fittracker-5e416.firebaseapp.com",
  projectId: "fittracker-5e416",
  storageBucket: "fittracker-5e416.firebasestorage.app",
  messagingSenderId: "742132998787",
  appId: "1:742132998787:web:73c8a8028ed0b12f78b1b6",
  measurementId: "G-FYR7P0NHEF"
};

if (typeof firebase !== 'undefined') {
  try {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
      console.log('Firebase initialized (compat)');
    } else {
      console.log('Firebase already initialized');
    }
  } catch (e) {
    console.error('Firebase init error', e);
  }
} else {
  console.warn('Firebase SDK not loaded. Ensure firebase scripts are included in index.html');
}
