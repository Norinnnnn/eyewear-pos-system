let currentUser = null;
let products = [];
let users = [];
let promotions = [];
let customers = [];
let productTypes = [];
let sales = [];
let cart = [];
let settings = { low_stock_threshold: 5 };

let editingUserId = null;
let editingPromotionId = null;
let editingCustomerId = null;
let editProductSku = null;

let inventorySearchQuery = "";
let inventoryFilterCategory = "";

// --- Helper Functions ---

function showToast(message, type = "success", title = "") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  const icons = {
    success: '<i class="fas fa-check-circle"></i>',
    error: '<i class="fas fa-times-circle"></i>',
    warning: '<i class="fas fa-exclamation-triangle"></i>',
    info: '<i class="fas fa-info-circle"></i>'
  };

  if (!title) {
    title = type === "success" ? "สำเร็จ" : type === "error" ? "ข้อผิดพลาด" : "แจ้งเตือน";
  }

  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || '<i class="fas fa-bell"></i>'}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

const originalFetch = window.fetch;
window.fetch = async function() {
  let [resource, config] = arguments;
  if (typeof resource === 'string' && resource.startsWith('/api/')) {
    config = config || {};
    config.headers = config.headers || {};
    const token = localStorage.getItem("token");
    if (token) {
      if (config.headers instanceof Headers) {
        config.headers.append('Authorization', `Bearer ${token}`);
      } else {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }
  const response = await originalFetch(resource, config);
  if (response.status === 401 || response.status === 403) {
    if (resource !== '/api/login') {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      window.location.replace("/login.html");
    }
  }
  return response;
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} error ${res.status}`);
  return res.json();
}

async function loadData() {
  try {
    const [p, u, promo, c, s, sett, pt] = await Promise.all([
      fetchJson("/api/products"),
      fetchJson("/api/users"),
      fetchJson("/api/promotions"),
      fetchJson("/api/customers"),
      fetchJson("/api/sales"),
      fetchJson("/api/settings"),
      fetchJson("/api/product-types")
    ]);
    products = p;
    users = u;
    promotions = promo;
    customers = c;
    sales = s;
    settings = sett;
    productTypes = pt;
    return true;
  } catch (error) {
    console.error("Load data failed:", error);
    showToast("ไม่สามารถโหลดข้อมูลจากเซิร์ฟเวอร์ได้", "error");
    return false;
  }
}

// --- Page Routing & Rendering ---

function checkAuth() {
  const userStr = localStorage.getItem("user");
  const token = localStorage.getItem("token");
  if (!userStr || !token) {
    window.location.replace("/login.html");
    return false;
  }
  currentUser = JSON.parse(userStr);
  const userInfoEl = document.getElementById("user-info");
  if (userInfoEl) userInfoEl.innerHTML = `<i class="fas fa-user-circle"></i> ${currentUser.name} (${currentUser.role})`;
  if (currentUser.role === "admin") {
    document.querySelectorAll(".admin-only").forEach(el => el.style.display = "flex");
  }
  return true;
}

function setupEventListeners() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchPage(btn.dataset.page, btn));
  });
  
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      window.location.replace("/login.html");
    });
  }
}

async function switchPage(pageName, button) {
  document.querySelectorAll(".page").forEach(p => {
    p.classList.remove("active");
    p.style.display = "none";
  });
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  
  const targetPage = document.getElementById(pageName);
  if (targetPage) {
    targetPage.classList.add("active");
    targetPage.style.display = "block";
  }
  if (button) button.classList.add("active");
  
  const titleMap = {
    home: "แดชบอร์ด",
    pos: "ขายหน้าร้าน",
    inventory: "คลังสินค้า",
    reports: "รายงาน",
    users: "จัดการผู้ใช้",
    promotions: "จัดการโปรโมชั่น",
    customers: "จัดการลูกค้า",
  };
  
  const titleEl = document.getElementById("page-title");
  if (titleEl) titleEl.textContent = titleMap[pageName] || "แดชบอร์ด";

  // Reload data for pages that need fresh info
  if (pageName !== "home") await loadData();

  if (pageName === "home") renderHome();
  if (pageName === "pos") renderPOS();
  if (pageName === "inventory") renderInventory();
  if (pageName === "reports") renderReports();
  if (pageName === "users") renderUsers();
  if (pageName === "promotions") renderPromotions();
  if (pageName === "customers") renderCustomers();
}

// --- Home Page ---

function renderHome() {
  if (products.length === 0) {
    document.getElementById("home").innerHTML = `
      <div class="empty-state">
        <div class="empty-card">
          <h2><i class="fas fa-info-circle"></i> ยินดีต้อนรับเข้าสู่ระบบ</h2>
          <p>ยังไม่มีข้อมูลสินค้า โปรดไปที่เมนู "คลังสินค้า" เพื่อเพิ่มสินค้าใหม่</p>
          <button onclick="switchPage('inventory')" class="btn-primary" style="margin-top: 1rem;"><i class="fas fa-plus"></i> ไปที่คลังสินค้า</button>
        </div>
      </div>
    `;
    return;
  }

  const lowStockItems = products.filter(p => Number(p.stock) <= Number(settings.low_stock_threshold));
  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const today = new Date().toLocaleDateString();
  const todaySales = sales.filter(s => new Date(s.sold_at).toLocaleDateString() === today);
  const todayRevenue = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0);

  const productSalesMap = {};
  sales.forEach(s => {
    productSalesMap[s.sku] = (productSalesMap[s.sku] || 0) + s.qty;
  });
  const topSelling = Object.entries(productSalesMap)
    .map(([sku, qty]) => ({ sku, qty, name: products.find(p => p.sku === sku)?.name || sku }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  document.getElementById("home").innerHTML = `
    <div class="dashboard-grid">
      <div class="metric-card">
        <div class="metric-top"><div><h3>ยอดขายวันนี้</h3></div><div class="icon-circle" style="background: #ecfdf5; color: #059669;"><i class="fas fa-coins"></i></div></div>
        <div class="value">฿${todayRevenue.toFixed(2)}</div>
        <p style="font-size: 0.85rem; color: #666; margin-top: 4px;">จากทั้งหมด ${todaySales.length} รายการ</p>
      </div>
      <div class="metric-card">
        <div class="metric-top"><div><h3>สินค้าทั้งหมด</h3></div><div class="icon-circle" style="background: #f0f9ff; color: #0284c7;"><i class="fas fa-box"></i></div></div>
        <div class="value">${products.length}</div>
        <p style="font-size: 0.85rem; color: #666; margin-top: 4px;">รวม ${products.reduce((s, p) => s + p.stock, 0)} ชิ้น</p>
      </div>
      <div class="metric-card">
        <div class="metric-top"><div><h3>สินค้าใกล้หมด</h3></div><div class="icon-circle" style="background: #fff7ed; color: #ea580c;"><i class="fas fa-exclamation-triangle"></i></div></div>
        <div class="value">${lowStockItems.length}</div>
        <p style="font-size: 0.85rem; color: #666; margin-top: 4px;">ต่ำกว่าเกณฑ์ ${settings.low_stock_threshold} ชิ้น</p>
      </div>
      <div class="metric-card">
        <div class="metric-top"><div><h3>ยอดขายสะสม</h3></div><div class="icon-circle" style="background: #fdf2f8; color: #db2777;"><i class="fas fa-chart-line"></i></div></div>
        <div class="value">฿${totalRevenue.toFixed(2)}</div>
        <p style="font-size: 0.85rem; color: #666; margin-top: 4px;">ตั้งแต่เริ่มระบบ</p>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
      <div class="card" style="margin: 0;">
        <h2 style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-bolt"></i> ทางลัดด่วน</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 1rem;">
          <button onclick="switchPage('pos')" class="btn-primary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #6366f1;"><i class="fas fa-cash-register"></i><span>เปิดหน้าขาย (POS)</span></button>
          <button onclick="switchPage('inventory')" class="btn-primary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #8b5cf6;"><i class="fas fa-plus-circle"></i><span>เพิ่มสินค้าใหม่</span></button>
          <button onclick="switchPage('reports')" class="btn-secondary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px;"><i class="fas fa-file-invoice-dollar"></i><span>ดูรายงานการขาย</span></button>
          <button onclick="switchPage('promotions')" class="btn-secondary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px;"><i class="fas fa-tags"></i><span>จัดการโปรโมชั่น</span></button>
          <button onclick="generateSalesReportPDF('today')" class="btn-secondary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #0ea5e9; color: white; border: none;"><i class="fas fa-calendar-day"></i><span>รายงานขายวันนี้ (PDF)</span></button>
          <button onclick="generateSalesReportPDF('month')" class="btn-secondary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #0369a1; color: white; border: none;"><i class="fas fa-calendar-alt"></i><span>รายงานรายเดือน (PDF)</span></button>
        </div>
      </div>
      <div class="card" style="margin: 0;">
        <h2><i class="fas fa-fire"></i> สินค้าขายดี</h2>
        <div style="margin-top: 1rem;">
          ${topSelling.length === 0 ? "<p style='color: #666; text-align: center; padding: 20px;'>ยังไม่มีข้อมูลการขาย</p>" : 
            topSelling.map((p, i) => `
              <div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: ${i === topSelling.length - 1 ? 'none' : '1px solid #eee'};">
                <div style="width: 24px; height: 24px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">${i+1}</div>
                <div style="flex: 1;"><div>${p.name}</div><div style="font-size: 0.75rem; color: #666;">รหัสสินค้า: ${p.sku}</div></div>
                <div style="font-weight: bold; color: #6366f1;">${p.qty} ชิ้น</div>
              </div>
            `).join("")}
        </div>
      </div>
    </div>
    
    <div class="card" style="margin-top: 1.5rem;">
      <h2 style="color: #ea580c;"><i class="fas fa-exclamation-triangle"></i> สินค้าที่ต้องเติมสต็อก</h2>
      <div style="margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
        ${lowStockItems.length === 0 ? "<p>คลังสินค้าปกติดี</p>" : 
          lowStockItems.map(p => `
            <div style="background: #fff7ed; border: 1px solid #ffedd5; padding: 12px; border-radius: 8px;">
              <strong>${p.name}</strong><br/><span style="font-size: 0.85rem;">รหัสสินค้า: ${p.sku}</span><br/><span style="font-weight: bold; color: #ea580c;">เหลือ: ${p.stock} ชิ้น</span>
            </div>
          `).join("")}
      </div>
    </div>
    
    ${currentUser.role === "admin" ? `
      <div class="card" style="margin-top: 1.5rem;">
        <h2><i class="fas fa-cog"></i> ตั้งค่าระบบ</h2>
        <div style="display: flex; align-items: center; gap: 15px; margin-top: 1rem;">
          <label style="flex: 1;">แจ้งเตือนสต็อกต่ำสุด: <input type="number" id="threshold" value="${settings.low_stock_threshold}" min="1" style="width: 80px; padding: 8px; border-radius: 8px; border: 1px solid #ddd;" /></label>
          <button onclick="updateThreshold()" class="btn-primary"><i class="fas fa-save"></i> บันทึก</button>
        </div>
      </div>
    ` : ""}
  `;
}

async function updateThreshold() {
  const val = parseInt(document.getElementById("threshold").value);
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ low_stock_threshold: val }),
  });
  showToast("บันทึกเรียบร้อย");
  await loadData();
  renderHome();
}

// --- POS Page ---

function renderPOS() {
  document.getElementById("pos").innerHTML = `
    <div class="pos-layout">
      <div>
        <div class="card">
          <h2 style="display: flex; align-items: center; gap: 10px;"><i class="fas fa-shopping-cart"></i> ระบบ POS ขายหน้าร้าน</h2>
          <div class="grid" style="grid-template-columns: 2fr 1fr; gap: 10px;">
            <label>ค้นหาสินค้า<input type="text" id="pos-search" placeholder="ชื่อหรือรหัสสินค้า" oninput="handlePOSSearch(this.value)" /></label>
            <label>เบอร์โทรลูกค้า<input type="text" id="pos-customer" placeholder="ค้นหาเบอร์" oninput="handlePOSCustomer(this.value)" list="cust-list-pos" /></label>
            <datalist id="cust-list-pos">${customers.map(c => `<option value="${c.phone}">${c.name}</option>`).join("")}</datalist>
          </div>
          <div id="pos-cust-info" style="margin: 10px 0; color: #7c3aed; font-weight: 500; height: 1.2rem;"></div>
          <div id="pos-product-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-top: 1rem; max-height: 500px; overflow-y: auto; padding: 5px;">
            ${renderPOSProductList(products)}
          </div>
        </div>
      </div>
      <div class="card" style="display: flex; flex-direction: column;">
        <h2 style="display: flex; align-items: center; gap: 10px;"><i class="fas fa-shopping-basket"></i> ตะกร้าสินค้า</h2>
        <div id="cart-list" style="flex: 1; min-height: 200px; max-height: 400px; overflow-y: auto; margin-bottom: 15px;"></div>
        <div class="cart-total">
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.9rem;"><span>ยอดรวม:</span><span>฿<span id="sub-val">0</span></span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 0.9rem; color: #059669;"><span>ส่วนลด:</span><span>-฿<span id="disc-val">0</span></span></div>
          <div style="display: flex; justify-content: space-between; font-size: 1.5rem; font-weight: 800; border-top: 1px dashed #ddd; margin-top: 10px; padding-top: 10px;">
            <span>สุทธิ:</span><span style="color: #7c3aed;">฿<span id="total-val">0</span></span>
          </div>
        </div>
        <button onclick="checkout()" class="btn-primary" style="width: 100%; margin-top: 1.5rem; padding: 18px; font-size: 1.2rem; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(124, 58, 237, 0.3);"><i class="fas fa-check"></i> ยืนยันการขาย & ออกใบเสร็จ</button>
      </div>
    </div>
  `;
  renderCart();
}

function renderPOSProductList(items) {
  if (items.length === 0) return `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">ไม่พบสินค้า</div>`;
  return items.map(p => `
    <div onclick="addToCart('${p.sku}')" style="background: white; border: 1px solid #f0f0f0; padding: 12px; border-radius: 16px; cursor: pointer; position: relative; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);" onmouseover="this.style.transform='translateY(-3px)'; this.style.borderColor='#7c3aed';" onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='#f0f0f0';">
      <img src="${p.image || 'https://via.placeholder.com/150?text=No+Image'}" style="width: 100%; height: 110px; object-fit: cover; border-radius: 12px;" />
      <div style="font-weight: 600; margin-top: 10px; font-size: 0.9rem; height: 2.4rem; overflow: hidden; line-height: 1.2;">${p.name}</div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
        <div style="color: #7c3aed; font-weight: 700; font-size: 1.1rem;">฿${Number(p.price).toLocaleString()}</div>
        <div style="font-size: 0.75rem; color: ${p.stock <= settings.low_stock_threshold ? '#ef4444' : '#6b7280'}; font-weight: 500;">คลัง: ${p.stock}</div>
      </div>
      ${p.stock <= settings.low_stock_threshold ? `<div style="position: absolute; top: 8px; right: 8px; background: #ef4444; color: white; font-size: 9px; padding: 2px 6px; border-radius: 10px; font-weight: bold; box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);">สต็อกต่ำ</div>` : ""}
    </div>
  `).join("");
}

function handlePOSSearch(val) {
  const filtered = products.filter(p => p.name.toLowerCase().includes(val.toLowerCase()) || p.sku.toLowerCase().includes(val.toLowerCase()));
  document.getElementById("pos-product-grid").innerHTML = renderPOSProductList(filtered);
}

function handlePOSCustomer(phone) {
  const c = customers.find(x => x.phone === phone);
  const info = document.getElementById("pos-cust-info");
  if (c) info.innerHTML = `<i class="fas fa-user-check"></i> ลูกค้าประจำ: <span style="color: #111827;">${c.name}</span>`;
  else if (phone.length >= 9) info.innerHTML = `<i class="fas fa-user-plus"></i> <span style="color: #059669;">ลูกค้าใหม่</span>: จะบันทึกเมื่อขายสำเร็จ`;
  else info.textContent = "";
}

function addToCart(sku) {
  const p = products.find(x => x.sku === sku);
  if (!p) return;
  
  const item = cart.find(x => x.sku === sku);
  if (item) {
    if (item.qty + 1 > p.stock) return showToast("สต็อกไม่เพียงพอสำหรับการขายเพิ่ม", "warning");
    item.qty++;
  } else {
    if (p.stock < 1) return showToast("สินค้าหมด ไม่สามารถขายได้", "error");
    cart.push({ sku, name: p.name, price: Number(p.price), qty: 1 });
  }
  showToast(`เพิ่ม ${p.name} ลงตะกร้า`, "success");
  renderCart();
}

function renderCart() {
  let sub = 0, disc = 0;
  const activePromos = promotions.filter(p => p.is_active);

  const html = cart.map((item, i) => {
    const p = products.find(x => x.sku === item.sku);
    let itemDisc = 0;
    const promo = activePromos.find(pr => {
      const skus = pr.applicable_skus ? pr.applicable_skus.split(",").map(s => s.trim()) : [];
      return (skus.length === 0 || skus.includes(item.sku)) && item.qty >= pr.min_qty;
    });

    if (promo) {
      itemDisc = promo.discount_type === "fixed" ? Number(promo.discount_value) : (item.price * Number(promo.discount_value) / 100);
    }

    const itemTotal = (item.price - itemDisc) * item.qty;
    sub += item.price * item.qty;
    disc += itemDisc * item.qty;

    return `
      <div style="background: #f8fafc; border: 1px solid #f1f5f9; padding: 12px; border-radius: 12px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="flex: 1;">
            <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 2px;">${item.name}</div>
            <div style="font-size: 0.75rem; color: #64748b;">SKU: ${item.sku} | ฿${item.price.toLocaleString()}</div>
          </div>
          <button onclick="removeFromCart(${i})" style="background: #fee2e2; color: #ef4444; width: 28px; height: 28px; border-radius: 8px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px;"><i class="fas fa-times"></i></button>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
          <div style="display: flex; align-items: center; background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <button onclick="updateCartQty(${i}, ${item.qty-1})" style="width: 32px; height: 32px; border: none; background: white; cursor: pointer; color: #64748b;"><i class="fas fa-minus"></i></button>
            <input type="number" value="${item.qty}" style="width: 65px; text-align: center; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 800; font-size: 1.1rem; color: #000000 !important; background-color: #ffffff !important;" onchange="updateCartQty(${i}, this.value)" />
            <button onclick="updateCartQty(${i}, ${item.qty+1})" style="width: 32px; height: 32px; border: none; background: white; cursor: pointer; color: #64748b;"><i class="fas fa-plus"></i></button>
          </div>
          <div style="text-align: right;">
            ${itemDisc > 0 ? `<div style="font-size: 0.75rem; color: #059669; text-decoration: none;">ลด ฿${(itemDisc * item.qty).toLocaleString()}</div>` : ""}
            <div style="font-weight: 700; color: #7c3aed;">฿${itemTotal.toLocaleString()}</div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  const cartList = document.getElementById("cart-list");
  if (cartList) {
    cartList.innerHTML = html || `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #94a3b8; gap: 10px;">
        <i class="fas fa-shopping-basket fa-3x"></i>
        <p>ยังไม่มีสินค้าในตะกร้า</p>
      </div>
    `;
  }

  const subVal = document.getElementById("sub-val");
  const discVal = document.getElementById("disc-val");
  const totalVal = document.getElementById("total-val");

  if (subVal) subVal.textContent = sub.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (discVal) discVal.textContent = disc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (totalVal) totalVal.textContent = (sub - disc).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


function updateCartQty(idx, val) {
  const qty = parseInt(val);
  const item = cart[idx];
  if (!item) return;
  const p = products.find(x => x.sku === item.sku);
  
  if (isNaN(qty) || qty < 1) item.qty = 1;
  else if (qty > p.stock) { 
    showToast(`สต็อกมีเพียง ${p.stock} ชิ้น`, "warning"); 
    item.qty = p.stock; 
  }
  else item.qty = qty;
  renderCart();
}

function removeFromCart(idx) {
  const item = cart[idx];
  cart.splice(idx, 1);
  showToast(`นำ ${item.name} ออกจากตะกร้า`, "info");
  renderCart();
}

async function checkout() {
  if (cart.length === 0) return showToast("กรุณาเลือกสินค้าก่อนยืนยันการขาย", "warning");
  
  const phone = document.getElementById("pos-customer").value;
  const cust = customers.find(x => x.phone === phone);
  
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        items: cart, 
        customer_phone: phone, 
        customer_name: cust?.name || (phone ? "ลูกค้าใหม่" : "ลูกค้าทั่วไป") 
      }),
    });

    if (res.ok) {
      const data = await res.json();
      showToast("บันทึกการขายสำเร็จ", "success");
      
      // Attempt to generate PDF but don't block
      generateReceiptPDF(data.order_id).catch(err => console.error("PDF Error:", err));
      
      cart = [];
      await loadData();
      renderPOS();
    } else {
      const err = await res.json();
      showToast(err.error || "เกิดข้อผิดพลาดในการขาย", "error");
    }
  } catch (error) {
    console.error("Checkout failed:", error);
    showToast("ไม่สามารถติดต่อเซิร์ฟเวอร์ได้", "error");
  }
}


// --- Inventory Page ---

function renderInventory() {
  document.getElementById("inventory").innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 15px; flex-wrap: wrap;">
      <button onclick="openAddProductModal()" class="btn-primary" style="display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-plus-circle"></i> เพิ่มสินค้าใหม่
      </button>
      <div style="display: flex; gap: 12px; flex: 1; max-width: 600px;">
        <div style="position: relative; flex: 2;">
          <input type="text" id="inv-search" placeholder="ค้นหาตามชื่อหรือรหัสสินค้า..." oninput="inventorySearchQuery=this.value; renderInventoryRows();" style="width: 100%; padding-left: 40px;" />
          <span style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #94a3b8;"><i class="fas fa-search"></i></span>
        </div>
        <select id="inv-filter" onchange="inventoryFilterCategory=this.value; renderInventoryRows();" style="flex: 1;">
          <option value="">ทุกหมวดหมู่</option>
          ${productTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="card" style="padding: 0; overflow: hidden; border: none; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width: 80px; text-align: center;">รูปภาพ</th>
              <th>รหัส (SKU)</th>
              <th>ชื่อสินค้า</th>
              <th>รายละเอียด</th>
              <th>หมวดหมู่</th>
              <th style="text-align: right;">ต้นทุน</th>
              <th style="text-align: right;">ราคาขาย</th>
              <th style="text-align: center;">สต็อก</th>
              <th style="width: 150px; text-align: center;">จัดการ</th>
            </tr>
          </thead>
          <tbody id="inv-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top: 2rem; border-left: 5px solid #7c3aed;">
      <h2 style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;"><i class="fas fa-tags"></i> จัดการหมวดหมู่สินค้า</h2>
      <div style="display: flex; gap: 12px; margin-bottom: 20px;">
        <input type="text" id="new-type" placeholder="ชื่อหมวดหมู่ใหม่..." style="flex: 1; max-width: 300px;" />
        <button onclick="addType()" class="btn-primary" style="padding: 0 25px;">เพิ่ม</button>
      </div>
      <div id="type-list" style="display: flex; flex-wrap: wrap; gap: 10px;">
        ${productTypes.length > 0 ? productTypes.map(t => `
          <div style="background: #f3f4f6; padding: 8px 16px; border-radius: 99px; font-size: 0.9rem; display: flex; align-items: center; gap: 8px; border: 1px solid #e5e7eb;">
            ${t.name}
            <button onclick="deleteType(${t.id})" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; padding: 0; display: flex; align-items: center;"><i class="fas fa-times"></i></button>
          </div>
        `).join("") : "<p style='color: #94a3b8; font-style: italic;'>ยังไม่มีหมวดหมู่</p>"}
      </div>
    </div>

    <div id="inv-modal" class="modal" style="display: none;">
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="modal-title">เพิ่มสินค้า</h2>
          <button onclick="closeModal()" class="modal-close"><i class="fas fa-times"></i></button>
        </div>
        <form onsubmit="saveProduct(event)">
          <div id="product-form" style="padding: 24px 32px;">
            <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 20px;">
              <label>รหัสสินค้า (SKU)
                <input type="text" id="m-sku" placeholder="เช่น EYE-001" required oninput="validateSKU(this.value)" />
                <span id="sku-error" style="color: #ef4444; font-size: 0.75rem; display: none; margin-top: 2px;"><i class="fas fa-exclamation-circle"></i> รหัสนี้มีในระบบแล้ว</span>
              </label>
              <label>ชื่อสินค้า<input type="text" id="m-name" placeholder="ชื่อรุ่นหรือชื่อสินค้า" required /></label>
              <label>หมวดหมู่
                <select id="m-cat">
                  <option value="">เลือกหมวดหมู่</option>
                  ${productTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join("")}
                </select>
              </label>
              <label>สี<input type="text" id="m-color" placeholder="เช่น ดำ, แดง, กระ" /></label>
              <label>ค่าสายตา (Prescription)<input type="text" id="m-prescription" placeholder="เช่น -1.00, +2.50" /></label>
              <label>ต้นทุน (บาท)<input type="number" id="m-cost" placeholder="0.00" step="0.01" required /></label>
              <label>ราคาขาย (บาท)<input type="number" id="m-price" placeholder="0.00" step="0.01" required /></label>
              <label>จำนวนในสต็อก<input type="number" id="m-stock" placeholder="0" required /></label>
              <label>รูปภาพสินค้า<input type="file" id="m-img" accept="image/*" onchange="previewImage(this)" /></label>
            </div>
            <div id="img-preview-container" style="margin-top: 15px; display: none; text-align: center;">
              <p style="font-size: 0.8rem; color: #64748b; margin-bottom: 5px;">ตัวอย่างรูปภาพ:</p>
              <img id="m-img-preview" src="" style="max-height: 120px; border-radius: 12px; border: 1px solid #e2e8f0;" />
            </div>
          </div>
          <div class="modal-footer" style="padding: 20px 32px; background: #f8fafc;">
            <button type="button" onclick="closeModal()" style="background: #e2e8f0; color: #475569;">ยกเลิก</button>
            <button type="submit" class="btn-primary"><i class="fas fa-save"></i> บันทึกข้อมูล</button>
          </div>
        </form>
      </div>
    </div>

    <div id="stock-modal" class="modal" style="display: none;">
      <div class="modal-content" style="width: min(100%, 450px);">
        <div class="modal-header" style="background: #ecfdf5; border-bottom: 1px solid #d1fae5;">
          <h2 style="color: #065f46;"><i class="fas fa-plus-circle"></i> เพิ่มสต็อกสินค้า</h2>
          <button onclick="closeStockModal()" class="modal-close"><i class="fas fa-times"></i></button>
        </div>
        <form onsubmit="addStock(event)">
          <div style="padding: 24px 32px;">
            <div id="stock-product-info" style="background: #f8fafc; padding: 16px; border-radius: 16px; margin-bottom: 20px; display: flex; gap: 15px; align-items: center; border: 1px solid #e2e8f0;">
              <!-- Product info will be injected here -->
            </div>
            <label style="font-weight: 600; color: #374151; margin-bottom: 8px;">จำนวนที่ต้องการเพิ่ม (ชิ้น)</label>
            <input type="number" id="stock-qty" placeholder="ใส่จำนวนที่ต้องการเพิ่ม" required min="1" step="1" 
              style="font-size: 1.5rem; font-weight: 800; text-align: center; padding: 15px; border-radius: 16px; border: 2px solid #e2e8f0; color: #059669;" />
            <p style="margin-top: 10px; font-size: 0.85rem; color: #6b7280; text-align: center;">สต็อกจะถูกบวกเพิ่มจากจำนวนปัจจุบันทันที</p>
          </div>
          <div class="modal-footer" style="padding: 20px 32px; background: #f9fafb;">
            <button type="button" onclick="closeStockModal()" style="background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb;">ยกเลิก</button>
            <button type="submit" class="btn-primary" style="background: #059669; box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.2);"><i class="fas fa-check"></i> ยืนยันการเพิ่ม</button>
          </div>
        </form>
      </div>
    </div>
  `;
  renderInventoryRows();
}

function previewImage(input) {
  const container = document.getElementById("img-preview-container");
  const preview = document.getElementById("m-img-preview");
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      preview.src = e.target.result;
      container.style.display = "block";
    }
    reader.readAsDataURL(input.files[0]);
  }
}

function renderInventoryRows() {
  const q = inventorySearchQuery.toLowerCase();
  const f = inventoryFilterCategory;
  const filtered = products.filter(p => 
    (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) && 
    (!f || p.category === f)
  );
  
  const tbody = document.getElementById("inv-tbody");
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 50px; color: #94a3b8;">ไม่พบข้อมูลสินค้า</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td style="text-align: center;">
        <img src="${p.image || 'https://via.placeholder.com/50?text=?'}" class="product-thumb" style="width: 48px; height: 48px; border-radius: 8px; border: 1px solid #f1f5f9;" />
      </td>
      <td style="font-family: monospace; font-weight: 600; color: #64748b;">${p.sku}</td>
      <td style="font-weight: 500;">${p.name}</td>
      <td style="font-size: 0.85rem; color: #666;">
        ${p.color ? `สี: ${p.color}<br/>` : ''}
        ${p.prescription ? `สายตา: ${p.prescription}` : ''}
      </td>
      <td><span style="background: #eff6ff; color: #2563eb; padding: 4px 10px; border-radius: 99px; font-size: 0.8rem;">${p.category || 'ทั่วไป'}</span></td>
      <td style="text-align: right; color: #666;">฿${Number(p.cost || 0).toLocaleString()}</td>
      <td style="text-align: right; font-weight: 700; color: #7c3aed;">฿${Number(p.price).toLocaleString()}</td>
      <td style="text-align: center;">
        <span class="status-badge ${Number(p.stock) <= Number(settings.low_stock_threshold) ? 'status-low-stock' : 'status-in-stock'}">
          ${p.stock}
        </span>
      </td>
      <td style="text-align: center;">
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button onclick="openAddStockModal('${p.sku}')" style="background: #ecfdf5; color: #059669; padding: 8px; border-radius: 8px; border: none; cursor: pointer;" title="เพิ่มสต็อก"><i class="fas fa-plus"></i></button>
          <button onclick="editProduct('${p.sku}')" style="background: #eff6ff; color: #2563eb; padding: 8px; border-radius: 8px; border: none; cursor: pointer;" title="แก้ไข"><i class="fas fa-edit"></i></button>
          <button onclick="delProduct('${p.sku}')" style="background: #fef2f2; color: #ef4444; padding: 8px; border-radius: 8px; border: none; cursor: pointer;" title="ลบ"><i class="fas fa-trash-alt"></i></button>
        </div>
      </td>
    </tr>
  `).join("");
}

function openAddProductModal() {
  editProductSku = null;
  const modal = document.getElementById("inv-modal");
  document.getElementById("modal-title").textContent = "เพิ่มสินค้าใหม่";
  document.getElementById("m-sku").value = "";
  document.getElementById("m-sku").readOnly = false;
  document.getElementById("m-sku").style.borderColor = "";
  const errEl = document.getElementById("sku-error");
  if (errEl) errEl.style.display = "none";
  
  document.getElementById("m-name").value = "";
  document.getElementById("m-cat").value = "";
  document.getElementById("m-color").value = "";
  document.getElementById("m-prescription").value = "";
  document.getElementById("m-cost").value = "";
  document.getElementById("m-price").value = "";
  document.getElementById("m-stock").value = "";
  document.getElementById("m-img").value = "";
  document.getElementById("img-preview-container").style.display = "none";
  modal.style.display = "flex";
}

function validateSKU(val) {
  if (editProductSku) return; 
  const exists = products.some(p => p.sku.toLowerCase() === val.trim().toLowerCase());
  const errEl = document.getElementById("sku-error");
  const input = document.getElementById("m-sku");
  if (exists && val.trim() !== "") {
    if (errEl) errEl.style.display = "block";
    if (input) input.style.borderColor = "#ef4444";
  } else {
    if (errEl) errEl.style.display = "none";
    if (input) input.style.borderColor = "";
  }
}

async function saveProduct(e) {
  e.preventDefault();
  const sku = document.getElementById("m-sku").value.trim();
  
  if (!editProductSku) {
    const exists = products.some(p => p.sku.toLowerCase() === sku.toLowerCase());
    if (exists) {
      alert(`⚠️ ขออภัย: รหัสสินค้า [${sku}] มีอยู่ในระบบแล้ว\nกรุณาใช้รหัสอื่นที่ไม่ซ้ำกัน`);
      document.getElementById("m-sku").focus();
      return;
    }
  }

  const fd = new FormData();
  fd.append("sku", sku);
  fd.append("name", document.getElementById("m-name").value);
  fd.append("category", document.getElementById("m-cat").value);
  fd.append("color", document.getElementById("m-color").value);
  fd.append("prescription", document.getElementById("m-prescription").value);
  fd.append("cost", document.getElementById("m-cost").value);
  fd.append("price", document.getElementById("m-price").value);
  fd.append("stock", document.getElementById("m-stock").value);
  
  const imgFile = document.getElementById("m-img").files[0];
  if (imgFile) fd.append("image", imgFile);
  
  const url = editProductSku ? `/api/products/${editProductSku}` : "/api/products";
  
  try {
    const res = await fetch(url, { 
      method: editProductSku ? "PUT" : "POST", 
      body: fd 
    });
    
    if (res.ok) { 
      showToast(editProductSku ? "แก้ไขสินค้าเรียบร้อย" : "เพิ่มสินค้าเรียบร้อย", "success"); 
      closeModal(); 
      await loadData(); 
      renderInventory(); 
    } else {
      const err = await res.json();
      if (err.error && err.error.includes("SKU")) {
        alert("❌ " + err.error);
      } else {
        showToast(err.error || "ไม่สามารถบันทึกข้อมูลได้", "error");
      }
    }
  } catch (error) {
    console.error("Save product failed:", error);
    showToast("เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
  }
}

function editProduct(sku) {
  const p = products.find(x => x.sku === sku);
  if (!p) return;
  
  editProductSku = sku;
  const modal = document.getElementById("inv-modal");
  document.getElementById("modal-title").textContent = "แก้ไขข้อมูลสินค้า";
  document.getElementById("m-sku").value = p.sku;
  document.getElementById("m-sku").readOnly = true;
  document.getElementById("m-name").value = p.name;
  document.getElementById("m-cat").value = p.category || "";
  document.getElementById("m-color").value = p.color || "";
  document.getElementById("m-prescription").value = p.prescription || "";
  document.getElementById("m-cost").value = p.cost || 0;
  document.getElementById("m-price").value = p.price;
  document.getElementById("m-stock").value = p.stock;
  document.getElementById("m-img").value = "";
  
  const preview = document.getElementById("m-img-preview");
  const previewCont = document.getElementById("img-preview-container");
  if (p.image) {
    preview.src = p.image;
    previewCont.style.display = "block";
  } else {
    previewCont.style.display = "none";
  }
  
  modal.style.display = "flex";
}

function closeModal() { 
  document.getElementById("inv-modal").style.display = "none"; 
}

function openAddStockModal(sku) {
  const p = products.find(x => x.sku === sku);
  if (!p) return;
  
  editProductSku = sku;
  const modal = document.getElementById("stock-modal");
  const infoCont = document.getElementById("stock-product-info");
  
  infoCont.innerHTML = `
    <img src="${p.image || 'https://via.placeholder.com/50?text=?'}" style="width: 60px; height: 60px; border-radius: 12px; object-fit: cover; border: 1px solid #e2e8f0;" />
    <div style="flex: 1;">
      <div style="font-weight: 700; color: #1e293b; font-size: 1.1rem;">${p.name}</div>
      <div style="font-size: 0.85rem; color: #64748b;">รหัส: ${p.sku} | สต็อกปัจจุบัน: <span style="font-weight: 800; color: #7c3aed;">${p.stock}</span></div>
    </div>
  `;
  
  document.getElementById("stock-qty").value = "";
  modal.style.display = "flex";
  setTimeout(() => document.getElementById("stock-qty").focus(), 100);
}

function closeStockModal() {
  document.getElementById("stock-modal").style.display = "none";
}

async function addStock(e) {
  e.preventDefault();
  const qty = document.getElementById("stock-qty").value;
  if (!qty || qty <= 0) return showToast("กรุณาใส่จำนวนที่ถูกต้อง", "warning");
  
  try {
    const res = await fetch(`/api/products/${editProductSku}/add-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: qty })
    });
    
    if (res.ok) {
      showToast(`เพิ่มสต็อกสำเร็จ (+${qty})`, "success");
      closeStockModal();
      await loadData();
      renderInventory();
    } else {
      const err = await res.json();
      showToast(err.error || "ไม่สามารถเพิ่มสต็อกได้", "error");
    }
  } catch (error) {
    console.error("Add stock failed:", error);
    showToast("เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
  }
}

