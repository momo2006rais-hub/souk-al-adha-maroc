export async function apiGet(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} failed`);
  return r.json();
}

export async function apiPost(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `POST ${url} failed`);
  return data;
}

export async function apiAdminOrders(password) {
  const r = await fetch("/api/admin/orders", {
    headers: { "x-admin-password": password }
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Unauthorized");
  return data;
}
