const pw = document.getElementById("pw");
const loadOrdersBtn = document.getElementById("loadOrders");
const loadPendingBtn = document.getElementById("loadPending");
const ordersOut = document.getElementById("orders");
const pendingOut = document.getElementById("pending");
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

async function adminGet(url){
  const r = await fetch(url, { headers: { "x-admin-password": pw.value } });
  const data = await r.json().catch(()=> ({}));
  if(!r.ok) throw new Error(data.error || "Unauthorized");
  return data;
}

async function adminPost(url){
  const r = await fetch(url, {
    method: "POST",
    headers: { "x-admin-password": pw.value }
  });
  const data = await r.json().catch(()=> ({}));
  if(!r.ok) throw new Error(data.error || "Erreur");
  return data;
}

function orderCard(o) {
  const items = (o.items || []).map(i =>
    `<li>${esc(i.qty)}x ${esc(i.title_fr)} — ${esc(i.price_mad)} MAD</li>`
  ).join("");

  return `
    <div class="card" style="margin-top:12px">
      <div class="body">
        <p class="title">🧾 ${esc(o.id)}</p>
        <div class="muted">${esc(o.created_at)} • ${esc(o.status)}</div>
        <div class="line"></div>
        <div><b>Client:</b> ${esc(o.customer_name)} • ${esc(o.phone)}</div>
        <div><b>Ville:</b> ${esc(o.city)}</div>
        <div><b>Adresse:</b> ${esc(o.address)}</div>
        ${o.notes ? `<div><b>Notes:</b> ${esc(o.notes)}</div>` : ""}
        <div class="line"></div>
        <ul style="margin:0 0 10px 18px">${items}</ul>
        <div class="price-row">
          <div class="price">Total: ${esc(o.subtotal_mad)} MAD</div>
        </div>
      </div>
    </div>
  `;
}

function pendingCard(p){
  const img = (p.images && p.images[0]) ? p.images[0] : "";
  const farmer = `${esc(p.farmer_name || "")} • ${esc(p.farmer_phone || "")}`;
  return `
    <div class="card" style="margin-top:12px">
      <div class="thumb">
        <img src="${esc(img)}" alt="">
      </div>
      <div class="body">
        <p class="title">🕒 ${esc(p.title_fr)} <span class="muted">(${esc(p.city)} • ${esc(p.category)})</span></p>
        <div class="muted">Éleveur: ${farmer}</div>
        <div class="badges">
          <span class="badge">Prix: ${esc(p.price_mad)} MAD</span>
          ${p.weight_kg ? `<span class="badge">Poids: ${esc(p.weight_kg)} kg</span>` : ""}
          ${p.age_months ? `<span class="badge">Âge: ${esc(p.age_months)} mois</span>` : ""}
          <span class="badge">Status: ${esc(p.status)}</span>
        </div>
        <div class="line"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" data-approve="${esc(p.slug)}" type="button">✅ Approver</button>
          <button class="btn secondary" data-reject="${esc(p.slug)}" type="button">🗑️ Rejeter</button>
          <a class="btn secondary" href="/product.html?slug=${encodeURIComponent(p.slug)}" target="_blank" type="button">👁️ Preview</a>
        </div>
      </div>
    </div>
  `;
}

async function loadOrders(){
  ordersOut.innerHTML = `<p class="muted">Chargement…</p>`;
  try{
    const orders = await adminGet("/api/admin/orders");
    ordersOut.innerHTML = orders.length ? orders.map(orderCard).join("") : `<p class="muted">Aucune commande.</p>`;
    toast("✅ Commandes chargées");
  }catch(e){
    ordersOut.innerHTML = `<p class="muted">❌ ${esc(e.message)}</p>`;
    toast("❌ " + e.message);
  }
}

async function loadPending(){
  pendingOut.innerHTML = `<p class="muted">Chargement…</p>`;
  try{
    const list = await adminGet("/api/admin/pending-products");
    pendingOut.innerHTML = list.length ? list.map(pendingCard).join("") : `<p class="muted">Aucun produit en attente.</p>`;
    bindPendingActions();
    toast("✅ Pending chargés");
  }catch(e){
    pendingOut.innerHTML = `<p class="muted">❌ ${esc(e.message)}</p>`;
    toast("❌ " + e.message);
  }
}

function bindPendingActions(){
  pendingOut.querySelectorAll("[data-approve]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const slug = btn.getAttribute("data-approve");
      btn.disabled = true;
      try{
        await adminPost(`/api/admin/products/${encodeURIComponent(slug)}/approve`);
        toast("✅ Approuvé");
        await loadPending();
      }catch(e){
        toast("❌ " + e.message);
        btn.disabled = false;
      }
    });
  });

  pendingOut.querySelectorAll("[data-reject]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const slug = btn.getAttribute("data-reject");
      if(!confirm("Rejeter ce produit ?")) return;
      btn.disabled = true;
      try{
        await adminPost(`/api/admin/products/${encodeURIComponent(slug)}/reject`);
        toast("🗑️ Rejeté");
        await loadPending();
      }catch(e){
        toast("❌ " + e.message);
        btn.disabled = false;
      }
    });
  });
}

loadOrdersBtn.addEventListener("click", loadOrders);
loadPendingBtn.addEventListener("click", loadPending);
