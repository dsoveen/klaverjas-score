import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, collectionGroup, getDocs, doc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Beheer van het scoreblok. Gebruikt een eigen Firebase-instantie ("beheer"), zodat inloggen
// hier de anonieme sessie van de app in dezelfde browser niet vervangt.
const $ = id => document.getElementById(id);
const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CFG = (window.KLAVERJAS_CONFIG || {}).firebase || {};
const app = initializeApp({ apiKey: CFG.apiKey, authDomain: CFG.projectId + ".firebaseapp.com", projectId: CFG.projectId }, "beheer");
const auth = getAuth(app), db = getFirestore(app);
let user = null, groups = [], games = [], sortKey = "last", openId = null, askDel = null;

const DAY = 864e5;
const fmtDate = iso => { try { return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return "–"; } };
const ago = iso => {
  if (!iso) return "–";
  const d = (Date.now() - new Date(iso).getTime()) / DAY;
  if (d < 1 / 24) return "net";
  if (d < 1) return Math.round(d * 24) + " uur geleden";
  if (d < 2) return "gisteren";
  if (d < 30) return Math.round(d) + " dagen geleden";
  return fmtDate(iso);
};
const maxIso = list => list.filter(Boolean).sort().pop() || "";
const teamName = (g, t) => ((g.players && g.players[t]) || []).map(p => (p && p.n) || "?").join(" & ");

function show(view) { ["loginView", "dashView"].forEach(v => { $(v).hidden = v !== view; }); }

onAuthStateChanged(auth, u => {
  user = u;
  $("who").textContent = u ? u.email : "";
  if (!u) { show("loginView"); return; }
  show("dashView"); load();
});

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("loginBtn").disabled = true; $("loginMsg").textContent = "";
  try { await signInWithEmailAndPassword(auth, $("mail").value.trim(), $("pass").value); }
  catch (err) {
    const c = (err && err.code) || "";
    $("loginMsg").textContent = /invalid|wrong|not-found|credential/.test(c) ? "E-mailadres of wachtwoord klopt niet."
      : /too-many/.test(c) ? "Te vaak geprobeerd. Wacht even." : /operation-not-allowed/.test(c) ? "Inloggen met e-mail en wachtwoord staat uit in Firebase."
      : "Inloggen lukte niet (" + c + ").";
  }
  $("loginBtn").disabled = false;
});
$("logout").onclick = () => signOut(auth);
$("refresh").onclick = () => load();

async function load() {
  $("status").textContent = "Gegevens laden…"; $("status").className = "status";
  try {
    const [gs, gm] = await Promise.all([getDocs(collection(db, "groups")), getDocs(collectionGroup(db, "games"))]);
    groups = gs.docs.map(d => Object.assign({ id: d.id }, d.data()));
    games = gm.docs.map(d => Object.assign({ id: d.id, gid: d.ref.parent.parent ? d.ref.parent.parent.id : "" }, d.data()));
    $("status").textContent = "Bijgewerkt om " + new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
    render();
  } catch (e) {
    console.warn(e);
    $("status").className = "status bad";
    $("status").innerHTML = e && e.code === "permission-denied"
      ? 'Dit account is (nog) geen beheerder. Zet deze UID in de Firestore-regels: <code>' + esc(user.uid) + '</code>'
      : "Laden lukte niet (" + esc((e && e.code) || e) + "). Controleer de verbinding en probeer opnieuw.";
    $("dash").hidden = true;
  }
}

function enrich() {
  return groups.map(g => {
    const gGames = games.filter(x => x.gid === g.id);
    const memberTimes = Object.values(g.members || {}).map(m => m && m.at);
    const last = maxIso([g.lastActive, g.createdAt, g.current && g.current.startedAt, g.current && g.current.finishedAt, ...memberTimes, ...gGames.map(x => x.at)]);
    const cur = g.current || {}, rounds = (cur.rounds || []).length, R = (g.settings && g.settings.rounds) || 16;
    return { g, games: gGames, last, members: Object.keys(g.members || {}).length, rounds, R, finished: rounds >= R };
  });
}