async function delProduct(sku) {
  if (!confirm(`ต้องการลบสินค้า [${sku}] หรือไม่?`)) return;
  
  try {
    const res = await fetch(`/api/products/${sku}`, { method: "DELETE" });
    if (res.ok) {
      showToast("ลบสินค้าเรียบร้อย", "success");
      await loadData(); 
      renderInventory();
    } else {
      showToast("ลบสินค้าไม่สำเร็จ", "error");
    }
  } catch (error) {
    showToast("เกิดข้อผิดพลาดในการลบ", "error");
  }
}

async function addType() {
  const input = document.getElementById("new-type");
  const name = input.value.trim();
  if (!name) return;
  
  try {
    const res = await fetch("/api/product-types", { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }, 
      body: JSON.stringify({ name }) 
    });
    
    if (res.ok) {
      showToast("เพิ่มหมวดหมู่สำเร็จ", "success");
      input.value = "";
      await loadData(); 
      renderInventory();
    } else {
      showToast("หมวดหมู่ซ้ำหรือมีข้อผิดพลาด", "warning");
    }
  } catch (error) {
    showToast("ติดต่อเซิร์ฟเวอร์ล้มเหลว", "error");
  }
}

async function deleteType(id) {
  if (!confirm("ต้องการลบหมวดหมู่นี้หรือไม่?")) return;
  try {
    const res = await fetch(`/api/product-types/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast("ลบหมวดหมู่สำเร็จ", "success");
      await loadData(); 
      renderInventory();
    } else {
      showToast("ไม่สามารถลบได้ (อาจมีสินค้าใช้งานอยู่)", "error");
    }
  } catch (error) {
    showToast("เกิดข้อผิดพลาดในการลบหมวดหมู่", "error");
  }
}


// --- Reports Page ---

function renderReports() {
  const orders = {};
  sales.forEach(s => {
    if (!orders[s.order_id]) orders[s.order_id] = { id: s.order_id, cust: s.customer_name || "-", seller: s.seller_name, total: 0, date: s.sold_at, items: 0 };
    orders[s.order_id].total += Number(s.total);
    orders[s.order_id].items += s.qty;
  });
  const list = Object.values(orders).sort((a,b) => new Date(b.date) - new Date(a.date));

  document.getElementById("reports").innerHTML = `
    <div class="card"><h2><i class="fas fa-search"></i> ค้นหารายงาน</h2>
      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
        <label>วันที่เริ่ม<input type="date" id="rep-start" /></label>
        <label>วันที่สิ้นสุด<input type="date" id="rep-end" /></label>
        <label>ค้นหา<input type="text" id="rep-search" placeholder="ลูกค้า/ออเดอร์" /></label>
        <button onclick="filterReports()" class="btn-primary" style="align-self: flex-end;"><i class="fas fa-filter"></i> ค้นหา</button>
      </div>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>เลขออเดอร์</th><th>วันที่</th><th>ลูกค้า</th><th>ผู้ขาย</th><th>รวม</th><th>ใบเสร็จ</th></tr></thead>
      <tbody>${list.map(o => `
        <tr><td>${o.id}</td><td>${new Date(o.date).toLocaleString("th-TH")}</td><td>${o.cust}</td><td>${o.seller}</td><td>฿${o.total.toFixed(2)}</td>
        <td><button onclick="generateReceiptPDF('${o.id}')" style="background: #10b981; color: white;"><i class="fas fa-file-pdf"></i> ดู</button></td></tr>`).join("")}</tbody>
    </table></div></div>
  `;
}

async function filterReports() {
  const start = document.getElementById("rep-start").value;
  const end = document.getElementById("rep-end").value;
  const q = document.getElementById("rep-search").value;
  let url = `/api/sales?`;
  if (start) url += `start_date=${start}&`;
  if (end) url += `end_date=${end}&`;
  if (q) url += `search=${encodeURIComponent(q)}&`;
  sales = await fetchJson(url);
  renderReports();
}

// --- Customer & Promotion & User Pages ---

function renderCustomers() {
  const editing = editingCustomerId ? customers.find(x => x.id === editingCustomerId) : null;
  document.getElementById("customers").innerHTML = `
    <div class="card"><h2>${editing ? '<i class="fas fa-user-edit"></i> แก้ไขลูกค้า' : '<i class="fas fa-user-plus"></i> เพิ่มลูกค้า'}</h2>
      <form onsubmit="saveCustomer(event)"><div class="grid">
        <label>เบอร์โทร<input type="text" id="c-phone" value="${editing?.phone || ''}" required /></label>
        <label>ชื่อลูกค้า<input type="text" id="c-name" value="${editing?.name || ''}" required /></label>
      </div><button type="submit" class="btn-primary">${editing ? '<i class="fas fa-save"></i> บันทึก' : '<i class="fas fa-plus"></i> เพิ่ม'}</button>
      ${editing ? `<button type="button" onclick="editingCustomerId=null; renderCustomers();" style="background: #94a3b8; color: white; margin-left: 10px;"><i class="fas fa-times"></i> ยกเลิก</button>` : ''}</form>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>เบอร์โทร</th><th>ชื่อ</th><th>จัดการ</th></tr></thead>
      <tbody>${customers.map(c => `<tr><td>${c.phone}</td><td>${c.name}</td>
        <td><button onclick="editingCustomerId=${c.id}; renderCustomers();" style="background: #eff6ff; color: #2563eb; padding: 8px; border-radius: 8px; margin-right: 5px;"><i class="fas fa-edit"></i></button><button onclick="delCustomer(${c.id})" style="background:#fef2f2; color: #ef4444; padding: 8px; border-radius: 8px;"><i class="fas fa-trash-alt"></i></button></td></tr>`).join("")}</tbody>
    </table></div></div>
  `;
}

async function saveCustomer(e) {
  e.preventDefault();
  const phone = document.getElementById("c-phone").value;
  const name = document.getElementById("c-name").value;
  const method = editingCustomerId ? "PUT" : "POST";
  const url = editingCustomerId ? `/api/customers/${editingCustomerId}` : "/api/customers";
  await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, name }) });
  editingCustomerId = null; await loadData(); renderCustomers();
}

async function delCustomer(id) {
  if (!confirm("ลบลูกค้า?")) return;
  await fetch(`/api/customers/${id}`, { method: "DELETE" });
  await loadData(); renderCustomers();
}

function renderPromotions() {
  const editing = editingPromotionId ? promotions.find(x => x.id === editingPromotionId) : null;
  document.getElementById("promotions").innerHTML = `
    <div class="card"><h2>${editing ? '<i class="fas fa-tag"></i> แก้ไขโปร' : '<i class="fas fa-plus-circle"></i> เพิ่มโปร'}</h2>
      <form onsubmit="savePromo(event)"><div class="grid">
        <label>ชื่อโปร<input type="text" id="p-name" value="${editing?.name || ''}" required /></label>
        <label>ขั้นต่ำ<input type="number" id="p-qty" value="${editing?.min_qty || 1}" /></label>
        <label>ประเภท<select id="p-type"><option value="fixed" ${editing?.discount_type==='fixed'?'selected':''}>บาท</option><option value="percent" ${editing?.discount_type==='percent'?'selected':''}>%</option></select></label>
        <label>ส่วนลด<input type="number" id="p-val" value="${editing?.discount_value || 0}" /></label>
        <label>สินค้า (SKU, คั่นด้วยคอมม่า)<input type="text" id="p-skus" value="${editing?.applicable_skus || ''}" placeholder="ว่างคือทั้งหมด" /></label>
        <label>สถานะ<select id="p-status"><option value="1" ${editing?.is_active?'selected':''}>เปิด</option><option value="0" ${!editing?.is_active?'selected':''}>ปิด</option></select></label>
      </div><button type="submit" class="btn-primary">${editing ? '<i class="fas fa-save"></i> บันทึก' : '<i class="fas fa-plus"></i> เพิ่ม'}</button>
      ${editing ? `<button type="button" onclick="editingPromotionId=null; renderPromotions();" style="background: #94a3b8; color: white; margin-left: 10px;"><i class="fas fa-times"></i> ยกเลิก</button>` : ''}</form>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>ชื่อ</th><th>เงื่อนไข</th><th>ส่วนลด</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
      <tbody>${promotions.map(p => `<tr><td>${p.name}</td><td>${p.min_qty} ชิ้น</td><td>${p.discount_type==='fixed'?'฿':''}${p.discount_value}${p.discount_type==='percent'?'%':''}</td>
        <td>${p.is_active?'เปิด':'ปิด'}</td><td><button onclick="editingPromotionId=${p.id}; renderPromotions();" style="background: #eff6ff; color: #2563eb; padding: 8px; border-radius: 8px; margin-right: 5px;"><i class="fas fa-edit"></i></button><button onclick="delPromo(${p.id})" style="background:#fef2f2; color: #ef4444; padding: 8px; border-radius: 8px;"><i class="fas fa-trash-alt"></i></button></td></tr>`).join("")}</tbody>
    </table></div></div>
  `;
}

async function savePromo(e) {
  e.preventDefault();
  const data = {
    name: document.getElementById("p-name").value,
    min_qty: document.getElementById("p-qty").value,
    discount_type: document.getElementById("p-type").value,
    discount_value: document.getElementById("p-val").value,
    applicable_skus: document.getElementById("p-skus").value,
    is_active: document.getElementById("p-status").value,
  };
  const method = editingPromotionId ? "PUT" : "POST";
  const url = editingPromotionId ? `/api/promotions/${editingPromotionId}` : "/api/promotions";
  await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  editingPromotionId = null; await loadData(); renderPromotions();
}

async function delPromo(id) {
  if (!confirm("ลบโปร?")) return;
  await fetch(`/api/promotions/${id}`, { method: "DELETE" });
  await loadData(); renderPromotions();
}

function renderUsers() {
  const editing = editingUserId ? users.find(x => x.id === editingUserId) : null;
  document.getElementById("users").innerHTML = `
    <div class="card"><h2>${editing ? '<i class="fas fa-user-cog"></i> แก้ไขผู้ใช้' : '<i class="fas fa-user-plus"></i> เพิ่มผู้ใช้'}</h2>
      <form onsubmit="saveUser(event)"><div class="grid">
        <label>User<input type="text" id="u-user" value="${editing?.username || ''}" required /></label>
        <label>Pass<input type="password" id="u-pass" ${editing?'':'required'} /></label>
        <label>ชื่อ<input type="text" id="u-name" value="${editing?.name || ''}" required /></label>
        <label>สิทธิ์<select id="u-role"><option value="user" ${editing?.role==='user'?'selected':''}>User</option><option value="admin" ${editing?.role==='admin'?'selected':''}>Admin</option></select></label>
      </div><button type="submit" class="btn-primary">${editing ? '<i class="fas fa-save"></i> บันทึก' : '<i class="fas fa-plus"></i> เพิ่ม'}</button>
      ${editing ? `<button type="button" onclick="editingUserId=null; renderUsers();" style="background: #94a3b8; color: white; margin-left: 10px;"><i class="fas fa-times"></i> ยกเลิก</button>` : ''}</form>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>User</th><th>ชื่อ</th><th>สิทธิ์</th><th>จัดการ</th></tr></thead>
      <tbody>${users.map(u => `<tr><td>${u.username}</td><td>${u.name}</td><td>${u.role}</td>
        <td><button onclick="editingUserId=${u.id}; renderUsers();" style="background: #eff6ff; color: #2563eb; padding: 8px; border-radius: 8px; margin-right: 5px;"><i class="fas fa-edit"></i></button><button onclick="delUser(${u.id})" style="background:#fef2f2; color: #ef4444; padding: 8px; border-radius: 8px;"><i class="fas fa-trash-alt"></i></button></td></tr>`).join("")}</tbody>
    </table></div></div>
  `;
}

async function saveUser(e) {
  e.preventDefault();
  const data = {
    username: document.getElementById("u-user").value,
    password: document.getElementById("u-pass").value,
    name: document.getElementById("u-name").value,
    role: document.getElementById("u-role").value,
  };
  const method = editingUserId ? "PUT" : "POST";
  const url = editingUserId ? `/api/users/${editingUserId}` : "/api/users";
  await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  editingUserId = null; await loadData(); renderUsers();
}

async function delUser(id) {
  if (currentUser.id === id) return showToast("ลบตัวเองไม่ได้", "error");
  if (!confirm("ลบผู้ใช้?")) return;
  await fetch(`/api/users/${id}`, { method: "DELETE" });
  await loadData(); renderUsers();
}

// --- PDF Generation ---

async function generateSalesReportPDF(period) {
  const now = new Date();
  let title = "";
  let filteredSales = [];
  
  if (period === 'today') {
    const todayStr = now.toLocaleDateString();
    title = `รายงานยอดขายประจำวันที่ ${now.toLocaleDateString("th-TH")}`;
    filteredSales = sales.filter(s => new Date(s.sold_at).toLocaleDateString() === todayStr);
  } else {
    const month = now.getMonth();
    const year = now.getFullYear();
    const monthName = now.toLocaleDateString("th-TH", { month: 'long', year: 'numeric' });
    title = `รายงานยอดขายประจำเดือน ${monthName}`;
    filteredSales = sales.filter(s => {
      const d = new Date(s.sold_at);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  }

  if (filteredSales.length === 0) return showToast("ไม่พบข้อมูลการขายในรอบที่เลือก", "warning");

  const element = document.createElement("div");
  element.style.padding = "40px";
  element.style.background = "#fff";
  element.style.color = "#000";
  element.style.fontFamily = "'Prompt', sans-serif";

  const totalRevenue = filteredSales.reduce((sum, s) => sum + Number(s.total), 0);
  const totalItems = filteredSales.reduce((sum, s) => sum + s.qty, 0);
  const totalOrders = [...new Set(filteredSales.map(s => s.order_id))].length;

  element.innerHTML = `
    <div style="text-align: center; margin-bottom: 30px; border-bottom: 4px solid #7c3aed; padding-bottom: 20px;">
      <h1 style="margin: 0; font-size: 28px; color: #1e293b;">ร้านแว่นตาอานนท์</h1>
      <h2 style="margin: 10px 0; color: #7c3aed; font-size: 20px;">${title}</h2>
      <p style="margin: 5px 0; color: #64748b; font-size: 14px;">พิมพ์เมื่อ: ${new Date().toLocaleString("th-TH")}</p>
    </div>

    <!-- Summary Box using Table for PDF Compatibility -->
    <table style="width: 100%; border-collapse: separate; border-spacing: 15px 0; margin-bottom: 30px; margin-left: -15px;">
      <tr>
        <td style="width: 33.33%; background: #f8fafc; padding: 20px; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0;">
          <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">ยอดขายสุทธิ</div>
          <div style="font-size: 22px; font-weight: 800; color: #7c3aed;">฿${totalRevenue.toLocaleString(undefined, {minimumFractionDigits:2})}</div>
        </td>
        <td style="width: 33.33%; background: #f8fafc; padding: 20px; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0;">
          <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">จำนวนออเดอร์</div>
          <div style="font-size: 22px; font-weight: 800; color: #1e293b;">${totalOrders}</div>
        </td>
        <td style="width: 33.33%; background: #f8fafc; padding: 20px; border-radius: 12px; text-align: center; border: 1px solid #e2e8f0;">
          <div style="font-size: 14px; color: #64748b; margin-bottom: 5px;">สินค้าที่ขายได้</div>
          <div style="font-size: 22px; font-weight: 800; color: #1e293b;">${totalItems} ชิ้น</div>
        </td>
      </tr>
    </table>

    <h3 style="border-left: 5px solid #7c3aed; padding-left: 10px; margin-bottom: 15px; color: #1e293b;">รายการธุรกรรม</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed;">
      <thead>
        <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1;">
          <th style="text-align: left; padding: 12px 10px; width: 17%;">วันที่/เวลา</th>
          <th style="text-align: left; padding: 12px 10px; width: 17%;">เลขออเดอร์</th>
          <th style="text-align: left; padding: 12px 10px; width: 33%;">รายการสินค้า</th>
          <th style="text-align: center; padding: 12px 10px; width: 10%;">จำนวน</th>
          <th style="text-align: right; padding: 12px 40px; width: 23%;">รวมสุทธิ</th>
        </tr>
      </thead>
      <tbody>
        ${filteredSales.map((s, idx) => `
          <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 0 ? '' : 'background: #fcfcfc;'}">
            <td style="padding: 10px; word-break: break-all;">${new Date(s.sold_at).toLocaleString("th-TH", {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'})}</td>
            <td style="padding: 10px; font-family: monospace; word-break: break-all;">${s.order_id}</td>
            <td style="padding: 10px;">
              <div style="font-weight: 600;">${s.product_name || s.sku}</div>
              <div style="font-size: 11px; color: #64748b;">฿${Number(s.unit_price).toLocaleString()} / ชิ้น</div>
            </td>
            <td style="padding: 10px; text-align: center;">${s.qty}</td>
            <td style="padding: 10px 40px; text-align: right; font-weight: 700;">฿${Number(s.total).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr style="background: #f8fafc; border-top: 2px solid #cbd5e1;">
          <td colspan="3" style="padding: 15px 10px; text-align: right; font-weight: 800; font-size: 16px;">รวมยอดขายทั้งสิ้น:</td>
          <td style="padding: 15px 10px; text-align: center; font-weight: 800; font-size: 16px;">${totalItems}</td>
          <td style="padding: 15px 40px; text-align: right; font-weight: 800; font-size: 18px; color: #7c3aed;">฿${totalRevenue.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top: 40px; text-align: right; border-top: 2px solid #f1f5f9; padding-top: 20px;">
      <p style="font-size: 14px; color: #64748b;">ออกรายงานโดย: ${currentUser.name}</p>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 10px;">เอกสารนี้เป็นรายงานสรุปยอดขายภายในเท่านั้น</p>
    </div>
  `;

  try {
    const opt = { 
      margin: 10,
      filename: `Sales-Report-${period}-${now.toISOString().split('T')[0]}.pdf`, 
      image: { type: 'jpeg', quality: 0.98 }, 
      html2canvas: { scale: 2, useCORS: true }, 
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } 
    };
    await html2pdf().from(element).set(opt).save();
    showToast("ส่งออกรายงาน PDF เรียบร้อย", "success");
  } catch (error) {
    console.error("PDF generation error:", error);
    showToast("ไม่สามารถสร้าง PDF ได้", "error");
  }
}

async function generateReceiptPDF(orderId) {
  const res = await fetch(`/api/orders/${orderId}`);
  if (!res.ok) return showToast("ไม่พบข้อมูลออเดอร์", "error");
  const order = await res.json();

  const element = document.createElement("div");
  element.style.padding = "40px";
  element.style.background = "#fff";
  element.style.color = "#000";
  element.style.fontFamily = "'Prompt', sans-serif";
  
  const subtotal = order.items.reduce((s, i) => s + (Number(i.unit_price) * i.qty), 0);
  const totalDiscount = order.items.reduce((s, i) => s + Number(i.discount), 0);
  const total = subtotal - totalDiscount;
  
  element.innerHTML = `
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="margin: 0; font-size: 24px;">ร้านแว่นตาอานนท์</h1>
      <p style="margin: 5px 0; color: #666;">ใบเสร็จรับเงิน / Receipt</p>
    </div>
    <div style="display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
      <div>
        <p style="margin: 3px 0;"><strong>เลขออเดอร์:</strong> ${order.order_id}</p>
        <p style="margin: 3px 0;"><strong>วันที่:</strong> ${new Date(order.sold_at).toLocaleString("th-TH")}</p>
      </div>
      <div style="text-align: right;">
        <p style="margin: 3px 0;"><strong>ลูกค้า:</strong> ${order.customer_name || 'ลูกค้าทั่วไป'}</p>
        <p style="margin: 3px 0;"><strong>เบอร์โทร:</strong> ${order.customer_phone || '-'}</p>
      </div>
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; table-layout: fixed;">
      <thead>
        <tr style="border-bottom: 2px solid #333;">
          <th style="text-align: left; padding: 10px 5px; width: 40%;">รายการ</th>
          <th style="text-align: center; padding: 10px 5px; width: 15%;">จำนวน</th>
          <th style="text-align: right; padding: 10px 5px; width: 20%;">ราคา/ชิ้น</th>
          <th style="text-align: right; padding: 10px 30px; width: 25%;">รวม</th>
        </tr>
      </thead>
      <tbody>
        ${order.items.map(i => `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px 5px;">${i.product_name}</td>
            <td style="text-align: center; padding: 12px 5px;">${i.qty}</td>
            <td style="text-align: right; padding: 12px 5px;">${Number(i.unit_price).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td style="text-align: right; padding: 12px 30px;">${Number(i.total).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div style="margin-top: 30px; border-top: 2px solid #333; padding-top: 15px;">
      <div style="display: flex; justify-content: flex-end; gap: 40px; margin-bottom: 8px;">
        <span style="color: #666;">ยอดรวม:</span>
        <span style="width: 150px; text-align: right; padding-right: 30px;">฿${subtotal.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 40px; margin-bottom: 8px;">
        <span style="color: #059669;">ส่วนลด:</span>
        <span style="width: 150px; text-align: right; padding-right: 30px;">-฿${totalDiscount.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 40px; font-size: 20px; font-weight: bold; margin-top: 10px;">
        <span>ยอดสุทธิ:</span>
        <span style="width: 170px; text-align: right; color: #7c3aed; padding-right: 30px;">฿${total.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
      </div>
    </div>
    <div style="text-align: center; margin-top: 50px; color: #999; font-size: 12px; border-top: 1px dashed #eee; padding-top: 20px;">
      <p>*** ขอบคุณที่ใช้บริการร้านแว่นตาอานนท์ ***</p>
      <p>สินค้าซื้อแล้วไม่รับเปลี่ยนหรือคืน</p>
    </div>
  `;

  try {
    const opt = { 
      margin: 10,
      filename: `Receipt-${orderId}.pdf`, 
      image: { type: 'jpeg', quality: 0.98 }, 
      html2canvas: { scale: 2, useCORS: true }, 
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } 
    };
    await html2pdf().from(element).set(opt).save();
    showToast("ส่งออกใบเสร็จ PDF เรียบร้อย", "success");
  } catch (error) {
    console.error("PDF generation error:", error);
    showToast("ไม่สามารถสร้าง PDF ได้", "error");
  }
}

// --- Initialization ---

async function init() {
  if (!checkAuth()) return;
  setupEventListeners();
  const success = await loadData();
  if (success) renderHome();
}

init();
