import { auth, db } from "./firebase-config.js";
import { requireRole, logout } from "./auth.js";
import { EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { esc, pct, fmtDate, fmtTime, badge, table, toast, overlay, confirmBox, formModal, initShell } from "./ui.js";
import { loadModels, startCamera, stopCamera, detectAll, drawResults, MSG } from "./face-recognition.js";
import { notify } from "./notifications.js";
import { sendAttendanceEmail } from "./email-service.js";

const { user, profile } = await requireRole("teacher");
const tSnap = await getDoc(doc(db, "teachers", profile.teacherId || "_"));
const teacher = tSnap.exists() ? { id: tSnap.id, ...tSnap.data() } : null;
const approved = teacher && teacher.verification === "Approved" && teacher.status === "Active";
const DEFAULT_ROOMS = ["Room 422", "Room 425"];
const MATCH_DISTANCE = 0.5, CONFIRM_FRAMES = 3;
let running = false, timer = null;

const getRooms = async () => { const s = await getDoc(doc(db, "settings", "system")); return s.exists() && s.data().rooms?.length ? s.data().rooms : DEFAULT_ROOMS; };
const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function verifyTeacher() {
  const d = await formModal({ title: "Teacher verification", submitText: "Verify", fields: [{ k: "pw", label: `Re-enter password for ${user.email}`, type: "password", required: true }] });
  if (!d) return false;
  try { await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, d.pw)); return true; }
  catch (e) { console.error(e); toast("Verification failed. Incorrect password.", "error"); return false; }
}

