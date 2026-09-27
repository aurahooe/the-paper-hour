const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
let session = null;
let mode = "signin";
const $ = (id) => document.getElementById(id);
const panels = [...document.querySelectorAll(".panel")];
function show(id) {
  panels.forEach((p) => p.classList.toggle("on", p.id === id));
  document.querySelectorAll("nav button").forEach((b) => {
    b.setAttribute("aria-current", b.dataset.go === id ? "true" : "false");
  });
}
document.querySelectorAll("[data-go]").forEach((b) => {
  b.addEventListener("click", () => {
    if (b.classList.contains("need-auth") && !session) { $("gate").showModal(); return; }
    show(b.dataset.go);
  });
});
$("authOpen").addEventListener("click", () => $("gate").showModal());
$("toggleMode").addEventListener("click", () => {
  mode = mode === "signin" ? "signup" : "signin";
  $("gateTitle").textContent = mode === "signin" ? "Come in" : "Take a desk";
  $("toggleMode").textContent = mode === "signin" ? "Need an account" : "I already have one";
  $("handleField").style.display = mode === "signup" ? "block" : "none";
});
$("handleField").style.display = "none";
function setAuthUi(user) {
  session = user;
  $("authOpen").hidden = !!user;
  $("signOut").hidden = !user;
}
$("signOut").addEventListener("click", async () => {
  await sb.auth.signOut();
  setAuthUi(null);
  show("front");
});
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const email = String(fd.get("email"));
  const password = String(fd.get("password"));
  const handle = String(fd.get("handle") || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 24);
  $("authErr").hidden = true;
  try {
    if (mode === "signup") {
      const { error } = await sb.auth.signUp({ email, password, options: { data: { handle: handle || undefined, display_name: handle } } });
      if (error) throw error;
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    $("gate").close();
  } catch (err) {
    $("authErr").hidden = false;
    $("authErr").textContent = err.message || "Could not sign in.";
  }
});
function pad(n) { return String(n).padStart(2, "0"); }
function tick() {
  const d = new Date();
  $("tick").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const left = 3600 - (d.getMinutes() * 60 + d.getSeconds());
  $("hourLabel").textContent = `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} · ${pad(d.getHours())}h · ${Math.floor(left/60)}m to next`;
}
setInterval(tick, 1000); tick();
function esc(s) {
  return String(s || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
async function ensureProfile(user) {
  const { data } = await sb.from("paper_profiles").select("id").eq("id", user.id).maybeSingle();
  if (data) return;
  const handle = (user.user_metadata?.handle || `desk-${user.id.slice(0,8)}`).slice(0,24);
  await sb.from("paper_profiles").insert({ id: user.id, handle, display_name: user.user_metadata?.display_name || handle });
}
async function loadFeature() {
  await sb.rpc("paper_rotate_hour");
  const now = new Date();
  const hk = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}`;
  const { data: slot } = await sb.from("paper_hours").select("note_id").eq("hour_key", hk).maybeSingle();
  const box = $("feature");
  if (!slot) { box.innerHTML = `<p class="quiet">The hour is still empty. Write something and mark it public.</p>`; return; }
  const { data: note } = await sb.from("paper_notes").select("title,body,created_at,author_id,paper_profiles(handle,display_name)").eq("id", slot.note_id).maybeSingle();
  if (!note) { box.innerHTML = `<p class="quiet">The hour is still empty. Write something and mark it public.</p>`; return; }
  const who = note.paper_profiles?.display_name || note.paper_profiles?.handle || "anonymous desk";
  box.innerHTML = `<h1>${esc(note.title)}</h1><p class="meta">This hour · ${esc(who)}</p><div class="body">${esc(note.body)}</div>`;
}
async function loadWall() {
  const { data } = await sb.from("paper_notes").select("id,title,body,created_at,paper_profiles(handle,display_name)").eq("is_public", true).order("created_at", { ascending: false }).limit(48);
  const grid = $("wallGrid");
  if (!data || !data.length) { grid.innerHTML = `<p class="quiet">Nothing on the wall yet.</p>`; return; }
  grid.innerHTML = data.map((n,i) => {
    const who = n.paper_profiles?.handle || "desk";
    const excerpt = n.body.length > 180 ? n.body.slice(0,180) + "…" : n.body;
    return `<article class="card" style="animation-delay:${i*40}ms"><h3>${esc(n.title)}</h3><p>${esc(excerpt)}</p><div class="who">@${esc(who)}</div></article>`;
  }).join("");
}
async function loadMine() {
  if (!session) return;
  const { data } = await sb.from("paper_notes").select("*").eq("author_id", session.id).order("created_at", { ascending: false });
  const box = $("mine");
  if (!data || !data.length) { box.innerHTML = `<p class="quiet">Your drawer is empty.</p>`; return; }
  box.innerHTML = data.map((n) => `<div class="slip"><strong>${esc(n.title)}</strong><div>${n.is_public ? "public" : "private"} · ${new Date(n.created_at).toLocaleString()}</div><button data-toggle="${n.id}" data-pub="${n.is_public}">${n.is_public ? "Make private" : "Make public"}</button></div>`).join("");
  box.querySelectorAll("[data-toggle]").forEach((b) => {
    b.addEventListener("click", async () => {
      const pub = b.dataset.pub === "true";
      await sb.from("paper_notes").update({ is_public: !pub, updated_at: new Date().toISOString() }).eq("id", b.dataset.toggle);
      await Promise.all([loadMine(), loadWall(), loadFeature()]);
    });
  });
}
$("compose").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session) { $("gate").showModal(); return; }
  await ensureProfile(session);
  const fd = new FormData(e.currentTarget);
  const { error } = await sb.from("paper_notes").insert({ author_id: session.id, title: String(fd.get("title")).trim(), body: String(fd.get("body")).trim(), is_public: fd.get("is_public") === "on" });
  if (error) { alert(error.message); return; }
  e.currentTarget.reset();
  await Promise.all([loadMine(), loadWall(), loadFeature()]);
});
sb.auth.onAuthStateChange(async (_e, s) => {
  const user = s?.user || null;
  setAuthUi(user);
  if (user) await ensureProfile(user);
  await loadMine();
});
async function boot() {
  const { data } = await sb.auth.getSession();
  setAuthUi(data.session?.user || null);
  if (data.session?.user) await ensureProfile(data.session.user);
  await Promise.all([loadFeature(), loadWall(), loadMine()]);
}
boot();
setInterval(loadFeature, 60 * 1000);
