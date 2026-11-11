import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, setDoc, updateDoc, deleteDoc, onSnapshot, getDocs, writeBatch, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Versienummer: verhoog dit samen met VERSIE in sw.js
const APP_VERSIE = "1.12";
window.__kjReady = true;
const $ = id => document.getElementById(id);
const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const CFG = (window.KLAVERJAS_CONFIG || {}).firebase || {};
const GKEY = "kj-groepen-v1", AKEY = "kj-actief-v1";
const DEFAULT_SETTINGS = { rounds: 16, verzRoem: "alle" };
const rid = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join(""); };
const newId = () => "g" + Date.now().toString(36) + rid(5);
const nowIso = () => new Date().toISOString();

let uid = null, db = null, view = "boot";
let myGroups = LS.get(GKEY, []), activeId = LS.get(AKEY, null);
let group = null, gRef = null, gState = "idle", games = [];
let lastErr = "", unsubG = null, unsubH = null, gTimer = null, prevLen = null, prevGameId = null;
let draft = blank(), editing = -1, askDel = null, askNew = false, askTake = false, askDanger = false, pendingSet = null, showQr = false;

// ---------- Hulpfuncties voor de groep ----------
function S() { return Object.assign({}, DEFAULT_SETTINGS, (group && group.settings) || {}); }
function R() { return S().rounds; }
function cur() { return (group && group.current) || { id: "x", rounds: [] }; }
function rounds() { return cur().rounds || []; }
function me() { return myGroups.find(g => g.id === activeId) || {}; }
function isWriter() { return !!group && cur().writer === uid; }
function isOwner() { return !!group && group.owner === uid; }
function players() { return (group && group.players) || { w: [{ n: "" }, { n: "" }], z: [{ n: "" }, { n: "" }] }; }
function pname(t, i) { const n = ((players()[t][i] || {}).n || "").trim(); return n || ("Speler " + (t === "w" ? i + 1 : i + 3)); }
function name(t) { return pname(t, 0) + " & " + pname(t, 1); }
function shortName(n) { return String(n || "").split("&").map(x => x.trim().charAt(0)).join("&"); }
function myName() { const p = me().player; return p ? pname(p[0], +p[1]) : ""; }
function avatar(t, i) {
  const pl = players()[t][i] || {}, seat = "s" + (t === "w" ? i + 1 : i + 3);
  if (pl.img) return '<img class="av ' + seat + '" src="' + esc(pl.img) + '" alt="' + esc(pname(t, i)) + '">';
  return '<span class="av ' + seat + '" aria-hidden="true">' + esc(pname(t, i).charAt(0).toUpperCase()) + '</span>';
}
function avs(t, cls) { return '<span class="avs ' + (cls || "") + '">' + avatar(t, 0) + avatar(t, 1) + '</span>'; }
function saveMyGroups() { LS.set(GKEY, myGroups); }
function upsertMyGroup(id, patch) {
  const g = myGroups.find(x => x.id === id);
  if (g) Object.assign(g, patch); else myGroups.push(Object.assign({ id }, patch));
  saveMyGroups();
}
function removeMyGroup(id) {
  myGroups = myGroups.filter(g => g.id !== id); saveMyGroups();
  if (activeId === id) { activeId = null; LS.set(AKEY, null); }
}
// De uitnodiging staat in het adres (?join=...). Oude links met #join- werken ook nog.
function linkFor(id, code) { return location.origin + location.pathname + "?join=" + id + "-" + code; }
function parseJoin(s) { const m = /join[-=]([A-Za-z0-9]{6,40})-([A-Za-z0-9]{12,64})/.exec(s || ""); return m ? { id: m[1], code: m[2] } : null; }
// Als app op het beginscherm (eigen opslag, los van Safari) of gewoon in de browser?
const standalone = (() => { try { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; } })();
// In de browser houden we de uitnodiging in de adresbalk. 'Zet op beginscherm' bewaart dat adres,
// zodat de app op het beginscherm de groep kan openen ondanks de lege opslag.
function keepJoinInUrl(id, code) {
  if (standalone || !id || !code) return;
  const want = "?join=" + id + "-" + code;
  if (location.search !== want || location.hash) { try { history.replaceState(null, "", location.pathname + want); } catch (e) {} }
}

let toastT = null;
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 4000); }
function failWrite(e) { console.warn(e); toast("Opslaan lukte niet" + (e && e.code === "permission-denied" ? ": Firebase weigert de toegang." : ". Probeer het opnieuw.") + (e && e.code ? " (" + e.code + ")" : "")); }

// ---------- Telling ----------
function score(r, set) {
  const st = set || S();
  const o = r.p === "w" ? "z" : "w";
  const roemAll = r.rw + r.rz;
  const out = { w: 0, z: 0, flag: null };
  if (r.v) {
    const other = r.v === "w" ? "z" : "w";
    out[other] = 162 + (st.verzRoem === "eigen" ? (other === "w" ? r.rw : r.rz) : roemAll);
    out.flag = "verz"; out.who = r.v;
    return out;
  }
  const pts = { w: r.w, z: r.z }, roem = { w: r.rw, z: r.rz };
  if (pts[o] === 162) { out[o] = 162 + roemAll + 100; out.flag = "pit"; out.who = o; return out; }
  const total = 162 + roemAll;
  if ((pts[r.p] + roem[r.p]) * 2 > total) {
    out.w = pts.w + roem.w; out.z = pts.z + roem.z;
    if (pts[r.p] === 162) { out[r.p] += 100; out.flag = "pit"; out.who = r.p; }
    return out;
  }
  out[o] = total; out.flag = "nat"; out.who = r.p;
  return out;
}
function totalsOf(list, set) { let w = 0, z = 0; list.forEach(r => { const s = score(r, set); w += s.w; z += s.z; }); return { w, z }; }
function totals() { return totalsOf(rounds()); }

// ---------- Weergave ----------
const SECTIONS = ["bootMsg", "board", "screenMsg", "welcome", "whoCard", "winCard", "entryCard", "sheet", "foot", "hist", "groupBox", "rulesBox"];
function show(list) { SECTIONS.forEach(id => { $(id).hidden = !list.includes(id); }); $("homeTip").hidden = true; }

function msg(html) { view = "msg"; $("screenMsg").innerHTML = html; show(["screenMsg"]); }

function render() {
  if (view === "boot") { show(["bootMsg"]); return; }
  if (view === "msg") return;
  if (view === "welcome") { renderWelcome(); return; }
  // groep
  if (gState === "loading" || gState === "slow") {
    $("screenMsg").innerHTML = '<h2>Groep laden…</h2>' + (gState === "slow" ? '<p>Dit duurt lang. Zonder internet kan een groep die je nog niet eerder opende niet laden. Hij verschijnt zodra er verbinding is.</p>' : '');
    show(["screenMsg"]); return;
  }
  if (gState === "gone") {
    $("screenMsg").innerHTML = '<h2>Groep niet beschikbaar</h2><p>Deze groep is verwijderd, of deze telefoon is geen lid meer. Vraag de groep om een nieuwe link.</p>' +
      (lastErr ? '<p class="hnote">Foutcode: ' + esc(lastErr) + '</p>' : '') +
      '<div class="actions"><button class="btn primary" id="goneDrop">Uit mijn lijst halen</button></div>';
    show(["screenMsg"]);
    $("goneDrop").onclick = () => { removeMyGroup(activeId); next(); };
    return;
  }
  renderGroup();
}

