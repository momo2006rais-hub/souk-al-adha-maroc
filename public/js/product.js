import { applyLangToDocument, getLang, setLang, t } from "./i18n.js";
import { apiGet, apiPost } from "./api.js";
import { addToCart, countItems, getCart, updateQty, removeFromCart, clearCart } from "./cart.js";

let META = null;
let CURRENT = null;

const els = {
  wrap: document.getElementById("productWrap"),
  cartCount: document.getElementById("cartCount"),
  drawer: document.getElementById("drawer"),
  openCart: document.getElementById("openCart"),
  closeCart: document.getElementById("closeCart"),
  cartItems: document.getElementById("cartItems"),
  cartTotal: document.getElementById("cartTotal"),
  checkoutForm: document.getElementById("checkoutForm"),
  submitOrder: document.getElementById("submitOrder"),
  waLink: document.getElementById("waLink"),
  toast: document.getElementById("toast"),
  langFr: document.getElementById("langFr"),
  langAr: document.getElementById("langAr")
};

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 1600);
}

function money(n){ return `${Number(n||0)} MAD`; }
function productTitle(p){ return getLang()==="ar" ? p.title_ar : p.title_fr; }

function openDrawer(){ els.drawer.classList.add("open"); }
function closeDrawer(){ els.drawer.classList.remove("open"); }

async function renderProduct() {
  const slug = new URLSearchParams(location.search).get("slug");
  if (!slug) {
    els.wrap.innerHTML = `<p class="muted">Produit introuvable.</p>`;
    return;
  }
  const p = await apiGet(`/api/products/${encodeURIComponent(slug)}`);
  CURRENT = p;
  const img = p.images?.[0] || "";

  const meta = [];
  if (p.weight_kg) meta.push(`${t("weight")}: ${p.weight_kg}kg`);
  if (p.age_months) meta.push(`${t("age")}: ${p.age_months} ${t("months")}`);

  const sellerLink = p.farmer_id
    ? `<a class="btn secondary" href="/farmer.html?id=${encodeURIComponent(p.farmer_id)}">👤 Éleveur</a>`
    : "";

  els.wrap.innerHTML = `
    <div class="hero-side">
      <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:16px;align-items:start">
        <div>
          <div class="thumb" style="border-radius:14px;border:1px solid var(--line);overflow:hidden;aspect-ratio:16/10">
            <img src="${img}" alt="${productTitle(p)}" style="width:100%;height:100%;object-fit:cover">
          </div>
        </div>
        <div>
          <h1 style="margin:0 0 8px;font-size:26px">${productTitle(p)}</h1>
          <div class="muted">${meta.join(" • ")}</div>

          <div class="badges" style="margin-top:12px">
            ${p.certified ? `<span class="badge">✅ ${t("certified")}</span>` : ""}
            ${p.delivery ? `<span class="badge">🚚 ${t("delivery")}</span>` : ""}
            <span class="badge">📍 ${p.city}</span>
            <span class="badge">🏷️ ${p.category}</span>
          </div>

          <div class="line"></div>

          <div class="price" style="font-size:26px">${money(p.price_mad)}</div>
          <p class="muted" style="margin:10px 0 0;line-height:1.6">
            ${getLang()==="ar" ? p.description_ar : p.description_fr}
          </p>

          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
            <button class="btn" id="add">${t("addToCart")}</button>
            <button class="btn secondary" id="buy">${t("checkout")}</button>
            ${sellerLink}
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("add").addEventListener("click", () => {
    addToCart(p.slug, 1);
    renderCart();
    toast("✅ Ajouté");
  });

  document.getElementById("buy").addEventListener("click", () => {
    addToCart(p.slug, 1);
    renderCart();
    openDrawer();
  });
}

function renderCart() {
  els.cartCount.textContent = String(countItems());
  const cart = getCart();

  if (cart.length === 0) {
    els.cartItems.innerHTML = `<p class="muted">${t("emptyCart")}</p>`;
    els.cartTotal.textContent = money(0);
    els.waLink.style.display = "none";
    return;
  }

  apiGet("/api/products").then(all => {
    const map = new Map(all.map(p => [p.slug, p]));
    let subtotal = 0;

    els.cartItems.innerHTML = cart.map(it => {
      const p = map.get(it.slug);
      if (!p) return "";
      subtotal += p.price_mad * it.qty;
      const img = p.images?.[0] || "";
      return `
        <div class="cart-item">
          <img src="${img}" alt="">
          <div>
            <div class="row">
              <strong>${productTitle(p)}</strong>
              <button class="btn secondary" data-rm="${p.slug}" type="button">🗑️</button>
            </div>
            <div class="row">
              <div class="muted">${money(p.price_mad)}</div>
              <div class="qty">
                <button type="button" data-dec="${p.slug}">−</button>
                <span><b>${t("qty")}:</b> ${it.qty}</span>
                <button type="button" data-inc="${p.slug}">+</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    els.cartTotal.textContent = money(subtotal);

    els.cartItems.querySelectorAll("[data-rm]").forEach(b => {
      b.addEventListener("click", () => { removeFromCart(b.dataset.rm); renderCart(); });
    });
    els.cartItems.querySelectorAll("[data-inc]").forEach(b => {
      b.addEventListener("click", () => {
        const slug = b.dataset.inc;
        const it = getCart().find(x => x.slug === slug);
        updateQty(slug, (it?.qty || 1) + 1);
        renderCart();
      });
    });
    els.cartItems.querySelectorAll("[data-dec]").forEach(b => {
      b.addEventListener("click", () => {
        const slug = b.dataset.dec;
        const it = getCart().find(x => x.slug === slug);
        updateQty(slug, (it?.qty || 1) - 1);
        renderCart();
      });
    });
  });
}

