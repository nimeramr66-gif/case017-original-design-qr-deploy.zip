// المفتاح العام فقط. لا تضع service_role هنا أبداً. كل الصلاحيات تُفرض في قاعدة البيانات (RLS + دوال SECURITY DEFINER).
const CFG = { url: "https://vzanygjerpvjehkxlzgr.supabase.co", key: "sb_publishable_M63V6c8jDiglgAjQCVkfFQ_fYbGbRuw" };
const sb = window.supabase.createClient(CFG.url, CFG.key);
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = d => d ? new Date(d).toLocaleString("ar", { numberingSystem: "latn" }) : "—";
const SID = sessionStorage.sid || (sessionStorage.sid = crypto.randomUUID());
const STAFF = ["admin", "super_admin", "content_admin", "support_admin"];
const ROLE_AR = { admin: "مدير عام", super_admin: "مدير عام", content_admin: "مسؤول محتوى", support_admin: "مسؤول دعم", investigator: "محقق" };
const PERMS = { admin: "*", super_admin: "*", content_admin: ["content", "audio"], support_admin: ["serials_read", "users_read", "logs"] };
const ST = { active: "متاح", used: "مستخدم", revoked: "ملغى", expired: "منتهي" };
let me = { id: null, role: null, email: "" };
const can = p => PERMS[me.role] === "*" || (PERMS[me.role] || []).includes(p);

let tt;
function toast(s) { const t = $("#toast"); t.textContent = s; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2800); }
const ok = r => { if (r.error) throw r.error; return r.data; };
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message || String(e)); console.error(e); } };
const log = async (t, serial, result, details) => { try { await sb.rpc("log_event", { p_type: t, p_serial: serial || null, p_result: result || "ok", p_details: details || {}, p_session: SID }); } catch (e) { } };
const badge = s => `<span class="badge b-${esc(s)}">${esc(ST[s] || s)}</span>`;
function modal(html) { $("#mbody").innerHTML = html; $("#modal").classList.remove("hidden"); }
$("#mx").onclick = () => $("#modal").classList.add("hidden");
function download(name, text, type = "text/csv") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + text], { type: type + ";charset=utf-8" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
function csv(rows) { if (!rows.length) return ""; const k = Object.keys(rows[0]); const c = v => `"${String(v ?? "").replace(/"/g, '""')}"`; return [k.join(","), ...rows.map(r => k.map(x => c(typeof r[x] === "object" ? JSON.stringify(r[x]) : r[x])).join(","))].join("\n"); }
function qrCanvas(text, scale = 6) {
  const q = qrcode(0, "M"); q.addData(text); q.make(); const n = q.getModuleCount(), m = 4, c = document.createElement("canvas");
  c.width = c.height = (n + 2 * m) * scale; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.fillStyle = "#000";
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect((k + m) * scale, (r + m) * scale, scale, scale); return c;
}
const siteUrl = serial => location.href.replace(/admin\.html.*$/, "index.html") + "?s=" + encodeURIComponent(serial);
function line(points, color = "#C6A15B") {
  if (!points || !points.length) return `<p class="note">لا توجد بيانات بعد.</p>`;
  const W = 520, H = 180, p = 24, max = Math.max(...points.map(x => x.n), 1);
  const xy = points.map((x, i) => [p + (points.length === 1 ? (W - 2 * p) / 2 : i * (W - 2 * p) / (points.length - 1)), H - p - (x.n / max) * (H - 2 * p)]);
  const path = xy.map((v, i) => (i ? "L" : "M") + v[0].toFixed(1) + " " + v[1].toFixed(1)).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><path d="${path}L${xy.at(-1)[0]} ${H - p}L${xy[0][0]} ${H - p}Z" fill="${color}22"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"/>${xy.map((v, i) => `<circle cx="${v[0]}" cy="${v[1]}" r="3.5" fill="${color}"><title>${esc(points[i].d)}: ${points[i].n}</title></circle>`).join("")}</svg>`;
}

// ---------------- الدخول ----------------
$("#loginForm").onsubmit = guard(async e => {
  e.preventDefault(); $("#loginMsg").textContent = ""; $("#loginBtn").disabled = true;
  try {
    const d = ok(await sb.auth.signInWithPassword({ email: $("#em").value.trim(), password: $("#pw").value }));
    const p = ok(await sb.from("profiles").select("role,suspended").eq("id", d.user.id).single());
    if (!STAFF.includes(p.role) || p.suspended) { await sb.auth.signOut(); throw new Error("هذا الحساب ليس حساب إدارة"); }
    me = { id: d.user.id, role: p.role, email: d.user.email }; boot(); log("admin_login");
  } catch (err) { $("#loginMsg").textContent = err.message; } finally { $("#loginBtn").disabled = false; }
});
$("#forgot").onclick = guard(async () => {
  const em = $("#em").value.trim(); if (!em) { $("#loginMsg").textContent = "اكتب بريدك أولاً"; return; }
  ok(await sb.auth.resetPasswordForEmail(em, { redirectTo: location.href })); $("#loginMsg").textContent = "إن كان البريد مسجلاً فقد أُرسل رابط إعادة التعيين.";
});
$("#logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };
(async () => { // استرجاع جلسة قائمة
  const { data } = await sb.auth.getSession(); if (!data.session) return;
  const { data: p } = await sb.from("profiles").select("role,suspended").eq("id", data.session.user.id).single();
  if (p && STAFF.includes(p.role) && !p.suspended) { me = { id: data.session.user.id, role: p.role, email: data.session.user.email }; boot(); }
})();

// ---------------- الهيكل ----------------
const NAV = [
  ["dashboard", "📊", "لوحة التحكم", "Dashboard", "serials_read"], ["serials", "🔢", "الأرقام التسلسلية", "Serial Codes", "serials_read"],
  ["pdf", "🖨", "مركز الطباعة / PDF", "PDF Generator", "pdf"], ["users", "👥", "المحققون والعملاء", "Users", "users_read"],
  ["sales", "🛒", "المبيعات", "Sales", "sales"], ["products", "🛍", "المنتجات", "Products", "sales"], ["orders", "📦", "طلبات الشراء", "Orders", "sales"], ["messages", "✉", "المحادثات", "Messages", "sales"], ["audio", "🎧", "التسجيلات الصوتية", "Audio Files", "audio"],
  ["content", "🗂", "المحتوى والأدلة", "Content & Evidence", "content"], ["logs", "🕓", "سجل النشاطات", "Activity Logs", "logs"],
  ["admins", "🛡", "حسابات الإدارة", "Administrators", "admins"], ["backup", "☁️", "النسخ الاحتياطي", "Backup & Restore", "backup"]];
function boot() {
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden"); $("#me").textContent = me.email; $("#role").textContent = ROLE_AR[me.role] || me.role; $("#avatar").textContent = (me.email || "A").charAt(0).toUpperCase();
  $("#nav").innerHTML = NAV.filter(n => can(n[4])).map(n => `<button data-k="${n[0]}"><i>${n[1]}</i><span><b>${n[2]}</b><small>${n[3]}</small></span></button>`).join("");
  $("#nav").onclick = e => { const b = e.target.closest("button"); if (b) go(b.dataset.k); };
  $("#burger").onclick = () => $("#side").classList.toggle("open");
  go(can("serials_read") ? "dashboard" : (NAV.find(n => can(n[4])) || [])[0]);
}
const V = {};
async function go(k) {
  $("#side").classList.remove("open"); document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.dataset.k === k));
  $("#main").innerHTML = `<p class="note">جارٍ التحميل…</p>`; await guard(V[k])(); window.scrollTo(0, 0);
}
const main = h => { $("#main").innerHTML = h; };