function renderGroup() {
  const list = rounds(), n = list.length, t = totals(), RR = R();
  const done = n >= RR && editing < 0;
  const writer = isWriter();
  const vis = ["board", "sheet", "foot", "hist", "groupBox", "rulesBox"];
  if (me().player === undefined) vis.push("whoCard");
  if (done) vis.push("winCard"); else if (writer) vis.push("entryCard");
  show(vis);

  $("gNameTxt").textContent = group.name || "Klaverjassen";
  $("totW").textContent = t.w; $("totZ").textContent = t.z;
  const diff = Math.abs(t.w - t.z);
  $("leadW").textContent = t.w > t.z ? "+" + diff : ""; $("leadZ").textContent = t.z > t.w ? "+" + diff : "";
  $("meta").textContent = n >= RR ? "Alle " + RR + " rondes gespeeld" : "Ronde " + (n + 1) + " van " + RR;
  $("prog").style.width = Math.min(100, n / RR * 100) + "%";
  const nw = name("w"), nz = name("z");
  $("tnW").textContent = nw; $("tnZ").textContent = nz;
  $("avW").innerHTML = avatar("w", 0) + avatar("w", 1); $("avZ").innerHTML = avatar("z", 0) + avatar("z", 1);
  $("hW").textContent = nw; $("hZ").textContent = nz; $("thW").textContent = nw; $("thZ").textContent = nz;
  $("playW").innerHTML = avs("w", "sm") + "<span>" + esc(nw) + "</span>";
  $("playZ").innerHTML = avs("z", "sm") + "<span>" + esc(nz) + "</span>";
  $("verzW").textContent = nw; $("verzZ").textContent = nz;

  renderWho();
  $("homeTip").hidden = standalone || LS.get("kj-tip-beginscherm", false) || !matchMedia("(pointer: coarse)").matches;
  if (done) renderWin(t);

  // rijen, nieuwste boven
  const tb = $("rows"); tb.innerHTML = ""; $("empty").hidden = n > 0;
  for (let i = n - 1; i >= 0; i--) {
    const r = list[i], s = score(r), tr = document.createElement("tr");
    if (i === editing) tr.className = "editing";
    const cell = team => {
      const roem = team === "w" ? r.rw : r.rz;
      const zero = s[team] === 0 && (s.flag === "nat" || s.flag === "verz") && s.who === team;
      return '<span class="' + (zero ? "zero" : "") + '">' + s[team] + '</span>' + (roem && !r.v ? '<span class="r">roem ' + roem + '</span>' : "");
    };
    let mid = "";
    if (s.flag === "nat") mid = '<span class="tag nat">nat</span>';
    if (s.flag === "pit") mid = '<span class="tag pit">pit</span>';
    if (s.flag === "verz") mid = '<span class="tag verz">verz.</span>';
    tr.innerHTML = '<td class="n">' + (i + 1) + (r.p === "w" ? " ◂" : " ▸") + '</td><td>' + cell("w") + '</td><td class="mid">' + mid + '</td><td>' + cell("z") + '</td>';
    tr.title = name(r.p) + " gingen";
    if (writer) tr.addEventListener("click", () => startEdit(i)); else tr.style.cursor = "default";
    tb.appendChild(tr);
  }
  $("footHint").textContent = writer ? "Tik op een ronde om hem te wijzigen."
    : cur().writer ? (cur().writerName || "Iemand anders") + " schrijft dit potje."
    : "Nog niemand schrijft. Kies Ik schrijf bij Groep en instellingen.";
  renderNew(done);
  if (writer && !done) renderForm();
  renderHist(); renderRules();
  if (!editingInBox()) renderGroupBox();
}

function renderWho() {
  const el = $("whoCard");
  const opt = (t, i) => '<button data-p="' + t + i + '">' + avatar(t, i) + '<span>' + esc(pname(t, i)) + '</span></button>';
  el.innerHTML = '<h3>Wie ben jij?</h3><p>Zo zien de anderen wie er schrijft als jij de score bijhoudt.</p><div class="opts">' +
    opt("w", 0) + opt("w", 1) + opt("z", 0) + opt("z", 1) + '</div><button class="linkish" data-p="">Ik speel niet mee</button>';
  el.querySelectorAll("[data-p]").forEach(b => b.onclick = () => setWho(b.dataset.p || null));
}
function setWho(p) {
  upsertMyGroup(activeId, { player: p });
  if (isWriter()) updateDoc(gRef, { "current.writerName": myName() }).catch(failWrite);
  render();
}

// Wie schrijft: in Groep en instellingen. Een ander kan het altijd overnemen.
function writerBlock() {
  const c = cur(), wn = c.writerName || "Iemand anders";
  let html = '<div class="blk"><span class="lbl">Wie schrijft</span>';
  if (isWriter()) html += '<p><b>Jij schrijft dit potje.</b> Een andere speler kan het overnemen met Ik schrijf op de eigen telefoon.</p>';
  else if (c.writer && askTake) html += '<p>' + esc(wn) + ' schrijft nu. Wil jij het overnemen?</p><div class="actions"><button class="btn small ghost" id="takeNo">Nee</button><button class="btn small primary" id="takeYes">Ja, ik schrijf</button></div>';
  else html += '<p>' + (c.writer ? '<b>' + esc(wn) + '</b> schrijft dit potje. Jij kijkt mee.' : 'Nog niemand schrijft dit potje.') + '</p><button class="btn small primary" id="takeBtn" style="align-self:flex-start">Ik schrijf</button>';
  return html + '</div>';
}
function bindWriter() {
  const c = cur();
  if ($("takeBtn")) $("takeBtn").onclick = () => { if (c.writer) { askTake = true; renderGroupBox(); } else takeOver(); };
  if ($("takeNo")) $("takeNo").onclick = () => { askTake = false; renderGroupBox(); };
  if ($("takeYes")) $("takeYes").onclick = () => { askTake = false; takeOver(); };
}
function takeOver() {
  resetDraft();
  updateDoc(gRef, { "current.writer": uid, "current.writerName": myName() }).then(() => toast("Jij schrijft nu dit potje."), failWrite);
}

