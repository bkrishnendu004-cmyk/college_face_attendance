import { db } from "./firebase-config.js";
import { requireRole, logout, createAccount } from "./auth.js";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, writeBatch, arrayUnion, arrayRemove, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { esc, pct, today, badge, table, toast, overlay, confirmBox, formModal, initShell } from "./ui.js";
import { loadModels, startCamera, stopCamera, detectAll, CONSENT_TEXT, MSG } from "./face-recognition.js";
import { notify, loadNotifications } from "./notifications.js";

const { profile, user } = await requireRole("admin");
const all = async n => (await getDocs(collection(db, n))).docs.map(d => ({ id: d.id, ...d.data() }));
const DEFAULT_ROOMS = ["Room 422", "Room 425"];
const getRooms = async () => { const s = await getDoc(doc(db, "settings", "system")); return s.exists() && s.data().rooms?.length ? s.data().rooms : DEFAULT_ROOMS; };
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const idOk = i => /^[A-Za-z0-9_-]+$/.test(i);
const byDate = (a, b) => (b.startedAt || "").localeCompare(a.startedAt || "");
const act = (b, a, id) => `<button class="btn sm" data-a="${a}" data-id="${esc(id)}">${b}</button> `;
const V = {};

function sessionRows(ss) {
  return ss.map(s => `<tr><td>${esc(s.date)}</td><td>${esc(s.className)}</td><td>${esc(s.teacherName)}</td><td>${esc(s.room)}</td><td>${s.presentCount}/${s.totalStudents}</td><td>${s.attendancePercentage}%</td><td>${badge(s.status)}</td><td>${act("View", "sess", s.id)}</td></tr>`);
}
const sessHeads = ["Date", "Class", "Teacher", "Room", "Present", "%", "Status", ""];
async function showSession(sid) {
  const snap = await getDocs(query(collection(db, "attendance"), where("sessionId", "==", sid)));
  const rows = snap.docs.map(d => d.data()).sort((a, b) => a.studentId.localeCompare(b.studentId));
  const o = overlay(`<h3>Session ${esc(sid)}</h3>${table(["ID", "Name", "Status", "Time", "Room"], rows.map(r => `<tr><td>${esc(r.studentId)}</td><td>${esc(r.studentName)}</td><td>${badge(r.status)}</td><td>${esc(r.time || "—")}</td><td>${esc(r.room)}</td></tr>`))}<div class="row end"><button class="btn" data-x>Close</button></div>`);
  o.querySelector("[data-x]").onclick = () => o.remove();
}
const sessionClick = v => v.addEventListener("click", e => { const b = e.target.closest('[data-a="sess"]'); if (b) showSession(b.dataset.id).catch(err => toast(err.message, "error")); });

V.dashboard = async v => {
  const [st, te, cl, ss] = await Promise.all([all("students"), all("teachers"), all("classes"), all("attendanceSessions")]);
  const t = ss.filter(s => s.date === today());
  const p = t.reduce((a, s) => a + s.presentCount, 0), ab = t.reduce((a, s) => a + s.absentCount, 0);
  const cards = [["Total Students", st.length], ["Total Teachers", te.length], ["Total Classes", cl.length], ["Today's Sessions", t.length], ["Present Today", p], ["Absent Today", ab], ["Overall Attendance", t.length ? pct(p, p + ab) + "%" : "—"]];
  v.innerHTML = `<div class="cards">${cards.map(([l, n]) => `<div class="card stat"><small>${l}</small><b>${n}</b></div>`).join("")}</div><h3>Recent sessions</h3>${table(sessHeads, sessionRows(ss.sort(byDate).slice(0, 8)))}`;
  sessionClick(v);
};

/* ---------- Students ---------- */
const studentFields = (cl, edit) => [
  { k: "studentId", label: "Student ID", required: true, readonly: edit }, { k: "name", label: "Full Name", required: true },
  { k: "email", label: "Email", type: "email", required: true }, { k: "phone", label: "Phone" },
  { k: "classId", label: "Class", type: "select", options: cl.map(c => ({ v: c.id, l: c.name })), required: true },
  { k: "department", label: "Department", required: true }, { k: "semester", label: "Semester", required: true },
  { k: "rollNo", label: "Roll Number", required: true }, { k: "status", label: "Status", type: "select", options: ["Active", "Disabled"], required: true }];
