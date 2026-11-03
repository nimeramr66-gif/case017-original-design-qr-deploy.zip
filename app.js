// Public anon key only. Never place Supabase service_role in browser code.
const CONFIG = {
  url: "https://vzanygjerpvjehkxlzgr.supabase.co",
  anonKey: "sb_publishable_M63V6c8jDiglgAjQCVkfFQ_fYbGbRuw"
};
let db = null;
const $ = id => document.getElementById(id);
if (CONFIG.url && CONFIG.anonKey && window.supabase) {
  db = window.supabase.createClient(CONFIG.url, CONFIG.anonKey);
}

const labels = {
  overview: "النظرة العامة", events: "الأحداث", people: "الأشخاص",
  evidence: "الأدلة", documents: "الوثائق", recordings: "التسجيلات", notes: "دفتر المحقق"
};
const descriptions = {
  overview: "ملف القضية 017 مفتوح. راجع الأدلة والوثائق واربط المعلومات قبل الوصول إلى استنتاجك.",
  events: "التسلسل الزمني للأحداث المعتمدة في القضية سيظهر هنا.",
  people: "ملفات الأشخاص والشخصيات المرتبطة بالقضية ستظهر هنا.",
  evidence: "مستودع الأدلة والصور والمرفقات سيظهر هنا.",
  documents: "الوثائق والتقارير والإيصالات المرتبطة بالقضية.",
  recordings: "التسجيلات الصوتية مع وصف كل تسجيل ومشغل خاص.",
  notes: ""
};
const statusLabels = { active: "متاح", used: "مستخدم", revoked: "ملغى", cancelled: "ملغى", canceled: "ملغى" };

// ---- جدول الملاحظات: عدّل أسماء الأعمدة هنا إن اختلفت في قاعدتك ----
const NOTES = { table: "investigator_notes", userCol: "user_id", textCol: "content" };

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function show(id) {
  ["gate", "workspace", "admin"].forEach(x => $(x).classList.toggle("hidden", x !== id));
  document.body.classList.toggle("in-case", id === "workspace");
  $("userchip").classList.toggle("hidden", id !== "workspace");
  const n = $("who").textContent || localStorage.getItem("tls017_name") || "المحقق";
  $("uname").textContent = "المحقق: " + n; $("av").textContent = n.trim().charAt(0) || "م";
}
let toastTimer;
function toast(s) {
  $("toast").textContent = s;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2300);
}

// ---------------- ملاحظات المحقق (Supabase + نسخة احتياطية محلية) ----------------
async function currentUserId() {
  if (!db) return null;
  const { data } = await db.auth.getSession();
  return data?.session?.user?.id || null;
}
async function loadNotes() {
  const local = localStorage.getItem("tls017_notes") || "";
  try {
    const uid = await currentUserId();
    if (!uid) return local;
    const { data, error } = await db.from(NOTES.table).select("*")
      .eq(NOTES.userCol, uid).order("created_at", { ascending: false }).limit(1);
    if (error) throw error;
    return data && data[0] ? (data[0][NOTES.textCol] ?? "") : local;
  } catch (e) {
    console.warn("loadNotes:", e.message);
    return local;
  }
}
async function saveNotes(text) {
  localStorage.setItem("tls017_notes", text); // نسخة احتياطية
  try {
    const uid = await currentUserId();
    if (!uid) throw new Error("لا توجد جلسة");
    const { data: existing, error: e1 } = await db.from(NOTES.table).select("id")
      .eq(NOTES.userCol, uid).order("created_at", { ascending: false }).limit(1);
    if (e1) throw e1;
    let res;
    if (existing && existing[0]) {
      res = await db.from(NOTES.table).update({ [NOTES.textCol]: text }).eq("id", existing[0].id);
    } else {
      res = await db.from(NOTES.table).insert({ [NOTES.userCol]: uid, [NOTES.textCol]: text });
    }
    if (res.error) throw res.error;
    toast("حُفظت الملاحظات في حسابك");
  } catch (e) {
    console.warn("saveNotes:", e.message);
    toast("حُفظت على هذا الجهاز فقط: " + e.message);
  }
}