function renderNew(done) {
  const w = $("newWrap");
  if (done) { w.innerHTML = ""; return; }
  if (askNew) {
    w.innerHTML = '<span>Dit potje stoppen en opnieuw beginnen?</span><button class="btn small ghost" id="nwNo">Nee</button><button class="btn small danger" id="nwYes">Opnieuw</button>';
    $("nwNo").onclick = () => { askNew = false; render(); };
    $("nwYes").onclick = () => { askNew = false; newGame(); };
    return;
  }
  w.innerHTML = rounds().length ? '<button class="linkish" id="nwBtn">Nieuw potje</button>' : "";
  if ($("nwBtn")) $("nwBtn").onclick = () => { askNew = true; render(); };
}
function newGame() {
  resetDraft();
  const c = cur();
  updateDoc(gRef, { current: { id: newId(), rounds: [], writer: c.writer || null, writerName: c.writer ? (c.writerName || "") : "", startedAt: nowIso() } }).catch(failWrite);
}

// ---------- Invoer (alleen de schrijver) ----------
function blank() { return { p: null, w: null, z: null, rw: 0, rz: 0, v: null }; }
let needP = false;   // pas na een poging tot opslaan zonder keuze melden
function resetDraft() { editing = -1; draft = blank(); needP = false; const vb = $("verzBox"); if (vb) vb.open = false; }
function draftComplete() { return draft.w !== null && draft.z !== null && draft.w + draft.z === 162; }

function renderForm() {
  $("summary").hidden = true; $("formActions").hidden = false;
  const nr = editing >= 0 ? editing + 1 : rounds().length + 1;
  $("formTitle").textContent = (editing >= 0 ? "Ronde " + nr + " wijzigen" : "Ronde " + nr) + " · wie gaat?";
  $("playSeg").classList.toggle("need", needP && !draft.p);
  $("playW").setAttribute("aria-pressed", draft.p === "w"); $("playZ").setAttribute("aria-pressed", draft.p === "z");
  $("colW").classList.toggle("playing", draft.p === "w"); $("colZ").classList.toggle("playing", draft.p === "z");
  $("verzW").setAttribute("aria-pressed", draft.v === "w"); $("verzZ").setAttribute("aria-pressed", draft.v === "z");
  if (draft.v) $("verzBox").open = true;
  $("verzBox").classList.toggle("on", !!draft.v);
  $("verzSum").textContent = draft.v ? "Verzaakt: " + name(draft.v) : "Verzaakt?";
  if (document.activeElement !== $("ptsW")) $("ptsW").value = draft.w === null ? "" : draft.w;
  if (document.activeElement !== $("ptsZ")) $("ptsZ").value = draft.z === null ? "" : draft.z;
  $("roemWv").textContent = draft.rw; $("roemZv").textContent = draft.rz;
  $("cancelEdit").hidden = editing < 0; $("deleteRound").hidden = editing < 0;
  $("save").textContent = editing >= 0 ? "Wijziging opslaan" : "Ronde opslaan";
  const pv = $("preview");
  const ok = draft.v || draftComplete();
  $("save").disabled = !ok;
  pv.hidden = false;
  if (!ok) {
    pv.innerHTML = draft.w !== null && draft.z !== null && draft.w + draft.z !== 162 ? '<span class="err">Samen moet het 162 zijn.</span>' : '<span>Vul de kaartpunten van één koppel in.</span>';
    return;
  }
  if (!draft.p) {
    // Geen standaardmelding; alleen een fout als iemand opslaat zonder te kiezen
    if (needP) pv.innerHTML = '<span class="err">Kies eerst wie er gaat.</span>'; else pv.hidden = true;
    return;
  }
  const s = score(buildRound());
  let label = "Gehaald", tag = "";
  if (s.flag === "nat") { label = name(s.who) + " zijn nat"; tag = '<span class="tag nat">nat</span>'; }
  if (s.flag === "pit") { label = name(s.who) + " hebben pit"; tag = '<span class="tag pit">pit</span>'; }
  if (s.flag === "verz") { label = name(s.who) + " verzaken"; tag = '<span class="tag verz">verz.</span>'; }
  pv.innerHTML = '<span>' + esc(label) + '</span>' + tag + '<span class="res">' + s.w + ' – ' + s.z + '</span>';
}
function setPts(team, raw) {
  const other = team === "w" ? "z" : "w";
  if (raw === "") { draft[team] = null; draft[other] = null; renderForm(); return; }
  const v = Math.max(0, Math.min(162, parseInt(raw, 10) || 0));
  draft[team] = v; draft[other] = 162 - v; renderForm();
}
function buildRound() { return { p: draft.p, w: draft.w || 0, z: draft.z || 0, rw: draft.rw, rz: draft.rz, v: draft.v }; }
function startEdit(i) {
  editing = i; draft = Object.assign({}, rounds()[i]); render();
  $("formTitle").scrollIntoView({ behavior: "smooth", block: "center" });
}
function showSummary() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const r = buildRound(), s = score(r), t = totals();
  if (editing >= 0) { const o = score(rounds()[editing]); t.w -= o.w; t.z -= o.z; }
  const nw = name("w"), nz = name("z");
  let uit = "Gehaald door " + name(r.p);
  if (s.flag === "nat") uit = name(s.who) + " zijn nat";
  if (s.flag === "pit") uit = name(s.who) + " hebben pit (+100)";
  if (s.flag === "verz") uit = name(s.who) + " hebben verzaakt";
  $("sumTitle").textContent = "Ronde " + (editing >= 0 ? editing + 1 : rounds().length + 1) + " · klopt dit?";
  const rows = [["Gaan", name(r.p)]];
  if (!(r.v && draft.w === null)) rows.push(["Kaartpunten", nw + " " + r.w + " – " + r.z + " " + nz]);
  rows.push(["Roem", nw + " " + r.rw + " – " + r.rz + " " + nz], ["Uitslag", uit], ["Deze ronde", s.w + " – " + s.z, "big"], ["Nieuwe stand", (t.w + s.w) + " – " + (t.z + s.z), "big"]);
  const dl = $("sumList"); dl.innerHTML = "";
  rows.forEach(([k, v, c]) => { const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; if (c) dd.className = c; dl.append(dt, dd); });
  $("formActions").hidden = true; $("summary").hidden = false;
  $("summary").scrollIntoView({ behavior: "smooth", block: "center" });
}

function gameDoc(list, at, set) {
  set = set || S();
  const t = totalsOf(list, set), c = { pit: { w: 0, z: 0 }, nat: { w: 0, z: 0 }, roem: { w: 0, z: 0 } };
  list.forEach(r => {
    const s = score(r, set);
    if (s.flag === "pit") c.pit[s.who]++;
    if (s.flag === "nat") c.nat[s.who]++;
    if (!r.v) { c.roem.w += r.rw; c.roem.z += r.rz; }
  });
  return { at, names: { w: name("w"), z: name("z") }, score: t, pit: c.pit, nat: c.nat, roem: c.roem, rounds: list, settings: set };
}
function saveRounds(list) {
  if (!isWriter()) { toast("Iemand anders schrijft nu dit potje."); resetDraft(); render(); return; }
  const c = cur(), fin = list.length >= R();
  const upd = { "current.rounds": list };
  const at = c.finishedAt || nowIso();
  if (fin && !c.finishedAt) upd["current.finishedAt"] = at;
  if (!fin && c.finishedAt) upd["current.finishedAt"] = deleteField();
  updateDoc(gRef, upd).catch(failWrite);
  const gdoc = doc(db, "groups", activeId, "games", c.id);
  if (fin) setDoc(gdoc, gameDoc(list, at)).catch(failWrite);
  else if (c.finishedAt) deleteDoc(gdoc).catch(() => {});
}