async function renderAttendance(v) {
  if (!approved) { v.innerHTML = `<div class="card"><h3>Not approved yet</h3><p class="muted">Only approved, active teachers can start attendance. Please contact the administrator.</p></div>`; return; }
  const [cs, rooms] = await Promise.all([getDocs(query(collection(db, "classes"), where("teacherId", "==", teacher.id))), getRooms()]);
  const classes = cs.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.status === "Active");
  v.innerHTML = `<div id="setup" class="card"><h3>Start attendance</h3>
    <label class="fld"><span>Class</span><select id="cls"><option value="">Select class…</option>${classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></label>
    <label class="fld"><span>Select Room (required)</span><select id="room"><option value="">Select room…</option>${rooms.map(r => `<option>${esc(r)}</option>`).join("")}</select></label>
    <button class="btn primary" id="start">Start Attendance</button><p class="muted" id="smsg">${classes.length ? "" : "No active classes are assigned to you."}</p></div>
    <div id="live" class="hidden"><div class="grid2"><div class="card cam"><video id="vid" playsinline muted></video><canvas id="ov"></canvas></div>
    <div class="card"><h3 id="lh"></h3><p id="status" class="muted"></p><p><b id="pc">0</b> present</p><div id="plist"></div><button class="btn danger block" id="end">End Attendance</button></div></div></div>
    <div id="summary"></div>`;
  const $ = s => v.querySelector(s);

  $("#start").onclick = async () => {
    const classId = $("#cls").value, room = $("#room").value, msg = t => $("#smsg").textContent = t;
    if (!classId) return msg("Please select a class.");
    if (!room || !rooms.includes(room)) return msg("Please select a room before starting attendance.");
    const cls = classes.find(c => c.id === classId);
    if (cls.teacherId !== teacher.id) return msg("You are not assigned to this class.");
    $("#start").disabled = true;
    try {
      if (!await verifyTeacher()) throw new Error("Teacher verification is required.");
      if (!await confirmBox("The camera will open to recognize students for attendance. Allow camera access?")) throw new Error(MSG.denied);
      msg(MSG.loading); await loadModels();
      const studs = (await Promise.all((cls.studentIds || []).map(id => getDoc(doc(db, "students", id))))).filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })).filter(s => s.status === "Active");
      if (!studs.length) throw new Error("This class has no active students.");
      const reg = studs.filter(s => s.faceSamples?.length);
      if (!reg.length) throw new Error("No students in this class have a registered face.");
      const matcher = new faceapi.FaceMatcher(reg.map(s => new faceapi.LabeledFaceDescriptors(s.id, s.faceSamples.map(x => new Float32Array(JSON.parse(x))))), MATCH_DISTANCE);
      $("#setup").classList.add("hidden"); $("#live").classList.remove("hidden"); $("#summary").innerHTML = "";
      const vid = $("#vid"), ov = $("#ov"); await startCamera(vid);
      const startedAt = new Date(), present = new Map(), streak = new Map();
      $("#lh").textContent = `${cls.name} · ${room}`;
      const byId = Object.fromEntries(studs.map(s => [s.id, s]));
      running = true;
      const tick = async () => {
        if (!running) return;
        try {
          const dets = await detectAll(vid), seen = new Set(), items = [];
          dets.forEach(d => {
            const m = matcher.findBestMatch(d.descriptor);
            if (m.label === "unknown") { items.push({ box: d.detection.box, label: "Unknown Person", color: "#e03131" }); return; }
            seen.add(m.label); streak.set(m.label, (streak.get(m.label) || 0) + 1);
            if (streak.get(m.label) >= CONFIRM_FRAMES && !present.has(m.label)) present.set(m.label, { time: fmtTime(new Date()), distance: +m.distance.toFixed(4) });
            items.push({ box: d.detection.box, label: `${byId[m.label].name}${present.has(m.label) ? " ✓" : ""}`, color: present.has(m.label) ? "#2f9e44" : "#f08c00" });
          });
          [...streak.keys()].forEach(k => { if (!seen.has(k)) streak.set(k, 0); });
          drawResults(ov, vid, items);
          $("#status").textContent = dets.length ? `${dets.length} face(s) in view` : MSG.noface;
          $("#pc").textContent = present.size; $("#plist").innerHTML = [...present.keys()].map(id => `<div>✅ ${esc(byId[id].name)} <span class="muted">${esc(id)} · ${esc(present.get(id).time)}</span></div>`).join("");
        } catch (e) { console.error(e); $("#status").textContent = MSG.fail; }
        timer = setTimeout(tick, 350);
      };
      tick();
      $("#end").onclick = async () => {
        if (!await confirmBox("End attendance and save the session?")) return;
        running = false; clearTimeout(timer); stopCamera(vid); $("#end").disabled = true;
        await finish({ cls, room, studs, present, startedAt });
        $("#live").classList.add("hidden"); $("#setup").classList.remove("hidden"); $("#start").disabled = false; msg("");
      };
    } catch (e) { console.error(e); running = false; stopCamera($("#vid")); msg(e.message); toast(e.message, "error"); $("#start").disabled = false; $("#setup").classList.remove("hidden"); $("#live").classList.add("hidden"); }

    async function finish({ cls, room, studs, present, startedAt }) {
      const endedAt = new Date(), total = studs.length, p = present.size, a = total - p, percent = pct(p, total);
      const sid = `S${startedAt.getTime()}`, date = localISO(startedAt), startTime = fmtTime(startedAt);
      const box = $("#summary"); box.innerHTML = `<div class="empty">Saving attendance…</div>`;
      try {
        const bt = writeBatch(db);
        bt.set(doc(db, "attendanceSessions", sid), { sessionId: sid, classId: cls.id, className: cls.name, teacherId: teacher.id, teacherName: teacher.name, room, date, startedAt: startedAt.toISOString(), startTime, endTime: fmtTime(endedAt), totalStudents: total, presentCount: p, absentCount: a, attendancePercentage: percent, teacherVerification: "Verified", status: "Completed", createdAt: serverTimestamp() });
        studs.forEach(s => { const r = present.get(s.id); bt.set(doc(db, "attendance", `${sid}_${s.id}`), { attendanceId: `${sid}_${s.id}`, sessionId: sid, studentId: s.id, studentName: s.name, classId: cls.id, teacherId: teacher.id, room, date, time: r ? r.time : "", status: r ? "Present" : "Absent", distance: r ? r.distance : null }); });
        await bt.commit();
      } catch (e) { console.error(e); box.innerHTML = `<div class="empty err">Attendance could not be saved: ${esc(e.message)}</div>`; return; }
      box.innerHTML = `<div class="card"><h3>Attendance Completed</h3><p>Class: <b>${esc(cls.name)}</b> · Teacher: <b>${esc(teacher.name)}</b> · Room: <b>${esc(room)}</b><br>Date: ${fmtDate(date)} · ${startTime} – ${fmtTime(endedAt)}</p>
        <div class="cards"><div class="card stat"><small>Total</small><b>${total}</b></div><div class="card stat"><small>Present</small><b>${p}</b></div><div class="card stat"><small>Absent</small><b>${a}</b></div><div class="card stat"><small>Attendance</small><b>${percent}%</b></div></div>
        ${table(["Student ID", "Student Name", "Status", "Time"], studs.map(s => `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${badge(present.has(s.id) ? "Present" : "Absent")}</td><td>${esc(present.get(s.id)?.time || "—")}</td></tr>`))}
        <p>Email Notification: <b id="em">Sending…</b></p></div>`;
      await notify("attendance", `Attendance completed: ${cls.name}, ${room}, ${p}/${total} (${percent}%)`);
      try {
        await sendAttendanceEmail({ class_name: cls.name, teacher_name: teacher.name, room, date: fmtDate(date), time: startTime, present_count: p, total_students: total, attendance_percentage: percent, teacher_status: "Verified", status: "Completed" });
        $("#em").textContent = "Sent successfully"; await notify("email", `Attendance email sent: ${cls.name}, ${room}`);
      } catch (e) {
        console.error(e); $("#em").textContent = "Failed"; toast("Attendance was saved successfully, but the notification email could not be sent.", "error");
        await notify("email-failed", `Email failed for ${cls.name}, ${room} (${fmtDate(date)})`);
      }
    }
  };
}

