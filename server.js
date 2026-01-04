import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import crypto from "crypto";

dotenv.config();

process.on("uncaughtException", (err) => console.error("❌ uncaughtException:", err));
process.on("unhandledRejection", (err) => console.error("❌ unhandledRejection:", err));

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "212600000000";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, "database.sqlite"));
db.pragma("journal_mode = WAL");

// -------- helpers
function sanitizeText(s, max = 500) {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}
function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
function requireAdmin(req, res, next) {
  const header = req.headers["x-admin-password"];
  if (!header || header !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
  next();
}
function nowIso() { return new Date().toISOString(); }

// password hashing (scrypt)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${key}`;
}
function verifyPassword(password, stored) {
  try {
    const [alg, salt, key] = String(stored).split("$");
    if (alg !== "scrypt") return false;
    const computed = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(key, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
}

// auth: farmer sessions
function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}
function requireFarmer(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const row = db.prepare(`
    SELECT s.token, s.farmer_id, f.name, f.phone, f.city
    FROM farmer_sessions s
    JOIN farmers f ON f.id = s.farmer_id
    WHERE s.token = ?
  `).get(token);

  if (!row) return res.status(401).json({ error: "Unauthorized" });
  req.farmer = { id: row.farmer_id, name: row.name, phone: row.phone, city: row.city };
  next();
}

function tableHasColumn(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}

// -------- schema + migrations
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS farmers (
      id TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now')),
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      city TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS farmer_sessions (
      token TEXT PRIMARY KEY,
      farmer_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (farmer_id) REFERENCES farmers(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title_fr TEXT NOT NULL,
      title_ar TEXT NOT NULL,
      category TEXT NOT NULL,
      city TEXT NOT NULL,
      price_mad INTEGER NOT NULL,
      weight_kg REAL,
      age_months INTEGER,
      gender TEXT,
      certified INTEGER DEFAULT 0,
      delivery INTEGER DEFAULT 1,
      images_json TEXT NOT NULL,
      description_fr TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now')),
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT NOT NULL,
      notes TEXT,
      items_json TEXT NOT NULL,
      subtotal_mad INTEGER NOT NULL,
      status TEXT DEFAULT 'new'
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_city ON products(city);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
  `);

  // migrations for marketplace
  if (!tableHasColumn("products", "farmer_id")) db.exec(`ALTER TABLE products ADD COLUMN farmer_id TEXT;`);
  if (!tableHasColumn("products", "status")) db.exec(`ALTER TABLE products ADD COLUMN status TEXT DEFAULT 'approved';`);
  if (!tableHasColumn("products", "source")) db.exec(`ALTER TABLE products ADD COLUMN source TEXT DEFAULT 'seed';`);
}
initDb();

// -------- middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("dev"));
app.use(express.json({ limit: "800kb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// -------- mapper
function mapProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    title_fr: row.title_fr,
    title_ar: row.title_ar,
    category: row.category,
    city: row.city,
    price_mad: row.price_mad,
    weight_kg: row.weight_kg,
    age_months: row.age_months,
    gender: row.gender,
    certified: !!row.certified,
    delivery: !!row.delivery,
    images: safeJson(row.images_json, []),
    description_fr: row.description_fr,
    description_ar: row.description_ar,
    farmer_id: row.farmer_id || null,
    status: row.status || "approved",
    source: row.source || "seed",
    created_at: row.created_at
  };
}

// -------- public API
app.get("/api/meta", (req, res) => res.json({ whatsappNumber: WHATSAPP_NUMBER }));

// approved + active only
app.get("/api/products", (req, res) => {
  const { category, city, q } = req.query;

  let sql = "SELECT * FROM products WHERE is_active=1 AND (status IS NULL OR status='approved')";
  const params = {};

  if (category && typeof category === "string" && category !== "all") {
    sql += " AND category=@category";
    params.category = category;
  }
  if (city && typeof city === "string" && city !== "all") {
    sql += " AND city=@city";
    params.city = city;
  }
  if (q && typeof q === "string" && q.trim()) {
    sql += " AND (title_fr LIKE @q OR title_ar LIKE @q OR description_fr LIKE @q OR description_ar LIKE @q)";
    params.q = `%${q.trim()}%`;
  }

  sql += " ORDER BY created_at DESC LIMIT 200";
  res.json(db.prepare(sql).all(params).map(mapProduct));
});

app.get("/api/products/:slug", (req, res) => {
  const slug = req.params.slug;
  const row = db.prepare(`
    SELECT * FROM products
    WHERE slug=? AND is_active=1 AND (status IS NULL OR status='approved')
  `).get(slug);

  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(mapProduct(row));
});

// public farmer profile
app.get("/api/farmers/:id/public", (req, res) => {
  const id = req.params.id;

  const farmer = db.prepare(`
    SELECT id, name, phone, city, is_active, created_at
    FROM farmers
    WHERE id=? AND is_active=1
  `).get(id);

  if (!farmer) return res.status(404).json({ error: "Not found" });

  const products = db.prepare(`
    SELECT * FROM products
    WHERE farmer_id=? AND is_active=1 AND source='farmer' AND status='approved'
    ORDER BY created_at DESC
    LIMIT 200
  `).all(id).map(mapProduct);

  res.json({ farmer, products });
});

// orders
app.post("/api/orders", (req, res) => {
  const b = req.body || {};
  const customer_name = sanitizeText(b.customer_name, 120);
  const phone = sanitizeText(b.phone, 40);
  const city = sanitizeText(b.city, 80);
  const address = sanitizeText(b.address, 220);
  const notes = sanitizeText(b.notes, 500);
  const items = Array.isArray(b.items) ? b.items : [];

  if (!customer_name || !phone || !city || !address) return res.status(400).json({ error: "Missing fields" });
  if (items.length === 0) return res.status(400).json({ error: "Empty cart" });

  const normalized = [];
  let subtotal = 0;

  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const slug = sanitizeText(it.slug, 120);
    const qty = Number(it.qty || 1);
    if (!slug || !Number.isFinite(qty) || qty < 1 || qty > 10) continue;

    const p = db.prepare(`
      SELECT slug, title_fr, title_ar, price_mad
      FROM products
      WHERE slug=? AND is_active=1 AND (status IS NULL OR status='approved')
    `).get(slug);

    if (!p) continue;

    normalized.push({ slug: p.slug, title_fr: p.title_fr, title_ar: p.title_ar, price_mad: p.price_mad, qty });
    subtotal += p.price_mad * qty;
  }

  if (normalized.length === 0) return res.status(400).json({ error: "No valid items" });

  const id = `ord_${nanoid(10)}`;
  db.prepare(`
    INSERT INTO orders (id, customer_name, phone, city, address, notes, items_json, subtotal_mad)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, customer_name, phone, city, address, notes || null, JSON.stringify(normalized), subtotal);

  res.json({ id });
});

// -------- farmer marketplace API
app.post("/api/farmers/register", (req, res) => {
  const name = sanitizeText(req.body?.name, 80);
  const phone = sanitizeText(req.body?.phone, 40);
  const city = sanitizeText(req.body?.city, 80);
  const password = sanitizeText(req.body?.password, 80);

  if (!name || !phone || !city || !password || password.length < 6) {
    return res.status(400).json({ error: "Invalid fields" });
  }

  const exists = db.prepare("SELECT id FROM farmers WHERE phone=?").get(phone);
  if (exists) return res.status(409).json({ error: "Phone already used" });

  const id = `far_${nanoid(10)}`;
  const password_hash = hashPassword(password);
  db.prepare(`INSERT INTO farmers (id, name, phone, city, password_hash) VALUES (?, ?, ?, ?, ?)`)
    .run(id, name, phone, city, password_hash);

  const token = `sess_${nanoid(24)}`;
  db.prepare(`INSERT INTO farmer_sessions (token, farmer_id) VALUES (?, ?)`).run(token, id);

  res.json({ token, farmer: { id, name, phone, city } });
});

app.post("/api/farmers/login", (req, res) => {
  const phone = sanitizeText(req.body?.phone, 40);
  const password = sanitizeText(req.body?.password, 80);

  const farmer = db.prepare("SELECT * FROM farmers WHERE phone=? AND is_active=1").get(phone);
  if (!farmer) return res.status(401).json({ error: "Invalid credentials" });
  if (!verifyPassword(password, farmer.password_hash)) return res.status(401).json({ error: "Invalid credentials" });

  const token = `sess_${nanoid(24)}`;
  db.prepare(`INSERT INTO farmer_sessions (token, farmer_id) VALUES (?, ?)`).run(token, farmer.id);

  res.json({ token, farmer: { id: farmer.id, name: farmer.name, phone: farmer.phone, city: farmer.city } });
});

app.get("/api/farmers/me", requireFarmer, (req, res) => res.json({ farmer: req.farmer }));

app.post("/api/farmers/logout", requireFarmer, (req, res) => {
  const token = getBearerToken(req);
  db.prepare("DELETE FROM farmer_sessions WHERE token=?").run(token);
  res.json({ ok: true });
});

// create product (pending)
app.post("/api/farmers/products", requireFarmer, (req, res) => {
  const title_fr = sanitizeText(req.body?.title_fr, 120);
  const title_ar = sanitizeText(req.body?.title_ar, 120);
  const category = sanitizeText(req.body?.category, 40);
  const city = sanitizeText(req.body?.city, 80) || req.farmer.city;
  const price_mad = Number(req.body?.price_mad || 0);
  const weight_kg = req.body?.weight_kg !== undefined ? Number(req.body.weight_kg) : null;
  const age_months = req.body?.age_months !== undefined ? Number(req.body.age_months) : null;
  const certified = req.body?.certified ? 1 : 0;
  const delivery = req.body?.delivery === false ? 0 : 1;
  const description_fr = sanitizeText(req.body?.description_fr, 1200);
  const description_ar = sanitizeText(req.body?.description_ar, 1200);

  const images = Array.isArray(req.body?.images) ? req.body.images : [];
  const images_clean = images
    .map(x => sanitizeText(String(x || ""), 300))
    .filter(x => /^https?:\/\//i.test(x))
    .slice(0, 6);

  if (!title_fr || !title_ar || !category || !city || !description_fr || !description_ar) {
    return res.status(400).json({ error: "Missing fields" });
  }
  if (!Number.isFinite(price_mad) || price_mad < 10 || price_mad > 200000) {
    return res.status(400).json({ error: "Invalid price" });
  }
  if (images_clean.length === 0) {
    return res.status(400).json({ error: "Add at least 1 image URL (https://...)" });
  }

  const slug = `p_${nanoid(10)}`;
  const id = `prd_${nanoid(10)}`;

  db.prepare(`
    INSERT INTO products (
      id, slug, title_fr, title_ar, category, city, price_mad,
      weight_kg, age_months, certified, delivery, images_json,
      description_fr, description_ar, is_active, farmer_id, status, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending', 'farmer', ?)
  `).run(
    id, slug, title_fr, title_ar, category, city, price_mad,
    (Number.isFinite(weight_kg) ? weight_kg : null),
    (Number.isFinite(age_months) ? age_months : null),
    certified, delivery, JSON.stringify(images_clean),
    description_fr, description_ar,
    req.farmer.id, nowIso()
  );

  res.json({ ok: true, slug });
});

app.get("/api/farmers/products", requireFarmer, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE farmer_id=? AND source='farmer'
    ORDER BY created_at DESC
    LIMIT 200
  `).all(req.farmer.id).map(mapProduct);

  res.json(rows);
});

// -------- admin API
app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200").all();
  res.json(rows.map(r => ({
    id: r.id,
    created_at: r.created_at,
    customer_name: r.customer_name,
    phone: r.phone,
    city: r.city,
    address: r.address,
    notes: r.notes,
    subtotal_mad: r.subtotal_mad,
    status: r.status,
    items: JSON.parse(r.items_json)
  })));
});

app.get("/api/admin/pending-products", requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, f.name AS farmer_name, f.phone AS farmer_phone
    FROM products p
    LEFT JOIN farmers f ON f.id = p.farmer_id
    WHERE p.source='farmer' AND p.status='pending' AND p.is_active=1
    ORDER BY p.created_at DESC
    LIMIT 200
  `).all().map(r => ({
    ...mapProduct(r),
    farmer_name: r.farmer_name || "",
    farmer_phone: r.farmer_phone || ""
  }));

  res.json(rows);
});

app.post("/api/admin/products/:slug/approve", requireAdmin, (req, res) => {
  const slug = req.params.slug;
  const row = db.prepare("SELECT slug FROM products WHERE slug=? AND source='farmer'").get(slug);
  if (!row) return res.status(404).json({ error: "Not found" });

  db.prepare("UPDATE products SET status='approved' WHERE slug=?").run(slug);
  res.json({ ok: true });
});

app.post("/api/admin/products/:slug/reject", requireAdmin, (req, res) => {
  const slug = req.params.slug;
  const row = db.prepare("SELECT slug FROM products WHERE slug=? AND source='farmer'").get(slug);
  if (!row) return res.status(404).json({ error: "Not found" });

  db.prepare("UPDATE products SET status='rejected', is_active=0 WHERE slug=?").run(slug);
  res.json({ ok: true });
});

// start
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