// ---------- Einde van een potje ----------
function renderWin(t) {
  const cnt = { pit: { w: 0, z: 0 }, nat: { w: 0, z: 0 }, roem: { w: 0, z: 0 } };
  rounds().forEach(r => { const s = score(r); if (s.flag === "pit") cnt.pit[s.who]++; if (s.flag === "nat") cnt.nat[s.who]++; if (!r.v) { cnt.roem.w += r.rw; cnt.roem.z += r.rz; } });
  const diff = Math.abs(t.w - t.z);
  let html;
  if (t.w === t.z) {
    html = '<span class="lbl">Potje gespeeld</span><div class="avs lg">' + avatar("w", 0) + avatar("w", 1) + avatar("z", 0) + avatar("z", 1) + '</div><h2>Gelijkspel!</h2><p class="line">Precies even veel punten. Dat vraagt om een revanche.</p>';
  } else {
    const wt = t.w > t.z ? "w" : "z", lt = wt === "w" ? "z" : "w";
    const line = diff < 100 ? "Op het nippertje, maar gewonnen is gewonnen." : diff < 400 ? "Een verdiende overwinning." : diff < 800 ? "Daar viel weinig tegen te doen." : "Een ware afstraffing.";
    html = '<span class="lbl">Potje gespeeld · gefeliciteerd</span>' + avs(wt, "lg") + '<h2>' + esc(name(wt)) + ' winnen!</h2><p class="line">' + line + ' ' + esc(name(lt)) + ' trakteren op de koffie.</p>';
  }
  html += '<div class="score">' + t.w + ' – ' + t.z + '</div><div class="stats"><span></span><b>' + esc(shortName(name("w"))) + '</b><b>' + esc(shortName(name("z"))) + '</b>' +
    '<span>Pit</span><span>' + cnt.pit.w + '</span><span>' + cnt.pit.z + '</span><span>Nat gegaan</span><span>' + cnt.nat.w + '</span><span>' + cnt.nat.z + '</span>' +
    '<span>Roem</span><span>' + cnt.roem.w + '</span><span>' + cnt.roem.z + '</span></div>' +
    '<div class="actions"><button class="btn ghost" id="winParty">Nog een feestje</button><button class="btn primary" id="winNew">Nieuw potje</button></div>';
  $("winCard").innerHTML = html;
  $("winNew").onclick = newGame; $("winParty").onclick = celebrate;
}
function celebrate() {
  try { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch (e) {}
  const cv = $("fx"), ctx = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); cv.hidden = false;
  const css = getComputedStyle(document.documentElement), v = k => css.getPropertyValue(k).trim();
  const suits = [["♥", v("--red")], ["♦", v("--red")], ["♠", v("--fg")], ["♣", v("--fg")], ["★", v("--gold")], ["●", v("--felt")]];
  const ps = Array.from({ length: 110 }, () => { const [ch, col] = suits[Math.floor(Math.random() * suits.length)];
    return { ch, col, x: Math.random() * W, y: -20 - Math.random() * H * 0.8, vy: 2 + Math.random() * 3.5, vx: -1 + Math.random() * 2, r: Math.random() * 6.28, vr: -0.08 + Math.random() * 0.16, sz: 16 + Math.random() * 20 }; });
  const t0 = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, W, H); let alive = false;
    ps.forEach(p => { p.y += p.vy; p.x += p.vx + Math.sin((now + p.sz * 50) / 400) * 0.6; p.r += p.vr; if (p.y < H + 40) alive = true;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.col; ctx.font = p.sz + "px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.ch, 0, 0); ctx.restore(); });
    if (alive && now - t0 < 7000) requestAnimationFrame(frame); else { ctx.clearRect(0, 0, W, H); cv.hidden = true; }
  })(t0);
}

