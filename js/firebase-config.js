import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Project: face-attendance-system-2f0b5.
// Paste the 3 values below from Firebase Console > Project settings > Your apps > SDK config.
export const firebaseConfig = {
  apiKey: "PASTE_YOUR_WEB_API_KEY",
  authDomain: "face-attendance-system-2f0b5.firebaseapp.com",
  projectId: "face-attendance-system-2f0b5",
  storageBucket: "face-attendance-system-2f0b5.firebasestorage.app",
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