V.students = async v => {
  const [st, cl] = await Promise.all([all("students"), all("classes")]);
  const cn = Object.fromEntries(cl.map(c => [c.id, c.name]));
  v.innerHTML = `<div class="bar"><input id="q" placeholder="Search name / ID / roll"><select id="fc"><option value="">All classes</option>${cl.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select><select id="fs"><option value="">All status</option><option>Active</option><option>Disabled</option></select><button class="btn primary" id="add">+ Add Student</button></div><div id="list"></div>`;
  const draw = () => {
    const q = v.querySelector("#q").value.toLowerCase(), fc = v.querySelector("#fc").value, fs = v.querySelector("#fs").value;
    v.querySelector("#list").innerHTML = table(["ID", "Name", "Class", "Dept", "Sem", "Roll", "Status", "Face", ""], st.filter(s => (!q || [s.id, s.name, s.rollNo].join(" ").toLowerCase().includes(q)) && (!fc || s.classId === fc) && (!fs || s.status === fs))
      .map(s => `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(cn[s.classId] || "—")}</td><td>${esc(s.department)}</td><td>${esc(s.semester)}</td><td>${esc(s.rollNo)}</td><td>${badge(s.status)}</td><td>${badge(s.faceStatus || "Pending")}</td><td>${act("Edit", "edit", s.id)}${act(s.status === "Active" ? "Disable" : "Enable", "tog", s.id)}${act("Delete", "del", s.id)}</td></tr>`));
  };
  draw(); ["q", "fc", "fs"].forEach(i => v.querySelector("#" + i).oninput = draw);
  const syncClass = async (oldC, newC, id) => {
    if (oldC && oldC !== newC) await updateDoc(doc(db, "classes", oldC), { studentIds: arrayRemove(id) }).catch(() => {});
    if (newC) await updateDoc(doc(db, "classes", newC), { studentIds: arrayUnion(id) });
  };
  const save = async (old) => {
    const d = await formModal({ title: old ? "Edit Student" : "Add Student", fields: studentFields(cl, !!old), values: old ? { ...old, studentId: old.id } : { status: "Active" } });
    if (!d) return;
    if (!idOk(d.studentId)) return toast("Student ID may only contain letters, numbers, - and _", "error");
    if (!emailOk(d.email)) return toast("Enter a valid email address", "error");
    try {
      if (!old && (await getDoc(doc(db, "students", d.studentId))).exists()) return toast("Student ID already exists", "error");
      await setDoc(doc(db, "students", d.studentId), { ...d, faceStatus: old?.faceStatus || "Pending", updatedAt: serverTimestamp() }, { merge: true });
      await syncClass(old?.classId, d.classId, d.studentId);
      toast("Student saved", "success"); if (!old) await notify("student", `Student registered: ${d.name} (${d.studentId})`);
      V.students(v);
    } catch (e) { console.error(e); toast("Could not save student: " + e.message, "error"); }
  };
  v.querySelector("#add").onclick = () => save(null);
  v.onclick = async e => {
    const b = e.target.closest("[data-a]"); if (!b) return; const s = st.find(x => x.id === b.dataset.id); if (!s) return;
    try {
      if (b.dataset.a === "edit") save(s);
      if (b.dataset.a === "tog") { await updateDoc(doc(db, "students", s.id), { status: s.status === "Active" ? "Disabled" : "Active" }); V.students(v); }
      if (b.dataset.a === "del" && await confirmBox(`Delete ${s.name}? Attendance history is kept.`)) { await deleteDoc(doc(db, "students", s.id)); await syncClass(s.classId, "", s.id); V.students(v); }
    } catch (err) { console.error(err); toast(err.message, "error"); }
  };
};