// ---------- Overzicht van alle potjes ----------
function fmtDate(iso) { try { return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }); } catch (e) { return ""; } }
function renderHist() {
  const body = $("histBody");
  const list = games.slice().sort((a, b) => (a.at < b.at ? -1 : 1));
  $("histMeta").textContent = list.length ? list.length + (list.length === 1 ? " potje" : " potjes") : "";
  if (!list.length) { body.innerHTML = '<p class="hempty">Nog geen gespeelde potjes. Na de laatste ronde komt een potje hier vanzelf bij.</p>'; return; }
  const win = { w: 0, z: 0, t: 0 }, sum = { w: 0, z: 0 }, pit = { w: 0, z: 0 }, nat = { w: 0, z: 0 };
  const kOf = g => g.score.w > g.score.z ? "w" : g.score.z > g.score.w ? "z" : "t";
  list.forEach(g => { win[kOf(g)]++; sum.w += g.score.w; sum.z += g.score.z; pit.w += (g.pit && g.pit.w) || 0; pit.z += (g.pit && g.pit.z) || 0; nat.w += (g.nat && g.nat.w) || 0; nat.z += (g.nat && g.nat.z) || 0; });
  let streak = 0, sk = null;
  for (let i = list.length - 1; i >= 0; i--) { const k = kOf(list[i]); if (sk === null) sk = k; if (k !== sk) break; streak++; }
  let st = sk === "t" ? "Het laatste potje eindigde gelijk." : streak >= 2 ? esc(name(sk)) + " winnen al " + streak + " potjes op rij." : esc(name(sk)) + " wonnen het laatste potje.";
  const lead = win.w > win.z ? "w" : win.z > win.w ? "z" : null, d = Math.abs(win.w - win.z);
  st += lead ? " " + esc(name(lead)) + " staan " + d + " potje" + (d === 1 ? "" : "s") + " voor." : " In potjes staan jullie gelijk.";
  const n = list.length, nw = name("w"), nz = name("z");
  let html = '<div class="tally"><div class="side">' + avs("w") + '<span class="nm">' + esc(nw) + '</span></div><div class="wins">' + win.w + ' – ' + win.z + '<small>gewonnen' + (win.t ? ' · ' + win.t + ' gelijk' : '') + '</small></div><div class="side">' + avs("z") + '<span class="nm">' + esc(nz) + '</span></div></div>' +
    '<div class="streak">' + st + '</div><div class="chart">' + chartSvg(list) + '</div>' +
    '<div class="hstats"><span></span><b>' + esc(shortName(nw)) + '</b><b>' + esc(shortName(nz)) + '</b><span>Gemiddeld per potje</span><span>' + Math.round(sum.w / n) + '</span><span>' + Math.round(sum.z / n) + '</span>' +
    '<span>Punten totaal</span><span>' + sum.w + '</span><span>' + sum.z + '</span><span>Pit</span><span>' + pit.w + '</span><span>' + pit.z + '</span><span>Nat gegaan</span><span>' + nat.w + '</span><span>' + nat.z + '</span></div><ul class="glist">';
  list.slice().reverse().forEach(g => {
    const k = kOf(g);
    const chip = k === "t" ? '<span class="wchip t">gelijk</span>' : '<span class="wchip ' + k + '">' + esc(shortName(g.names ? g.names[k] : name(k))) + ' wint</span>';
    html += '<li><span class="d">' + fmtDate(g.at) + '</span><span class="sc">' + g.score.w + ' – ' + g.score.z + '</span>' + chip + '<button class="del" data-id="' + esc(g.id) + '" aria-label="Potje verwijderen">×</button>' +
      (askDel === g.id ? '<span class="ask">Dit potje verwijderen?<button class="btn small ghost" data-no="1">Nee</button><button class="btn small danger" data-yes="' + esc(g.id) + '">Verwijder</button></span>' : '') + '</li>';
  });
  body.innerHTML = html + '</ul>';
  body.querySelectorAll(".del").forEach(b => b.onclick = () => { askDel = b.dataset.id; renderHist(); });
  body.querySelectorAll("[data-no]").forEach(b => b.onclick = () => { askDel = null; renderHist(); });
  body.querySelectorAll("[data-yes]").forEach(b => b.onclick = () => { const id = b.dataset.yes; askDel = null; deleteDoc(doc(db, "groups", activeId, "games", id)).catch(failWrite); });
}
function chartSvg(list) {
  const W = 320, H = 150, top = 22, bot = 22, mid = top + (H - top - bot) / 2, half = (H - top - bot) / 2;
  const max = Math.max(50, ...list.map(g => Math.abs(g.score.w - g.score.z)));
  const step = (W - 8) / list.length, bw = Math.max(3, Math.min(22, step * 0.7));
  let bars = "";
  list.forEach((g, i) => {
    const d = g.score.w - g.score.z, h = Math.max(1.5, Math.abs(d) / max * half), x = 4 + step * i + (step - bw) / 2, y = d >= 0 ? mid - h : mid;
    bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" fill="var(' + (d >= 0 ? "--felt" : "--gold") + ')"><title>' + fmtDate(g.at) + ': ' + g.score.w + ' – ' + g.score.z + '</title></rect>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Puntenverschil per potje"><text x="4" y="12">▲ ' + esc(name("w")) + ' wint (verschil in punten)</text><text x="4" y="' + (H - 4) + '">▼ ' + esc(name("z")) + ' wint</text>' +
    '<text x="' + (W - 4) + '" y="' + (top + 8) + '" text-anchor="end">' + max + '</text><line x1="0" x2="' + W + '" y1="' + mid + '" y2="' + mid + '" stroke="var(--line)" stroke-width="1"/>' + bars + '</svg>';
}

function renderRules() {
  const s = S();
  $("rulesList").innerHTML =
    '<li>Per ronde zijn er 162 kaartpunten (inclusief 10 voor de laatste slag). Vul één kant in, de andere vult zich aan.</li>' +
    '<li>Wie gaat, moet meer dan de helft halen van alle punten plus alle roem. Lukt dat niet, dan zijn ze <b>nat</b> en krijgt de tegenpartij 162 plus alle roem.</li>' +
    '<li><b>Pit</b> (alle slagen, dus 162 punten) geeft 100 extra roem.</li>' +
    '<li>Bij <b>verzaken</b> krijgt de tegenpartij 162 plus ' + (s.verzRoem === "eigen" ? "alleen de eigen roem" : "alle opgegeven roem") + '.</li>' +
    '<li>Een potje duurt ' + s.rounds + ' rondes. Dit stel je in bij Groep en instellingen.</li>';
}

// ---------- Groep en instellingen ----------
let nameT = null, playersT = null;
// Niet opnieuw opbouwen terwijl iemand in een invoerveld van de groep typt
function editingInBox() { const a = document.activeElement; return !!a && $("groupEd").contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== "file"; }
function renderGroupBox() {
  const ed = $("groupEd"), s = S(), memberCount = Object.keys(group.members || {}).length, others = myGroups.filter(g => g.id !== activeId);
  const p = me().player;
  const opt = (v, l) => '<option value="' + v + '"' + ((p || "") === v ? " selected" : "") + '>' + esc(l) + '</option>';
  let html =
    '<div class="blk"><span class="lbl">Uitnodigen</span><p>Stuur deze link naar de andere spelers. Wie hem opent, kijkt live mee. Nu ' + memberCount + (memberCount === 1 ? " telefoon" : " telefoons") + ' in deze groep.</p>' +
    '<div class="linkbox"><input class="txt" id="gLink" readonly value="' + esc(linkFor(activeId, group.code)) + '" aria-label="Uitnodigingslink"><button class="btn small ghost" id="gCopy" style="flex:none">Kopieer</button></div>' +
    '<button class="btn small ghost" id="gQrBtn" style="align-self:flex-start">' + (showQr ? "Verberg QR-code" : "Toon QR-code") + '</button>' +
    (showQr ? qrBlock(linkFor(activeId, group.code)) : '') +
    (isOwner() ? '<button class="linkish" id="gRotate" style="align-self:flex-start">Nieuwe link maken (de oude werkt dan niet meer)</button>' : '') + '</div>' +
    '<div class="blk"><span class="lbl">Naam van de groep</span><input class="txt" id="gNameIn" maxlength="30" value="' + esc(group.name || "") + '"></div>' +
    '<div class="blk"><span class="lbl">Op deze telefoon ben ik</span><select class="txt" id="gWho">' + opt("", "Ik speel niet mee") + opt("w0", pname("w", 0)) + opt("w1", pname("w", 1)) + opt("z0", pname("z", 0)) + opt("z1", pname("z", 1)) + '</select></div>' +
    writerBlock() +
    '<div class="blk"><span class="lbl">Spelers en foto\'s</span><div id="playersEd"></div></div>' +
    '<div class="blk"><span class="lbl">Spelregels</span>' +
    '<label class="field"><span class="hnote">Aantal rondes per potje</span><select class="txt" id="gRounds">' + [8, 12, 16, 20, 24].map(n => '<option' + (n === s.rounds ? " selected" : "") + '>' + n + '</option>').join("") + '</select></label>' +
    (pendingSet && pendingSet.key === "rounds" ? setWarning() : '') +
    '<label class="field"><span class="hnote">Bij verzaken krijgt de tegenpartij 162 plus</span><select class="txt" id="gVerz"><option value="alle"' + (s.verzRoem !== "eigen" ? " selected" : "") + '>alle opgegeven roem</option><option value="eigen"' + (s.verzRoem === "eigen" ? " selected" : "") + '>alleen hun eigen roem</option></select></label>' +
    (pendingSet && pendingSet.key === "verzRoem" ? setWarning() : '') + '</div>' +
    '<div class="blk"><span class="lbl">Andere groepen</span><div class="glist2">' + others.map(g => '<button data-g="' + esc(g.id) + '">' + esc(g.name || "Naamloze groep") + '</button>').join("") + '</div>' +
    '<button class="btn small ghost" id="gNew" style="align-self:flex-start">Nieuwe groep of lid worden</button></div>' +
    '<div class="blk dz">';
  if (askDanger) html += '<p>' + (isOwner() ? "De groep en alle potjes worden voor iedereen verwijderd." : "Deze telefoon ziet de groep dan niet meer. Met de link kun je terugkomen.") + '</p><div class="actions"><button class="btn small ghost" id="dzNo">Nee</button><button class="btn small danger" id="dzYes">' + (isOwner() ? "Groep verwijderen" : "Groep verlaten") + '</button></div>';
  else html += '<button class="btn small outline" id="dzBtn" style="align-self:flex-start">' + (isOwner() ? "Groep verwijderen" : "Groep verlaten") + '</button>';
  ed.innerHTML = html + '</div>';

  $("gCopy").onclick = () => {
    const t = $("gLink").value;
    const fb = () => { $("gLink").focus(); $("gLink").select(); toast("Selecteer en kopieer de link."); };
    try { navigator.clipboard.writeText(t).then(() => toast("Link gekopieerd. Zet hem in de groepsapp."), fb); } catch (e) { fb(); }
  };
  $("gQrBtn").onclick = () => { showQr = !showQr; renderGroupBox(); if (showQr && $("qrBox")) $("qrBox").scrollIntoView({ behavior: "smooth", block: "center" }); };
  if ($("gRotate")) $("gRotate").onclick = () => { updateDoc(gRef, { code: rid(20) }).then(() => toast("Nieuwe link gemaakt."), failWrite); };
  $("gNameIn").oninput = e => { clearTimeout(nameT); const v = e.target.value.trim(); nameT = setTimeout(() => { if (v) updateDoc(gRef, { name: v }).catch(failWrite); }, 700); };
  $("gNameIn").onblur = () => setTimeout(render, 800);
  $("gWho").onchange = e => setWho(e.target.value || null);
  $("gRounds").onchange = e => askSetting("rounds", +e.target.value);
  $("gVerz").onchange = e => askSetting("verzRoem", e.target.value);
  if ($("setNo")) $("setNo").onclick = () => { pendingSet = null; renderGroupBox(); };
  if ($("setYes")) $("setYes").onclick = () => { const p = pendingSet; pendingSet = null; applySetting(p.key, p.value); };
  ed.querySelectorAll("[data-g]").forEach(b => b.onclick = () => { $("groupBox").open = false; openGroup(b.dataset.g); scrollTo(0, 0); });
  $("gNew").onclick = () => { $("groupBox").open = false; showWelcome(); };
  if ($("dzBtn")) $("dzBtn").onclick = () => { askDanger = true; renderGroupBox(); };
  if ($("dzNo")) $("dzNo").onclick = () => { askDanger = false; renderGroupBox(); };
  if ($("dzYes")) $("dzYes").onclick = () => { askDanger = false; isOwner() ? deleteGroup() : leaveGroup(); };
  bindWriter();
  renderPlayers();
}
// ---------- QR-code van de uitnodiging ----------
function qrBlock(text) {
  let svg = null;
  try {
    if (typeof window.qrcode === "function") { const q = window.qrcode(0, "M"); q.addData(text); q.make(); svg = q.createSvgTag({ cellSize: 6, margin: 3, scalable: true }); }
  } catch (e) { console.warn(e); }
  if (!svg) return '<p class="hnote">De QR-code kan nu niet worden getoond. Open de app één keer met internet, daarna werkt het ook offline.</p>';
  return '<div class="qr" id="qrBox"><div class="qrimg" role="img" aria-label="QR-code met de uitnodigingslink">' + svg + '</div>' +
    '<p>Laat de ander deze code scannen met de camera van de telefoon. Zet daarna in Safari het scoreblok op het beginscherm.</p></div>';
}

// ---------- Spelregels wijzigen tijdens een potje ----------
function askSetting(key, value) {
  if (!rounds().length) { applySetting(key, value); return; }   // nog niets gespeeld: geen gevolgen
  pendingSet = { key, value };
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  renderGroupBox();
  const w = $("setWarn"); if (w) w.scrollIntoView({ behavior: "smooth", block: "center" });
}
function setWarning() {
  const { key, value } = pendingSet, list = rounds(), n = list.length, c = cur(), s = S();
  const next = Object.assign({}, s, { [key]: value });
  let lines = [];
  if (key === "rounds") {
    const wasDone = n >= s.rounds, willDone = n >= value;
    lines.push("Er " + (n === 1 ? "is 1 ronde" : "zijn " + n + " rondes") + " gespeeld van het lopende potje.");
    if (!wasDone && willDone) lines.push("Met " + value + " rondes is het potje meteen afgelopen" + (n > value ? ", en alle " + n + " rondes tellen mee" : "") + ". Het komt dan in het overzicht.");
    else if (wasDone && !willDone) lines.push("Het potje was al afgelopen. Met " + value + " rondes gaat het weer verder, en het verdwijnt uit het overzicht tot het opnieuw klaar is.");
    else if (wasDone && willDone) lines.push("Het potje blijft afgelopen.");
    else lines.push("Het lopende potje duurt dan " + value + " rondes in plaats van " + s.rounds + ".");
  } else {
    const k = list.filter(r => r.v).length;
    const a = totalsOf(list, s), b = totalsOf(list, next);
    if (!k) lines.push("Dit geldt ook voor het lopende potje. Daarin is nog niet verzaakt, dus de stand blijft gelijk.");
    else lines.push("In het lopende potje is " + (k === 1 ? "1 keer" : k + " keer") + " verzaakt. De stand wordt opnieuw berekend: " +
      a.w + " – " + a.z + " wordt " + b.w + " – " + b.z + ".");
  }
  if (key === "verzRoem" && n >= s.rounds) lines.push("Dit afgelopen potje wordt in het overzicht bijgewerkt. Eerdere potjes blijven zoals ze waren.");
  else lines.push("Potjes die al in het overzicht staan, blijven zoals ze waren.");
  const label = key === "rounds" ? value + " rondes" : (value === "eigen" ? "alleen eigen roem bij verzaken" : "alle roem bij verzaken");
  return '<div class="setwarn" id="setWarn" role="alert"><b>Spelregel wijzigen tijdens een potje</b>' + lines.map(l => '<p>' + esc(l) + '</p>').join("") +
    '<div class="actions"><button class="btn small ghost" id="setNo">Annuleer</button><button class="btn small primary" id="setYes">Ja, ' + esc(label) + '</button></div></div>';
}
async function applySetting(key, value) {
  // Met de nieuwe regel rekenen: de bijgewerkte groep is mogelijk nog niet terug van Firebase
  const next = Object.assign({}, S(), { [key]: value });
  try { await updateDoc(gRef, { ["settings." + key]: value }); } catch (e) { failWrite(e); renderGroupBox(); return; }
  syncFinish(next);
}
// Na een gewijzigde spelregel kan een potje klaar zijn, weer verder gaan of een andere stand hebben
function syncFinish(set) {
  const c = cur(), list = rounds();
  if (!list.length) return;
  const fin = list.length >= set.rounds, gdoc = doc(db, "groups", activeId, "games", c.id);
  if (fin) {
    const at = c.finishedAt || nowIso();
    if (!c.finishedAt) updateDoc(gRef, { "current.finishedAt": at }).catch(failWrite);
    setDoc(gdoc, gameDoc(list, at, set)).catch(failWrite);
  } else if (c.finishedAt) {
    updateDoc(gRef, { "current.finishedAt": deleteField() }).catch(failWrite);
    deleteDoc(gdoc).catch(() => {});
  }
}

function renderPlayers() {
  const ed = $("playersEd"); if (!ed) return; ed.innerHTML = "";
  ["w", "z"].forEach((t, ti) => {
    const box = document.createElement("div"); box.className = "team";
    box.innerHTML = '<div class="hnote">Koppel ' + (ti + 1) + '</div>';
    [0, 1].forEach(i => {
      const id = "pl-" + t + i, pl = players()[t][i] || {};
      const row = document.createElement("div"); row.className = "prow";
      row.innerHTML = avatar(t, i) + '<input type="text" id="' + id + '" maxlength="14" aria-label="Naam speler" value="' + esc(pl.n || "") + '">' +
        '<label class="btn small ghost" for="' + id + '-f">Foto</label><input class="sr" type="file" accept="image/*" id="' + id + '-f">' +
        (pl.img ? '<button class="btn small ghost" id="' + id + '-x" aria-label="Foto verwijderen">×</button>' : '');
      box.appendChild(row);
      row.querySelector("#" + id).addEventListener("input", e => { const v = e.target.value; clearTimeout(playersT); playersT = setTimeout(() => setPlayer(t, i, { n: v.trim() }), 700); });
      row.querySelector("#" + id).addEventListener("blur", () => setTimeout(() => { if (!editingInBox()) render(); }, 900));
      row.querySelector("#" + id + "-f").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) setPhoto(t, i, f); });
      const x = row.querySelector("#" + id + "-x"); if (x) x.onclick = () => setPlayer(t, i, { img: null });
    });
    ed.appendChild(box);
  });
}
function setPlayer(t, i, patch) {
  const pl = JSON.parse(JSON.stringify(players()));
  pl[t][i] = Object.assign({}, pl[t][i], patch);
  const upd = { players: pl };
  updateDoc(gRef, upd).catch(failWrite);
}
function setPhoto(t, i, file) {
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    const S2 = 112, c = document.createElement("canvas"); c.width = c.height = S2;
    const m = Math.min(img.width, img.height);
    c.getContext("2d").drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S2, S2);
    URL.revokeObjectURL(url); setPlayer(t, i, { img: c.toDataURL("image/jpeg", 0.72) });
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast("Deze foto kan niet worden gelezen."); };
  img.src = url;
}
async function leaveGroup() {
  const id = activeId;
  try { await updateDoc(gRef, { ["members." + uid]: deleteField() }); } catch (e) { failWrite(e); return; }
  removeMyGroup(id); next();
}
async function deleteGroup() {
  const id = activeId;
  try {
    const qs = await getDocs(collection(db, "groups", id, "games"));
    const b = writeBatch(db); qs.docs.forEach(d => b.delete(d.ref)); await b.commit();
    stopListening(); await deleteDoc(doc(db, "groups", id));
  } catch (e) { failWrite(e); return; }
  removeMyGroup(id); next(); toast("Groep verwijderd.");
}

