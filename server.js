import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import { nanoid } from "nanoid";
import crypto from "crypto";
import pg from "pg";

dotenv.config();

process.on("uncaughtException", (err) => console.error("❌ uncaughtException:", err));
process.on("unhandledRejection", (err) => console.error("❌ unhandledRejection:", err));

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || "212600000000";
const DATABASE_URL = process.env.DATABASE_URL || "";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!DATABASE_URL) {
  console.error("❌ Missing DATABASE_URL. Set it on Render Environment Variables.");
}

const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("render.com") || DATABASE_URL.includes("postgres") ? { rejectUnauthorized: false } : undefined
});

// helpers
function sanitizeText(s, max = 500) {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, max);
}
function nowIso() { return new Date().toISOString(); }

function requireAdmin(req, res, next) {
  const header = req.headers["x-admin-password"];
  if (!header || header !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function getBearerToken(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

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

function mapProduct(row) {
  return {
    id: row.id,
    slug: row.slug,
    title_fr: row.title_fr,
    title_ar: row.title_ar,
    category: row.category,
    city: row.city,
    price_mad: Number(row.price_mad),
    weight_kg: row.weight_kg === null ? null : Number(row.weight_kg),
    age_months: row.age_months === null ? null : Number(row.age_months),
    gender: row.gender,
    certified: !!row.certified,
    delivery: !!row.delivery,
    images: Array.isArray(row.images) ? row.images : [],
    description_fr: row.description_fr,
    description_ar: row.description_ar,
    farmer_id: row.farmer_id || null,
    status: row.status || "approved",
    source: row.source || "seed",
    created_at: row.created_at
  };
}

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS farmers (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      city TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS farmer_sessions (
      token TEXT PRIMARY KEY,
      farmer_id TEXT NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);

    await client.query(`CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title_fr TEXT NOT NULL,
      title_ar TEXT NOT NULL,
      category TEXT NOT NULL,
      city TEXT NOT NULL,
      price_mad INTEGER NOT NULL,
      weight_kg DOUBLE PRECISION,
      age_months INTEGER,
      gender TEXT,
      certified BOOLEAN DEFAULT FALSE,
      delivery BOOLEAN DEFAULT TRUE,
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      description_fr TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      farmer_id TEXT REFERENCES farmers(id),
      status TEXT DEFAULT 'approved',
      source TEXT DEFAULT 'seed'
    );`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_products_city ON products(city);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);`);

    await client.query(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT NOT NULL,
      notes TEXT,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      subtotal_mad INTEGER NOT NULL,
      status TEXT DEFAULT 'new'
    );`);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);`);

    console.log("✅ Postgres schema ready");
  } finally {
    client.release();
  }
}

// middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// auth middleware
async function requireFarmer(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { rows } = await pool.query(`
    SELECT s.token, s.farmer_id, f.name, f.phone, f.city
    FROM farmer_sessions s
    JOIN farmers f ON f.id = s.farmer_id
    WHERE s.token = $1
  `, [token]);

  if (!rows[0]) return res.status(401).json({ error: "Unauthorized" });
  req.farmer = { id: rows[0].farmer_id, name: rows[0].name, phone: rows[0].phone, city: rows[0].city };
  next();
}

// API
app.get("/api/meta", (req, res) => res.json({ whatsappNumber: WHATSAPP_NUMBER }));

app.get("/api/products", async (req, res) => {
  const { category, city, q } = req.query;

  const params = [];
  let where = `WHERE is_active=TRUE AND (status IS NULL OR status='approved')`;

  if (category && category !== "all") {
    params.push(String(category));
    where += ` AND category=$${params.length}`;
  }
  if (city && city !== "all") {
    params.push(String(city));
    where += ` AND city=$${params.length}`;
  }
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    where += ` AND (title_fr ILIKE $${params.length} OR title_ar ILIKE $${params.length} OR description_fr ILIKE $${params.length} OR description_ar ILIKE $${params.length})`;
  }

  const { rows } = await pool.query(`
    SELECT * FROM products
    ${where}
    ORDER BY created_at DESC
    LIMIT 200
  `, params);

  res.json(rows.map(mapProduct));
});

app.get("/api/products/:slug", async (req, res) => {
  const slug = sanitizeText(req.params.slug, 120);
  const { rows } = await pool.query(`
    SELECT * FROM products
    WHERE slug=$1 AND is_active=TRUE AND (status IS NULL OR status='approved')
    LIMIT 1
  `, [slug]);

  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(mapProduct(rows[0]));
});

app.get("/api/farmers/:id/public", async (req, res) => {
  const id = sanitizeText(req.params.id, 120);

  const farmerRes = await pool.query(`
    SELECT id, name, phone, city, created_at
    FROM farmers
    WHERE id=$1 AND is_active=TRUE
    LIMIT 1
  `, [id]);

  if (!farmerRes.rows[0]) return res.status(404).json({ error: "Not found" });

  const prodRes = await pool.query(`
    SELECT * FROM products
    WHERE farmer_id=$1 AND is_active=TRUE AND source='farmer' AND status='approved'
    ORDER BY created_at DESC
    LIMIT 200
  `, [id]);

  res.json({ farmer: farmerRes.rows[0], products: prodRes.rows.map(mapProduct) });
});

// Orders
app.post("/api/orders", async (req, res) => {
  const b = req.body || {};
  const customer_name = sanitizeText(b.customer_name, 120);
  const phone = sanitizeText(b.phone, 40);
  const city = sanitizeText(b.city, 80);
  const address = sanitizeText(b.address, 220);
  const notes = sanitizeText(b.notes, 500);
  const items = Array.isArray(b.items) ? b.items : [];

  if (!customer_name || !phone || !city || !address) return res.status(400).json({ error: "Missing fields" });
  if (items.length === 0) return res.status(400).json({ error: "Empty cart" });

  // normalize items using current product prices
  const normalized = [];
  let subtotal = 0;

  for (const it of items) {
    const slug = sanitizeText(it?.slug || "", 120);
    const qty = Number(it?.qty || 1);
    if (!slug || !Number.isFinite(qty) || qty < 1 || qty > 10) continue;

    const pr = await pool.query(`
      SELECT slug, title_fr, title_ar, price_mad
      FROM products
      WHERE slug=$1 AND is_active=TRUE AND (status IS NULL OR status='approved')
      LIMIT 1
    `, [slug]);

    const p = pr.rows[0];
    if (!p) continue;

    normalized.push({ slug: p.slug, title_fr: p.title_fr, title_ar: p.title_ar, price_mad: p.price_mad, qty });
    subtotal += p.price_mad * qty;
  }

  if (normalized.length === 0) return res.status(400).json({ error: "No valid items" });

  const id = `ord_${nanoid(10)}`;

  await pool.query(`
    INSERT INTO orders (id, customer_name, phone, city, address, notes, items, subtotal_mad)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  `, [id, customer_name, phone, city, address, notes || null, JSON.stringify(normalized), subtotal]);

  res.json({ id });
});

// Farmers
app.post("/api/farmers/register", async (req, res) => {
  const name = sanitizeText(req.body?.name, 80);
  const phone = sanitizeText(req.body?.phone, 40);
  const city = sanitizeText(req.body?.city, 80);
  const password = sanitizeText(req.body?.password, 80);

  if (!name || !phone || !city || !password || password.length < 6) {
    return res.status(400).json({ error: "Invalid fields" });
  }

  const exists = await pool.query(`SELECT id FROM farmers WHERE phone=$1 LIMIT 1`, [phone]);
  if (exists.rows[0]) return res.status(409).json({ error: "Phone already used" });

  const id = `far_${nanoid(10)}`;
  const password_hash = hashPassword(password);

  await pool.query(`
    INSERT INTO farmers (id, name, phone, city, password_hash)
    VALUES ($1,$2,$3,$4,$5)
  `, [id, name, phone, city, password_hash]);

  const token = `sess_${nanoid(24)}`;
  await pool.query(`INSERT INTO farmer_sessions (token, farmer_id) VALUES ($1,$2)`, [token, id]);

  res.json({ token, farmer: { id, name, phone, city } });
});

app.post("/api/farmers/login", async (req, res) => {
  const phone = sanitizeText(req.body?.phone, 40);
  const password = sanitizeText(req.body?.password, 80);

  const fr = await pool.query(`
    SELECT id, name, phone, city, password_hash
    FROM farmers
    WHERE phone=$1 AND is_active=TRUE
    LIMIT 1
  `, [phone]);

  const farmer = fr.rows[0];
  if (!farmer) return res.status(401).json({ error: "Invalid credentials" });
  if (!verifyPassword(password, farmer.password_hash)) return res.status(401).json({ error: "Invalid credentials" });

  const token = `sess_${nanoid(24)}`;
  await pool.query(`INSERT INTO farmer_sessions (token, farmer_id) VALUES ($1,$2)`, [token, farmer.id]);

  res.json({ token, farmer: { id: farmer.id, name: farmer.name, phone: farmer.phone, city: farmer.city } });
});

app.get("/api/farmers/me", requireFarmer, async (req, res) => {
  res.json({ farmer: req.farmer });
});

app.post("/api/farmers/logout", requireFarmer, async (req, res) => {
  const token = getBearerToken(req);
  await pool.query(`DELETE FROM farmer_sessions WHERE token=$1`, [token]);
  res.json({ ok: true });
});

// Farmer products
app.post("/api/farmers/products", requireFarmer, async (req, res) => {
  const title_fr = sanitizeText(req.body?.title_fr, 120);
  const title_ar = sanitizeText(req.body?.title_ar, 120);
  const category = sanitizeText(req.body?.category, 40);
  const city = sanitizeText(req.body?.city, 80) || req.farmer.city;
  const price_mad = Number(req.body?.price_mad || 0);
  const weight_kg = req.body?.weight_kg !== undefined ? Number(req.body.weight_kg) : null;
  const age_months = req.body?.age_months !== undefined ? Number(req.body.age_months) : null;
  const certified = !!req.body?.certified;
  const delivery = req.body?.delivery === false ? false : true;
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

  await pool.query(`
    INSERT INTO products (
      id, slug, title_fr, title_ar, category, city, price_mad,
      weight_kg, age_months, certified, delivery, images,
      description_fr, description_ar, is_active, farmer_id, status, source, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,$15,'pending','farmer',$16)
  `, [
    id, slug, title_fr, title_ar, category, city, price_mad,
    Number.isFinite(weight_kg) ? weight_kg : null,
    Number.isFinite(age_months) ? age_months : null,
    certified, delivery, JSON.stringify(images_clean),
    description_fr, description_ar,
    req.farmer.id, nowIso()
  ]);

  res.json({ ok: true, slug });
});

app.get("/api/farmers/products", requireFarmer, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT * FROM products
    WHERE farmer_id=$1 AND source='farmer'
    ORDER BY created_at DESC
    LIMIT 200
  `, [req.farmer.id]);

  res.json(rows.map(mapProduct));
});

