import { applyLangToDocument, getLang, setLang } from "./i18n.js";
import { apiGet } from "./api.js";
import { addToCart, countItems } from "./cart.js";

const profile = document.getElementById("profile");
const grid = document.getElementById("grid");
const toastEl = document.getElementById("toast");

function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(()=> toastEl.classList.remove("show"), 1600);
}

function esc(s){
  return String(s||"").replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])
  );
}

function money(n){ return `${Number(n||0)} MAD`; }

function title(p){
  return (getLang() === "ar") ? p.title_ar : p.title_fr;
}

function cardHtml(p){
  const img = (p.images && p.images[0]) ? p.images[0] : "";
  const meta = [];
  if (p.weight_kg) meta.push(`Poids: ${p.weight_kg}kg`);
  if (p.age_months) meta.push(`Âge: ${p.age_months} mois`);

  return `
    <article class="card">
      <a class="thumb" href="/product.html?slug=${encodeURIComponent(p.slug)}">
        <img src="${esc(img)}" alt="${esc(title(p))}" loading="lazy">
      </a>
      <div class="body">
        <p class="title">${esc(title(p))}</p>
        <div class="muted">${esc(p.city)} • ${esc(p.category)}${meta.length ? " • " + esc(meta.join(" • ")) : ""}</div>
        <div class="badges">
          <span class="badge">💰 ${money(p.price_mad)}</span>
          ${p.delivery ? `<span class="badge">🚚 Livraison</span>` : ``}
        </div>
        <div class="actions">
          <a class="btn secondary" href="/product.html?slug=${encodeURIComponent(p.slug)}">Voir</a>
          <button class="btn" data-add="${esc(p.slug)}" type="button">Ajouter</button>
        </div>
      </div>
    </article>
  `;
}

function bindAddButtons(){
  grid.querySelectorAll("button[data-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      addToCart(btn.dataset.add, 1);
      toast(`✅ Ajouté (panier: ${countItems()})`);
    });
  });
}

function phoneToWa(phone){
  const clean = String(phone||"").replace(/[^\d]/g, "");
  if(!clean) return "#";
  return `https://wa.me/${clean}`;
}

async function init(){
  applyLangToDocument();

  const id = new URLSearchParams(location.search).get("id");
  if(!id){
    profile.innerHTML = `<p class="muted">Éleveur introuvable.</p>`;
    return;
  }

  const data = await apiGet(`/api/farmers/${encodeURIComponent(id)}/public`);
  const f = data.farmer;
  const products = data.products || [];

  const wa = phoneToWa(f.phone);

  profile.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
      <div>
        <h2 style="margin:0 0 6px">👤 ${esc(f.name)}</h2>
        <div class="muted">${esc(f.city)} • ${esc(f.phone)}</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn" href="${wa}" target="_blank">💬 WhatsApp</a>
        <a class="btn secondary" href="/">← Home</a>
      </div>
    </div>
  `;

  grid.innerHTML = products.length
    ? products.map(cardHtml).join("")
    : `<p class="muted">Aucun produit approuvé.</p>`;

  bindAddButtons();

  // language buttons (se esistono in layout futuro)
  const langFr = document.getElementById("langFr");
  const langAr = document.getElementById("langAr");
  if (langFr && langAr) {
    langFr.addEventListener("click", () => { setLang("fr"); location.reload(); });
    langAr.addEventListener("click", () => { setLang("ar"); location.reload(); });
  }

  toast("✅ Profil chargé");
}

init().catch(err => {
  console.error(err);
  toast("❌ Erreur");
  profile.innerHTML = `<p class="muted">Erreur de chargement.</p>`;
});