// ---------- Groep openen, maken, lid worden ----------
function stopListening() { if (unsubG) unsubG(); if (unsubH) unsubH(); unsubG = unsubH = null; clearTimeout(gTimer); }
function openGroup(id) {
  stopListening();
  view = "group"; activeId = id; LS.set(AKEY, id);
  group = null; games = []; gState = "loading"; prevLen = null; prevGameId = null; askDel = null; askNew = askTake = askDanger = false; resetDraft();
  render();
  gRef = doc(db, "groups", id);
  gTimer = setTimeout(() => { if (gState === "loading") { gState = "slow"; render(); } }, 10000);
  let tries = 0; lastErr = "";
  const listen = () => { unsubG = onSnapshot(gRef, snap => {
    const fromCache = !!(snap.metadata && snap.metadata.fromCache);
    if (!snap.exists()) { if (!fromCache) { gState = "gone"; render(); } return; }
    const d = snap.data();
    if (!d.members || !d.members[uid]) { gState = "gone"; render(); return; }
    clearTimeout(gTimer);
    group = d; gState = "ok";
    keepJoinInUrl(id, d.code);
    if (me().name !== d.name) upsertMyGroup(id, { name: d.name });
    const c = cur(), n = rounds().length;
    if (prevLen !== null && prevGameId === c.id && prevLen < R() && n >= R()) { setTimeout(() => { $("winCard").scrollIntoView({ behavior: "smooth", block: "start" }); celebrate(); }, 250); }
    if (prevGameId !== null && prevGameId !== c.id) resetDraft();
    prevLen = n; prevGameId = c.id;
    if (editing >= n) resetDraft();
    if (!isWriter()) { editing = -1; }
    render();
  }, e => {
    // Een geweigerde of afgebroken verbinding een paar keer opnieuw proberen voordat we opgeven
    lastErr = (e && (e.code || e.message)) || "onbekend";
    console.warn("groep", e);
    if (tries < 3 && activeId === id && view === "group") { tries++; setTimeout(() => { if (activeId === id && view === "group") listen(); }, 1200 * tries); }
    else { gState = "gone"; render(); }
  }); };
  listen();
  unsubH = onSnapshot(collection(db, "groups", id, "games"), qs => {
    games = qs.docs.map(d => Object.assign({ id: d.id }, d.data()));
    if (gState === "ok") renderHist();
  }, () => {});
}
function next() { if (myGroups.length) openGroup(myGroups[0].id); else showWelcome(); }