// ---------------- لوحة التحكم ----------------
function spark(points, color = "#C6A15B") {
  const pts = (points && points.length > 1) ? points : [{ n: 0 }, { n: 0 }];
  const W = 120, H = 50, max = Math.max(...pts.map(x => x.n), 1);
  const xy = pts.map((x, i) => [i * W / (pts.length - 1), H - 6 - (x.n / max) * (H - 14)]);
  const d = xy.map((v, i) => (i ? "L" : "M") + v[0].toFixed(1) + " " + v[1].toFixed(1)).join("");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}L${W} ${H}L0 ${H}Z" fill="${color}22"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
}
function chart(points) {
  if (!points.length) return `<p class="note">لا توجد مبيعات في هذه الفترة.</p>`;
  const W = 640, H = 230, L = 38, B = 26, T = 12, R = 10, max = Math.max(4, Math.ceil(Math.max(...points.map(x => x.n)) / 4) * 4);
  const X = i => L + (points.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (points.length - 1)), Y = n => H - B - (n / max) * (H - B - T);
  const grid = [0, .25, .5, .75, 1].map(f => { const y = Y(max * f); return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#ffffff14"/><text x="${L - 6}" y="${y + 4}" fill="#9b958a" font-size="11" text-anchor="end">${Math.round(max * f)}</text>`; }).join("");
  const xy = points.map((p, i) => [X(i), Y(p.n)]), d = xy.map((v, i) => (i ? "L" : "M") + v[0].toFixed(1) + " " + v[1].toFixed(1)).join("");
  const lab = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => `<text x="${X(i)}" y="${H - 6}" fill="#9b958a" font-size="11" text-anchor="middle">${esc(points[i].d)}</text>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C6A15B" stop-opacity=".55"/><stop offset="1" stop-color="#C6A15B" stop-opacity="0"/></linearGradient></defs>${grid}${lab}<path d="${d}L${xy.at(-1)[0]} ${H - B}L${xy[0][0]} ${H - B}Z" fill="url(#cg)"/><path d="${d}" fill="none" stroke="#e2c487" stroke-width="2.5" stroke-linejoin="round"/>${xy.map((v, i) => `<circle cx="${v[0]}" cy="${v[1]}" r="4" fill="#e2c487" stroke="#080808" stroke-width="1.5"><title>${esc(points[i].d)}: ${points[i].n}</title></circle>`).join("")}</svg>`;
}
function donutSvg(parts, total) {
  const R = 52, C = 2 * Math.PI * R; let off = 0;
  const arcs = parts.filter(p => p.v > 0).map(p => { const len = C * p.v / Math.max(total, 1); const o = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${p.c}" stroke-width="16" stroke-dasharray="${len.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 70 70)"/>`; off += len; return o; }).join("");
  return `<svg viewBox="0 0 140 140"><circle r="${R}" cx="70" cy="70" fill="none" stroke="#ffffff12" stroke-width="16"/>${arcs}<text x="70" y="68" text-anchor="middle" fill="#fff" font-size="21" font-weight="700" font-family="Cinzel,serif">${total}</text><text x="70" y="86" text-anchor="middle" fill="#9b958a" font-size="11">المجموع</text></svg>`;
}
function bucket(rows, days) {
  const now = new Date(); now.setHours(23, 59, 59, 999); const step = days <= 30 ? 1 : days <= 90 ? 7 : 30, n = Math.ceil(days / step), out = [];
  for (let i = n - 1; i >= 0; i--) { const end = new Date(now - i * step * 864e5), start = new Date(end - step * 864e5); const c = rows.filter(r => { const t = new Date(r.purchased_at); return t > start && t <= end; }).length; out.push({ d: end.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), n: c }); }
  return out;
}
V.dashboard = async () => {
  const s = ok(await sb.rpc("admin_stats"));
  const [logs, sales] = await Promise.all([
    can("logs") ? sb.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(5) : { data: [] },
    can("sales") ? sb.from("sales").select("*").order("purchased_at", { ascending: false }).limit(1000) : { data: [] }]);
  const sr = sales.data || [], ev = { serial_activation: ["✔", "تم تفعيل رقم تسلسلي"], login_success: ["🔑", "دخول ناجح"], login_failed: ["⚠", "محاولة دخول فاشلة"], sale_create: ["🛒", "تسجيل شراء جديد"], content_update: ["✎", "تحديث المحتوى"], backup_export: ["☁", "تصدير نسخة احتياطية"], audio_upload: ["🎙", "رفع تسجيل صوتي"], pdf_generation: ["📄", "توليد ملفات PDF"] };
  const sv = s.serials;
  main(`<div class="s4">
   <div class="glass sc4"><i>👥</i><div><span>إجمالي المحققين</span><b>${s.users}</b></div>${spark(s.daily_regs)}</div>
   <div class="glass sc4"><i>💵</i><div><span>مجموع المبالغ المسجلة</span><b>${Number(s.sales.revenue).toLocaleString("en")}</b></div>${spark(s.daily_sales)}</div>
   <div class="glass sc4"><i>🛒</i><div><span>إجمالي الطلبات</span><b>${s.sales.total}</b></div>${spark(s.daily_sales, "#7fb7a0")}</div>
   <div class="glass sc4"><i>▥</i><div><span>الأرقام التسلسلية</span><b>${sv.total}</b></div>${spark(s.daily_events, "#c98b6a")}</div></div>
  <div class="glass sbar"><input id="qs" dir="ltr" placeholder="ابحث عن رقم تسلسلي  TLS017-…"><button class="btn gold" id="qgo">بحث</button></div><div id="qres" class="note"></div>
  <div class="dg a">
   <div class="glass card"><h3>▥ نظرة على المبيعات <span class="seg" id="seg" dir="ltr"><button data-d="7">7D</button><button class="on" data-d="30">30D</button><button data-d="90">90D</button><button data-d="365">1Y</button></span></h3><div id="sch"></div></div>
   <div class="glass card"><h3>◔ حالة الأرقام التسلسلية</h3><div class="donutw">${donutSvg([{ v: sv.active, c: "#4fae6c" }, { v: sv.used, c: "#d9a441" }, { v: sv.revoked, c: "#d84a42" }, { v: sv.expired, c: "#7d7a74" }], sv.total)}
     <ul class="lg"><li><i style="background:#4fae6c"></i>متاح<b>${sv.active}</b></li><li><i style="background:#d9a441"></i>مستخدم<b>${sv.used}</b></li><li><i style="background:#d84a42"></i>ملغى<b>${sv.revoked}</b></li><li><i style="background:#7d7a74"></i>منتهي<b>${sv.expired}</b></li></ul></div></div>
   <div class="glass card"><h3>🔔 آخر النشاطات <button class="link" data-go="logs">عرض الكل</button></h3>${(logs.data || []).map(l => { const e = ev[l.event_type] || ["•", l.event_type]; return `<div class="act"><span class="ic">${e[0]}</span><span>${esc(e[1])}</span><em>${fmt(l.created_at)}</em></div>`; }).join("") || `<p class="note">لا يوجد نشاط مسجّل بعد.</p>`}</div></div>
  <div class="dg b">
   <div class="glass card"><h3>🛒 آخر طلبات الشراء <button class="link" data-go="sales">عرض الكل</button></h3><div class="scroll"><table class="pt"><thead><tr><th>العميل</th><th>الرقم</th><th>المبلغ</th><th>التاريخ</th></tr></thead><tbody>${sr.slice(0, 3).map(r => `<tr><td>${esc(r.customer_name)}</td><td class="ltr">${esc(r.serial || "—")}</td><td>${esc(r.amount)} ${esc(r.currency)}</td><td>${fmt(r.purchased_at)}</td></tr>`).join("") || `<tr><td colspan="4">لا مشتريات مسجّلة.</td></tr>`}</tbody></table></div></div>
   <div class="glass card"><h3>⚡ التحكم السريع</h3><div class="qa3"><button class="btn" data-go="serials"><i>➕</i>توليد أرقام</button><button class="btn" data-go="pdf"><i>📄</i>إنشاء PDF</button><button class="btn" data-go="sales"><i>🧾</i>تسجيل شراء</button></div></div>
   <div class="glass card promo"><span class="st">TOP SECRET</span><b>THE LAST SHADOW</b><em>CASE FILE 017</em><small>Truth hides in the shadows…</small></div></div>`);
  document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  const draw = d => { $("#sch").innerHTML = can("sales") ? chart(bucket(sr, d)) : `<p class="note">لا تملك صلاحية عرض المبيعات.</p>`; document.querySelectorAll("#seg button").forEach(b => b.classList.toggle("on", +b.dataset.d === d)); };
  draw(30); $("#seg").onclick = e => { const b = e.target.closest("button"); if (b) draw(+b.dataset.d); };
  $("#qgo").onclick = guard(async () => {
    const q = $("#qs").value.trim().toUpperCase(); if (!q) return;
    const r = ok(await sb.from("serial_codes").select("*").or(`case_code.ilike.%${q}%,serial_display.ilike.%${q}%`).limit(1));
    if (!r.length) { $("#qres").textContent = "لا يوجد رقم مطابق."; return; }
    $("#qres").innerHTML = `<span class="ltr">${esc(r[0].serial_display)}</span> ${badge(r[0].status)} <button class="btn ghost sm" id="qd">عرض التفاصيل</button>`; $("#qd").onclick = () => serialDetail(r[0]);
  });
};

// ---------------- الأرقام التسلسلية ----------------
let serialCache = [];
V.serials = async () => {
  main(`<h2>الأرقام التسلسلية</h2><div class="glass card"><div class="row"><input id="sq" placeholder="بحث: رقم / اسم عميل / بريد / معرّف محقق"><select id="sf"><option value="">كل الحالات</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
   <button class="btn ghost" id="sx">تصدير CSV</button></div>
   ${can("serials") ? `<div class="row" style="margin-top:10px"><input id="gn" type="number" min="1" max="500" value="10" style="max-width:110px"><button class="btn gold" id="gen">توليد أكواد قضية (6 أرقام)</button><span class="note">حتى 500 في الطلب (تُولَّد على دفعات من 100). لا يمكن أن يتكرر رقم.</span></div>` : ""}
   <div id="gout"></div></div><div class="glass card" style="margin-top:14px"><div class="scroll"><table class="tbl"><thead><tr><th>الرقم</th><th>الحالة</th><th>العميل</th><th>تاريخ الإنشاء</th></tr></thead><tbody id="srows"></tbody></table></div><p class="note" id="scount"></p></div>`);
  serialCache = ok(await sb.from("serial_codes").select("*").order("created_at", { ascending: false }).limit(1000));
  const draw = () => {
    const q = $("#sq").value.trim().toLowerCase(), f = $("#sf").value;
    const rows = serialCache.filter(x => (!f || x.status === f) && (!q || JSON.stringify(x).toLowerCase().includes(q)));
    $("#srows").innerHTML = rows.slice(0, 300).map((x, i) => `<tr class="k" data-i="${serialCache.indexOf(x)}"><td class="ltr">${esc(x.case_code || x.serial_display)}</td><td>${badge(x.status)}</td><td>${esc(x.customer_name || "")}</td><td>${fmt(x.created_at)}</td></tr>`).join("") || `<tr><td colspan="4">لا نتائج</td></tr>`;
    $("#scount").textContent = `${rows.length} نتيجة (يُعرض أول 300) — يُحمَّل آخر 1000 رقم.`; return rows;
  };
  draw(); $("#sq").oninput = draw; $("#sf").onchange = draw;
  $("#srows").onclick = e => { const tr = e.target.closest("tr.k"); if (tr) serialDetail(serialCache[tr.dataset.i]); };
  $("#sx").onclick = () => { download("serials.csv", csv(draw())); log("backup_export", null, "ok", { what: "serials_csv" }); };
  if ($("#gen")) $("#gen").onclick = guard(async () => {
    let n = Math.min(500, Math.max(1, Number($("#gn").value) | 0)), all = []; $("#gen").disabled = true;
    try { while (n > 0) { const c = Math.min(100, n); const d = ok(await sb.rpc("admin_generate_case_codes", { p_count: c })); all.push(...d.map(x => typeof x === "string" ? x : x.case_code)); n -= c; } }
    finally { $("#gen").disabled = false; }
    $("#gout").innerHTML = `<p class="note">تم توليد ${all.length} رقماً.</p><div class="row"><button class="btn ghost sm" id="gcp">نسخ الكل</button><button class="btn ghost sm" id="gcsv">CSV</button></div><div class="ltr" style="max-height:140px;overflow:auto;margin-top:8px">${all.map(esc).join("<br>")}</div>`;
    $("#gcp").onclick = () => navigator.clipboard.writeText(all.join("\n")).then(() => toast("تم النسخ")); $("#gcsv").onclick = () => download("new-serials.csv", "serial\n" + all.join("\n"));
    toast("تم التوليد"); V.serials();
  });
};
async function serialDetail(x) {
  const id = x.id, key = x.case_code || x.serial_display;
  const logs = can("logs") ? ok(await sb.from("activity_logs").select("*").eq("serial", key).order("created_at", { ascending: false }).limit(200)) : [];
  const logins = logs.filter(l => l.event_type === "login_success"), outs = logs.filter(l => l.event_type === "logout");
  const act = logs.filter(l => l.event_type === "serial_activation").at(-1);
  const sessions = new Set(logs.map(l => l.session_id).filter(Boolean)).size;
  const known = ["id", "serial_display", "status", "customer_name", "customer_email", "country", "city", "purchase_ref", "admin_notes", "created_at"];
  const extra = Object.entries(x).filter(([k]) => !known.includes(k) && !/hash|secret|salt/i.test(k));
  const canW = can("serials"), fld = (k, l, t = "text") => `<label>${l}<input data-f="${k}" type="${t}" value="${esc(x[k] ?? "")}" ${canW ? "" : "disabled"}></label>`;
  modal(`<h3 class="ltr" style="margin-top:0">${esc(key)}</h3><div>${badge(x.status)}</div>
   <div class="f2">${fld("customer_name", "اسم العميل")}${fld("customer_email", "البريد", "email")}${fld("country", "الدولة")}${fld("city", "المدينة")}${fld("purchase_ref", "مرجع الشراء")}</div>
   <label>ملاحظات إدارية داخلية<textarea data-f="admin_notes" rows="3" ${canW ? "" : "disabled"}>${esc(x.admin_notes || "")}</textarea></label>
   <dl class="kv"><dt>تاريخ الإنشاء</dt><dd>${fmt(x.created_at)}</dd><dt>أول تفعيل (من السجل)</dt><dd>${fmt(act?.created_at)}</dd><dt>آخر دخول مسجّل</dt><dd>${fmt(logins[0]?.created_at)}</dd>
   <dt>آخر خروج مسجّل</dt><dd>${outs[0] ? fmt(outs[0].created_at) : "غير مسجّل (لا يُسجَّل إلا عند الضغط على خروج)"}</dd><dt>عدد الجلسات المسجّلة</dt><dd>${sessions}</dd>
   ${extra.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</dd>`).join("")}</dl>
   <p class="note">الأحداث أعلاه مأخوذة من سجل الأحداث المسجّلة فقط، وليست تقديراً لوقت مغادرة الزائر.</p>
   <div class="row">${canW ? `<button class="btn gold" id="ssave">حفظ</button>${x.status === "revoked" ? `<button class="btn ghost" id="sre">إعادة التفعيل</button>` : `<button class="btn red" id="srev">إلغاء الرقم</button>`}` : ""}<button class="btn ghost" id="sqr">QR</button></div><div id="sqrout"></div>`);
  $("#sqr")?.addEventListener("click", () => { const c = qrCanvas(siteUrl(key), 5); $("#sqrout").innerHTML = ""; $("#sqrout").append(c); });
  $("#ssave")?.addEventListener("click", guard(async () => { const p = {}; document.querySelectorAll("#mbody [data-f]").forEach(i => p[i.dataset.f] = i.value.trim()); ok(await sb.rpc("admin_update_serial", { p_id: String(id), p })); toast("تم الحفظ"); V.serials(); }));
  const st = s => guard(async () => { if (!confirm(s === "revoked" ? "إلغاء هذا الرقم؟ لن يستطيع صاحبه الدخول." : "إعادة تفعيل الرقم؟")) return; ok(await sb.rpc("admin_set_serial_status", { p_id: String(id), p_status: s })); toast("تم"); $("#modal").classList.add("hidden"); V.serials(); });
  $("#srev")?.addEventListener("click", st("revoked")); $("#sre")?.addEventListener("click", st(x.activated_at || x.used_at || x.used_by ? "used" : "active"));
}

// ---------------- مركز الطباعة / PDF ----------------
V.pdf = async () => {
  const hist = ok(await sb.from("print_jobs").select("*").order("generated_at", { ascending: false }).limit(100));
  main(`<h2>مركز الطباعة / PDF</h2><div class="glass card"><p class="note">ارفع ملف القضية الأصلي (PDF). يُختم على كل نسخة كود قضية فريد من 6 أرقام ورمز QR يفتح بوابة الدخول مع تعبئة الكود، دون تغيير تصميم الصفحات.</p>
   <div class="f2"><label>ملف القضية PDF<input id="pf" type="file" accept="application/pdf"></label><label>اسم القضية<input id="pl" value="CASE FILE 017"></label>
   <label>عدد النسخ (1–200)<input id="pn" type="number" min="1" max="200" value="1"></label><label>موضع الختم<select id="pp"><option value="first">الصفحة الأولى</option><option value="last">الصفحة الأخيرة</option><option value="all">كل الصفحات</option></select></label>
   <label>الزاوية<select id="pc"><option value="br">أسفل اليمين</option><option value="bl">أسفل اليسار</option><option value="tr">أعلى اليمين</option><option value="tl">أعلى اليسار</option></select></label></div>
   <div class="row" style="margin-top:12px"><button class="btn ghost" id="ppv">معاينة (بدون حفظ رقم)</button><button class="btn gold" id="pgo">توليد وتنزيل</button></div><div id="pst" class="note"></div><div id="ppvo"></div></div>
   <div class="glass card" style="margin-top:14px"><h3>سجل الطباعة</h3><div class="scroll"><table class="tbl"><thead><tr><th>الرقم</th><th>القضية</th><th>الحالة</th><th>التاريخ</th><th>العميل</th></tr></thead><tbody>${hist.map(j => `<tr><td class="ltr">${esc(j.serial)}</td><td>${esc(j.case_label)}</td><td>${esc(j.status)}</td><td>${fmt(j.generated_at)}</td><td>${esc(j.customer_name || "")}</td></tr>`).join("") || `<tr><td colspan="5">لا سجل</td></tr>`}</tbody></table></div></div>`);
  async function stamp(bytes, serial) {
    const { PDFDocument, rgb, StandardFonts } = PDFLib, doc = await PDFDocument.load(bytes), font = await doc.embedFont(StandardFonts.CourierBold);
    const png = await doc.embedPng(qrCanvas(siteUrl(serial), 6).toDataURL("image/png")), pages = doc.getPages(), mode = $("#pp").value, cor = $("#pc").value;
    const targets = mode === "first" ? [pages[0]] : mode === "last" ? [pages.at(-1)] : pages;
    for (const pg of targets) {
      const { width: w, height: h } = pg.getSize(), S = 62, m = 16, left = cor.endsWith("l"), top = cor.startsWith("t"), x = left ? m : w - S - m, y = top ? h - S - m - 14 : m + 14;
      pg.drawRectangle({ x: x - 4, y: y - 16, width: S + 8, height: S + 22, color: rgb(1, 1, 1), opacity: .85 }); pg.drawImage(png, { x, y, width: S, height: S });
      pg.drawText(serial, { x: x - 2, y: y - 9, size: 8, font, color: rgb(.1, .1, .1) });
    }
    return doc.save();
  }
  const src = async () => { const f = $("#pf").files[0]; if (!f) throw new Error("اختر ملف PDF أولاً"); if (f.type !== "application/pdf" || f.size > 80e6) throw new Error("ملف PDF غير صالح أو أكبر من 80MB"); return new Uint8Array(await f.arrayBuffer()); };
  $("#ppv").onclick = guard(async () => { const b = await stamp(await src(), "123456"); $("#ppvo").innerHTML = `<iframe class="pv" src="${URL.createObjectURL(new Blob([b], { type: "application/pdf" }))}"></iframe><p class="note">المعاينة بقيمة تجريبية ولا تُسجَّل.</p>`; });
  $("#pgo").onclick = guard(async () => {
    const bytes = await src(), n = Math.min(200, Math.max(1, Number($("#pn").value) | 0)), label = $("#pl").value.trim() || "CASE FILE 017";
    if (!confirm(`سيتم توليد ${n} رقماً جديداً وتسجيلها بشكل دائم. متابعة؟`)) return; $("#pgo").disabled = true; const serials = [];
    try {
      let left = n; while (left > 0) { const c = Math.min(100, left); serials.push(...ok(await sb.rpc("admin_generate_case_codes", { p_count: c })).map(x => typeof x === "string" ? x : x.case_code)); left -= c; }
      const files = []; for (let i = 0; i < serials.length; i++) { $("#pst").textContent = `ختم ${i + 1} / ${serials.length}`; files.push([serials[i], await stamp(bytes, serials[i])]); }
      ok(await sb.from("print_jobs").insert(serials.map(s => ({ serial: s, case_label: label, status: "generated" }))));
      if (files.length === 1) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([files[0][1]], { type: "application/pdf" })); a.download = `${files[0][0]}.pdf`; a.click(); }
      else { const z = new JSZip(); files.forEach(([s, b]) => z.file(`${s}.pdf`, b)); const blob = await z.generateAsync({ type: "blob" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `case017-${files.length}-copies.zip`; a.click(); }
      log("pdf_generation", serials[0], "ok", { count: serials.length, label }); toast("تم التوليد والتسجيل"); V.pdf();
    } finally { $("#pgo").disabled = false; }
  });
};

// ---------------- المحققون ----------------
V.users = async () => {
  const rows = ok(await sb.from("profiles").select("*").order("created_at", { ascending: false }).limit(500));
  main(`<h2>المحققون والعملاء</h2><div class="glass card"><div class="warn">المعلومات المجمعة: معرّف الحساب، الاسم المُدخل عند التفعيل، الرقم التسلسلي، وسجل أحداث الدخول — لازمة لتشغيل الخدمة والدعم. لا يوجد تتبّع GPS أو مراقبة خفية. بيانات العميل (الاسم/البريد/الدولة) تُدخل يدوياً من المشرف.</div>
   <input id="uq" placeholder="بحث بالمعرّف أو الدور"><div class="scroll"><table class="tbl"><thead><tr><th>المعرّف</th><th>الدور</th><th>الحالة</th><th>التسجيل</th></tr></thead><tbody id="urows"></tbody></table></div></div>`);
  const draw = () => { const q = $("#uq").value.trim().toLowerCase(); $("#urows").innerHTML = rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q)).map(r => `<tr class="k" data-id="${esc(r.id)}"><td class="ltr">${esc(r.id)}</td><td>${esc(ROLE_AR[r.role] || r.role || "—")}</td><td>${r.suspended ? '<span class="badge b-revoked">موقوف</span>' : '<span class="badge b-active">نشط</span>'}</td><td>${fmt(r.created_at)}</td></tr>`).join(""); };
  draw(); $("#uq").oninput = draw;
  $("#urows").onclick = guard(async e => {
    const tr = e.target.closest("tr.k"); if (!tr) return; const u = rows.find(r => r.id === tr.dataset.id);
    const logs = can("logs") ? ok(await sb.from("activity_logs").select("*").eq("user_id", u.id).order("created_at", { ascending: false }).limit(30)) : [];
    const ser = ok(await sb.from("serial_codes").select("*").limit(1000)).filter(s => Object.values(s).some(v => v === u.id));
    modal(`<h3 class="ltr" style="margin-top:0">${esc(u.id)}</h3><dl class="kv"><dt>الدور</dt><dd>${esc(ROLE_AR[u.role] || u.role)}</dd><dt>الحالة</dt><dd>${u.suspended ? "موقوف" : "نشط"}</dd><dt>تاريخ التسجيل</dt><dd>${fmt(u.created_at)}</dd><dt>أرقامه</dt><dd class="ltr">${ser.map(s => esc(s.serial_display)).join("<br>") || "—"}</dd></dl>
     ${can("admins") ? `<button class="btn ${u.suspended ? "gold" : "red"}" id="usp">${u.suspended ? "استعادة الحساب" : "إيقاف الحساب"}</button>` : ""}<h3>آخر النشاطات</h3>${logs.map(l => `<div class="act"><span>${esc(l.event_type)}</span><span>${esc(l.result)}</span><em>${fmt(l.created_at)}</em></div>`).join("") || `<p class="note">لا نشاط مسجّل.</p>`}`);
    $("#usp")?.addEventListener("click", guard(async () => { ok(await sb.rpc("admin_set_suspended", { p_id: u.id, p_value: !u.suspended })); toast("تم"); $("#modal").classList.add("hidden"); V.users(); }));
  });
};

// ---------------- المبيعات ----------------
V.sales = async () => {
  const rows = ok(await sb.from("sales").select("*").order("purchased_at", { ascending: false }).limit(1000));
  main(`<h2>المبيعات</h2><div class="glass card"><p class="note">التسجيل يدوي — لا يوجد ربط ببوابة دفع، ولا يُعدّ أي شراء موثَّقاً تلقائياً.</p><form id="sf2" class="f2">
   <label>الرقم التسلسلي (اختياري)<input name="serial" dir="ltr" placeholder="TLS017-…"></label><label>اسم العميل<input name="customer_name" required></label><label>البريد<input name="customer_email" type="email"></label>
   <label>المبلغ<input name="amount" type="number" step="0.01" min="0" required></label><label>العملة<input name="currency" value="USD" maxlength="3"></label><label>طريقة الدفع<input name="method"></label>
   <label>تاريخ ووقت الشراء<input name="purchased_at" type="datetime-local"></label><label>ملاحظات<input name="notes"></label><div><button class="btn gold block">تسجيل الشراء</button></div></form></div>
   <div class="glass card" style="margin-top:14px"><div class="row"><input id="sq2" placeholder="بحث"><button class="btn ghost" id="sx2">تصدير CSV</button></div><div class="scroll"><table class="tbl"><thead><tr><th>التاريخ</th><th>العميل</th><th>الرقم</th><th>المبلغ</th><th>الدفع</th></tr></thead><tbody id="sr2"></tbody></table></div></div>`);
  const draw = () => { const q = $("#sq2").value.trim().toLowerCase(), r = rows.filter(x => !q || JSON.stringify(x).toLowerCase().includes(q)); $("#sr2").innerHTML = r.map(x => `<tr><td>${fmt(x.purchased_at)}</td><td>${esc(x.customer_name)}<br><span class="note">${esc(x.customer_email || "")}</span></td><td class="ltr">${esc(x.serial || "")}</td><td>${esc(x.amount)} ${esc(x.currency)}</td><td>${esc(x.method || "")}</td></tr>`).join("") || `<tr><td colspan="5">لا سجلات</td></tr>`; return r; };
  draw(); $("#sq2").oninput = draw; $("#sx2").onclick = () => { download("sales.csv", csv(draw())); log("backup_export", null, "ok", { what: "sales_csv" }); };
  $("#sf2").onsubmit = guard(async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.serial = (f.serial || "").trim().toUpperCase() || null; f.currency = (f.currency || "USD").toUpperCase();
    f.purchased_at = f.purchased_at ? new Date(f.purchased_at).toISOString() : new Date().toISOString(); f.amount = Number(f.amount);
    if (f.serial) { if (!/^\d{6}$/.test(f.serial)) throw new Error("كود القضية يجب أن يتكون من 6 أرقام"); const s = ok(await sb.from("serial_codes").select("id").eq("case_code", f.serial).limit(1)); if (!s.length) throw new Error("الرقم غير موجود"); f._sid = s[0].id; }
    const sid = f._sid; delete f._sid; const row = ok(await sb.from("sales").insert(f).select().single());
    if (sid) ok(await sb.rpc("admin_update_serial", { p_id: String(sid), p: { customer_name: f.customer_name, customer_email: f.customer_email || "", purchase_ref: row.id.slice(0, 8) } }));
    log("sale_create", f.serial, "ok", { amount: f.amount }); toast("تم تسجيل الشراء"); V.sales();
  });
};

// ---------------- الصوتيات ----------------
const SECTIONS = { recordings: "التسجيلات", overview: "النظرة العامة", events: "الأحداث", people: "الأشخاص", evidence: "الأدلة" };
V.products = async () => {
  const rows=ok(await sb.from("products").select("*").order("sort_order"));
  main(`<h2>إدارة المنتجات</h2><div class="glass card"><div class="f2"><label>اسم المنتج<input id="pn"></label><label>السعر<input id="pp" type="number" min="0" step=".01"></label><label>العملة<select id="pcu"><option>USD</option><option>ILS</option><option>JOD</option></select></label><label>الوصف<input id="pd"></label></div><button class="btn gold" id="padd">إضافة منتج</button></div><div class="glass card">${rows.map(p=>`<div class="act"><span><b>${esc(p.name)}</b><small>${esc(p.description||"")}</small></span><b>${Number(p.price).toFixed(2)} ${esc(p.currency)}</b><span>${p.active?"منشور":"مخفي"}</span><button class="btn ghost sm" data-edit="${p.id}">تعديل</button><button class="btn ghost sm" data-toggle="${p.id}">${p.active?"إخفاء":"نشر"}</button></div>`).join("")||"لا توجد منتجات."}</div>`);
  $("#padd").onclick=guard(async()=>{const name=$("#pn").value.trim(),price=Number($("#pp").value);if(!name||!Number.isFinite(price)||price<0)throw new Error("أدخل الاسم والسعر.");ok(await sb.from("products").insert({name,price,currency:$("#pcu").value,description:$("#pd").value,active:true}));V.products();});
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=guard(async()=>{const p=rows.find(x=>x.id===b.dataset.edit);const name=prompt("اسم المنتج",p.name);if(name===null)return;const price=Number(prompt("السعر",p.price));if(!Number.isFinite(price)||price<0)throw new Error("السعر غير صحيح.");ok(await sb.from("products").update({name:name.trim(),price}).eq("id",p.id));V.products();}));
  document.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=guard(async()=>{const p=rows.find(x=>x.id===b.dataset.toggle);ok(await sb.from("products").update({active:!p.active}).eq("id",p.id));V.products();}));
};
V.orders = async () => {
  const rows=ok(await sb.from("order_requests").select("*").order("created_at",{ascending:false}).limit(500));
  main(`<h2>طلبات الشراء</h2><div class="glass card"><div class="scroll"><table class="tbl"><thead><tr><th>العميل</th><th>المحتويات</th><th>الإجمالي</th><th>الحالة</th><th>التاريخ</th><th>تحديث</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(o.customer_name)}</td><td>${(o.items||[]).map(x=>`${esc(x.name)} × ${x.qty}`).join("<br>")}</td><td>${Number(o.total).toFixed(2)} ${esc(o.currency)}</td><td>${esc(o.status)}</td><td>${fmt(o.created_at)}</td><td><select data-order="${o.id}"><option value="new" ${o.status==="new"?"selected":""}>جديد</option><option value="processing" ${o.status==="processing"?"selected":""}>قيد التجهيز</option><option value="completed" ${o.status==="completed"?"selected":""}>مكتمل</option><option value="cancelled" ${o.status==="cancelled"?"selected":""}>ملغي</option></select></td></tr>`).join("")}</tbody></table></div></div>`);
  document.querySelectorAll("[data-order]").forEach(x=>x.onchange=guard(async()=>{ok(await sb.from("order_requests").update({status:x.value}).eq("id",x.dataset.order));toast("تم تحديث حالة الطلب");}));
};
V.messages = async () => {
  const rows=ok(await sb.from("chat_messages").select("*").order("created_at",{ascending:false}).limit(200));
  main(`<h2>مركز المحادثات</h2><div class="glass card"><div class="scroll">${rows.reverse().map(m=>`<div class="act"><span><b>${esc(m.sender_name)} · ${esc(m.room)}</b><small>${esc(m.body)}</small></span><em>${fmt(m.created_at)}</em></div>`).join("")||"لا توجد رسائل."}</div><div class="f2"><label>القناة<select id="mr"><option value="support">الدعم والإدارة</option><option value="investigators">مجتمع المحققين</option></select></label><label>الرد<input id="mb" maxlength="2000"></label></div><button class="btn gold" id="msend">إرسال رسالة إدارية</button></div>`);
  $("#msend").onclick=guard(async()=>{const body=$("#mb").value.trim();if(!body)return;ok(await sb.from("chat_messages").insert({room:$("#mr").value,sender_id:me.id,sender_name:"الإدارة",body}));V.messages();});
};
V.audio = async () => {
  const rows = ok(await sb.from("audio_tracks").select("*").order("created_at", { ascending: false }));
  main(`<h2>التسجيلات الصوتية</h2><div class="glass card"><div class="f2"><label>ملف صوتي (MP3/WAV/M4A/OGG، حتى 50MB)<input id="af" type="file" accept="audio/*"></label><label>العنوان<input id="at"></label>
   <label>الوصف<input id="ad"></label><label>القسم<select id="as">${Object.entries(SECTIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label></div>
   <button class="btn gold" id="aup" style="margin-top:12px">رفع (يُحفظ كمسودة)</button><span id="ast" class="note"></span></div>
   <div class="glass card" style="margin-top:14px"><div class="scroll"><table class="tbl"><thead><tr><th>العنوان</th><th>القسم</th><th>إصدار</th><th>الحالة</th><th>الرفع</th><th></th></tr></thead><tbody>${rows.map(r => `<tr data-id="${r.id}"><td>${esc(r.title)}<br><span class="note">${esc(r.description || "")}</span></td><td>${esc(SECTIONS[r.section] || r.section)}</td><td>v${r.version}</td><td>${r.published ? '<span class="badge b-active">منشور</span>' : '<span class="badge b-expired">مسودة</span>'}</td><td>${fmt(r.created_at)}</td>
   <td class="row"><button class="btn ghost sm" data-a="play">▶</button><button class="btn ghost sm" data-a="pub">${r.published ? "إلغاء النشر" : "نشر"}</button><button class="btn ghost sm" data-a="ren">إعادة تسمية</button><button class="btn ghost sm" data-a="rep">استبدال</button><button class="btn red sm" data-a="del">حذف</button></td></tr>`).join("") || `<tr><td colspan="6">لا تسجيلات</td></tr>`}</tbody></table></div><div id="apv"></div></div>`);
  const valid = f => { if (!f) throw new Error("اختر ملفاً"); if (!f.type.startsWith("audio/")) throw new Error("نوع الملف غير مسموح"); if (f.size > 52428800) throw new Error("الحجم أكبر من 50MB"); };
  const upload = async f => { valid(f); const path = `${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_")}`; ok(await sb.storage.from("case-audio").upload(path, f, { contentType: f.type, upsert: false })); return path; };
  $("#aup").onclick = guard(async () => { const f = $("#af").files[0]; if (!$("#at").value.trim()) throw new Error("اكتب عنواناً"); $("#aup").disabled = true; try { const path = await upload(f); ok(await sb.from("audio_tracks").insert({ title: $("#at").value.trim(), description: $("#ad").value.trim(), section: $("#as").value, path })); log("audio_upload", null, "ok", { path }); toast("تم الرفع"); V.audio(); } finally { $("#aup").disabled = false; } });
  document.querySelector("tbody").onclick = guard(async e => {
    const b = e.target.closest("[data-a]"); if (!b) return; const id = b.closest("tr").dataset.id, r = rows.find(x => x.id === id);
    if (b.dataset.a === "play") { const u = ok(await sb.storage.from("case-audio").createSignedUrl(r.path, 600)); $("#apv").innerHTML = `<audio controls autoplay src="${esc(u.signedUrl)}" style="width:100%;margin-top:10px"></audio>`; }
    if (b.dataset.a === "pub") { ok(await sb.from("audio_tracks").update({ published: !r.published, updated_at: new Date().toISOString() }).eq("id", id)); log("audio_update", null, "ok", { id, published: !r.published }); V.audio(); }
    if (b.dataset.a === "ren") { const t = prompt("العنوان الجديد", r.title); if (t) { ok(await sb.from("audio_tracks").update({ title: t.trim(), updated_at: new Date().toISOString() }).eq("id", id)); V.audio(); } }
    if (b.dataset.a === "rep") { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "audio/*"; inp.onchange = guard(async () => { const path = await upload(inp.files[0]); ok(await sb.from("audio_tracks").update({ path, version: r.version + 1, history: [...(r.history || []), { path: r.path, v: r.version, at: new Date().toISOString() }], updated_at: new Date().toISOString() }).eq("id", id)); log("audio_update", null, "ok", { id, replaced: true }); toast("تم الاستبدال (النسخة القديمة محفوظة في السجل)"); V.audio(); }); inp.click(); }
    if (b.dataset.a === "del") { if (!confirm("حذف التسجيل وملفاته نهائياً؟")) return; await sb.storage.from("case-audio").remove([r.path, ...(r.history || []).map(h => h.path)]); ok(await sb.from("audio_tracks").delete().eq("id", id)); log("audio_delete", null, "ok", { id }); V.audio(); }
  });
};

