const toastEl = document.getElementById("toast");
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(()=> toastEl.classList.remove("show"), 1600);
}

const authBlock = document.getElementById("authBlock");
const panel = document.getElementById("panel");
const who = document.getElementById("who");

const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logout");

const productForm = document.getElementById("productForm");
const myProducts = document.getElementById("myProducts");

const TOKEN_KEY = "farmer_token_v1";

function getToken(){ return localStorage.getItem(TOKEN_KEY) || ""; }
function setToken(t){ localStorage.setItem(TOKEN_KEY, t); }
function clearToken(){ localStorage.removeItem(TOKEN_KEY); }

async function api(url, opts = {}) {
  const headers = { "content-type": "application/json", ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const r = await fetch(url, { ...opts, headers });
  const data = await r.json().catch(()=> ({}));
  if (!r.ok) throw new Error(data.error || "Erreur");
  return data;
}

function card(p){
  const img = (p.images && p.images[0]) ? p.images[0] : "";
  return `
    <article class="card">
      <a class="thumb" href="/product.html?slug=${encodeURIComponent(p.slug)}" target="_blank">
        <img src="${img}" alt="" loading="lazy">
      </a>
      <div class="body">
        <p class="title">${p.title_fr}</p>
        <div class="muted">${p.city} • ${p.category}</div>
        <div class="badges">
          <span class="badge">Status: ${p.status}</span>
          <span class="badge">Prix: ${p.price_mad} MAD</span>
        </div>
      </div>
    </article>
  `;
}

async function refreshMe(){
  const me = await api("/api/farmers/me");
  who.textContent = `${me.farmer.name} — ${me.farmer.phone} — ${me.farmer.city}`;
}

async function refreshMyProducts(){
  const list = await api("/api/farmers/products");
  myProducts.innerHTML = list.length ? list.map(card).join("") : `<p class="muted">Aucun produit.</p>`;
}

function showPanel(){
  authBlock.style.display = "none";
  panel.style.display = "block";
}

function showAuth(){
  authBlock.style.display = "grid";
  panel.style.display = "none";
}

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(registerForm);
  try{
    const res = await api("/api/farmers/register", {
      method:"POST",
      body: JSON.stringify({
        name: fd.get("name"),
        phone: fd.get("phone"),
        city: fd.get("city"),
        password: fd.get("password")
      })
    });
    setToken(res.token);
    toast("✅ Compte créé");
    showPanel();
    await refreshMe();
    await refreshMyProducts();
  }catch(err){
    toast("❌ " + err.message);
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(loginForm);
  try{
    const res = await api("/api/farmers/login", {
      method:"POST",
      body: JSON.stringify({
        phone: fd.get("phone"),
        password: fd.get("password")
      })
    });
    setToken(res.token);
    toast("✅ Connecté");
    showPanel();
    await refreshMe();
    await refreshMyProducts();
  }catch(err){
    toast("❌ " + err.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  try { await api("/api/farmers/logout", { method:"POST" }); } catch {}
  clearToken();
  showAuth();
  toast("👋 Déconnecté");
});

productForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(productForm);

  const images = [fd.get("img1"), fd.get("img2")].filter(Boolean);

  try{
    await api("/api/farmers/products", {
      method:"POST",
      body: JSON.stringify({
        title_fr: fd.get("title_fr"),
        title_ar: fd.get("title_ar"),
        category: fd.get("category"),
        city: fd.get("city"),
        price_mad: Number(fd.get("price_mad")),
        weight_kg: fd.get("weight_kg") ? Number(fd.get("weight_kg")) : undefined,
        age_months: fd.get("age_months") ? Number(fd.get("age_months")) : undefined,
        certified: false,
        delivery: (fd.get("delivery") !== "no"),
        images,
        description_fr: fd.get("description_fr"),
        description_ar: fd.get("description_ar")
      })
    });

    toast("✅ Produit envoyé (pending)");
    productForm.reset();
    await refreshMyProducts();
  }catch(err){
    toast("❌ " + err.message);
  }
});

async function init(){
  const token = getToken();
  if (!token) { showAuth(); return; }

  try{
    showPanel();
    await refreshMe();
    await refreshMyProducts();
  }catch{
    clearToken();
    showAuth();
  }
}

init();