function showWelcome() {
  stopListening(); view = "welcome"; gState = "idle"; $("nMsg").textContent = ""; render();
}
function renderWelcome() {
  show(["welcome"]);
  $("nBack").hidden = !myGroups.length;
}
async function createGroup() {
  const nm = $("nGroup").value.trim(), ps = ["n10", "n11", "n20", "n21"].map(i => $(i).value.trim());
  if (!nm) { $("nMsg").textContent = "Geef de groep een naam."; $("nGroup").focus(); return; }
  if (ps.some(p => !p)) { $("nMsg").textContent = "Vul de namen van alle vier de spelers in."; return; }
  const ref = doc(collection(db, "groups")), code = rid(20);
  const data = {
    name: nm, code, owner: uid, createdAt: nowIso(),
    members: { [uid]: { code, at: nowIso() } },
    players: { w: [{ n: ps[0], img: null }, { n: ps[1], img: null }], z: [{ n: ps[2], img: null }, { n: ps[3], img: null }] },
    settings: DEFAULT_SETTINGS,
    current: { id: newId(), rounds: [], writer: uid, writerName: "", startedAt: nowIso() }
  };
  if (!navigator.onLine) { $("nMsg").textContent = "Een groep maken kan alleen met internet."; return; }
  $("nCreate").disabled = true; $("nCreate").textContent = "Groep maken…"; $("nMsg").textContent = "";
  try {
    // Eerst wachten tot Firebase de groep heeft. Anders vraagt de app hem op voordat hij bestaat en weigert Firebase dat.
    await setDoc(ref, data);
  } catch (e) {
    console.warn(e);
    $("nMsg").textContent = "De groep kon niet worden gemaakt (" + (e.code || e.message) + "). " +
      (e.code === "permission-denied" ? "Controleer of de Firestore-regels zijn gepubliceerd." : "Controleer je verbinding en probeer het opnieuw.");
    $("nCreate").disabled = false; $("nCreate").textContent = "Groep maken";
    return;
  }
  $("nCreate").disabled = false; $("nCreate").textContent = "Groep maken";
  upsertMyGroup(ref.id, { name: nm });
  ["nGroup", "n10", "n11", "n20", "n21"].forEach(i => { $(i).value = ""; });
  openGroup(ref.id);
  setTimeout(() => { $("groupBox").open = true; }, 50);
}
async function joinGroup(id, code) {
  msg('<h2>Lid worden…</h2><p>Even geduld, de groep wordt geopend.</p>');
  try {
    await updateDoc(doc(db, "groups", id), { ["members." + uid]: { code, at: nowIso() } });
  } catch (e) {
    console.warn(e);
    const offline = !navigator.onLine;
    msg('<h2>Deze link werkt niet</h2><p class="bad">' + (offline ? "Je bent offline. Open de link opnieuw als je verbinding hebt." : "De link is verlopen of klopt niet. Vraag de groep om de nieuwste link.") + '</p><div class="actions"><button class="btn primary" id="jOk">Verder</button></div>');
    $("jOk").onclick = () => { clearJoin(); next(); };
    return;
  }
  if (standalone) clearJoin();
  if (!myGroups.some(g => g.id === id)) upsertMyGroup(id, { name: "" });
  openGroup(id);
}
function clearJoin() { try { history.replaceState(null, "", location.pathname); } catch (e) { location.hash = ""; } }

