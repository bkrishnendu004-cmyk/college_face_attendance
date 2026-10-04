export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pct = (p, t) => t > 0 ? Math.round(p / t * 1000) / 10 : 0;
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const fmtDate = iso => { const [y, m, d] = String(iso).split("-"); return `${d}/${m}/${y}`; };
export const fmtTime = d => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const badge = s => `<span class="pill ${esc(String(s).toLowerCase())}">${esc(s)}</span>`;
export const table = (heads, rows) => rows.length ? `<div class="tw"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>` : `<div class="empty">No records found.</div>`;

export function toast(msg, type = "info") {
  let b = document.getElementById("toasts");
  if (!b) { b = document.createElement("div"); b.id = "toasts"; document.body.appendChild(b); }
  const t = document.createElement("div"); t.className = "toast " + type; t.textContent = msg; b.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}
export function overlay(html) {
  const o = document.createElement("div"); o.className = "overlay";
  o.innerHTML = `<div class="modal">${html}</div>`; document.body.appendChild(o); return o;
}
export function confirmBox(msg) {
  return new Promise(r => {
    const o = overlay(`<p>${esc(msg)}</p><div class="row end"><button class="btn ghost" data-v="0">Cancel</button><button class="btn primary" data-v="1">Confirm</button></div>`);
    o.addEventListener("click", e => { const v = e.target.dataset?.v; if (v !== undefined) { o.remove(); r(v === "1"); } });
  });
}
export function formModal({ title, fields, values = {}, submitText = "Save" }) {
  return new Promise(res => {
    const opt = o => typeof o === "string" ? { v: o, l: o } : o;
    const h = fields.map(f => {
      const v = values[f.k] ?? ""; let inp;
      if (f.type === "select") inp = `<select name="${f.k}" ${f.required ? "required" : ""}><option value="">Select…</option>${f.options.map(opt).map(o => `<option value="${esc(o.v)}" ${o.v === v ? "selected" : ""}>${esc(o.l)}</option>`).join("")}</select>`;
      else if (f.type === "checks") inp = `<div class="checks" data-k="${f.k}">${f.options.map(opt).map(o => `<label><input type="checkbox" value="${esc(o.v)}" ${(v || []).includes(o.v) ? "checked" : ""}> ${esc(o.l)}</label>`).join("") || "<em>None available</em>"}</div>`;
      else inp = `<input name="${f.k}" type="${f.type || "text"}" value="${esc(v)}" ${f.required ? "required" : ""} ${f.readonly ? "readonly" : ""} ${f.minlength ? `minlength="${f.minlength}"` : ""}>`;
      return `<label class="fld"><span>${esc(f.label)}</span>${inp}</label>`;
    }).join("");
    const o = overlay(`<h3>${esc(title)}</h3><form>${h}<div class="row end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn primary">${esc(submitText)}</button></div></form>`);
    o.querySelector("[data-c]").onclick = () => { o.remove(); res(null); };
    o.querySelector("form").onsubmit = e => {
      e.preventDefault(); const fd = new FormData(e.target); const out = {};
      fields.forEach(f => { out[f.k] = f.type === "checks" ? [...o.querySelectorAll(`.checks[data-k="${f.k}"] input:checked`)].map(i => i.value) : String(fd.get(f.k) ?? "").trim(); });
      o.remove(); res(out);
    };
  });
}
export function initShell({ items, render, profile, logout }) {
  document.getElementById("nav").innerHTML = items.map(i => `<a href="#${i.id}" data-id="${i.id}">${i.icon} <span>${i.label}</span></a>`).join("") + `<a href="#" id="logout">🚪 <span>Logout</span></a>`;
  document.getElementById("who").textContent = `${profile.name || profile.email} · ${profile.role}`;
  document.getElementById("menu").onclick = () => document.getElementById("side").classList.toggle("open");
  document.getElementById("logout").onclick = e => { e.preventDefault(); logout(); };
  const go = async () => {
    const it = items.find(i => i.id === location.hash.slice(1)) || items[0];
    document.querySelectorAll("#nav a[data-id]").forEach(a => a.classList.toggle("active", a.dataset.id === it.id));
    document.getElementById("title").textContent = it.label; document.getElementById("side").classList.remove("open");
    const v = document.getElementById("view"); v.onclick = null; v.innerHTML = '<div class="empty">Loading…</div>';
    try { await render(it.id, v); } catch (err) { console.error(err); v.innerHTML = `<div class="empty err">Something went wrong: ${esc(err.message)}</div>`; }
  };
  window.addEventListener("hashchange", go);
  document.getElementById("loader").remove(); document.getElementById("app").classList.remove("hidden"); go();
}