app.delete("/api/farmers/products/:slug", requireFarmer, async (req, res) => {
  const slug = sanitizeText(req.params.slug, 120);

  const r = await pool.query(`
    SELECT slug, farmer_id, source
    FROM products
    WHERE slug=$1 AND is_active=TRUE
    LIMIT 1
  `, [slug]);

  const row = r.rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });
  if (row.source !== "farmer") return res.status(403).json({ error: "Forbidden" });
  if (row.farmer_id !== req.farmer.id) return res.status(403).json({ error: "Forbidden" });

  await pool.query(`UPDATE products SET is_active=FALSE, status='deleted' WHERE slug=$1`, [slug]);
  res.json({ ok: true });
});

// Admin
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 200`);
  res.json(rows.map(r => ({
    id: r.id,
    created_at: r.created_at,
    customer_name: r.customer_name,
    phone: r.phone,
    city: r.city,
    address: r.address,
    notes: r.notes,
    subtotal_mad: Number(r.subtotal_mad),
    status: r.status,
    items: r.items || []
  })));
});

app.get("/api/admin/pending-products", requireAdmin, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT p.*, f.name AS farmer_name, f.phone AS farmer_phone
    FROM products p
    LEFT JOIN farmers f ON f.id = p.farmer_id
    WHERE p.source='farmer' AND p.status='pending' AND p.is_active=TRUE
    ORDER BY p.created_at DESC
    LIMIT 200
  `);

  res.json(rows.map(r => ({
    ...mapProduct(r),
    farmer_name: r.farmer_name || "",
    farmer_phone: r.farmer_phone || ""
  })));
});

app.post("/api/admin/products/:slug/approve", requireAdmin, async (req, res) => {
  const slug = sanitizeText(req.params.slug, 120);
  const upd = await pool.query(`UPDATE products SET status='approved' WHERE slug=$1 AND source='farmer'`, [slug]);
  if (upd.rowCount === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.post("/api/admin/products/:slug/reject", requireAdmin, async (req, res) => {
  const slug = sanitizeText(req.params.slug, 120);
  const upd = await pool.query(`UPDATE products SET status='rejected', is_active=FALSE WHERE slug=$1 AND source='farmer'`, [slug]);
  if (upd.rowCount === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

async function start() {
  await initDb();
  app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
}

start().catch(err => {
  console.error("❌ Failed to start:", err);
  process.exit(1);
});