/* ---------- Face registration ---------- */
V.faces = async v => {
  const st = (await all("students")).filter(s => s.status !== "Disabled");
  v.innerHTML = `<div class="grid2"><div class="card"><label class="fld"><span>Student</span><select id="sel"><option value="">Select student…</option>${st.map(s => `<option value="${esc(s.id)}">${esc(s.id)} — ${esc(s.name)} (${esc(s.faceStatus || "Pending")})</option>`).join("")}</select></label><div id="info" class="muted">Select one student. Only one person can be registered at a time.</div><label class="chk"><input type="checkbox" id="consent"> <span>${CONSENT_TEXT}</span></label><div class="row"><button class="btn" id="cam" disabled>Open camera</button><button class="btn primary" id="cap" disabled>Capture 5 samples</button><button class="btn danger" id="clr" disabled>Remove face data</button></div><p id="msg" class="muted"></p></div><div class="card cam"><video id="vid" playsinline muted></video></div></div>`;
  const $ = s => v.querySelector(s), vid = $("#vid"); let cur = null, on = false, busy = false;
  const msg = (t, err) => { $("#msg").textContent = t; $("#msg").style.color = err ? "#e03131" : ""; };
  const refresh = () => { $("#cam").disabled = !(cur && $("#consent").checked); $("#cap").disabled = !(cur && on) || busy; $("#clr").disabled = !cur?.faceSamples?.length; };
  $("#sel").onchange = () => { cur = st.find(s => s.id === $("#sel").value) || null; $("#info").innerHTML = cur ? `<b>${esc(cur.name)}</b><br>ID ${esc(cur.id)} · ${esc(cur.department)} · Sem ${esc(cur.semester)} · Roll ${esc(cur.rollNo)}<br>Face status: ${badge(cur.faceStatus || "Pending")}` : ""; refresh(); };
  $("#consent").onchange = refresh;
  $("#cam").onclick = async () => {
    try { msg(MSG.loading); await loadModels(); await startCamera(vid); on = true; msg("Camera ready. Ask the student to face the camera, then click Capture."); }
    catch (e) { console.error(e); msg(e.message, true); } refresh();
  };
  $("#cap").onclick = async () => {
    busy = true; refresh(); const samples = []; let tries = 0;
    try {
      while (samples.length < 5 && tries++ < 25) {
        await new Promise(r => setTimeout(r, 700));
        const d = await detectAll(vid);
        if (d.length === 0) { msg(MSG.noface, true); continue; }
        if (d.length > 1) { msg(MSG.multi, true); continue; }
        if (d[0].detection.score < 0.8) { msg("Face is unclear. Improve lighting and look at the camera.", true); continue; }
        samples.push(JSON.stringify(Array.from(d[0].descriptor))); msg(`Captured ${samples.length}/5 samples…`);
      }
      if (samples.length < 5) throw new Error("Could not capture enough clear samples. Please try again.");
      await updateDoc(doc(db, "students", cur.id), { faceSamples: samples, faceStatus: "Completed", faceRegisteredAt: serverTimestamp() });
      cur.faceSamples = samples; cur.faceStatus = "Completed"; msg("Face registration completed.");
      toast("Face registration completed", "success"); await notify("face", `Face registration completed: ${cur.name} (${cur.id})`);
    } catch (e) { console.error(e); msg(e.message, true); }
    busy = false; refresh();
  };
  $("#clr").onclick = async () => {
    if (!await confirmBox(`Remove stored face data for ${cur.name}?`)) return;
    await updateDoc(doc(db, "students", cur.id), { faceSamples: [], faceStatus: "Pending" }); cur.faceSamples = []; cur.faceStatus = "Pending"; msg("Face data removed."); refresh();
  };
  const stop = () => { stopCamera(vid); window.removeEventListener("hashchange", stop); }; window.addEventListener("hashchange", stop);
};

