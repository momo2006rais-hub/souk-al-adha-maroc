import { applyLangToDocument, getLang, setLang, t } from "./i18n.js";
import { apiGet, apiPost } from "./api.js";
import { addToCart, countItems, getCart, updateQty, removeFromCart, clearCart } from "./cart.js";

let META = null;

const els = {
  grid: document.getElementById("grid"),
  search: document.getElementById("search"),
  category: document.getElementById("category"),
  city: document.getElementById("city"),
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
  langAr: document.getElementById("langAr"),
  quickAid: document.getElementById("quickAid"),
  quickFarm: document.getElementById("quickFarm")
};

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 1600);
}

function openDrawer() {
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
}

function money(n) {
  return `${Number(n || 0)} MAD`;
}

function productTitle(p) {
  return getLang() === "ar" ? p.title_ar : p.title_fr;
}

function badgeRow(p) {
  const b = [];
  if (p.certified) b.push(`<span class="badge">✅ ${t("certified")}</span>`);
  if (p.delivery) b.push(`<span class="badge">🚚 ${t("delivery")}</span>`);
  b.push(`<span class="badge">📍 ${p.city}</span>`);
  b.push(`<span class="badge">🏷️ ${p.category}</span>`);
  return `<div class="badges">${b.join("")}</div>`;
}

function cardHtml(p) {
  const img = (p.images && p.images[0]) ? p.images[0] : "";
  const meta = [];
  if (p.weight_kg) meta.push(`${t("weight")}: ${p.weight_kg}kg`);
  if (p.age_months) meta.push(`${t("age")}: ${p.age_months} ${t("months")}`);

  return `
    <article class="card">
      <a class="thumb" href="/product.html?slug=${encodeURIComponent(p.slug)}">
        <img src="${img}" alt="${productTitle(p)}" loading="lazy">
      </a>
      <div class="body">
        <p class="title">${productTitle(p)}</p>
        <div class="muted">${meta.join(" • ")}</div>
        ${badgeRow(p)}
        <div class="price-row">
          <div class="price">${money(p.price_mad)}</div>
          <div class="actions">
            <a class="btn secondary" href="/product.html?slug=${encodeURIComponent(p.slug)}">${t("view")}</a>
            ${p.farmer_id ? `<a class="btn secondary" href="/farmer.html?id=${encodeURIComponent(p.farmer_id)}">👤 Éleveur</a>` : ``}
            <button class="btn" data-add="${p.slug}">${t("addToCart")}</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

async function loadProducts() {
  const params = new URLSearchParams();
  const category = els.category.value;
  const city = els.city.value;
  const q = els.search.value.trim();

  if (category && category !== "all") params.set("category", category);
  if (city && city !== "all") params.set("city", city);
  if (q) params.set("q", q);

  const url = `/api/products${params.toString() ? `?${params}` : ""}`;
  const products = await apiGet(url);

  els.grid.innerHTML = products.map(cardHtml).join("");

  els.grid.querySelectorAll("button[data-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      addToCart(btn.dataset.add, 1);
      renderCart();
      toast("✅ Ajouté");
    });
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

    const html = cart.map(it => {
      const p = map.get(it.slug);
      if (!p) return "";
      subtotal += (p.price_mad * it.qty);

      const img = (p.images && p.images[0]) ? p.images[0] : "";
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

    els.cartItems.innerHTML = html;
    els.cartTotal.textContent = money(subtotal);

    els.cartItems.querySelectorAll("[data-rm]").forEach(b => {
      b.addEventListener("click", () => {
        removeFromCart(b.dataset.rm);
        renderCart();
      });
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
      normalized.push({
        slug: p.slug,
        title_fr: p.title_fr,
        title_ar: p.title_ar,
        price_mad: p.price_mad,
        qty: it.qty
      });
      subtotal += p.price_mad * it.qty;
    }

    const wa = buildWhatsAppLink(id, payload, normalized, subtotal);
    els.waLink.href = wa;
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
  els.langFr.addEventListener("click", () => {
    setLang("fr");
    applyLangToDocument();
    loadProducts().then(renderCart);
  });
  els.langAr.addEventListener("click", () => {
    setLang("ar");
    applyLangToDocument();
    loadProducts().then(renderCart);
  });
}

async function init() {
  META = await apiGet("/api/meta");
  applyLangToDocument();
  bindLangButtons();

  els.openCart.addEventListener("click", () => { openDrawer(); renderCart(); });
  els.closeCart.addEventListener("click", closeDrawer);

  els.category.addEventListener("change", () => loadProducts());
  els.city.addEventListener("change", () => loadProducts());
  els.search.addEventListener("input", debounce(() => loadProducts(), 220));

  els.quickAid.addEventListener("click", () => { els.category.value = "aid"; loadProducts(); });
  // quickFarm = mostra “allevamento”: lascia category su all e imposta query vuota (o se vuoi: aliments)
  els.quickFarm.addEventListener("click", () => { els.category.value = "all"; loadProducts(); });

  els.checkoutForm.addEventListener("submit", submitOrder);

  els.cartCount.textContent = String(countItems());
  await loadProducts();
}

function debounce(fn, ms) {
  let tmr;
  return (...args) => {
    clearTimeout(tmr);
    tmr = setTimeout(() => fn(...args), ms);
  };
}

init().catch(err => {
  console.error(err);
  toast("❌ Erreur de chargement");
});
