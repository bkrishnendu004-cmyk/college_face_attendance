import { login, resetPassword } from "./auth.js";
const $ = id => document.getElementById(id);
$("eye").onclick = () => { const s = $("pw").type === "password"; $("pw").type = s ? "text" : "password"; $("eye").textContent = s ? "Hide" : "Show"; };
$("f").onsubmit = async e => {
  e.preventDefault(); $("err").textContent = ""; $("go").disabled = true; $("go").textContent = "Signing in…";
  try { await login($("email").value.trim(), $("pw").value); }
  catch (err) {
    console.error(err);
    const m = { "auth/invalid-credential": "Incorrect email or password.", "auth/too-many-requests": "Too many attempts. Try again later.", "auth/network-request-failed": "Network error. Check your connection." }[err.code];
    $("err").textContent = m || err.message; $("go").disabled = false; $("go").textContent = "Login";
  }
};
$("forgot").onclick = async () => {
  const email = $("email").value.trim();
  if (!email) { $("err").textContent = "Enter your email first, then click Forgot password."; return; }
  try { await resetPassword(email); $("err").style.color = "#2f9e44"; $("err").textContent = "Password reset email sent."; }
  catch (err) { console.error(err); $("err").style.color = ""; $("err").textContent = "Could not send reset email."; }
};
