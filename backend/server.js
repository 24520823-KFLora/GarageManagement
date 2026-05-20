/* ═══════════════════════════════════════════════════════════════
   AutoCare — Garage Management System  |  server.js
   Stack : Node.js + Express + PostgreSQL (pg)
   Deploy: Render.com  |  DB: Neon.tech (free PostgreSQL)
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'autocare_dev_secret_change_me';

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── PostgreSQL Pool ───────────────────────────────────────────
// Set DATABASE_URL in environment variables (Render / Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── Auth Middleware ───────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token không hợp lệ' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'quan_ly') return res.status(403).json({ error: 'Không có quyền' });
  next();
}

// ── DB Init ───────────────────────────────────────────────────
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         SERIAL PRIMARY KEY,
        username   TEXT UNIQUE NOT NULL,
        password   TEXT NOT NULL,
        full_name  TEXT NOT NULL,
        role       TEXT NOT NULL DEFAULT 'nhan_vien_le_tan',
        phone      TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS customers (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        phone      TEXT NOT NULL,
        address    TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS vehicles (
        id          SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        plate       TEXT UNIQUE NOT NULL,
        brand       TEXT NOT NULL,
        model       TEXT NOT NULL,
        color       TEXT,
        year        INTEGER,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS services (
        id           SERIAL PRIMARY KEY,
        name         TEXT NOT NULL,
        description  TEXT,
        price        NUMERIC(15,0) NOT NULL DEFAULT 0,
        duration_min INTEGER NOT NULL DEFAULT 60,
        active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS parts (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        unit       TEXT NOT NULL DEFAULT 'cái',
        price      NUMERIC(15,0) NOT NULL DEFAULT 0,
        stock_qty  INTEGER NOT NULL DEFAULT 0,
        min_stock  INTEGER NOT NULL DEFAULT 5,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS repair_orders (
        id                SERIAL PRIMARY KEY,
        customer_id       INTEGER NOT NULL REFERENCES customers(id),
        vehicle_id        INTEGER NOT NULL REFERENCES vehicles(id),
        staff_id          INTEGER REFERENCES users(id),
        status            TEXT NOT NULL DEFAULT 'tiep_nhan',
        initial_condition TEXT,
        note              TEXT,
        total_amount      NUMERIC(15,0) NOT NULL DEFAULT 0,
        created_at        TIMESTAMPTZ DEFAULT NOW(),
        updated_at        TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS order_services (
        id            SERIAL PRIMARY KEY,
        order_id      INTEGER NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
        service_id    INTEGER NOT NULL REFERENCES services(id),
        qty           INTEGER NOT NULL DEFAULT 1,
        price_at_time NUMERIC(15,0) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_parts (
        id            SERIAL PRIMARY KEY,
        order_id      INTEGER NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
        part_id       INTEGER NOT NULL REFERENCES parts(id),
        qty           INTEGER NOT NULL DEFAULT 1,
        price_at_time NUMERIC(15,0) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id              SERIAL PRIMARY KEY,
        repair_order_id INTEGER UNIQUE NOT NULL REFERENCES repair_orders(id),
        service_total   NUMERIC(15,0) NOT NULL DEFAULT 0,
        parts_total     NUMERIC(15,0) NOT NULL DEFAULT 0,
        discount        NUMERIC(15,0) NOT NULL DEFAULT 0,
        total           NUMERIC(15,0) NOT NULL DEFAULT 0,
        payment_method  TEXT NOT NULL DEFAULT 'tien_mat',
        created_by      INTEGER REFERENCES users(id),
        paid_at         TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id          SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        vehicle_id  INTEGER REFERENCES vehicles(id),
        scheduled_at TIMESTAMPTZ NOT NULL,
        note        TEXT,
        status      TEXT NOT NULL DEFAULT 'cho_xac_nhan',
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Seed default admin if not exists
    const { rows } = await client.query(`SELECT id FROM users WHERE username = 'admin'`);
    if (rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await client.query(`
        INSERT INTO users (username, password, full_name, role)
        VALUES ('admin', $1, 'Quản Lý', 'quan_ly')
      `, [hash]);
      console.log('✅ Tạo tài khoản admin mặc định: admin / admin123');
    }

    console.log('✅ Database sẵn sàng');
  } finally {
    client.release();
  }
}

// ── Helper: tính lại total cho repair order ───────────────────
async function recalcOrderTotal(client, orderId) {
  const svcRes = await client.query(
    `SELECT COALESCE(SUM(price_at_time * qty), 0) AS total FROM order_services WHERE order_id = $1`,
    [orderId]
  );
  const partRes = await client.query(
    `SELECT COALESCE(SUM(price_at_time * qty), 0) AS total FROM order_parts WHERE order_id = $1`,
    [orderId]
  );
  const total = Number(svcRes.rows[0].total) + Number(partRes.rows[0].total);
  await client.query(
    `UPDATE repair_orders SET total_amount = $1, updated_at = NOW() WHERE id = $2`,
    [total, orderId]
  );
  return total;
}

// ════════════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════════════

// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'AutoCare API running 🚗' }));

// ── AUTH ──────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin' });

    const { rows } = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET, { expiresIn: '8h' }
    );
    res.json({
      token,
      user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── USERS / STAFF ─────────────────────────────────────────────
app.get('/api/users', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, full_name, role, phone, created_at FROM users ORDER BY id`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, full_name, role, phone } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'Thiếu thông tin' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password, full_name, role, phone) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [username, hash, full_name, role || 'nhan_vien_le_tan', phone || null]
    );
    res.json({ id: rows[0].id, message: 'Thêm nhân viên thành công' });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { full_name, role, phone, password } = req.body;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `UPDATE users SET full_name=$1, role=$2, phone=$3, password=$4 WHERE id=$5`,
        [full_name, role, phone || null, hash, req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE users SET full_name=$1, role=$2, phone=$3 WHERE id=$4`,
        [full_name, role, phone || null, req.params.id]
      );
    }
    res.json({ message: 'Đã cập nhật' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Không thể xóa chính mình' });
    await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CUSTOMERS ────────────────────────────────────────────────
app.get('/api/customers', auth, async (req, res) => {
  try {
    const search = req.query.search || '';
    const { rows } = await pool.query(`
      SELECT c.*, COUNT(v.id)::int AS vehicle_count
      FROM customers c
      LEFT JOIN vehicles v ON v.customer_id = c.id
      WHERE c.name ILIKE $1 OR c.phone ILIKE $1
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `, [`%${search}%`]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/customers/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM customers WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/customers', auth, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Tên và SĐT là bắt buộc' });
    const { rows } = await pool.query(
      `INSERT INTO customers (name, phone, address) VALUES ($1,$2,$3) RETURNING id`,
      [name, phone, address || null]
    );
    res.json({ id: rows[0].id, message: 'Thêm khách hàng thành công' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/customers/:id', auth, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    await pool.query(
      `UPDATE customers SET name=$1, phone=$2, address=$3 WHERE id=$4`,
      [name, phone, address || null, req.params.id]
    );
    res.json({ message: 'Đã cập nhật' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/customers/:id', auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM customers WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VEHICLES ──────────────────────────────────────────────────
app.get('/api/vehicles', auth, async (req, res) => {
  try {
    const { customer_id, search } = req.query;
    let query = `
      SELECT v.*, c.name AS customer_name, c.phone AS customer_phone
      FROM vehicles v
      JOIN customers c ON c.id = v.customer_id
      WHERE 1=1
    `;
    const params = [];
    if (customer_id) { params.push(customer_id); query += ` AND v.customer_id = $${params.length}`; }
    if (search)      { params.push(`%${search}%`); query += ` AND (v.plate ILIKE $${params.length} OR v.brand ILIKE $${params.length} OR c.name ILIKE $${params.length})`; }
    query += ' ORDER BY v.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/vehicles', auth, async (req, res) => {
  try {
    const { customer_id, plate, brand, model, color, year } = req.body;
    if (!customer_id || !plate || !brand || !model) return res.status(400).json({ error: 'Thiếu thông tin' });
    const { rows } = await pool.query(
      `INSERT INTO vehicles (customer_id, plate, brand, model, color, year) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [customer_id, plate.toUpperCase(), brand, model, color || null, year || null]
    );
    res.json({ id: rows[0].id, message: 'Thêm xe thành công' });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Biển số đã tồn tại' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/vehicles/:id', auth, async (req, res) => {
  try {
    const { customer_id, brand, model, color, year } = req.body;
    await pool.query(
      `UPDATE vehicles SET customer_id=$1, brand=$2, model=$3, color=$4, year=$5 WHERE id=$6`,
      [customer_id, brand, model, color || null, year || null, req.params.id]
    );
    res.json({ message: 'Đã cập nhật' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/vehicles/:id', auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM vehicles WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SERVICES ──────────────────────────────────────────────────
app.get('/api/services', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM services ORDER BY name`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/services', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, price, duration_min, active } = req.body;
    if (!name || price == null) return res.status(400).json({ error: 'Thiếu thông tin' });
    const { rows } = await pool.query(
      `INSERT INTO services (name, description, price, duration_min, active) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [name, description || null, price, duration_min || 60, active !== false]
    );
    res.json({ id: rows[0].id, message: 'Thêm dịch vụ thành công' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/services/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, description, price, duration_min, active } = req.body;
    await pool.query(
      `UPDATE services SET name=$1, description=$2, price=$3, duration_min=$4, active=$5 WHERE id=$6`,
      [name, description || null, price, duration_min || 60, active !== false, req.params.id]
    );
    res.json({ message: 'Đã cập nhật' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/services/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query(`DELETE FROM services WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PARTS ────────────────────────────────────────────────────
app.get('/api/parts', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM parts ORDER BY name`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/parts', auth, async (req, res) => {
  try {
    const { name, unit, price, stock_qty, min_stock } = req.body;
    if (!name || price == null) return res.status(400).json({ error: 'Thiếu thông tin' });
    const { rows } = await pool.query(
      `INSERT INTO parts (name, unit, price, stock_qty, min_stock) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [name, unit || 'cái', price, stock_qty || 0, min_stock || 5]
    );
    res.json({ id: rows[0].id, message: 'Thêm phụ tùng thành công' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/parts/:id', auth, async (req, res) => {
  try {
    const { name, unit, price, stock_qty, min_stock } = req.body;
    await pool.query(
      `UPDATE parts SET name=$1, unit=$2, price=$3, stock_qty=$4, min_stock=$5 WHERE id=$6`,
      [name, unit || 'cái', price, stock_qty, min_stock || 5, req.params.id]
    );
    res.json({ message: 'Đã cập nhật' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/parts/:id', auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM parts WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Nhập kho
app.post('/api/parts/:id/restock', auth, async (req, res) => {
  try {
    const { qty } = req.body;
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Số lượng không hợp lệ' });
    await pool.query(`UPDATE parts SET stock_qty = stock_qty + $1 WHERE id = $2`, [qty, req.params.id]);
    res.json({ message: `Đã nhập thêm ${qty} vào kho` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REPAIR ORDERS ────────────────────────────────────────────
app.get('/api/repair-orders', auth, async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = `
      SELECT ro.*, c.name AS customer_name, c.phone AS customer_phone,
             v.plate, v.brand, v.model,
             u.full_name AS staff_name,
             (SELECT id FROM invoices WHERE repair_order_id = ro.id LIMIT 1) AS invoice
      FROM repair_orders ro
      JOIN customers c ON c.id = ro.customer_id
      JOIN vehicles  v ON v.id = ro.vehicle_id
      LEFT JOIN users u ON u.id = ro.staff_id
      WHERE 1=1
    `;
    const params = [];
    if (status) { params.push(status); query += ` AND ro.status = $${params.length}`; }
    if (search)  { params.push(`%${search}%`); query += ` AND (v.plate ILIKE $${params.length} OR c.name ILIKE $${params.length})`; }
    query += ' ORDER BY ro.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/repair-orders/:id', auth, async (req, res) => {
  try {
    // Order info
    const { rows } = await pool.query(`
      SELECT ro.*, c.name AS customer_name, c.phone AS customer_phone,
             v.plate, v.brand, v.model, v.color, v.year,
             u.full_name AS staff_name
      FROM repair_orders ro
      JOIN customers c ON c.id = ro.customer_id
      JOIN vehicles  v ON v.id = ro.vehicle_id
      LEFT JOIN users u ON u.id = ro.staff_id
      WHERE ro.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy' });
    const order = rows[0];

    // Services
    const { rows: services } = await pool.query(`
      SELECT os.*, s.name AS service_name
      FROM order_services os JOIN services s ON s.id = os.service_id
      WHERE os.order_id = $1
    `, [order.id]);

    // Parts
    const { rows: parts } = await pool.query(`
      SELECT op.*, p.name AS part_name, p.unit
      FROM order_parts op JOIN parts p ON p.id = op.part_id
      WHERE op.order_id = $1
    `, [order.id]);

    // Invoice
    const { rows: invRows } = await pool.query(
      `SELECT * FROM invoices WHERE repair_order_id = $1`, [order.id]
    );

    res.json({ ...order, services, parts, invoice: invRows[0] || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/repair-orders', auth, async (req, res) => {
  try {
    const { customer_id, vehicle_id, staff_id, initial_condition, note } = req.body;
    if (!customer_id || !vehicle_id) return res.status(400).json({ error: 'Thiếu thông tin' });
    const { rows } = await pool.query(`
      INSERT INTO repair_orders (customer_id, vehicle_id, staff_id, initial_condition, note)
      VALUES ($1,$2,$3,$4,$5) RETURNING id
    `, [customer_id, vehicle_id, staff_id || null, initial_condition || null, note || null]);
    res.json({ id: rows[0].id, message: 'Tạo phiếu sửa chữa thành công' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/repair-orders/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query(
      `UPDATE repair_orders SET status=$1, updated_at=NOW() WHERE id=$2`,
      [status, req.params.id]
    );
    res.json({ message: 'Đã cập nhật trạng thái' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Thêm dịch vụ vào phiếu
app.post('/api/repair-orders/:id/services', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { service_id, qty } = req.body;
    const { rows: svc } = await client.query(`SELECT price FROM services WHERE id = $1`, [service_id]);
    if (!svc[0]) throw new Error('Dịch vụ không tồn tại');
    await client.query(
      `INSERT INTO order_services (order_id, service_id, qty, price_at_time) VALUES ($1,$2,$3,$4)`,
      [req.params.id, service_id, qty || 1, svc[0].price]
    );
    await recalcOrderTotal(client, req.params.id);
    await client.query('COMMIT');
    res.json({ message: 'Đã thêm dịch vụ' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Xóa dịch vụ khỏi phiếu
app.delete('/api/repair-orders/:id/services/:sid', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM order_services WHERE id=$1 AND order_id=$2`, [req.params.sid, req.params.id]);
    await recalcOrderTotal(client, req.params.id);
    await client.query('COMMIT');
    res.json({ message: 'Đã xóa' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Thêm phụ tùng vào phiếu
app.post('/api/repair-orders/:id/parts', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { part_id, qty } = req.body;
    const { rows: part } = await client.query(`SELECT price, stock_qty FROM parts WHERE id = $1`, [part_id]);
    if (!part[0]) throw new Error('Phụ tùng không tồn tại');
    if (part[0].stock_qty < qty) throw new Error(`Không đủ tồn kho (còn ${part[0].stock_qty})`);
    await client.query(
      `INSERT INTO order_parts (order_id, part_id, qty, price_at_time) VALUES ($1,$2,$3,$4)`,
      [req.params.id, part_id, qty || 1, part[0].price]
    );
    await client.query(`UPDATE parts SET stock_qty = stock_qty - $1 WHERE id = $2`, [qty, part_id]);
    await recalcOrderTotal(client, req.params.id);
    await client.query('COMMIT');
    res.json({ message: 'Đã thêm phụ tùng' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// Xóa phụ tùng khỏi phiếu (hoàn kho)
app.delete('/api/repair-orders/:id/parts/:pid', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT part_id, qty FROM order_parts WHERE id=$1 AND order_id=$2`,
      [req.params.pid, req.params.id]
    );
    if (rows[0]) {
      await client.query(`UPDATE parts SET stock_qty = stock_qty + $1 WHERE id = $2`, [rows[0].qty, rows[0].part_id]);
      await client.query(`DELETE FROM order_parts WHERE id = $1`, [req.params.pid]);
      await recalcOrderTotal(client, req.params.id);
    }
    await client.query('COMMIT');
    res.json({ message: 'Đã xóa' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ── INVOICES ─────────────────────────────────────────────────
app.post('/api/invoices', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { repair_order_id, discount, payment_method } = req.body;

    const { rows: svcRows } = await client.query(
      `SELECT COALESCE(SUM(price_at_time * qty), 0) AS total FROM order_services WHERE order_id = $1`,
      [repair_order_id]
    );
    const { rows: partRows } = await client.query(
      `SELECT COALESCE(SUM(price_at_time * qty), 0) AS total FROM order_parts WHERE order_id = $1`,
      [repair_order_id]
    );
    const svcTotal  = Number(svcRows[0].total);
    const partTotal = Number(partRows[0].total);
    const disc      = Number(discount) || 0;
    const total     = svcTotal + partTotal - disc;

    const { rows } = await client.query(`
      INSERT INTO invoices (repair_order_id, service_total, parts_total, discount, total, payment_method, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
    `, [repair_order_id, svcTotal, partTotal, disc, total, payment_method || 'tien_mat', req.user.id]);

    await client.query(
      `UPDATE repair_orders SET status='da_thanh_toan', updated_at=NOW() WHERE id=$1`,
      [repair_order_id]
    );
    await client.query('COMMIT');
    res.json({ id: rows[0].id, total, message: 'Tạo hóa đơn thành công' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

app.get('/api/invoices/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT inv.*, ro.id AS order_id,
             c.name AS customer_name, c.phone AS customer_phone,
             v.plate, v.brand, v.model,
             u.full_name AS created_by_name
      FROM invoices inv
      JOIN repair_orders ro ON ro.id = inv.repair_order_id
      JOIN customers c ON c.id = ro.customer_id
      JOIN vehicles  v ON v.id = ro.vehicle_id
      LEFT JOIN users u ON u.id = inv.created_by
      WHERE inv.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy' });
    const inv = rows[0];

    const { rows: services } = await pool.query(`
      SELECT os.qty, os.price_at_time, s.name
      FROM order_services os JOIN services s ON s.id = os.service_id
      WHERE os.order_id = $1
    `, [inv.order_id]);

    const { rows: parts } = await pool.query(`
      SELECT op.qty, op.price_at_time, p.name, p.unit
      FROM order_parts op JOIN parts p ON p.id = op.part_id
      WHERE op.order_id = $1
    `, [inv.order_id]);

    res.json({ ...inv, services, parts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── APPOINTMENTS ─────────────────────────────────────────────
app.get('/api/appointments', auth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT a.*, c.name AS customer_name, c.phone AS customer_phone,
             v.plate
      FROM appointments a
      JOIN customers c ON c.id = a.customer_id
      LEFT JOIN vehicles v ON v.id = a.vehicle_id
      WHERE 1=1
    `;
    const params = [];
    if (status) { params.push(status); query += ` AND a.status = $${params.length}`; }
    query += ' ORDER BY a.scheduled_at ASC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/appointments', auth, async (req, res) => {
  try {
    const { customer_id, vehicle_id, scheduled_at, note } = req.body;
    if (!customer_id || !scheduled_at) return res.status(400).json({ error: 'Thiếu thông tin' });
    const { rows } = await pool.query(`
      INSERT INTO appointments (customer_id, vehicle_id, scheduled_at, note)
      VALUES ($1,$2,$3,$4) RETURNING id
    `, [customer_id, vehicle_id || null, scheduled_at, note || null]);
    res.json({ id: rows[0].id, message: 'Đặt lịch thành công' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/appointments/:id/confirm', auth, async (req, res) => {
  try {
    await pool.query(`UPDATE appointments SET status='da_xac_nhan' WHERE id=$1`, [req.params.id]);
    res.json({ message: 'Đã xác nhận' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/appointments/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query(`UPDATE appointments SET status=$1 WHERE id=$2`, [status, req.params.id]);
    res.json({ message: 'Đã cập nhật' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REPORTS ───────────────────────────────────────────────────
app.get('/api/reports/dashboard', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [cust, veh, ordToday, revToday, revMonth, lowStock, pendingOrders, pendingAppts] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM customers`),
      pool.query(`SELECT COUNT(*)::int AS n FROM vehicles`),
      pool.query(`SELECT COUNT(*)::int AS n FROM repair_orders WHERE created_at::date = $1`, [today]),
      pool.query(`SELECT COALESCE(SUM(total),0) AS n FROM invoices WHERE paid_at::date = $1`, [today]),
      pool.query(`SELECT COALESCE(SUM(total),0) AS n FROM invoices WHERE DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', NOW())`),
      pool.query(`SELECT COUNT(*)::int AS n FROM parts WHERE stock_qty <= min_stock`),
      pool.query(`SELECT COUNT(*)::int AS n FROM repair_orders WHERE status IN ('tiep_nhan','dang_sua')`),
      pool.query(`SELECT COUNT(*)::int AS n FROM appointments WHERE status = 'cho_xac_nhan'`),
    ]);
    res.json({
      totalCustomers:      cust.rows[0].n,
      totalVehicles:       veh.rows[0].n,
      ordersToday:         ordToday.rows[0].n,
      revenueToday:        Number(revToday.rows[0].n),
      revenueMonth:        Number(revMonth.rows[0].n),
      lowStockParts:       lowStock.rows[0].n,
      pendingOrders:       pendingOrders.rows[0].n,
      pendingAppointments: pendingAppts.rows[0].n,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/revenue', auth, async (req, res) => {
  try {
    const { period, month, year } = req.query;
    let query, params = [];

    if (period === 'day') {
      // Theo ngày trong tháng
      const m = month || new Date().toISOString().slice(0, 7);
      params = [m + '-01', m + '-31'];
      query = `
        SELECT TO_CHAR(paid_at, 'DD/MM') AS label,
               COALESCE(SUM(total),0)::bigint AS revenue,
               COUNT(*)::int AS count
        FROM invoices
        WHERE paid_at::date BETWEEN $1::date AND $2::date
        GROUP BY label, DATE_TRUNC('day', paid_at)
        ORDER BY DATE_TRUNC('day', paid_at)
      `;
    } else if (period === 'month') {
      // Theo tháng trong năm
      const y = year || new Date().getFullYear();
      params = [y];
      query = `
        SELECT TO_CHAR(paid_at, 'MM/YYYY') AS label,
               COALESCE(SUM(total),0)::bigint AS revenue,
               COUNT(*)::int AS count
        FROM invoices
        WHERE EXTRACT(YEAR FROM paid_at) = $1
        GROUP BY label, DATE_TRUNC('month', paid_at)
        ORDER BY DATE_TRUNC('month', paid_at)
      `;
    } else {
      // Theo năm
      query = `
        SELECT TO_CHAR(paid_at, 'YYYY') AS label,
               COALESCE(SUM(total),0)::bigint AS revenue,
               COUNT(*)::int AS count
        FROM invoices
        GROUP BY label
        ORDER BY label
      `;
    }
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/services', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.name, COUNT(os.id)::int AS usage_count,
             COALESCE(SUM(os.price_at_time * os.qty), 0)::bigint AS total_revenue
      FROM order_services os
      JOIN services s ON s.id = os.service_id
      GROUP BY s.id, s.name
      ORDER BY usage_count DESC
      LIMIT 10
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Start ─────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚗 AutoCare API running on port ${PORT}`));
}).catch(err => {
  console.error('❌ Không thể kết nối database:', err.message);
  process.exit(1);
});