function buildWhatsAppLink(orderId, customer, items, subtotal) {
  const lines = [];
  lines.push(`🧾 Commande: ${orderId}`);
  lines.push(`👤 Nom: ${customer.customer_name}`);
  lines.push(`📞 Téléphone: ${customer.phone}`);
  lines.push(`📍 Ville: ${customer.city}`);
  lines.push(`🏠 Adresse: ${customer.address}`);
  if (customer.notes) lines.push(`📝 Notes: ${customer.notes}`);
  lines.push("—");
  for (const it of items) lines.push(`• ${it.qty}x ${it.title_fr} — ${it.price_mad} MAD`);
  lines.push("—");
  lines.push(`💰 Total: ${subtotal} MAD`);
  const text = encodeURIComponent(lines.join("\n"));
  const phone = (META?.whatsappNumber || "").replace(/[^\d]/g, "");
  return `https://wa.me/${phone}?text=${text}`;
}

async function submitOrder(e) {
  e.preventDefault();
  const cart = getCart();
  if (cart.length === 0) return toast(t("emptyCart"));

  const fd = new FormData(els.checkoutForm);
  const payload = {
    customer_name: String(fd.get("customer_name") || "").trim(),
    phone: String(fd.get("phone") || "").trim(),
    city: String(fd.get("city") || "").trim(),
    address: String(fd.get("address") || "").trim(),
    notes: String(fd.get("notes") || "").trim(),
    items: cart
  };

  els.submitOrder.disabled = true;
  els.submitOrder.textContent = "…";

  try {
    const { id } = await apiPost("/api/orders", payload);

    const all = await apiGet("/api/products");
    const map = new Map(all.map(p => [p.slug, p]));
    const normalized = [];
    let subtotal = 0;

    for (const it of cart) {
      const p = map.get(it.slug);
      if (!p) continue;
      normalized.push({ slug:p.slug, title_fr:p.title_fr, title_ar:p.title_ar, price_mad:p.price_mad, qty:it.qty });
      subtotal += p.price_mad * it.qty;
    }

    els.waLink.href = buildWhatsAppLink(id, payload, normalized, subtotal);
    els.waLink.style.display = "inline-block";

    toast("✅ Commande créée");
    clearCart();
    renderCart();
  } catch (err) {
    toast(`❌ ${err.message}`);
  } finally {
    els.submitOrder.disabled = false;
    els.submitOrder.textContent = t("submitOrder");
  }
}

function bindLangButtons() {
  els.langFr.addEventListener("click", async () => {
    setLang("fr");
    applyLangToDocument();
    await renderProduct();
    renderCart();
  });
  els.langAr.addEventListener("click", async () => {
    setLang("ar");
    applyLangToDocument();
    await renderProduct();
    renderCart();
  });
}

async function init() {
  META = await apiGet("/api/meta");
  applyLangToDocument();
  bindLangButtons();

  els.openCart.addEventListener("click", () => { openDrawer(); renderCart(); });
  els.closeCart.addEventListener("click", closeDrawer);
  els.checkoutForm.addEventListener("submit", submitOrder);

  els.cartCount.textContent = String(countItems());
  await renderProduct();
  renderCart();
}

init().catch(err => {
  console.error(err);
  toast("❌ Erreur");
});
