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

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
app.use(cors());
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-for-eyewear-pos";

// Middleware for authenticating JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: "Unauthorized: ไม่ได้เข้าสู่ระบบ" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Forbidden: Token หมดอายุหรือไม่ถูกต้อง" });
    req.user = user;
    next();
  });
}

// Prevent caching of HTML files
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.static(path.join(__dirname)));

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));

// Cloudinary Storage Configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "eyewear_inventory",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => {
      const safeName = file.originalname.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_.-]/g, "");
      return `${Date.now()}-${safeName}`;
    },
  },
});

const upload = multer({ storage });

const DB_NAME = process.env.DB_NAME || "eyewear_inventory";

const sslConfig = {};
const caPath = path.join(__dirname, "ca.pem");

if (fs.existsSync(caPath)) {
  console.log("SSL Certificate found as file, enabling SSL connection.");
  sslConfig.ca = fs.readFileSync(caPath);
} else if (process.env.DB_SSL_CA) {
  console.log("SSL Certificate found in environment variable, enabling SSL connection.");
  sslConfig.ca = process.env.DB_SSL_CA;
} else {
  console.warn("WARNING: SSL Certificate not found. Attempting connection without it.");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: Object.keys(sslConfig).length > 0 ? sslConfig : (process.env.DB_HOST ? { rejectUnauthorized: false } : null),
});

async function createDatabaseIfNotExists() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
    ssl: Object.keys(sslConfig).length > 0 ? sslConfig : (process.env.DB_HOST ? { rejectUnauthorized: false } : null),
  });
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await connection.end();
}