/* ---------- Teachers ---------- */
V.teachers = async v => {
  const [te, cl] = await Promise.all([all("teachers"), all("classes")]);
  const names = t => cl.filter(c => c.teacherId === t).map(c => c.name).join(", ") || "—";
  v.innerHTML = `<div class="bar"><button class="btn primary" id="add">+ Add Teacher</button></div>${table(["ID", "Name", "Email", "Dept", "Classes", "Status", "Verification", ""], te.map(t => `<tr><td>${esc(t.id)}</td><td>${esc(t.name)}</td><td>${esc(t.email)}</td><td>${esc(t.department)}</td><td>${esc(names(t.id))}</td><td>${badge(t.status)}</td><td>${badge(t.verification)}</td><td>${act("Edit", "edit", t.id)}${t.verification !== "Approved" ? act("Approve", "apr", t.id) : ""}${act("Classes", "cls", t.id)}${act(t.status === "Active" ? "Disable" : "Enable", "tog", t.id)}</td></tr>`))}`;
  v.querySelector("#add").onclick = async () => {
    const d = await formModal({ title: "Add Teacher", fields: [{ k: "teacherId", label: "Teacher ID", required: true }, { k: "name", label: "Full Name", required: true }, { k: "email", label: "Email", type: "email", required: true }, { k: "department", label: "Department", required: true }, { k: "password", label: "Temporary password (min 6)", type: "password", required: true, minlength: 6 }] });
    if (!d) return;
    if (!idOk(d.teacherId)) return toast("Teacher ID may only contain letters, numbers, - and _", "error");
    if (!emailOk(d.email)) return toast("Enter a valid email address", "error");
    try {
      if ((await getDoc(doc(db, "teachers", d.teacherId))).exists()) return toast("Teacher ID already exists", "error");
      const uid = await createAccount(d.email, d.password);
      await setDoc(doc(db, "users", uid), { role: "teacher", name: d.name, email: d.email, teacherId: d.teacherId, status: "Active" });
      await setDoc(doc(db, "teachers", d.teacherId), { teacherId: d.teacherId, name: d.name, email: d.email, department: d.department, uid, status: "Active", verification: "Pending" });
      toast("Teacher added. Approve them before they can take attendance.", "success"); V.teachers(v);
    } catch (e) { console.error(e); toast(e.code === "auth/email-already-in-use" ? "That email already has an account" : e.message, "error"); }
  };
  v.onclick = async e => {
    const b = e.target.closest("[data-a]"); if (!b) return; const t = te.find(x => x.id === b.dataset.id); if (!t) return;
    try {
      if (b.dataset.a === "apr") { await updateDoc(doc(db, "teachers", t.id), { verification: "Approved" }); await notify("teacher", `Teacher approved: ${t.name}`); V.teachers(v); }
      if (b.dataset.a === "tog") { const s = t.status === "Active" ? "Disabled" : "Active"; await updateDoc(doc(db, "teachers", t.id), { status: s }); await updateDoc(doc(db, "users", t.uid), { status: s }); V.teachers(v); }
      if (b.dataset.a === "edit") {
        const d = await formModal({ title: "Edit Teacher", fields: [{ k: "name", label: "Full Name", required: true }, { k: "department", label: "Department", required: true }], values: t });
        if (d) { await updateDoc(doc(db, "teachers", t.id), d); await updateDoc(doc(db, "users", t.uid), { name: d.name }); V.teachers(v); }
      }
      if (b.dataset.a === "cls") {
        const d = await formModal({ title: `Assign classes to ${t.name}`, fields: [{ k: "ids", label: "Classes", type: "checks", options: cl.map(c => ({ v: c.id, l: c.name })) }], values: { ids: cl.filter(c => c.teacherId === t.id).map(c => c.id) } });
        if (d) { const bt = writeBatch(db); cl.forEach(c => { if (d.ids.includes(c.id)) bt.update(doc(db, "classes", c.id), { teacherId: t.id, teacherName: t.name }); else if (c.teacherId === t.id) bt.update(doc(db, "classes", c.id), { teacherId: "", teacherName: "" }); }); await bt.commit(); V.teachers(v); }
      }
    } catch (err) { console.error(err); toast(err.message, "error"); }
  };
};