function render() {
  $("dash").hidden = false;
  const rows = enrich(), now = Date.now();
  const active7 = rows.filter(r => r.last && now - new Date(r.last) < 7 * DAY).length;
  const phones = rows.reduce((a, r) => a + r.members, 0);
  const games30 = games.filter(x => x.at && now - new Date(x.at) < 30 * DAY).length;
  const playing = rows.filter(r => r.rounds > 0 && !r.finished).length;
  $("kpis").innerHTML = [
    ["Groepen", groups.length, active7 + " actief in de laatste 7 dagen"],
    ["Telefoons", phones, "leden in alle groepen samen"],
    ["Potjes gespeeld", games.length, games30 + " in de laatste 30 dagen"],
    ["Nu bezig", playing, playing === 1 ? "potje met rondes, nog niet klaar" : "potjes met rondes, nog niet klaar"]
  ].map(([l, v, s]) => '<div class="kpi"><span class="kl">' + l + '</span><span class="kv">' + v + '</span><span class="ks">' + esc(s) + '</span></div>').join("");
  $("chart").innerHTML = weekChart();

  const sorters = { last: (a, b) => (b.last || "").localeCompare(a.last || ""), name: (a, b) => (a.g.name || "").localeCompare(b.g.name || "", "nl"),
    games: (a, b) => b.games.length - a.games.length, members: (a, b) => b.members - a.members, created: (a, b) => (b.g.createdAt || "").localeCompare(a.g.createdAt || "") };
  rows.sort(sorters[sortKey]);
  document.querySelectorAll("th[data-sort]").forEach(th => th.classList.toggle("on", th.dataset.sort === sortKey));
  const tb = $("rows"); tb.innerHTML = "";
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">Nog geen groepen.</td></tr>'; return; }
  rows.forEach(r => {
    const g = r.g, tr = document.createElement("tr");
    const state = r.rounds === 0 ? '<span class="pill idle">geen potje bezig</span>' : r.finished ? '<span class="pill done">potje klaar</span>' : '<span class="pill live">ronde ' + (r.rounds + 1) + ' van ' + r.R + '</span>';
    tr.className = "grow" + (openId === g.id ? " open" : "");
    tr.innerHTML = '<td><b>' + esc(g.name || "Naamloos") + '</b><span class="sub">' + esc(teamName(g, "w")) + ' tegen ' + esc(teamName(g, "z")) + '</span></td>' +
      '<td class="num">' + r.members + '</td><td class="num">' + r.games.length + '</td><td>' + state + '</td><td>' + esc(ago(r.last)) + '</td><td>' + esc(fmtDate(g.createdAt)) + '</td>';
    tr.onclick = () => { openId = openId === g.id ? null : g.id; askDel = null; render(); };
    tb.appendChild(tr);
    if (openId === g.id) {
      const d = document.createElement("tr"); d.className = "detail";
      const list = r.games.slice().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
      const verz = g.settings && g.settings.verzRoem === "eigen" ? "alleen eigen roem" : "alle roem";
      d.innerHTML = '<td colspan="6"><div class="det">' +
        '<div><span class="kl">Spelregels</span><p>' + r.R + ' rondes · verzaken: ' + verz + '</p></div>' +
        '<div><span class="kl">Schrijver</span><p>' + esc((g.current && g.current.writerName) || (g.current && g.current.writer ? "naam onbekend" : "niemand")) + '</p></div>' +
        '<div><span class="kl">Leden (telefoons)</span><p>' + Object.values(g.members || {}).map(m => esc(ago(m && m.at))).join(", ") + '</p></div>' +
        '<div class="wide"><span class="kl">Potjes</span>' + (list.length ? '<ul>' + list.slice(0, 12).map(x => '<li><span>' + esc(fmtDate(x.at)) + '</span><b>' + x.score.w + ' – ' + x.score.z + '</b></li>').join("") + '</ul>' + (list.length > 12 ? '<p class="sub">en nog ' + (list.length - 12) + ' oudere</p>' : '') : '<p>Nog geen potjes.</p>') + '</div>' +
        '<div class="wide dz">' + (askDel === g.id
          ? '<p>Groep "' + esc(g.name) + '" met ' + list.length + ' potjes voor iedereen verwijderen? Dit kan niet ongedaan worden.</p><div class="row"><button class="btn ghost" id="delNo">Annuleer</button><button class="btn danger" id="delYes">Verwijderen</button></div>'
          : '<button class="btn outline" id="delBtn">Groep verwijderen</button>') + '</div></div></td>';
      tb.appendChild(d);
      if ($("delBtn")) $("delBtn").onclick = e => { e.stopPropagation(); askDel = g.id; render(); };
      if ($("delNo")) $("delNo").onclick = e => { e.stopPropagation(); askDel = null; render(); };
      if ($("delYes")) $("delYes").onclick = e => { e.stopPropagation(); removeGroup(g.id, list); };
    }
  });
}