async function initializeDatabase() {
  await createDatabaseIfNotExists();

  const tables = {
    users: `
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(150) NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,
    products: `
      CREATE TABLE IF NOT EXISTS products (
        sku VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        brand VARCHAR(100),
        frame VARCHAR(100),
        lens VARCHAR(100),
        prescription VARCHAR(100),
        color VARCHAR(100),
        size VARCHAR(100),
        category VARCHAR(100),
        cost DECIMAL(12,2) DEFAULT 0,
        price DECIMAL(12,2) DEFAULT 0,
        stock INT DEFAULT 0,
        image VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,
    product_types: `
      CREATE TABLE IF NOT EXISTS product_types (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
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

    // Add payment_method column to existing sales table if missing
    try {
      await connection.query("ALTER TABLE sales ADD COLUMN payment_method ENUM('cash', 'qr', 'transfer') DEFAULT 'cash' AFTER discount;");
    } catch (e) { /* Column likely exists */ }

    // Insert Defaults
    await connection.query("INSERT IGNORE INTO settings (id, low_stock_threshold) VALUES (1, 5);");
    await connection.query("INSERT IGNORE INTO product_types (name) VALUES ('เลนส์'), ('กรอบแว่นตา'), ('เลนส์โค้ดเปลี่ยนสี');");
    // Admin: admin / admin123, User: user / user123
    await connection.query(`INSERT IGNORE INTO users (id, username, password, name, role) VALUES 
      (1, 'admin', '$2b$10$9TQ52FfRu5LAgwC6J5.aBuEUAwWggOm/ygoIi182tQ6D5VB1772pK', 'Admin', 'admin'),
      (2, 'user', '$2b$10$TpnONEA6e62ub.3WjO8Dm.f8qGtag4U/3q07.HrdhVcxECR0bhU2y', 'User', 'user');`);

    console.log("Database initialized successfully");
  } finally {
    connection.release();
  }
}

function handleError(res, error) {
  console.error(error);
  res.status(500).json({ error: "เกิดข้อผิดพลาดในเซิร์ฟเวอร์" });
}

// --- Auth Endpoints ---

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

// --- User Endpoints ---

app.get("/api/users", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, username, name, role FROM users");
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

app.post("/api/users", authenticateToken, async (req, res) => {
  const { username, password, name, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)", [username, hash, name, role || "user"]);
    res.status(201).json({ message: "สำเร็จ" });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: "ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว" });
    }
    handleError(res, error);
  }
});

app.put("/api/users/:id", authenticateToken, async (req, res) => {
  const { username, name, role, password } = req.body;
  try {
    let sql = "UPDATE users SET username=?, name=?, role=? WHERE id=?";
    let params = [username, name, role, req.params.id];
    if (password) {
      sql = "UPDATE users SET username=?, name=?, role=?, password=? WHERE id=?";
      params = [username, name, role, await bcrypt.hash(password, 10), req.params.id];
    }
    await pool.query(sql, params);
    res.json({ message: "สำเร็จ" });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: "ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว" });
    }
    handleError(res, error);
  }
});

app.delete("/api/users/:id", authenticateToken, async (req, res) => {
  if (req.user.id == req.params.id) return res.status(400).json({ error: "ลบตัวเองไม่ได้" });
  try {
    await pool.query("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

// --- Product Endpoints ---

app.get("/api/products", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM products ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

app.post("/api/products", authenticateToken, upload.single("image"), async (req, res) => {
  const { sku, name, category, price, stock, cost, color, prescription } = req.body;
  const image = req.file ? req.file.path : null;
  try {
    await pool.query(
      "INSERT INTO products (sku, name, category, price, stock, image, cost, color, prescription) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [sku, name, category, price, stock, image, cost || 0, color || "", prescription || ""]
    );
    res.status(201).json({ message: "สำเร็จ" });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: "รหัสสินค้านี้ (SKU) มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น" });
    }
    handleError(res, error);
  }
});

app.put("/api/products/:sku", authenticateToken, upload.single("image"), async (req, res) => {
  const { sku: newSku, name, category, price, stock, cost, color, prescription } = req.body;
  const oldSku = req.params.sku;
  const image = req.file ? req.file.path : null;
  
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Update Product details
    let sql = "UPDATE products SET sku=?, name=?, category=?, price=?, stock=?, cost=?, color=?, prescription=? WHERE sku=?";
    let params = [newSku || oldSku, name, category, price, stock, cost || 0, color || "", prescription || "", oldSku];
    if (image) {
      sql = "UPDATE products SET sku=?, name=?, category=?, price=?, stock=?, cost=?, color=?, prescription=?, image=? WHERE sku=?";
      params = [newSku || oldSku, name, category, price, stock, cost || 0, color || "", prescription || "", image, oldSku];
    }
    await connection.query(sql, params);

    // 2. Cascade SKU change if it changed
    if (newSku && newSku !== oldSku) {
      await connection.query("UPDATE sales SET sku = ? WHERE sku = ?", [newSku, oldSku]);
      await connection.query("UPDATE stock_logs SET sku = ? WHERE sku = ?", [newSku, oldSku]);
    }

    await connection.commit();
    res.json({ message: "สำเร็จ" });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: "รหัสสินค้านี้มีอยู่ในระบบแล้ว" });
    }
    handleError(res, error);
  } finally {
    connection.release();
  }
});

app.post("/api/products/:sku/add-stock", authenticateToken, async (req, res) => {
  console.log(`Add stock request received for SKU: ${req.params.sku}, Quantity: ${req.body.quantity}`);
  const { quantity } = req.body;
  const qty = parseInt(quantity);
  if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: "จำนวนไม่ถูกต้อง" });
  
  try {
    await pool.query("UPDATE products SET stock = stock + ? WHERE sku = ?", [qty, req.params.sku]);
    res.json({ message: "เพิ่มสต็อกสำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.delete("/api/products/:sku", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM products WHERE sku = ?", [req.params.sku]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.get("/api/product-types", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM product_types ORDER BY name ASC");
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

// --- Customer Endpoints ---

app.get("/api/customers", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM customers ORDER BY name ASC");
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

app.post("/api/customers", authenticateToken, async (req, res) => {
  const { name, phone } = req.body;
  try {
    await pool.query("INSERT INTO customers (name, phone) VALUES (?, ?) ON DUPLICATE KEY UPDATE name=?", [name, phone, name]);
    res.status(201).json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.put("/api/customers/:id", authenticateToken, async (req, res) => {
  const { name, phone } = req.body;
  try {
    await pool.query("UPDATE customers SET name=?, phone=? WHERE id=?", [name, phone, req.params.id]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.delete("/api/customers/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM customers WHERE id = ?", [req.params.id]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

// --- Promotion Endpoints ---

app.get("/api/promotions", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM promotions ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

app.post("/api/promotions", authenticateToken, async (req, res) => {
  const { name, min_qty, discount_type, discount_value, is_active, applicable_skus } = req.body;
  try {
    await pool.query("INSERT INTO promotions (name, min_qty, discount_type, discount_value, is_active, applicable_skus) VALUES (?, ?, ?, ?, ?, ?)", [name, min_qty, discount_type, discount_value, is_active, applicable_skus]);
    res.status(201).json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.put("/api/promotions/:id", authenticateToken, async (req, res) => {
  const { name, min_qty, discount_type, discount_value, is_active, applicable_skus } = req.body;
  try {
    await pool.query("UPDATE promotions SET name=?, min_qty=?, discount_type=?, discount_value=?, is_active=?, applicable_skus=? WHERE id=?", [name, min_qty, discount_type, discount_value, is_active, applicable_skus, req.params.id]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

app.delete("/api/promotions/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM promotions WHERE id = ?", [req.params.id]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

// --- Sales & Checkout ---

app.post("/api/checkout", authenticateToken, async (req, res) => {
  const { items, customer_phone, customer_name, payment_method } = req.body;
  console.log(">>> CHECKOUT START:", { user: req.user.id, itemsCount: items?.length });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let customer_id = null;
    if (customer_phone) {
      console.log("Checking customer:", customer_phone);
      const [custs] = await connection.query("SELECT id FROM customers WHERE phone = ?", [customer_phone]);
      if (custs.length > 0) customer_id = custs[0].id;
      else {
        const [insertRes] = await connection.query("INSERT INTO customers (name, phone) VALUES (?, ?)", [customer_name || "ลูกค้าทั่วไป", customer_phone]);
        customer_id = insertRes.insertId;
      }
    }
    // Sequential Order ID Generation (ORD-0001, ORD-0002, ...)
    const [lastOrderRows] = await connection.query("SELECT order_id FROM sales WHERE order_id REGEXP '^ORD-[0-9]{4,}$' ORDER BY id DESC LIMIT 1");
    let nextNum = 1;
    if (lastOrderRows.length > 0) {
      const lastId = lastOrderRows[0].order_id;
      const lastNum = parseInt(lastId.split('-')[1]);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    const order_id = `ORD-${String(nextNum).padStart(4, '0')}`;
    const [activePromos] = await connection.query("SELECT * FROM promotions WHERE is_active = 1");

    for (const item of items) {
      console.log("Item SKU:", item.sku, "Qty:", item.qty);
      const [prods] = await connection.query("SELECT * FROM products WHERE sku = ?", [item.sku]);
      const product = prods[0];
      if (!product) throw new Error(`ไม่พบสินค้า [${item.sku}] ในฐานข้อมูล`);
      
      let discountPerUnit = 0;
      const promo = activePromos.find(pr => {
        const skus = pr.applicable_skus ? pr.applicable_skus.split(",").map(s => s.trim()) : [];
        return (skus.length === 0 || skus.includes(item.sku)) && item.qty >= pr.min_qty;
      });
      if (promo) discountPerUnit = promo.discount_type === "fixed" ? Number(promo.discount_value) : (product.price * Number(promo.discount_value) / 100);

      const total = (Number(product.price) - discountPerUnit) * item.qty;
      const totalDiscount = discountPerUnit * item.qty;

      console.log("Running SQL for item:", item.sku);
      await connection.query("UPDATE products SET stock = stock - ? WHERE sku = ?", [item.qty, item.sku]);
      await connection.query("INSERT INTO sales (order_id, user_id, customer_id, sku, qty, unit_price, discount, total, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [order_id, req.user.id, customer_id, item.sku, item.qty, product.price, totalDiscount, total, payment_method || 'cash']);
    }
    await connection.commit();
    console.log(">>> CHECKOUT SUCCESS:", order_id);
    res.json({ message: "สำเร็จ", order_id });
  } catch (error) { 
    console.error(">>> CHECKOUT FAILED:", error);
    await connection.rollback(); 
    res.status(500).json({ error: error.message || "เกิดข้อผิดพลาดในเซิร์ฟเวอร์" });
  } finally { 
    connection.release(); 
  }
});

app.get("/api/sales", authenticateToken, async (req, res) => {
  const { start_date, end_date, search } = req.query;
  let sql = `SELECT s.*, p.name as product_name, u.name as seller_name, c.name as customer_name, c.phone as customer_phone FROM sales s 
             LEFT JOIN products p ON s.sku = p.sku LEFT JOIN users u ON s.user_id = u.id LEFT JOIN customers c ON s.customer_id = c.id WHERE 1=1`;
  const params = [];
  if (start_date) { sql += " AND DATE(s.sold_at) >= ?"; params.push(start_date); }
  if (end_date) { sql += " AND DATE(s.sold_at) <= ?"; params.push(end_date); }
  if (search) { sql += " AND (s.order_id LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR p.name LIKE ?)"; const p = `%${search}%`; params.push(p,p,p,p); }
  sql += " ORDER BY s.sold_at DESC LIMIT 100";
  try {
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) { handleError(res, error); }
});

app.get("/api/orders/:id", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT s.*, p.name as product_name, u.name as seller_name, c.name as customer_name, c.phone as customer_phone FROM sales s 
                                     LEFT JOIN products p ON s.sku = p.sku LEFT JOIN users u ON s.user_id = u.id LEFT JOIN customers c ON s.customer_id = c.id WHERE s.order_id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "ไม่พบข้อมูล" });
    res.json({
      order_id: req.params.id,
      sold_at: rows[0].sold_at,
      customer_name: rows[0].customer_name,
      customer_phone: rows[0].customer_phone,
      items: rows.map(r => ({ sku: r.sku, product_name: r.product_name, qty: r.qty, unit_price: r.unit_price, discount: r.discount, total: r.total }))
    });
  } catch (error) { handleError(res, error); }
});

app.delete("/api/orders/:id", authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: "เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถยกเลิกออเดอร์ได้" });
  
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    // Get items to restore stock
    const [items] = await connection.query("SELECT sku, qty FROM sales WHERE order_id = ? AND is_voided = 0", [req.params.id]);
    
    for (const item of items) {
      await connection.query("UPDATE products SET stock = stock + ? WHERE sku = ?", [item.qty, item.sku]);
    }
    
    // Mark as voided
    await connection.query("UPDATE sales SET is_voided = 1 WHERE order_id = ?", [req.params.id]);
    
    await connection.commit();
    res.json({ message: "ยกเลิกออเดอร์และคืนสต็อกเรียบร้อย" });
  } catch (error) {
    await connection.rollback();
    handleError(res, error);
  } finally {
    connection.release();
  }
});

// --- Prescription Endpoints ---

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
    res.status(201).json({ message: "บันทึกค่าสายตาเรียบร้อย" });
  } catch (error) { handleError(res, error); }
});

app.delete("/api/prescriptions/:id", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM prescriptions WHERE id = ?", [req.params.id]);
    res.json({ message: "ลบข้อมูลเรียบร้อย" });
  } catch (error) { handleError(res, error); }
});

app.get("/api/settings", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT low_stock_threshold FROM settings WHERE id = 1");
    res.json(rows[0] || { low_stock_threshold: 5 });
  } catch (error) { handleError(res, error); }
});

app.post("/api/settings", authenticateToken, async (req, res) => {
  try {
    await pool.query("UPDATE settings SET low_stock_threshold = ? WHERE id = 1", [req.body.low_stock_threshold]);
    res.json({ message: "สำเร็จ" });
  } catch (error) { handleError(res, error); }
});

const port = process.env.PORT || 3000;
initializeDatabase().then(() => {
  app.listen(port, "0.0.0.0", () => console.log(`Server running at http://0.0.0.0:${port} - RESTARTED_${Date.now()}`));
}).catch(e => { 
  console.error("DATABASE INITIALIZATION ERROR:", e);
  app.listen(port, "0.0.0.0", () => console.log(`Server running in ERROR MODE at http://0.0.0.0:${port}`));
});