/* ---------- Classes ---------- */
V.classes = async v => {
  const [cl, te, st] = await Promise.all([all("classes"), all("teachers"), all("students")]);
  v.innerHTML = `<div class="bar"><button class="btn primary" id="add">+ Create Class</button></div>${table(["ID", "Name", "Dept", "Sem", "Year", "Teacher", "Students", "Status", ""], cl.map(c => `<tr><td>${esc(c.id)}</td><td>${esc(c.name)}</td><td>${esc(c.department)}</td><td>${esc(c.semester)}</td><td>${esc(c.academicYear)}</td><td>${esc(c.teacherName || "—")}</td><td>${(c.studentIds || []).length}</td><td>${badge(c.status)}</td><td>${act("Edit", "edit", c.id)}${act(c.status === "Active" ? "Disable" : "Enable", "tog", c.id)}</td></tr>`))}`;
  const save = async old => {
    const d = await formModal({ title: old ? "Edit Class" : "Create Class", values: old ? { ...old, classId: old.id } : { status: "Active", studentIds: [] }, fields: [
      { k: "classId", label: "Class ID", required: true, readonly: !!old }, { k: "name", label: "Class Name", required: true }, { k: "department", label: "Department", required: true },
      { k: "semester", label: "Semester", required: true }, { k: "academicYear", label: "Academic Year", required: true },
      { k: "teacherId", label: "Assigned Teacher", type: "select", options: te.filter(t => t.verification === "Approved").map(t => ({ v: t.id, l: t.name })) },
      { k: "studentIds", label: "Students", type: "checks", options: st.map(s => ({ v: s.id, l: `${s.id} — ${s.name}` })) },
      { k: "status", label: "Status", type: "select", options: ["Active", "Disabled"], required: true }] });
    if (!d) return;
    if (!idOk(d.classId)) return toast("Class ID may only contain letters, numbers, - and _", "error");
    try {
      if (!old && (await getDoc(doc(db, "classes", d.classId))).exists()) return toast("Class ID already exists", "error");
      const tn = te.find(t => t.id === d.teacherId)?.name || "";
      const bt = writeBatch(db); const { classId, ...rest } = d;
      bt.set(doc(db, "classes", classId), { ...rest, teacherName: tn }, { merge: true });
      st.forEach(s => { if (d.studentIds.includes(s.id)) bt.update(doc(db, "students", s.id), { classId }); else if (s.classId === classId) bt.update(doc(db, "students", s.id), { classId: "" }); });
      await bt.commit(); toast("Class saved", "success"); V.classes(v);
    } catch (e) { console.error(e); toast(e.message, "error"); }
  };
  v.querySelector("#add").onclick = () => save(null);
  v.onclick = async e => {
    const b = e.target.closest("[data-a]"); if (!b) return; const c = cl.find(x => x.id === b.dataset.id); if (!c) return;
    if (b.dataset.a === "edit") save(c);
    if (b.dataset.a === "tog") { await updateDoc(doc(db, "classes", c.id), { status: c.status === "Active" ? "Disabled" : "Active" }); V.classes(v); }
  };
};

/* ---------- Attendance & reports ---------- */
V.attendance = async v => {
  const [ss, rooms] = await Promise.all([all("attendanceSessions"), getRooms()]);
  v.innerHTML = `<div class="bar"><select id="r"><option value="">All rooms</option>${rooms.map(r => `<option>${esc(r)}</option>`).join("")}</select><input type="date" id="d"></div><div id="l"></div>`;
  const draw = () => { const r = v.querySelector("#r").value, d = v.querySelector("#d").value; v.querySelector("#l").innerHTML = table(sessHeads, sessionRows(ss.filter(s => (!r || s.room === r) && (!d || s.date === d)).sort(byDate))); };
  draw(); v.querySelector("#r").onchange = draw; v.querySelector("#d").onchange = draw; sessionClick(v);
};
V.reports = async v => {
  const [ss, rec, cl, te, rooms] = await Promise.all([all("attendanceSessions"), all("attendance"), all("classes"), all("teachers"), getRooms()]);
  const sel = (id, label, opts) => `<select id="${id}"><option value="">${label}</option>${opts.map(o => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join("")}</select>`;
  v.innerHTML = `<div class="bar"><input type="date" id="from" title="From"><input type="date" id="to" title="To">${sel("c", "All classes", cl.map(c => ({ v: c.id, l: c.name })))}${sel("t", "All teachers", te.map(t => ({ v: t.id, l: t.name })))}${sel("r", "All rooms", rooms.map(r => ({ v: r, l: r })))}${sel("s", "Any status", ["Present", "Absent"].map(x => ({ v: x, l: x })))}<input id="sid" placeholder="Student ID"></div><h3>Room-wise report</h3><div id="rw"></div><h3>Records</h3><div id="rc"></div>`;
  const $ = s => v.querySelector(s);
  const draw = () => {
    const f = { from: $("#from").value, to: $("#to").value, c: $("#c").value, t: $("#t").value, r: $("#r").value, s: $("#s").value, sid: $("#sid").value.trim().toLowerCase() };
    const ok = x => (!f.from || x.date >= f.from) && (!f.to || x.date <= f.to) && (!f.c || x.classId === f.c) && (!f.t || x.teacherId === f.t) && (!f.r || x.room === f.r);
    const fs = ss.filter(ok);
    $("#rw").innerHTML = table(["Room", "Sessions", "Students present", "Average attendance"], rooms.map(r => { const a = fs.filter(s => s.room === r); return `<tr><td>${esc(r)}</td><td>${a.length}</td><td>${a.reduce((n, s) => n + s.presentCount, 0)}</td><td>${a.length ? (a.reduce((n, s) => n + s.attendancePercentage, 0) / a.length).toFixed(1) + "%" : "—"}</td></tr>`; }));
    const fr = rec.filter(x => ok(x) && (!f.s || x.status === f.s) && (!f.sid || x.studentId.toLowerCase().includes(f.sid))).slice(0, 500);
    $("#rc").innerHTML = table(["Date", "Student", "Name", "Class", "Room", "Status", "Time"], fr.map(x => `<tr><td>${esc(x.date)}</td><td>${esc(x.studentId)}</td><td>${esc(x.studentName)}</td><td>${esc(x.classId)}</td><td>${esc(x.room)}</td><td>${badge(x.status)}</td><td>${esc(x.time || "—")}</td></tr>`));
  };
  v.querySelectorAll("select,input").forEach(i => i.oninput = draw); draw();
};