// ---------------- المحتوى ----------------
const KINDS = { homepage: "الصفحة الرئيسية", case_info: "معلومات القضية", character: "شخصيات", suspect: "مشتبه بهم", evidence: "أدلة", document: "وثائق", timeline: "خط زمني", instruction: "تعليمات المحقق", announcement: "إعلانات" };
let curKind = "case_info";
V.content = async () => {
  const rows = ok(await sb.from("site_content").select("*").eq("kind", curKind).order("sort").order("created_at", { ascending: false }));
  main(`<h2>المحتوى والأدلة</h2><div class="glass card"><div class="row"><select id="ck">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${k === curKind ? "selected" : ""}>${v}</option>`).join("")}</select><button class="btn gold" id="cnew">+ إضافة</button></div>
   <p class="note">أدخل المحتوى الأصلي للقضية بنفسك — النظام لا يولّد معلومات. الصور: ضع رابط صورة (https) أو مسارها.</p></div>
   <div class="glass card" style="margin-top:14px">${rows.map(r => `<div class="act" data-id="${r.id}"><b>${esc(r.title)}</b>${r.published ? '<span class="badge b-active">منشور</span>' : '<span class="badge b-expired">مسودة</span>'}<em class="row"><button class="btn ghost sm" data-a="pv">معاينة</button><button class="btn ghost sm" data-a="ed">تعديل</button><button class="btn ghost sm" data-a="pub">${r.published ? "إلغاء النشر" : "نشر"}</button><button class="btn red sm" data-a="del">حذف</button></em></div>`).join("") || `<p class="note">لا عناصر في هذا القسم.</p>`}</div>`);
  $("#ck").onchange = e => { curKind = e.target.value; V.content(); };
  const form = r => { modal(`<h3 style="margin-top:0">${r ? "تعديل" : "إضافة"} — ${KINDS[curKind]}</h3><label>العنوان<input id="ct" value="${esc(r?.title || "")}"></label><label>النص<textarea id="cb" rows="6">${esc(r?.body || "")}</textarea></label><label>رابط الصورة<input id="ci" dir="ltr" value="${esc(r?.image_url || "")}"></label><label>الترتيب<input id="cs" type="number" value="${r?.sort ?? 0}"></label><label><input id="cp" type="checkbox" style="width:auto" ${r?.published ? "checked" : ""}> منشور</label><button class="btn gold block" id="csv">حفظ</button>`);
    $("#csv").onclick = guard(async () => { const o = { kind: curKind, title: $("#ct").value.trim(), body: $("#cb").value, image_url: $("#ci").value.trim() || null, sort: Number($("#cs").value) | 0, published: $("#cp").checked, updated_at: new Date().toISOString() }; if (!o.title) throw new Error("العنوان مطلوب"); if (o.image_url && !/^https:\/\//.test(o.image_url)) throw new Error("رابط الصورة يجب أن يبدأ بـ https://"); ok(r ? await sb.from("site_content").update(o).eq("id", r.id) : await sb.from("site_content").insert(o)); log("content_update", null, "ok", { kind: curKind }); $("#modal").classList.add("hidden"); V.content(); }); };
  $("#cnew").onclick = () => form(null);
  $("#main").querySelector(".card:last-child").onclick = guard(async e => { const b = e.target.closest("[data-a]"); if (!b) return; const id = b.closest(".act").dataset.id, r = rows.find(x => x.id === id);
    if (b.dataset.a === "ed") form(r); if (b.dataset.a === "pv") modal(`<h3 style="margin-top:0">${esc(r.title)}</h3>${r.image_url ? `<img src="${esc(r.image_url)}" alt="" style="max-width:100%;border-radius:6px">` : ""}<p style="white-space:pre-wrap">${esc(r.body)}</p>`);
    if (b.dataset.a === "pub") { ok(await sb.from("site_content").update({ published: !r.published }).eq("id", id)); log("content_update", null, "ok", { id }); V.content(); }
    if (b.dataset.a === "del" && confirm("حذف العنصر؟")) { ok(await sb.from("site_content").delete().eq("id", id)); log("content_update", null, "ok", { id, deleted: true }); V.content(); } });
};

// ---------------- السجلات ----------------
V.logs = async () => {
  const rows = ok(await sb.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(1000));
  const types = [...new Set(rows.map(r => r.event_type))];
  main(`<h2>سجل النشاطات</h2><div class="warn">هذا السجل يعرض الأحداث المُسجَّلة فقط. لا يُعرف وقت مغادرة الزائر إلا إذا سُجّل حدث خروج. أحداث الزوار تُرسل من المتصفح (client-reported).</div><div class="glass card"><div class="row"><input id="lq" placeholder="بحث"><select id="lt"><option value="">كل الأحداث</option>${types.map(t => `<option>${esc(t)}</option>`).join("")}</select><input id="ld1" type="date"><input id="ld2" type="date"><button class="btn ghost" id="lx">CSV</button></div>
   <div class="scroll"><table class="tbl"><thead><tr><th>الوقت</th><th>الحدث</th><th>المستخدم</th><th>الرقم</th><th>الجلسة</th><th>النتيجة</th><th>تفاصيل</th></tr></thead><tbody id="lr"></tbody></table></div><p class="note" id="lc"></p></div>`);
  const draw = () => { const q = $("#lq").value.trim().toLowerCase(), t = $("#lt").value, a = $("#ld1").value, b = $("#ld2").value;
    const r = rows.filter(x => (!t || x.event_type === t) && (!a || x.created_at.slice(0, 10) >= a) && (!b || x.created_at.slice(0, 10) <= b) && (!q || JSON.stringify(x).toLowerCase().includes(q)));
    $("#lr").innerHTML = r.slice(0, 300).map(x => `<tr><td>${fmt(x.created_at)}</td><td>${esc(x.event_type)}</td><td class="ltr">${esc((x.user_id || "").slice(0, 8))}</td><td class="ltr">${esc(x.serial || "")}</td><td class="ltr">${esc((x.session_id || "").slice(0, 8))}</td><td>${esc(x.result)}</td><td class="ltr">${esc(JSON.stringify(x.details || {}))}</td></tr>`).join("") || `<tr><td colspan="7">لا نتائج</td></tr>`;
    $("#lc").textContent = `${r.length} نتيجة`; return r; };
  draw(); ["#lq", "#lt", "#ld1", "#ld2"].forEach(s => $(s).oninput = draw); $("#lx").onclick = () => download("activity.csv", csv(draw()));
};

// ---------------- حسابات الإدارة ----------------
V.admins = async () => {
  const rows = ok(await sb.from("profiles").select("*").in("role", STAFF));
  main(`<h2>حسابات الإدارة</h2><div class="glass card"><p class="note">لكل مشرف حساب فردي. أنشئ المستخدم أولاً من Supabase ← Authentication ← Users، ثم عيّن دوره هنا بالبريد.</p><div class="row"><input id="re" type="email" dir="ltr" placeholder="البريد"><select id="rr"><option value="super_admin">مدير عام</option><option value="content_admin">مسؤول محتوى</option><option value="support_admin">مسؤول دعم</option><option value="investigator">إزالة الصلاحية (محقق)</option></select><button class="btn gold" id="rgo">تعيين</button></div></div>
   <div class="glass card" style="margin-top:14px"><table class="tbl"><thead><tr><th>المعرّف</th><th>الدور</th><th>الحالة</th></tr></thead><tbody>${rows.map(r => `<tr><td class="ltr">${esc(r.id)}${r.id === me.id ? " (أنت)" : ""}</td><td>${esc(ROLE_AR[r.role])}</td><td>${r.suspended ? "موقوف" : "نشط"}</td></tr>`).join("")}</tbody></table>
   <div class="row" style="margin-top:12px"><button class="btn ghost" id="rso">إنهاء جلساتي الأخرى</button></div><p class="note">المصادقة الثنائية (MFA): غير مفعّلة في هذه النسخة.</p></div>`);
  $("#rgo").onclick = guard(async () => { if (!confirm("تعيين الدور؟")) return; ok(await sb.rpc("admin_set_role", { p_email: $("#re").value.trim(), p_role: $("#rr").value })); toast("تم"); V.admins(); });
  $("#rso").onclick = guard(async () => { ok(await sb.auth.signOut({ scope: "others" })); toast("أُنهيت الجلسات الأخرى"); });
};

// ---------------- النسخ الاحتياطي ----------------
const BK = ["serial_codes", "sales", "site_content", "audio_tracks", "print_jobs", "activity_logs", "profiles"], RESTORABLE = ["sales", "site_content", "audio_tracks"];
V.backup = async () => {
  const hist = ok(await sb.from("backups_log").select("*").order("created_at", { ascending: false }).limit(30));
  main(`<h2>النسخ الاحتياطي</h2><div class="glass card"><div class="row">${BK.map(t => `<button class="btn ghost" data-t="${t}">تصدير ${t}</button>`).join("")}</div>
   <h3 style="margin-top:18px">استعادة (${RESTORABLE.join(", ")} فقط)</h3><div class="warn">الاستعادة تدمج السجلات بحسب id وقد تستبدل سجلات موجودة. لا تُدعم استعادة الأرقام التسلسلية عمداً حتى لا تتكرر أو تُنتهك.</div><div class="row"><input id="bf" type="file" accept=".json"><select id="bt">${RESTORABLE.map(t => `<option>${t}</option>`).join("")}</select><button class="btn red" id="brs">استعادة</button></div></div>
   <div class="glass card" style="margin-top:14px"><h3>سجل النسخ</h3>${hist.map(h => `<div class="act"><span>${esc(h.kind)}</span><span>${h.rows_count} سجل</span><em>${fmt(h.created_at)}</em></div>`).join("") || `<p class="note">لا سجل.</p>`}</div>`);
  document.querySelectorAll("[data-t]").forEach(b => b.onclick = guard(async () => { const t = b.dataset.t; const d = ok(await sb.from(t).select("*").limit(50000)); download(`${t}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 1), "application/json"); ok(await sb.from("backups_log").insert({ kind: t, rows_count: d.length })); log("backup_export", null, "ok", { t }); V.backup(); }));
  $("#brs").onclick = guard(async () => {
    if (!can("backup")) throw new Error("غير مصرح"); const f = $("#bf").files[0]; if (!f) throw new Error("اختر ملف JSON"); const t = $("#bt").value, d = JSON.parse(await f.text());
    if (!Array.isArray(d) || !d.length) throw new Error("الملف فارغ أو غير صالح"); if (!confirm(`سيتم دمج ${d.length} سجل في ${t} وقد تُستبدل سجلات موجودة. هل أنت متأكد؟`)) return;
    ok(await sb.from(t).upsert(d)); ok(await sb.from("backups_log").insert({ kind: "restore:" + t, rows_count: d.length })); log("backup_restore", null, "ok", { t, n: d.length }); toast("تمت الاستعادة");
  });
};
