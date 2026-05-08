const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "eyewear-pos-secret-2024";

// --- Cloudinary Config ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "eyewear-pos",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    transformation: [{ width: 500, height: 500, crop: "limit" }]
  },
});
const upload = multer({ storage: storage });

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static("."));

// --- Database Connection ---
const DB_NAME = process.env.DB_NAME || "eyewear_inventory";

// SSL Config for Aiven/Managed MySQL
const sslConfig = {};
if (process.env.DB_SSL_CA) {
  sslConfig.ca = process.env.DB_SSL_CA;
} else if (fs.existsSync("./ca.pem")) {
  sslConfig.ca = fs.readFileSync("./ca.pem");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: Object.keys(sslConfig).length > 0 ? sslConfig : (process.env.DB_HOST ? { rejectUnauthorized: false } : null),
});

// --- Auth Middleware ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "โปรดเข้าสู่ระบบ" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token หมดอายุหรือเซสชันไม่ถูกต้อง" });
    req.user = user;
    next();
  });
}

// --- DB Init ---
async function createDatabaseIfNotExists() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    ssl: Object.keys(sslConfig).length > 0 ? sslConfig : (process.env.DB_HOST ? { rejectUnauthorized: false } : null),
  });
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;`);
  await connection.end();
}

async function initializeDatabase() {
  const tables = {
    users: `
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,
    product_types: `
      CREATE TABLE IF NOT EXISTS product_types (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,
    products: `
      CREATE TABLE IF NOT EXISTS products (
        sku VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(100),
        price DECIMAL(12,2) NOT NULL,
        cost DECIMAL(12,2) DEFAULT 0,
        stock INT DEFAULT 0,
        image VARCHAR(255),
        color VARCHAR(50),
        prescription VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,
    sales: `
      CREATE TABLE IF NOT EXISTS sales (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(50),
        user_id INT UNSIGNED,
        customer_id INT UNSIGNED,
        sku VARCHAR(50),
        qty INT NOT NULL,
        unit_price DECIMAL(12,2) NOT NULL,
        total DECIMAL(12,2) NOT NULL,
        discount DECIMAL(12,2) DEFAULT 0,
        payment_method ENUM('cash', 'qr', 'transfer') DEFAULT 'cash',
        sold_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,
    settings: `
      CREATE TABLE IF NOT EXISTS settings (
        id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
        low_stock_threshold INT NOT NULL DEFAULT 5
      );`,
    promotions: `
      CREATE TABLE IF NOT EXISTS promotions (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        min_qty INT DEFAULT 1,
        discount_type ENUM('fixed', 'percent') DEFAULT 'fixed',
        discount_value DECIMAL(12,2) DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        applicable_skus TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,
    prescriptions: `
      CREATE TABLE IF NOT EXISTS prescriptions (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        customer_id INT UNSIGNED,
        sph_r VARCHAR(10), cyl_r VARCHAR(10), axis_r VARCHAR(10),
        sph_l VARCHAR(10), cyl_l VARCHAR(10), axis_l VARCHAR(10),
        add_val VARCHAR(10), pd VARCHAR(10),
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      );`,
    stock_logs: `
      CREATE TABLE IF NOT EXISTS stock_logs (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        sku VARCHAR(50),
        user_id INT UNSIGNED,
        quantity INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,
    customers: `
      CREATE TABLE IF NOT EXISTS customers (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`
  };

  const connection = await pool.getConnection();
  try {
    for (const sql of Object.values(tables)) {
      await connection.query(sql);
    }

    // Add cost, color, prescription to products if missing
    try { await connection.query("ALTER TABLE products ADD COLUMN cost DECIMAL(12,2) DEFAULT 0 AFTER price;"); } catch (e) {}
    try { await connection.query("ALTER TABLE products ADD COLUMN color VARCHAR(50) AFTER image;"); } catch (e) {}
    try { await connection.query("ALTER TABLE products ADD COLUMN prescription VARCHAR(100) AFTER color;"); } catch (e) {}
    
    // Add payment_method to sales if missing
    try { await connection.query("ALTER TABLE sales ADD COLUMN payment_method ENUM('cash', 'qr', 'transfer') DEFAULT 'cash' AFTER discount;"); } catch (e) {}

    // Insert Default Admin: admin / admin123
    const [rows] = await connection.query("SELECT * FROM users WHERE username = 'admin'");
    if (rows.length === 0) {
      const hashed = await bcrypt.hash("admin123", 10);
      await connection.query("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)", ["admin", hashed, "Admin User", "admin"]);
    }
    
    // Insert Default Settings
    const [sett] = await connection.query("SELECT * FROM settings WHERE id = 1");
    if (sett.length === 0) {
      await connection.query("INSERT INTO settings (id, low_stock_threshold) VALUES (1, 5)");
    }

  } catch (error) {
    console.error("DATABASE INITIALIZATION ERROR:", error);
  } finally {
    connection.release();
  }
}

// --- Endpoints ---

// --- Auth ---
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    if (rows.length === 0 || !(await bcrypt.compare(password, rows[0].password))) {
      return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }
    const user = rows[0];
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  } catch (error) { handleError(res, error); }
});

// --- Users ---
app.get("/api/users", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, username, name, role, created_at FROM users");
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

app.post("/api/users", authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Unauthorized" });
  const { username, password, name, role } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)", [username, hashed, name, role || 'user']);
    res.status(201).json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.put("/api/users/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Unauthorized" });
  const { username, password, name, role } = req.body;
  try {
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await pool.query("UPDATE users SET username=?, password=?, name=?, role=? WHERE id=?", [username, hashed, name, role, req.params.id]);
    } else {
      await pool.query("UPDATE users SET username=?, name=?, role=? WHERE id=?", [username, name, role, req.params.id]);
    }
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.delete("/api/users/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' || req.user.id == req.params.id) return res.status(403).json({ error: "Unauthorized" });
  try {
    await pool.query("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

// --- Products ---
app.get("/api/products", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

app.post("/api/products", authenticateToken, upload.single("image"), async (req, res) => {
  const { sku, name, category, price, cost, stock, color, prescription } = req.body;
  const image = req.file ? req.file.path : null;
  try {
    await pool.query("INSERT INTO products (sku, name, category, price, cost, stock, image, color, prescription) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [sku, name, category, price, cost, stock, image, color, prescription]);
    res.status(201).json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.put("/api/products/:sku", authenticateToken, upload.single("image"), async (req, res) => {
  const { name, category, price, cost, stock, color, prescription } = req.body;
  const image = req.file ? req.file.path : null;
  try {
    if (image) {
      await pool.query("UPDATE products SET name=?, category=?, price=?, cost=?, stock=?, image=?, color=?, prescription=? WHERE sku=?",
        [name, category, price, cost, stock, image, color, prescription, req.params.sku]);
    } else {
      await pool.query("UPDATE products SET name=?, category=?, price=?, cost=?, stock=?, color=?, prescription=? WHERE sku=?",
        [name, category, price, cost, stock, color, prescription, req.params.sku]);
    }
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.post("/api/products/:sku/add-stock", authenticateToken, async (req, res) => {
  const { quantity } = req.body;
  const qty = parseInt(quantity);
  if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: "จำนวนไม่ถูกต้อง" });
  
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("UPDATE products SET stock = stock + ? WHERE sku = ?", [qty, req.params.sku]);
    await connection.query("INSERT INTO stock_logs (sku, user_id, quantity) VALUES (?, ?, ?)", [req.params.sku, req.user.id, qty]);
    await connection.commit();
    res.json({ message: "สำเร็จ" });
  } catch (error) { await connection.rollback(); handleError(res, error); } finally { connection.release(); }
});

app.delete("/api/products/:sku", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM products WHERE sku = ?", [req.params.sku]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

// --- Product Types ---
app.get("/api/product-types", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM product_types");
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

app.post("/api/product-types", authenticateToken, async (req, res) => {
  try {
    await pool.query("INSERT IGNORE INTO product_types (name) VALUES (?)", [req.body.name]);
    res.status(201).json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.delete("/api/product-types/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM product_types WHERE id = ?", [req.params.id]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

// --- Customers ---
app.get("/api/customers", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM customers ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

app.post("/api/customers", authenticateToken, async (req, res) => {
  const { name, phone } = req.body;
  try {
    await pool.query("INSERT INTO customers (name, phone) VALUES (?, ?)", [name, phone]);
    res.status(201).json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

// --- Prescriptions ---
app.get("/api/customers/:phone/prescriptions", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT pr.* FROM prescriptions pr 
                                     JOIN customers c ON pr.customer_id = c.id 
                                     WHERE c.phone = ? ORDER BY pr.created_at DESC`, [req.params.phone]);
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

app.post("/api/prescriptions", authenticateToken, async (req, res) => {
  const { customer_id, sph_r, cyl_r, axis_r, sph_l, cyl_l, axis_l, add_val, pd, note } = req.body;
  try {
    await pool.query(
      "INSERT INTO prescriptions (customer_id, sph_r, cyl_r, axis_r, sph_l, cyl_l, axis_l, add_val, pd, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [customer_id, sph_r, cyl_r, axis_r, sph_l, cyl_l, axis_l, add_val, pd, note]
    );
    res.status(201).json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.delete("/api/prescriptions/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM prescriptions WHERE id = ?", [req.params.id]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

// --- Promotions ---
app.get("/api/promotions", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM promotions ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

app.post("/api/promotions", authenticateToken, async (req, res) => {
  const { name, min_qty, discount_type, discount_value, applicable_skus, is_active } = req.body;
  try {
    await pool.query("INSERT INTO promotions (name, min_qty, discount_type, discount_value, applicable_skus, is_active) VALUES (?, ?, ?, ?, ?, ?)",
      [name, min_qty, discount_type, discount_value, applicable_skus, is_active]);
    res.status(201).json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.put("/api/promotions/:id", authenticateToken, async (req, res) => {
  const { name, min_qty, discount_type, discount_value, applicable_skus, is_active } = req.body;
  try {
    await pool.query("UPDATE promotions SET name=?, min_qty=?, discount_type=?, discount_value=?, applicable_skus=?, is_active=? WHERE id=?",
      [name, min_qty, discount_type, discount_value, applicable_skus, is_active, req.params.id]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.delete("/api/promotions/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM promotions WHERE id = ?", [req.params.id]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

// --- Checkout & Sales ---
app.get("/api/sales", authenticateToken, async (req, res) => {
  const { start_date, end_date, search } = req.query;
  let sql = `SELECT s.*, p.name as product_name, c.name as customer_name, c.phone as customer_phone, u.name as seller_name 
             FROM sales s 
             LEFT JOIN products p ON s.sku = p.sku 
             LEFT JOIN customers c ON s.customer_id = c.id 
             LEFT JOIN users u ON s.user_id = u.id WHERE 1=1`;
  const params = [];
  if (start_date) { sql += " AND s.sold_at >= ?"; params.push(start_date + " 00:00:00"); }
  if (end_date) { sql += " AND s.sold_at <= ?"; params.push(end_date + " 23:59:59"); }
  if (search) { sql += " AND (s.order_id LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR p.name LIKE ?)"; const p = `%${search}%`; params.push(p, p, p, p); }
  sql += " ORDER BY s.sold_at DESC LIMIT 500";
  try {
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

app.post("/api/checkout", authenticateToken, async (req, res) => {
  const { items, customer_phone, customer_name, payment_method } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let customer_id = null;
    if (customer_phone) {
      const [custs] = await connection.query("SELECT id FROM customers WHERE phone = ?", [customer_phone]);
      if (custs.length > 0) customer_id = custs[0].id;
      else {
        const [insertRes] = await connection.query("INSERT INTO customers (name, phone) VALUES (?, ?)", [customer_name || "ลูกค้าทั่วไป", customer_phone]);
        customer_id = insertRes.insertId;
      }
    }

    const order_id = `ORD-${Date.now()}`;
    const [activePromos] = await connection.query("SELECT * FROM promotions WHERE is_active = 1");

    for (const item of items) {
      const [prods] = await connection.query("SELECT * FROM products WHERE sku = ?", [item.sku]);
      const product = prods[0];
      if (!product) throw new Error(`ไม่พบสินค้า [${item.sku}]`);
      
      let discountPerUnit = 0;
      const promo = activePromos.find(pr => {
        const skus = pr.applicable_skus ? pr.applicable_skus.split(",").map(s => s.trim()) : [];
        return (skus.length === 0 || skus.includes(item.sku)) && item.qty >= pr.min_qty;
      });
      if (promo) discountPerUnit = promo.discount_type === "fixed" ? Number(promo.discount_value) : (product.price * Number(promo.discount_value) / 100);

      const total = (Number(product.price) - discountPerUnit) * item.qty;
      const totalDiscount = discountPerUnit * item.qty;

      await connection.query("UPDATE products SET stock = stock - ? WHERE sku = ?", [item.qty, item.sku]);
      await connection.query("INSERT INTO sales (order_id, user_id, customer_id, sku, qty, unit_price, discount, total, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [order_id, req.user.id, customer_id, item.sku, item.qty, product.price, totalDiscount, total, payment_method || 'cash']);
    }
    await connection.commit();
    res.json({ message: "สำเร็จ", order_id });
  } catch (error) { await connection.rollback(); handleError(res, error); } finally { connection.release(); }
});

app.get("/api/orders/:id", authenticateToken, async (req, res) => {
  try {
    const [salesRows] = await pool.query(`SELECT s.*, p.name as product_name, c.name as customer_name, c.phone as customer_phone 
                                          FROM sales s 
                                          LEFT JOIN products p ON s.sku = p.sku 
                                          LEFT JOIN customers c ON s.customer_id = c.id 
                                          WHERE s.order_id = ?`, [req.params.id]);
    if (salesRows.length === 0) return res.status(404).json({ error: "ไม่พบออเดอร์" });
    const order = {
      order_id: salesRows[0].order_id,
      sold_at: salesRows[0].sold_at,
      customer_name: salesRows[0].customer_name,
      customer_phone: salesRows[0].customer_phone,
      payment_method: salesRows[0].payment_method,
      items: salesRows.map(r => ({ product_name: r.product_name, sku: r.sku, qty: r.qty, unit_price: r.unit_price, discount: r.discount, total: r.total }))
    };
    res.json(order);
  } catch (error) { handleError(res, error); }
});

// --- Settings & Logs ---
app.get("/api/settings", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM settings WHERE id = 1");
    res.json(rows[0] || { low_stock_threshold: 5 });
  } catch (error) { handleError(res, error); }
});

app.post("/api/settings", authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "Unauthorized" });
  try {
    await pool.query("UPDATE settings SET low_stock_threshold = ? WHERE id = 1", [req.body.low_stock_threshold]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.get("/api/stock-logs", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT sl.*, p.name as product_name, u.name as user_name FROM stock_logs sl 
                                     LEFT JOIN products p ON sl.sku = p.sku 
                                     LEFT JOIN users u ON sl.user_id = u.id 
                                     ORDER BY sl.created_at DESC LIMIT 100`);
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

// --- Helper ---
function handleError(res, error) {
  console.error("API Error:", error);
  res.status(500).json({ error: error.message || "เกิดข้อผิดพลาดในเซิร์ฟเวอร์" });
}

// --- Start ---
createDatabaseIfNotExists().then(() => initializeDatabase()).then(() => {
  app.listen(port, "0.0.0.0", () => console.log(`Server running at http://0.0.0.0:${port}`));
}).catch(e => { 
  console.error("STARTUP ERROR:", e);
  app.listen(port, "0.0.0.0", () => console.log(`Server running in ERROR MODE at http://0.0.0.0:${port}`));
});