// ---------------- لوحة المحقق ----------------
let loggedIn = false;
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const seenEv = () => LS.get("tls017_seen", []);
const stages = () => LS.get("tls017_stages", [false, false, false]);
const logEv = t => { const l = LS.get("tls017_log", []); l.unshift({ t, at: new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit", numberingSystem: "latn" }) }); LS.set("tls017_log", l.slice(0, 12)); };
const evOpen = EVID.filter(e => !e.locked);
function progress() {
  const st = stages(), all = seenEv().length >= evOpen.length;
  return Math.round(seenEv().length / evOpen.length * 55 + (all ? 15 : 0) + st.filter(Boolean).length / 3 * 30);
}
function cmodal(html) { $("cbody").innerHTML = html; $("cmodal").classList.remove("hidden"); document.body.style.overflow = "hidden"; }
$("cx").onclick = () => { $("cmodal").classList.add("hidden"); document.body.style.overflow = ""; };
$("cmodal").onclick = e => { if (e.target.id === "cmodal") $("cx").click(); };
const initials = n => n.replace(/^(د\.|المحامي|الرقيب)\s*/, "").trim().charAt(0);
const avatar = p => p.img ? `<img src="${p.img}" alt="${esc(p.name)}">` : `<span class="ph">${esc(initials(p.name))}</span>`;
const kv = rows => `<dl class="kv2">${rows.map(r => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join("")}</dl>`;
const ph = (icon, t, extra = "") => `<div class="wcard"><h3><i>${icon}</i>${t}${extra}</h3>`;

function donut(p) { const c = 2 * Math.PI * 44; return `<svg viewBox="0 0 110 110" class="donut"><circle cx="55" cy="55" r="44" fill="none" stroke="#3a3126" stroke-width="9"/><circle cx="55" cy="55" r="44" fill="none" stroke="url(#gg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c}" transform="rotate(-90 55 55)"/><defs><linearGradient id="gg"><stop offset="0" stop-color="#e6c88f"/><stop offset="1" stop-color="#9a7236"/></linearGradient></defs><text x="55" y="62" text-anchor="middle" fill="#f1e6cf" font-size="22" font-family="Cinzel,serif" font-weight="700">${p}%</text></svg>`; }

const V = {
  dash() {
    const p = progress(), st = stages(), seen = seenEv().length, lg = LS.get("tls017_log", []);
    const stg = [["مراجعة الأدلة", seen >= evOpen.length, 0], ["تحليل التسجيلات", st[0], 1], ["مقابلة الشهود", st[1], 2], ["إعداد التقرير النهائي", st[2], 3]];
    return `<div class="dbanner"><div class="tape">CRIME SCENE · DO NOT CROSS · CRIME SCENE · DO NOT CROSS</div>
      <div class="bq"><q>كل تفصيلة… قد تصنع الفرق</q><small dir="ltr">Every detail… can make the difference</small></div>
      <div class="ccard paper"><img src="assets/cover.jpg" alt=""><div><b>الظل الأخير</b><span>القضية رقم 017</span><small dir="ltr">THE LAST SHADOW<br>CASE FILE 017</small></div><i class="seal">قيد التحقيق</i></div></div>
    <div class="stats4">
      <div class="scard"><i>🗂</i><div><span>الأدلة المراجَعة</span><b>${seen}<em>/${evOpen.length}</em></b></div></div>
      <div class="scard"><i>👥</i><div><span>الشخصيات</span><b>${PEOPLE.length}</b></div></div>
      <div class="scard"><i>🕓</i><div><span>الأحداث المسجلة</span><b>${TIMELINE.length}</b></div></div>
      <div class="scard"><i>✔</i><div><span>التقدم في التحقيق</span><div class="bar"><u style="width:${p}%"></u></div><b class="pc">${p}%</b></div></div></div>
    <div class="g3w">
      ${ph("🎙", "الإحاطة الصوتية", '<button class="mini" data-go="recordings">كل التسجيلات</button>')}<div id="briefing" class="brief"><div class="mic">🎙</div><div class="bt"><p class="mut">جارٍ التحميل…</p></div></div></div>
      ${ph("●", "آخر الأحداث")}<ul class="evl">${lg.slice(0, 4).map(x => `<li><span>${esc(x.t)}</span><em>${esc(x.at)}</em></li>`).join("") || `<li class="mut">لم تفتح أي دليل بعد. ابدأ من «غرفة الأدلة».</li>`}</ul></div>
      ${ph("📍", "خريطة التحقيق")}<div class="mapw"><img src="assets/map.jpg" alt="خريطة مدينة رأس النور"><button class="mini" id="openMap">عرض الخريطة</button></div></div></div>
    <div class="g3w">
      ${ph("ⓘ", "معلومات القضية")}${kv([["المفقود", "سامر فؤاد الخطيب"], ["الموقع", CASE.location], ["الحالة", CASE.status], ["الهدف", "فحص الأدلة وإعادة بناء الأحداث"]])}</div>
      ${ph("◔", "التطور في التحقيق")}<div class="prog">${donut(p)}<ul class="stl">${stg.map(s => `<li class="${s[1] ? "ok" : ""}" ${s[2] ? `data-st="${s[2] - 1}"` : ""}><i>${s[1] ? "✔" : "○"}</i>${s[0]}</li>`).join("")}</ul></div></div>
      ${ph("⚡", "أدوات التحقيق السريعة")}<div class="qt"><button data-go="evidence">🖼<br>عرض الأدلة</button><button data-go="file">🗂<br>فتح الملف</button><button data-go="timeline">📅<br>عرض الخط الزمني</button><button data-go="notes">✎<br>إضافة ملاحظة</button></div></div></div>`;
  },
  file() {
    return `<div class="wcard"><h3><i>📖</i>ما الذي حدث؟</h3>${CASE.story.map(t => `<p>${esc(t)}</p>`).join("")}</div>
    <div class="two"><div class="wcard"><h3><i>👤</i>بيانات المفقود</h3>${kv(CASE.missing)}</div>
    <div class="wcard"><h3><i>📄</i>البلاغ وأمر فتح التحقيق</h3>${kv(CASE.report)}<p class="note">${esc(CASE.goal)}</p></div></div>
    <div class="wcard"><h3><i>🧭</i>مراحل التحقيق</h3><div class="scroll"><table class="tb"><thead><tr><th>#</th><th>المرحلة</th><th>الهدف</th><th>الألغاز</th></tr></thead><tbody>${CASE.stages.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
    <div class="wcard"><h3><i>📑</i>محتويات الملف</h3><ul class="toc">${CASE.sections.map(s => `<li><b>${esc(s[0])}</b><span>${esc(s[1])}</span><em>ص ${esc(s[2])}</em></li>`).join("")}</ul></div>`;
  },
  people() {
    return `<div class="pgrid2">${PEOPLE.map(p => `<button class="pcard2" data-p="${p.id}"><div class="pimg">${avatar(p)}<i class="tg t-${p.tag === "مشتبه" ? "s" : "o"}">${esc(p.tag)}</i></div><b>${esc(p.name)}</b><small>${esc(p.role)}</small></button>`).join("")}</div>`;
  },
  evidence() {
    const seen = seenEv();
    return `<p class="mut">اضغط على الدليل لقراءة تفاصيله. ${seen.length} من ${evOpen.length} تمت مراجعتها.</p><div class="egrid">${EVID.map(e => `<button class="ecard ${e.locked ? "lk" : ""} ${seen.includes(e.id) ? "sn" : ""}" data-e="${e.id}"><span class="eid">${e.id}</span><b>${esc(e.title)}</b><small>${esc(e.at)}${e.when !== "—" ? " · " + esc(e.when) : ""}</small><i>${e.locked ? "🔒" : seen.includes(e.id) ? "✔" : ""}</i></button>`).join("")}</div>`;
  },
  timeline() {
    return `<div class="wcard"><h3><i>🕓</i>التسلسل الزمني الأولي (كما ورد في البلاغ، قبل أي تحقق)</h3><ol class="tl">${TIMELINE.map(t => `<li><time>${esc(t[0])}</time><div><b>${esc(t[1])}</b><small>المصدر: ${esc(t[2])}</small></div><i class="chip ${t[3] === "مؤكد" ? "c1" : "c2"}">${esc(t[3])}</i></li>`).join("")}</ol></div>
    <div class="wcard"><h3><i>🚪</i>ما سجّلته البوابات والحساسات — ليلة 12/03</h3><div class="scroll"><table class="tb"><thead><tr><th>الوقت</th><th>الحدث</th><th>الدليل</th></tr></thead><tbody>${GATE_LOG.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="note">لغز 7: رتّب الليلة بنفسك على ورقتك. ما الذي حدث بين آخر حدث مسجل داخل المستودع وفتح الغرفة 2؟</p></div>`;
  },
  howto() {
    return `<div class="wcard"><h3><i>📜</i>كيف تلعب؟</h3><ol class="how">${CASE.howto.map(t => `<li>${esc(t)}</li>`).join("")}</ol></div>
    <div class="two"><div class="wcard gold"><h3><i>⚖</i>قاعدتان ذهبيتان</h3><ol class="how">${CASE.rules.map(t => `<li>${esc(t)}</li>`).join("")}</ol></div>
    <div class="wcard"><h3><i>🧩</i>ألغاز الملف</h3><ul class="pz">${CASE.puzzles.map(p => `<li><b>${esc(p[0])}</b>${esc(p[1])}</li>`).join("")}</ul></div></div>`;
  },
  notes() {
    return `<div class="wcard"><h3><i>✎</i>دفتر المحقق</h3><p class="mut">دوّن ملاحظاتك واستنتاجاتك. تُحفظ باسم جلستك ولا يراها محقق آخر.</p><textarea id="notes" class="notepad" placeholder="اكتب ملاحظاتك هنا..."></textarea><button id="save" class="btn gold">حفظ الملاحظات</button></div>`;
  },
  settings() {
    return `<div class="wcard"><h3><i>⚙</i>الإعدادات</h3>${kv([["اسم المحقق", localStorage.getItem("tls017_name") || ""], ["نسبة التقدم", progress() + "%"]])}<div class="row2"><button id="resetP" class="btn ghost">تصفير التقدم</button><button id="out3" class="btn ghost">تسجيل الخروج</button></div><p class="note">التقدم يُحفظ على هذا الجهاز فقط. الملاحظات تُحفظ في حسابك.</p></div>`;
  },
  recordings() { return `<div id="recs"></div>`; }
};
const TITLES = { dash: "لوحة التحقيق", file: "ملف القضية", people: "الشخصيات", evidence: "غرفة الأدلة", timeline: "الخط الزمني", howto: "تعليمات المحقق", notes: "الملاحظات", settings: "الإعدادات", recordings: "التسجيلات" };
const KINDMAP = { file: ["case_info"], people: ["character", "suspect"], evidence: ["evidence", "document"], timeline: ["timeline"], howto: ["instruction"], dash: ["announcement", "homepage"] };

async function plog(type, serial, result, details) {
  try { if (db) await db.rpc("log_event", { p_type: type, p_serial: serial || null, p_result: result || "ok", p_details: details || {}, p_session: SID }); } catch (e) { }
}
const SID = sessionStorage.sid || (sessionStorage.sid = crypto.randomUUID());
async function loadContent(v) {
  if (!db || !KINDMAP[v]) return [];
  const { data, error } = await db.from("site_content").select("*").in("kind", KINDMAP[v]).eq("published", true).order("sort");
  return error ? [] : data || [];
}
const contentCard = r => `<div class="wcard"><h3><i>★</i>${esc(r.title)}</h3>${/^https:\/\//.test(r.image_url || "") ? `<img src="${esc(r.image_url)}" alt="" style="max-width:100%;border-radius:8px;margin:8px 0">` : ""}<p style="white-space:pre-wrap">${esc(r.body)}</p></div>`;

async function renderAudio(target, compact) {
  const { data, error } = db ? await db.from("audio_tracks").select("*").eq("published", true).order("created_at") : { data: [] };
  const list = error ? [] : data || [];
  const row = t => `<div class="wcard"><h3><i>🎙</i>${esc(t.title)}</h3><p class="mut">${esc(t.description || "")}</p><button class="btn gold sm play" data-p="${esc(t.path)}">▶ تشغيل</button><div class="ao"></div></div>`;
  if (compact) return list;
  target.innerHTML = list.map(row).join("") || `<div class="wcard"><p class="mut">لا توجد تسجيلات منشورة بعد. ستظهر هنا فور نشرها من الإدارة.</p></div>`;
  target.querySelectorAll(".play").forEach(b => b.onclick = async () => {
    const { data: u, error: e } = await db.storage.from("case-audio").createSignedUrl(b.dataset.p, 600);
    if (e) { toast("تعذر تشغيل التسجيل"); return; }
    b.nextElementSibling.innerHTML = `<audio controls autoplay src="${esc(u.signedUrl)}" style="width:100%;margin-top:8px"></audio>`; plog("audio_play"); logEv("استماع إلى تسجيل صوتي");
  });
}

function bindDash() {
  document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => view(b.dataset.go));
  $("openMap")?.addEventListener("click", () => cmodal(`<h3 class="mh">خريطة مواقع القضية — مدينة رأس النور</h3><img src="assets/map.jpg" alt="الخريطة" style="width:100%;border-radius:8px"><p class="note">الخط المتقطع: الطريق السريع إلى المطار. أزمنة التنقل التقريبية في الصفحة 26 من ملفك الورقي.</p>`));
  document.querySelectorAll("[data-st]").forEach(li => li.onclick = () => { const s = stages(); s[+li.dataset.st] = !s[+li.dataset.st]; LS.set("tls017_stages", s); view("dash"); });
  (async () => {
    const box = $("briefing"); if (!box) return;
    const list = db ? await renderAudio(box, true) : [];
    const t = (list || [])[0];
    if (!document.body.contains(box)) return;
    box.querySelector(".bt").innerHTML = t ? `<b>${esc(t.title)}</b><button class="btn gold sm" id="bp">▶ الاستماع للتسجيل</button><div class="ao"></div>` : `<p class="mut">لم يُنشر تسجيل بعد.</p>`;
    $("bp")?.addEventListener("click", async () => { const { data: u } = await db.storage.from("case-audio").createSignedUrl(t.path, 600); if (u) { box.querySelector(".ao").innerHTML = `<audio controls autoplay src="${esc(u.signedUrl)}" style="width:100%;margin-top:8px"></audio>`; plog("audio_play"); logEv("استماع إلى الإحاطة الصوتية"); } });
  })();
}
function bindPeople() {
  document.querySelectorAll("[data-p]").forEach(b => b.onclick = () => {
    const p = PEOPLE.find(x => x.id === b.dataset.p); logEv("فتح ملف: " + p.name);
    cmodal(`<div class="phead"><div class="pimg big">${avatar(p)}</div><div><h3 class="mh">${esc(p.name)}</h3><span class="tg t-${p.tag === "مشتبه" ? "s" : "o"}">${esc(p.role)}</span></div></div>${kv(p.facts)}${p.sections.map(s => `<h4>${esc(s[0])}</h4><p>${esc(s[1])}</p>`).join("") || `<p class="mut">لا تفاصيل إضافية في الملف.</p>`}`);
    plog("document_access", null, "ok", { person: p.id });
  });
}
function bindEvid() {
  document.querySelectorAll("[data-e]").forEach(b => b.onclick = () => {
    const e = EVID.find(x => x.id === b.dataset.e);
    if (e.locked) { cmodal(`<h3 class="mh">🔒 ${esc(e.id)} — ${esc(e.title)}</h3><p>${esc(e.at)}</p><div class="warnb">${esc(e.locked)}</div><p class="mut">هذا محتوى مختوم؛ لا يُعرض قبل تحقق الشرط حفاظاً على متعة التحقيق.</p>`); return; }
    const seen = seenEv(); if (!seen.includes(e.id)) { seen.push(e.id); LS.set("tls017_seen", seen); logEv(`تم فتح ملف الدليل رقم ${e.id}`); }
    cmodal(`<span class="eid big">${esc(e.id)}</span><h3 class="mh">${esc(e.title)}</h3>${kv([["مكان الضبط", e.at], ["تاريخ الضبط", e.when]])}<p>${esc(e.desc)}</p>${(e.d || []).map(s => `<h4>${esc(s[0])}</h4><p style="white-space:pre-line">${esc(s[1])}</p>`).join("")}${e.puzzle ? `<p class="note">مرتبط بـ ${esc(e.puzzle)}.</p>` : ""}`);
    b.classList.add("sn"); b.querySelector("i").textContent = "✔"; plog("document_access", null, "ok", { evidence: e.id });
  });
}
async function view(v) {
  if (!V[v]) v = "dash";
  document.querySelectorAll("aside nav button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  const el = $("view"); $("title").textContent = TITLES[v];
  el.innerHTML = `<div class="vwrap v-${v}">${V[v]()}</div>`;
  if (v === "dash") bindDash(); if (v === "people") bindPeople(); if (v === "evidence") bindEvid();
  if (v === "notes") { $("notes").value = await loadNotes(); $("save").onclick = () => saveNotes($("notes").value); }
  if (v === "recordings") renderAudio($("recs"));
  if (v === "settings") { $("resetP").onclick = () => { if (confirm("تصفير التقدم المحفوظ على هذا الجهاز؟")) { ["tls017_seen", "tls017_stages", "tls017_log"].forEach(k => localStorage.removeItem(k)); view("settings"); } }; $("out3").onclick = () => $("logout").click(); }
  if (KINDMAP[v]) { const items = await loadContent(v); if (items.length) el.firstChild.insertAdjacentHTML("beforeend", items.map(contentCard).join("")); }
  setTop(v); plog("case_access", null, "ok", { view: v }); window.scrollTo({ top: 0 });
}
document.querySelectorAll("aside nav button").forEach(b => b.onclick = () => view(b.dataset.v));

// القائمة العلوية
function goAccess() {
  $("access").scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => $("name").focus({ preventScroll: true }), 500);
}
function setTop(k) { /* القائمة العلوية مخفية داخل القضية */ }
document.querySelectorAll("[data-h]").forEach(b => b.onclick = e => {
  e.preventDefault();
  const k = b.dataset.h;
  if (k === "home") {
    if (loggedIn) { show("workspace"); view("dash"); }
    else { show("gate"); window.scrollTo({ top: 0, behavior: "smooth" }); setTop("home"); }
    return;
  }
  if (!loggedIn) { show("gate"); toast("أدخل الرقم التسلسلي أولاً لفتح ملف القضية"); goAccess(); return; }
  show("workspace"); view({ overview: "file", people: "people", evidence: "evidence", events: "timeline", documents: "howto" }[k] || "dash");
});
$("startBtn").onclick = goAccess;
$("openBtn").onclick = goAccess;
$("serial").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase(); });
{ const qs = new URLSearchParams(location.search).get("s"); if (qs) { $("serial").value = qs.toUpperCase().slice(0, 23); setTimeout(goAccess, 400); } }

