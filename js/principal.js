import { db } from "./firebase-config.js";
import { requireRole, logout } from "./auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { esc, pct, today, badge, table, initShell } from "./ui.js";

const { profile } = await requireRole("principal");
const all = async n => (await getDocs(collection(db, n))).docs.map(d => ({ id: d.id, ...d.data() }));
const [ss, cl, st] = await Promise.all([all("attendanceSessions"), all("classes"), all("students")]);
const dept = Object.fromEntries(cl.map(c => [c.id, c.department]));
const rooms = [...new Set(["Room 422", "Room 425", ...ss.map(s => s.room)])];
const F = { date: "", classId: "", dept: "", teacher: "", room: "" }; let charts = [];

const uniq = (arr, f) => [...new Map(arr.map(x => [f(x)[0], f(x)[1]])).entries()];
const sel = (id, label, opts) => `<select id="${id}"><option value="">${label}</option>${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`;
const filterBar = () => `<div class="bar"><input type="date" id="date" value="${F.date}">${sel("classId", "All classes", cl.map(c => [c.id, c.name]))}${sel("dept", "All departments", [...new Set(cl.map(c => c.department))].map(d => [d, d]))}${sel("teacher", "All teachers", uniq(ss, s => [s.teacherId, s.teacherName]))}${sel("room", "All Rooms", rooms.map(r => [r, r]))}</div>`;
const filtered = () => ss.filter(s => (!F.date || s.date === F.date) && (!F.classId || s.classId === F.classId) && (!F.dept || dept[s.classId] === F.dept) && (!F.teacher || s.teacherId === F.teacher) && (!F.room || s.room === F.room));
const group = (arr, key) => arr.reduce((m, s) => ((m[key(s)] ||= []).push(s), m), {});
const avg = a => a.length ? +(a.reduce((n, s) => n + s.attendancePercentage, 0) / a.length).toFixed(1) : 0;
const chart = (id, type, labels, datasets, opts = {}) => charts.push(new Chart(document.getElementById(id), { type, data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, ...opts } }));

function draw(id, v) {
  const box = v.querySelector("#out"), f = filtered(); charts.forEach(c => c.destroy()); charts = [];
  if (id === "history") { box.innerHTML = table(["Date", "Class", "Teacher", "Room", "Start", "End", "Present", "Absent", "%", "Status"], f.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || "")).map(s => `<tr><td>${esc(s.date)}</td><td>${esc(s.className)}</td><td>${esc(s.teacherName)}</td><td>${esc(s.room)}</td><td>${esc(s.startTime)}</td><td>${esc(s.endTime)}</td><td>${s.presentCount}</td><td>${s.absentCount}</td><td>${s.attendancePercentage}%</td><td>${badge(s.status)}</td></tr>`)); return; }
  const t = f.filter(s => s.date === (F.date || today())), p = t.reduce((n, s) => n + s.presentCount, 0), a = t.reduce((n, s) => n + s.absentCount, 0);
  const cards = [["Total Students", st.length], ["Present Today", p], ["Absent Today", a], ["Overall Attendance", f.length ? pct(f.reduce((n, s) => n + s.presentCount, 0), f.reduce((n, s) => n + s.totalStudents, 0)) + "%" : "—"], ["Classes Today", new Set(t.map(s => s.classId)).size], ["Completed Sessions", f.filter(s => s.status === "Completed").length]];
  box.innerHTML = `<div class="cards">${cards.map(([l, n]) => `<div class="card stat"><small>${l}</small><b>${n}</b></div>`).join("")}</div>
    <div class="grid2"><div class="card"><h4>Daily attendance (present)</h4><div class="chartbox"><canvas id="c1"></canvas></div></div><div class="card"><h4>Class-wise attendance %</h4><div class="chartbox"><canvas id="c2"></canvas></div></div>
    <div class="card"><h4>Present vs Absent</h4><div class="chartbox"><canvas id="c3"></canvas></div></div><div class="card"><h4>Attendance trend %</h4><div class="chartbox"><canvas id="c4"></canvas></div></div>
    <div class="card"><h4>Room-wise average %</h4><div class="chartbox"><canvas id="c5"></canvas></div></div><div class="card"><h4>Teacher-wise average %</h4><div class="chartbox"><canvas id="c6"></canvas></div></div></div>`;
  const days = Object.entries(group(f, s => s.date)).sort(([x], [y]) => x.localeCompare(y)).slice(-14);
  const cls = Object.entries(group(f, s => s.className)), tch = Object.entries(group(f, s => s.teacherName));
  chart("c1", "bar", days.map(d => d[0]), [{ label: "Present", data: days.map(([, x]) => x.reduce((n, s) => n + s.presentCount, 0)), backgroundColor: "#3b5bdb" }]);
  chart("c2", "bar", cls.map(c => c[0]), [{ label: "%", data: cls.map(([, x]) => avg(x)), backgroundColor: "#7048e8" }], { scales: { y: { max: 100, beginAtZero: true } } });
  const tp = f.reduce((n, s) => n + s.presentCount, 0), ta = f.reduce((n, s) => n + s.absentCount, 0);
  chart("c3", "doughnut", ["Present", "Absent"], [{ data: [tp, ta], backgroundColor: ["#2f9e44", "#e03131"] }]);
  chart("c4", "line", days.map(d => d[0]), [{ label: "%", data: days.map(([, x]) => avg(x)), borderColor: "#3b5bdb", tension: .3 }], { scales: { y: { max: 100, beginAtZero: true } } });
  chart("c5", "bar", rooms, [{ label: "Avg %", data: rooms.map(r => avg(f.filter(s => s.room === r))), backgroundColor: "#f08c00" }], { scales: { y: { max: 100, beginAtZero: true } } });
  chart("c6", "bar", tch.map(c => c[0]), [{ label: "%", data: tch.map(([, x]) => avg(x)), backgroundColor: "#1098ad" }], { scales: { y: { max: 100, beginAtZero: true } } });
}
initShell({ profile, logout, items: [{ id: "dashboard", label: "Dashboard", icon: "📊" }, { id: "history", label: "Attendance History", icon: "🕘" }],
  render: async (id, v) => {
    v.innerHTML = filterBar() + `<div id="out"></div>`;
    Object.keys(F).forEach(k => { const el = v.querySelector("#" + k); el.value = F[k]; el.onchange = () => { F[k] = el.value; draw(id, v); }; });
    draw(id, v);
  } });