/* ---------- Notifications, settings, profile ---------- */
V.notifications = async v => {
  const n = await loadNotifications();
  v.innerHTML = `<div class="bar"><span class="muted">${n.filter(x => !x.read).length} unread</span><button class="btn" id="mr">Mark all read</button></div>${table(["Type", "Message", "When"], n.map(x => `<tr class="${x.read ? "" : "unread"}"><td>${esc(x.type)}</td><td style="white-space:normal">${esc(x.message)}</td><td>${x.createdAt ? new Date(x.createdAt.seconds * 1000).toLocaleString() : ""}</td></tr>`))}`;
  v.querySelector("#mr").onclick = async () => { const bt = writeBatch(db); n.filter(x => !x.read).forEach(x => bt.update(doc(db, "notifications", x.id), { read: true })); await bt.commit(); V.notifications(v); };
};
V.settings = async v => {
  const rooms = await getRooms();
  v.innerHTML = `<div class="card"><h3>Attendance rooms</h3><p class="muted">Teachers can only choose from these rooms.</p><p>${rooms.map(r => `<span class="pill">${esc(r)}</span>`).join(" ")}</p><div class="row"><input id="nr" placeholder="New room name" style="max-width:240px"><button class="btn" id="ar">Add room</button></div></div><div class="card"><h3>Principal account</h3><button class="btn primary" id="ap">+ Add Principal</button></div>`;
  v.querySelector("#ar").onclick = async () => { const r = v.querySelector("#nr").value.trim(); if (!r) return; await setDoc(doc(db, "settings", "system"), { rooms: [...new Set([...rooms, r])] }, { merge: true }); V.settings(v); };
  v.querySelector("#ap").onclick = async () => {
    const d = await formModal({ title: "Add Principal", fields: [{ k: "name", label: "Full Name", required: true }, { k: "email", label: "Email", type: "email", required: true }, { k: "password", label: "Temporary password (min 6)", type: "password", required: true, minlength: 6 }] });
    if (!d) return;
    try { const uid = await createAccount(d.email, d.password); await setDoc(doc(db, "users", uid), { role: "principal", name: d.name, email: d.email, status: "Active" }); toast("Principal account created", "success"); } catch (e) { console.error(e); toast(e.message, "error"); }
  };
};
V.profile = async v => { v.innerHTML = `<div class="card"><h3>${esc(profile.name || "Admin")}</h3><p>${esc(profile.email)}<br>Role: Admin</p></div>`; };

const items = [["dashboard", "Dashboard", "📊"], ["students", "Students", "🧑‍🎓"], ["faces", "Face Registration", "📷"], ["teachers", "Teachers", "👩‍🏫"], ["classes", "Classes", "🏫"], ["attendance", "Attendance", "✅"], ["reports", "Reports", "📑"], ["notifications", "Notifications", "🔔"], ["settings", "Settings", "⚙️"], ["profile", "Profile", "👤"]].map(([id, label, icon]) => ({ id, label, icon }));
initShell({ items, profile, logout, render: (id, v) => V[id](v) });