// ---------------- بوابة المحقق ----------------
$("enter").onclick = async () => {
  const name = $("name").value.trim();
  const code = $("serial").value.trim().toUpperCase();
  const msg = t => { $("gateMsg").textContent = t; };
  if (!name || !code) return msg("أدخل اسم المحقق والرقم التسلسلي.");
  if (!/^TLS017-[0-9A-F]{16}$/.test(code)) return msg("صيغة الرقم المطلوبة TLS017-XXXXXXXXXXXXXXXX (16 خانة من 0-9 و A-F)");
  if (!db) return msg("لا يمكن الاتصال بقاعدة البيانات. تحقق من الإنترنت وإعدادات Supabase.");
  $("enter").disabled = true;
  try {
    const { data: s } = await db.auth.getSession();
    if (!s.session) {
      const { error: a } = await db.auth.signInAnonymously();
      if (a) throw a;
    }
    const { data, error } = await db.rpc("claim_case_serial", { p_serial: code, p_investigator_name: name });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || result.success !== true) {
      throw new Error((result && result.message) || "الرقم التسلسلي غير صالح أو مستخدم أو ملغى.");
    }
    localStorage.setItem("tls017_name", name);
    plog("serial_activation", code); plog("login_success", code);
    msg("");
    loggedIn = true;
    $("who").textContent = name;
    show("workspace");
    view("dash");
    setTop("dash");
    window.scrollTo({ top: 0 });
  } catch (e) {
    msg(e.message);
    plog("login_failed", code, "fail", { reason: String(e.message).slice(0, 80) });
  } finally {
    $("enter").disabled = false;
  }
};

