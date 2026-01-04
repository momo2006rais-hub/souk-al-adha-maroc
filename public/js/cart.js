const KEY = "cart_v1";

export function getCart() {
  try {
    const raw = localStorage.getItem(KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export function setCart(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function addToCart(slug, qty = 1) {
  const items = getCart();
  const found = items.find(i => i.slug === slug);
  if (found) found.qty = Math.min(10, (found.qty || 1) + qty);
  else items.push({ slug, qty: Math.min(10, qty) });
  setCart(items);
  return items;
}

export function removeFromCart(slug) {
  const items = getCart().filter(i => i.slug !== slug);
  setCart(items);
  return items;
}

export function updateQty(slug, qty) {
  const items = getCart();
  const it = items.find(i => i.slug === slug);
  if (!it) return items;
  it.qty = Math.max(1, Math.min(10, Number(qty) || 1));
  setCart(items);
  return items;
}

export function clearCart() {
  localStorage.removeItem(KEY);
}

export function countItems() {
  return getCart().reduce((a, b) => a + (b.qty || 1), 0);
}
