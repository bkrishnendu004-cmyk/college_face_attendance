import { auth, db, firebaseConfig } from "./firebase-config.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

export const HOME = { admin: "admin.html", teacher: "teacher.html", principal: "principal.html" };
export const getProfile = async uid => { const s = await getDoc(doc(db, "users", uid)); return s.exists() ? { uid, ...s.data() } : null; };

export async function login(email, pw) {
  const c = await signInWithEmailAndPassword(auth, email, pw);
  const p = await getProfile(c.user.uid);
  if (!p || !HOME[p.role]) { await signOut(auth); throw new Error("No role assigned to this account. Contact the administrator."); }
  if (p.status === "Disabled") { await signOut(auth); throw new Error("This account has been disabled."); }
  location.href = HOME[p.role];
}
export const resetPassword = email => sendPasswordResetEmail(auth, email);
export const logout = async () => { await signOut(auth); location.replace("login.html"); };

// Guards a dashboard page: redirects to login if signed out, or to the user's own dashboard if the role is wrong.
export function requireRole(role) {
  return new Promise(resolve => {
    onAuthStateChanged(auth, async u => {
      if (!u) return location.replace("login.html");
      const p = await getProfile(u.uid).catch(() => null);
      if (!p || p.status === "Disabled") { await signOut(auth); return location.replace("login.html"); }
      if (p.role !== role) return location.replace(HOME[p.role] || "login.html");
      resolve({ user: u, profile: p });
    });
  });
}

// Creates a login for a teacher/principal without signing the admin out (uses a secondary app instance).
export async function createAccount(email, password) {
  const app = getApps().find(a => a.name === "sec") || initializeApp(firebaseConfig, "sec");
  const a = getAuth(app);
  const c = await createUserWithEmailAndPassword(a, email, password);
  await signOut(a);
  return c.user.uid;
}