// استرجاع الجلسة عند تحديث الصفحة
(async function restore() {
  if (!db) return;
  try {
    const { data } = await db.auth.getSession();
    const name = localStorage.getItem("tls017_name");
    if (data?.session?.is_anonymous && name) {
      loggedIn = true;
      $("who").textContent = name;
      show("workspace");
      view("dash");
      setTop("dash");
    }
  } catch (e) { console.warn("restore:", e.message); }
})();

// ---------------- لوحة المشرف ----------------
let allRows = [];
let lastBatch = [];
$("adminOpen").onclick = () => { location.href = "admin.html"; };
$("back").onclick = () => show(loggedIn ? "workspace" : "gate");

$("login").onclick = async () => {
  if (!db) { $("adminMsg").textContent = "تعذر الاتصال بـ Supabase."; return; }
  try {
    const { data, error } = await db.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
    if (error) throw error;
    const { data: p, error: e } = await db.from("profiles").select("role").eq("id", data.user.id).single();
    if (e) throw e;
    if (p.role !== "admin") {
      await db.auth.signOut();
      throw new Error("الحساب ليس مشرفاً");
    }
    $("adminMsg").textContent = "";
    $("adminLogin").classList.add("hidden");
    $("tools").classList.remove("hidden");
    ensureSearchBox();
    await load();
  } catch (e) {
    $("adminMsg").textContent = e.message;
  }
};

