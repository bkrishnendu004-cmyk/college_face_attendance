import { db } from "./firebase-config.js";
import { collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
export async function notify(type, message, extra = {}) {
  try { await addDoc(collection(db, "notifications"), { type, message, read: false, createdAt: serverTimestamp(), ...extra }); }
  catch (e) { console.warn("Notification not saved", e); }
}
export async function loadNotifications() {
  const s = await getDocs(collection(db, "notifications"));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}