async function renderHistory(v) {
  const snap = await getDocs(query(collection(db, "attendanceSessions"), where("teacherId", "==", profile.teacherId || "_")));
  const ss = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
  v.innerHTML = table(["Date", "Class", "Room", "Present", "%", "Status", ""], ss.map(s => `<tr><td>${esc(s.date)}</td><td>${esc(s.className)}</td><td>${esc(s.room)}</td><td>${s.presentCount}/${s.totalStudents}</td><td>${s.attendancePercentage}%</td><td>${badge(s.status)}</td><td><button class="btn sm" data-id="${esc(s.id)}">View</button></td></tr>`));
  v.onclick = async e => {
    const b = e.target.closest("button[data-id]"); if (!b) return;
    const rs = (await getDocs(query(collection(db, "attendance"), where("sessionId", "==", b.dataset.id)))).docs.map(d => d.data()).sort((a, b) => a.studentId.localeCompare(b.studentId));
    const o = overlay(`<h3>Session ${esc(b.dataset.id)}</h3>${table(["ID", "Name", "Status", "Time", "Room"], rs.map(r => `<tr><td>${esc(r.studentId)}</td><td>${esc(r.studentName)}</td><td>${badge(r.status)}</td><td>${esc(r.time || "—")}</td><td>${esc(r.room)}</td></tr>`))}<div class="row end"><button class="btn" data-x>Close</button></div>`);
    o.querySelector("[data-x]").onclick = () => o.remove();
  };
}

window.addEventListener("hashchange", () => { running = false; clearTimeout(timer); document.querySelectorAll("video").forEach(stopCamera); });
initShell({ profile, logout, items: [{ id: "attendance", label: "Attendance", icon: "📷" }, { id: "history", label: "History", icon: "🕘" }],
  render: (id, v) => id === "history" ? renderHistory(v) : renderAttendance(v) });