function ensureSearchBox() {
  if ($("search")) return;
  const input = document.createElement("input");
  input.id = "search";
  input.placeholder = "ابحث عن رقم تسلسلي...";
  $("rows").parentNode.insertBefore(input, $("rows"));
  input.oninput = renderRows;
}

function renderRows() {
  const q = ($("search")?.value || "").trim().toUpperCase();
  const rows = q ? allRows.filter(x => String(x.serial_display || "").toUpperCase().includes(q)) : allRows;
  $("rows").innerHTML = rows.map(x => {
    const by = x.used_by_name || x.investigator_name || x.used_by || "";
    const date = x.created_at ? new Date(x.created_at).toLocaleString("ar") : "";
    return `<div class="code">${esc(x.serial_display)} · ${esc(statusLabels[x.status] || x.status)} · ${esc(date)}${by ? " · " + esc(by) : ""}</div>`;
  }).join("") || "لا توجد أرقام.";
}

async function load() {
  const { data, error } = await db.from("serial_codes").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) { toast(error.message); return; }
  allRows = data || [];
  $("total").textContent = allRows.length;
  $("used").textContent = allRows.filter(x => x.status === "used").length;
  $("available").textContent = allRows.filter(x => x.status === "active").length;
  renderRows();
}

$("generate").onclick = async () => {
  const n = Number($("count").value);
  if (!Number.isInteger(n) || n < 1 || n > 100) { toast("العدد من 1 إلى 100"); return; }
  try {
    const { data, error } = await db.rpc("admin_generate_serials", { p_count: n });
    if (error) throw error;
    const list = (data || []).map(c => (typeof c === "string" ? c : c.serial_display));
    $("codes").innerHTML = list.map(c => `<div class="code"><span>${esc(c)}</span><button class="btn ghost sm" data-code="${esc(c)}">نسخ</button></div>`).join("");
    document.querySelectorAll("[data-code]").forEach(b => b.onclick = () =>
      navigator.clipboard.writeText(b.dataset.code).then(() => toast("تم النسخ")));
    lastBatch = list;
    $("pdfNew").classList.toggle("hidden", !list.length);
    await load();
  } catch (e) {
    toast(e.message);
  }
};