async function removeGroup(id, list) {
  $("delYes").disabled = true;
  try {
    const b = writeBatch(db); list.forEach(x => b.delete(doc(db, "groups", id, "games", x.id))); await b.commit();
    await deleteDoc(doc(db, "groups", id));
    openId = null; askDel = null; await load();
  } catch (e) { console.warn(e); alertBox("Verwijderen lukte niet (" + ((e && e.code) || e) + ")."); }
}
function alertBox(t) { $("status").className = "status bad"; $("status").textContent = t; }

// Potjes per week, laatste 12 weken
function weekChart() {
  const narrow = innerWidth < 640, weeks = narrow ? 6 : 12, now = new Date(), monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const starts = Array.from({ length: weeks }, (_, i) => new Date(monday.getTime() - (weeks - 1 - i) * 7 * DAY));
  const counts = starts.map(s => games.filter(x => { const t = new Date(x.at).getTime(); return t >= s.getTime() && t < s.getTime() + 7 * DAY; }).length);
  const max = Math.max(4, ...counts), W = narrow ? 340 : 640, H = 180, L = 28, B = 26, T = 12, cw = (W - L - 8) / weeks, bw = Math.min(30, cw * 0.62);
  const y = v => T + (H - T - B) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gespeelde potjes per week, laatste 12 weken">';
  ticks.forEach(t => { svg += '<line x1="' + L + '" x2="' + (W - 4) + '" y1="' + y(t) + '" y2="' + y(t) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (y(t) + 3.5) + '" text-anchor="end">' + t + '</text>'; });
  counts.forEach((c, i) => {
    const x = L + cw * i + (cw - bw) / 2, last = i === weeks - 1;
    svg += '<rect x="' + x.toFixed(1) + '" y="' + y(c).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, y(0) - y(c)).toFixed(1) + '" rx="3" class="' + (last ? "bar now" : "bar") + '"><title>Week van ' + fmtDate(starts[i]) + ': ' + c + ' potjes</title></rect>';
    if (c) svg += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y(c) - 4).toFixed(1) + '" text-anchor="middle" class="val">' + c + '</text>';
    if (narrow || i % 2 === 1 || last) svg += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + starts[i].toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) + '</text>';
  });
  return svg + '</svg>';
}
let lastNarrow = innerWidth < 640;
addEventListener("resize", () => { const n = innerWidth < 640; if (n !== lastNarrow && !$("dash").hidden) { lastNarrow = n; $("chart").innerHTML = weekChart(); } });

document.querySelectorAll("th[data-sort]").forEach(th => th.onclick = () => { sortKey = th.dataset.sort; render(); });
window.__kjAdminReady = true;