// ---------- Gebeurtenissen ----------
$("playW").onclick = () => { draft.p = "w"; renderForm(); };
$("playZ").onclick = () => { draft.p = "z"; renderForm(); };
$("verzW").onclick = () => { draft.v = draft.v === "w" ? null : "w"; renderForm(); };
$("verzZ").onclick = () => { draft.v = draft.v === "z" ? null : "z"; renderForm(); };
$("ptsW").addEventListener("input", e => setPts("w", e.target.value));
$("ptsZ").addEventListener("input", e => setPts("z", e.target.value));
const onBlur = () => { if ($("summary").hidden) renderForm(); };
$("ptsW").addEventListener("blur", onBlur); $("ptsZ").addEventListener("blur", onBlur);
document.querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => {
  const k = b.dataset.t === "w" ? "rw" : "rz", v = +b.dataset.v; draft[k] = v === 0 ? 0 : draft[k] + v; renderForm();
}));
$("save").onclick = () => {
  if ($("save").disabled) return;
  if (!draft.p) { needP = true; renderForm(); $("playSeg").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  showSummary();
};
$("sumBack").onclick = () => { $("summary").hidden = true; $("formActions").hidden = false; };
$("sumOk").onclick = () => {
  const r = buildRound(), list = rounds().slice();
  if (editing >= 0) list[editing] = r; else list.push(r);
  resetDraft(); saveRounds(list); render();
  if (list.length < R()) $("formTitle").scrollIntoView({ behavior: "smooth", block: "center" });
};
$("cancelEdit").onclick = () => { resetDraft(); render(); };
$("deleteRound").onclick = () => { if (editing < 0) return; const list = rounds().slice(); list.splice(editing, 1); resetDraft(); saveRounds(list); render(); };
$("gNameBtn").onclick = () => { $("groupBox").open = true; $("groupBox").scrollIntoView({ behavior: "smooth", block: "start" }); };
$("nCreate").onclick = createGroup;
$("nBack").onclick = () => next();
$("nJoin").onclick = () => {
  const j = parseJoin($("nLink").value);
  if (!j) { $("nMsg").textContent = "Dit is geen uitnodigingslink van het scoreblok."; return; }
  $("nLink").value = ""; joinGroup(j.id, j.code);
};
addEventListener("hashchange", () => { const j = parseJoin(location.hash); if (j && uid) joinGroup(j.id, j.code); });
$("homeClose").onclick = () => { LS.set("kj-tip-beginscherm", true); $("homeTip").hidden = true; };

// ---------- Opstarten ----------
function boot() {
  $("ver").textContent = "v" + APP_VERSIE;
  if (!CFG.apiKey || !CFG.projectId) { msg('<h2>Nog niet ingesteld</h2><p>Vul de Firebase-gegevens in bij config.js.</p>'); return; }
  const app = initializeApp({ apiKey: CFG.apiKey, authDomain: CFG.projectId + ".firebaseapp.com", projectId: CFG.projectId });
  try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch (e) { db = getFirestore(app); }
  const auth = getAuth(app);
  let started = false;
  onAuthStateChanged(auth, u => {
    if (!u) {
      signInAnonymously(auth).catch(e => {
        console.warn(e);
        msg('<h2>Opstarten lukt niet</h2><p class="bad">' + (navigator.onLine ? "Firebase weigert de verbinding. Staat anoniem inloggen aan?" : "De eerste keer opstarten kan alleen met internet.") + '</p>');
      });
      return;
    }
    uid = u.uid;
    if (started) return; started = true;
    const j = parseJoin(location.search + location.hash);
    // Al lid (bijv. de app op het beginscherm start met de uitnodiging in het adres): gewoon openen
    if (j && myGroups.some(g => g.id === j.id)) { if (standalone) clearJoin(); openGroup(activeId && myGroups.some(g => g.id === activeId) ? activeId : j.id); }
    else if (j) joinGroup(j.id, j.code);
    else if (activeId && myGroups.some(g => g.id === activeId)) openGroup(activeId);
    else next();
  });
}
boot();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