$("logout2").onclick = () => $("logout").click();
$("goSet").onclick = () => view("settings");
$("logout").onclick = async () => {
  await plog("logout");
  if (db) await db.auth.signOut();
  localStorage.removeItem("tls017_name");
  allRows = [];
  loggedIn = false;
  setTop("home");
  show("gate");
  window.scrollTo({ top: 0 });
};

// ---------------- تصدير PDF (يفتح نافذة الطباعة → اختر "حفظ كـ PDF") ----------------
function exportPdf(items, title) {
  if (!items.length) { toast("لا توجد أرقام للتصدير"); return; }
  const d = new Date().toLocaleDateString("ar");
  $("printSheet").innerHTML = `<h1>THE LAST SHADOW — CASE FILE 017</h1><p>${esc(title)} · ${esc(d)} · العدد: ${items.length}</p>
    <div class="pgrid">${items.map(i => `<div class="pcard"><small>الظل الأخير · القضية 017</small><b>${esc(i.serial)}</b><span>${esc(i.note || "")}</span></div>`).join("")}</div>`;
  const old = document.title;
  document.title = "CASE-017-serials";
  window.onafterprint = () => { document.title = old; $("printSheet").innerHTML = ""; };
  window.print();
}
$("pdfNew").onclick = () => exportPdf(lastBatch.map(c => ({ serial: c })), "دفعة أرقام جديدة");
$("pdfAll").onclick = () => exportPdf(allRows.map(x => ({
  serial: x.serial_display,
  note: (statusLabels[x.status] || x.status) + (x.created_at ? " · " + new Date(x.created_at).toLocaleDateString("ar") : "")
})), "سجل الأرقام التسلسلية");
