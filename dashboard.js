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
  const icons = { success: '<i class="fas fa-check-circle"></i>', error: '<i class="fas fa-times-circle"></i>', warning: '<i class="fas fa-exclamation-triangle"></i>', info: '<i class="fas fa-info-circle"></i>' };
  if (!title) title = type === "success" ? "สำเร็จ" : type === "error" ? "ข้อผิดพลาด" : "แจ้งเตือน";
  toast.innerHTML = `<div class="toast-icon">${icons[type] || '<i class="fas fa-bell"></i>'}</div><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div>`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 300); }, 3000);
}

const originalFetch = window.fetch;
window.fetch = async function() {
  let [resource, config] = arguments;
  if (typeof resource === 'string' && resource.startsWith('/api/')) {
    config = config || {}; config.headers = config.headers || {};
    const token = localStorage.getItem("token");
    if (token) { if (config.headers instanceof Headers) config.headers.append('Authorization', `Bearer ${token}`); else config.headers['Authorization'] = `Bearer ${token}`; }
  }
  const response = await originalFetch(resource, config);
  if (response.status === 401 || response.status === 403) { if (resource !== '/api/login') { localStorage.removeItem("user"); localStorage.removeItem("token"); window.location.replace("/login.html"); } }
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
      fetchJson("/api/products"), fetchJson("/api/users"), fetchJson("/api/promotions"),
      fetchJson("/api/customers"), fetchJson("/api/sales"), fetchJson("/api/settings"), fetchJson("/api/product-types")
    ]);
    products = p; users = u; promotions = promo; customers = c; sales = s; settings = sett; productTypes = pt;
    return true;
  } catch (error) { showToast("ไม่สามารถโหลดข้อมูลได้", "error"); return false; }
}

// --- Page Routing ---

function checkAuth() {
  const userStr = localStorage.getItem("user");
  const token = localStorage.getItem("token");
  if (!userStr || !token) { window.location.replace("/login.html"); return false; }
  currentUser = JSON.parse(userStr);
  const userInfoEl = document.getElementById("user-info");
  if (userInfoEl) userInfoEl.innerHTML = `<i class="fas fa-user-circle"></i> ${currentUser.name} (${currentUser.role})`;
  if (currentUser.role === "admin") document.querySelectorAll(".admin-only").forEach(el => el.style.display = "flex");
  return true;
}

function setupEventListeners() {
  document.querySelectorAll(".nav-item").forEach(btn => { btn.addEventListener("click", () => switchPage(btn.dataset.page, btn)); });
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) logoutBtn.addEventListener("click", () => { localStorage.removeItem("user"); localStorage.removeItem("token"); window.location.replace("/login.html"); });
}

async function switchPage(pageName, button) {
  document.querySelectorAll(".page").forEach(p => { p.classList.remove("active"); p.style.display = "none"; });
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  const targetPage = document.getElementById(pageName);
  if (targetPage) { targetPage.classList.add("active"); targetPage.style.display = "block"; }
  if (button) button.classList.add("active");
  const titleMap = { home: "แดชบอร์ด", pos: "ขายหน้าร้าน", inventory: "คลังสินค้า", reports: "รายงาน", users: "จัดการผู้ใช้", promotions: "จัดการโปรโมชั่น", customers: "จัดการลูกค้า" };
  const titleEl = document.getElementById("page-title");
  if (titleEl) titleEl.textContent = titleMap[pageName] || "แดชบอร์ด";
  if (pageName !== "home") await loadData();
  if (pageName === "home") renderHome();
  else if (pageName === "pos") renderPOS();
  else if (pageName === "inventory") renderInventory();
  else if (pageName === "reports") renderReports();
  else if (pageName === "users") renderUsers();
  else if (pageName === "promotions") renderPromotions();
  else if (pageName === "customers") renderCustomers();
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
  sales.forEach(s => { productSalesMap[s.sku] = (productSalesMap[s.sku] || 0) + s.qty; });
  const topSelling = Object.entries(productSalesMap).map(([sku, qty]) => ({ sku, qty, name: products.find(p => p.sku === sku)?.name || sku })).sort((a, b) => b.qty - a.qty).slice(0, 5);

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

    <div class="card" style="margin-top: 1.5rem;">
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;">
        <div><h2><i class="fas fa-chart-area"></i> แนวโน้มยอดขาย</h2><div style="height: 300px;"><canvas id="salesChart"></canvas></div></div>
        <div><h2><i class="fas fa-chart-pie"></i> สัดส่วนสินค้า</h2><div style="height: 300px;"><canvas id="categoryChart"></canvas></div></div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
      <div class="card"><h2><i class="fas fa-bolt"></i> ทางลัดด่วน</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 1rem;">
          <button onclick="switchPage('pos')" class="btn-primary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #6366f1;"><i class="fas fa-cash-register"></i><span>เปิดหน้าขาย</span></button>
          <button onclick="switchPage('inventory')" class="btn-primary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #8b5cf6;"><i class="fas fa-plus-circle"></i><span>เพิ่มสินค้าใหม่</span></button>
          <button onclick="switchPage('reports')" class="btn-secondary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px;"><i class="fas fa-file-invoice-dollar"></i><span>ดูรายงาน</span></button>
          <button onclick="generateSalesReportPDF('today')" class="btn-secondary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #0ea5e9; color: white; border: none;"><i class="fas fa-calendar-day"></i><span>รายงานวันนี้ (PDF)</span></button>
        </div>
      </div>
      <div class="card"><h2><i class="fas fa-fire"></i> สินค้าขายดี</h2>
        <div style="margin-top: 1rem;">${topSelling.map((p, i) => `<div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: ${i === 4 ? 'none' : '1px solid #eee'};"><span>${i+1}. ${p.name}</span><span style="font-weight: bold; color: #6366f1;">${p.qty} ชิ้น</span></div>`).join("")}</div>
      </div>
      <div class="card"><h2><i class="fas fa-receipt"></i> การขายล่าสุด</h2>
        <div style="margin-top: 1rem;">${[...new Map(sales.map(item => [item.order_id, item])).values()].slice(0, 5).map(s => `<div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9;"><div><div style="font-weight: 600; font-size: 0.9rem;">${s.order_id}</div><div style="font-size: 0.7rem; color: #64748b;">${new Date(s.sold_at).toLocaleTimeString('th-TH')}</div></div><div style="font-weight: 700; color: #059669;">฿${Number(s.total).toLocaleString()}</div></div>`).join("")}</div>
      </div>
    </div>
  `;
  renderCharts();
}

function renderCharts() { renderSalesChart(); renderCategoryChart(); }

function renderSalesChart() {
  const ctx = document.getElementById('salesChart'); if (!ctx) return;
  const labels = []; const dataPoints = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); const dateStr = d.toLocaleDateString();
    labels.push(d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
    const daySales = sales.filter(s => new Date(s.sold_at).toLocaleDateString() === dateStr);
    dataPoints.push(daySales.reduce((sum, s) => sum + Number(s.total || 0), 0));
  }
  if (window.mySalesChart) window.mySalesChart.destroy();
  window.mySalesChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{ label: 'ยอดขาย', data: dataPoints, borderColor: '#7c3aed', backgroundColor: 'rgba(124, 58, 237, 0.1)', fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}

function renderCategoryChart() {
  const ctx = document.getElementById('categoryChart'); if (!ctx) return;
  const catMap = {}; sales.forEach(s => { const p = products.find(prod => prod.sku === s.sku); const cat = p?.category || 'ทั่วไป'; catMap[cat] = (catMap[cat] || 0) + Number(s.total); });
  const labels = Object.keys(catMap); const data = Object.values(catMap);
  if (window.myCatChart) window.myCatChart.destroy();
  window.myCatChart = new Chart(ctx, { type: 'doughnut', data: { labels: labels, datasets: [{ data: data, backgroundColor: ['#7c3aed', '#059669', '#0284c7', '#ea580c', '#db2777'] }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } } });
}

// --- POS Page ---

function renderPOS() {
  document.getElementById("pos").innerHTML = `
    <div class="pos-layout">
      <div class="card">
        <h2 style="display: flex; align-items: center; gap: 10px;"><i class="fas fa-shopping-cart"></i> ระบบ POS ขายหน้าร้าน</h2>
        <div class="grid" style="grid-template-columns: 2fr 1fr; gap: 10px;">
          <input type="text" id="pos-search" placeholder="ค้นหาสินค้า..." oninput="handlePOSSearch(this.value)" />
          <input type="text" id="pos-customer" placeholder="เบอร์โทรลูกค้า" oninput="handlePOSCustomer(this.value)" list="cust-list-pos" />
          <datalist id="cust-list-pos">${customers.map(c => `<option value="${c.phone}">${c.name}</option>`).join("")}</datalist>
        </div>
        <div id="pos-cust-info" style="margin: 10px 0; color: #7c3aed; font-weight: 500; height: 1.2rem;"></div>
        <div style="display: flex; gap: 8px; margin: 15px 0; overflow-x: auto; padding-bottom: 5px;">
          <button onclick="filterPOSByCategory('')" class="btn-category active" id="cat-all">ทั้งหมด</button>
          ${productTypes.map(t => `<button onclick="filterPOSByCategory('${t.name}')" class="btn-category" id="cat-${t.id}">${t.name}</button>`).join("")}
        </div>
        <div id="pos-product-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-top: 1rem; max-height: 500px; overflow-y: auto; padding: 5px;">
          ${renderPOSProductList(products)}
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
        <button onclick="checkout()" class="btn-primary" style="width: 100%; margin-top: 1.5rem; padding: 18px; font-size: 1.2rem; border-radius: 16px;"><i class="fas fa-check"></i> ชำระเงิน</button>
      </div>
    </div>
  `;
  renderCart();
}

function renderPOSProductList(items) {
  if (items.length === 0) return `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">ไม่พบสินค้า</div>`;
  return items.map(p => `
    <div onclick="addToCart('${p.sku}')" style="background: white; border: 1px solid #f0f0f0; padding: 12px; border-radius: 16px; cursor: pointer; text-align: center; transition: 0.2s;" onmouseover="this.style.borderColor='#7c3aed'" onmouseout="this.style.borderColor='#f0f0f0'">
      <img src="${p.image || 'https://via.placeholder.com/150?text=No+Image'}" style="width: 100%; height: 110px; object-fit: cover; border-radius: 12px;" />
      <div style="font-weight: 600; margin-top: 10px; font-size: 0.9rem; height: 2.4rem; overflow: hidden; line-height: 1.2;">${p.name}</div>
      <div style="color: #7c3aed; font-weight: 700; font-size: 1.1rem; margin-top: 5px;">฿${Number(p.price).toLocaleString()}</div>
      <div style="font-size: 0.75rem; color: #6b7280;">คลัง: ${p.stock}</div>
    </div>
  `).join("");
}

function handlePOSSearch(val) { const filtered = products.filter(p => p.name.toLowerCase().includes(val.toLowerCase()) || p.sku.toLowerCase().includes(val.toLowerCase())); document.getElementById("pos-product-grid").innerHTML = renderPOSProductList(filtered); }
function handlePOSCustomer(phone) { const c = customers.find(x => x.phone === phone); const info = document.getElementById("pos-cust-info"); if (c) info.innerHTML = `<i class="fas fa-user-check"></i> ลูกค้าประจำ: ${c.name}`; else info.textContent = ""; }
function filterPOSByCategory(cat) { document.querySelectorAll(".btn-category").forEach(btn => btn.classList.remove("active")); const filtered = cat === "" ? products : products.filter(p => p.category === cat); document.getElementById("pos-product-grid").innerHTML = renderPOSProductList(filtered); }

function addToCart(sku) {
  const p = products.find(x => x.sku === sku); if (!p) return;
  const item = cart.find(x => x.sku === sku);
  if (item) { if (item.qty + 1 > p.stock) return showToast("สต็อกไม่พอ", "warning"); item.qty++; }
  else { if (p.stock < 1) return showToast("สินค้าหมด", "error"); cart.push({ sku, name: p.name, price: Number(p.price), qty: 1 }); }
  renderCart();
}

function renderCart() {
  let sub = 0, disc = 0;
  const html = cart.map((item, i) => {
    const promo = promotions.filter(p => p.is_active).find(pr => {
      const skus = pr.applicable_skus ? pr.applicable_skus.split(",").map(s => s.trim()) : [];
      return (skus.length === 0 || skus.includes(item.sku)) && item.qty >= pr.min_qty;
    });
    let itemDisc = promo ? (promo.discount_type === "fixed" ? Number(promo.discount_value) : (item.price * Number(promo.discount_value) / 100)) : 0;
    sub += item.price * item.qty; disc += itemDisc * item.qty;
    return `
      <div style="background: #f8fafc; border: 1px solid #f1f5f9; padding: 12px; border-radius: 12px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between;"><strong>${item.name}</strong><button onclick="removeFromCart(${i})" style="color: #ef4444; border: none; background: none; cursor: pointer;"><i class="fas fa-times"></i></button></div>
        <div style="display: flex; justify-content: space-between; margin-top: 10px; align-items: center;">
          <div style="display: flex; align-items: center; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <button onclick="updateCartQty(${i}, ${item.qty-1})" style="padding: 5px 10px; border: none; background: white;">-</button>
            <input type="number" value="${item.qty}" style="width: 40px; text-align: center; border: none;" onchange="updateCartQty(${i}, this.value)" />
            <button onclick="updateCartQty(${i}, ${item.qty+1})" style="padding: 5px 10px; border: none; background: white;">+</button>
          </div>
          <div style="font-weight: 700;">฿${((item.price - itemDisc) * item.qty).toLocaleString()}</div>
        </div>
      </div>
    `;
  }).join("");
  document.getElementById("cart-list").innerHTML = html || `<div style="text-align: center; color: #94a3b8; padding: 40px;">ตะกร้าว่าง</div>`;
  document.getElementById("sub-val").textContent = sub.toLocaleString(); document.getElementById("disc-val").textContent = disc.toLocaleString(); document.getElementById("total-val").textContent = (sub - disc).toLocaleString();
}

function updateCartQty(idx, val) {
  const qty = parseInt(val); const item = cart[idx]; if (!item) return;
  const p = products.find(x => x.sku === item.sku);
  if (isNaN(qty) || qty < 1) item.qty = 1; else if (qty > p.stock) { showToast("สต็อกไม่พอ", "warning"); item.qty = p.stock; } else item.qty = qty;
  renderCart();
}
function removeFromCart(idx) { cart.splice(idx, 1); renderCart(); }

async function checkout() {
  if (cart.length === 0) return showToast("กรุณาเลือกสินค้า", "warning");
  const sub = cart.reduce((s, i) => s + (i.price * i.qty), 0);
  const disc = cart.reduce((sum, item) => {
    const promo = promotions.filter(p => p.is_active).find(pr => { const skus = pr.applicable_skus ? pr.applicable_skus.split(",").map(s => s.trim()) : []; return (skus.length === 0 || skus.includes(item.sku)) && item.qty >= pr.min_qty; });
    return sum + (promo ? (promo.discount_type === "fixed" ? Number(promo.discount_value) : (item.price * Number(promo.discount_value) / 100)) : 0) * item.qty;
  }, 0);
  const total = sub - disc;

  let modal = document.getElementById("payment-modal"); if (!modal) { modal = document.createElement("div"); modal.id = "payment-modal"; modal.className = "modal"; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div class="modal-content" style="width: min(100%, 450px);">
      <div class="modal-header"><h2>ชำระเงิน</h2><button onclick="document.getElementById('payment-modal').style.display='none'" class="modal-close"><i class="fas fa-times"></i></button></div>
      <div style="padding: 24px;">
        <div style="text-align: center; margin-bottom: 20px; background: #f8fafc; padding: 15px; border-radius: 16px;">
          <div style="font-size: 0.9rem; color: #64748b;">ยอดรวมสุทธิ</div>
          <div style="font-size: 2rem; font-weight: 800; color: #7c3aed;">฿${total.toLocaleString()}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px;">
          ${['cash', 'qr', 'transfer'].map(m => `<label class="pay-method-btn"><input type="radio" name="pay-method" value="${m}" ${m==='cash'?'checked':''} /><span>${m.toUpperCase()}</span></label>`).join('')}
        </div>
        <label>รับเงินมา (บาท)<input type="number" id="pay-received" style="width: 100%; font-size: 1.5rem; text-align: center; padding: 10px; border-radius: 12px; border: 1px solid #ddd;" oninput="calculateChange(${total})" /></label>
        <div id="pay-change" style="text-align: right; margin-top: 10px; font-weight: 700; color: #059669; font-size: 1.2rem;">เงินทอน: ฿0.00</div>
      </div>
      <div class="modal-footer"><button onclick="finalizeCheckout(${total})" class="btn-primary" style="width: 100%; padding: 15px;">ยืนยันการชำระเงิน</button></div>
    </div>
  `;
  modal.style.display = "flex";
  setTimeout(() => document.getElementById("pay-received").focus(), 100);
}

function calculateChange(total) {
  const received = parseFloat(document.getElementById("pay-received").value) || 0;
  document.getElementById("pay-change").textContent = `เงินทอน: ฿${Math.max(0, received - total).toLocaleString()}`;
}

async function finalizeCheckout(totalAmount) {
  const method = document.querySelector('input[name="pay-method"]:checked').value;
  const received = parseFloat(document.getElementById("pay-received").value) || 0;
  if (method === "cash" && received < totalAmount) return showToast("เงินไม่เพียงพอ", "warning");
  
  const btn = event.target; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...';
  
  try {
    const res = await fetch("/api/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart, customer_phone: document.getElementById("pos-customer").value, payment_method: method }),
    });
    if (res.ok) {
      const data = await res.json();
      showToast("สำเร็จ", "success");
      document.getElementById("payment-modal").style.display = "none";
      generateReceiptPDF(data.order_id);
      cart = []; await loadData(); renderPOS();
    }
  } catch (e) { showToast("ล้มเหลว", "error"); }
  btn.disabled = false; btn.innerHTML = "ยืนยันการชำระเงิน";
}

// --- Inventory Page ---

function renderInventory() {
  document.getElementById("inventory").innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 15px; flex-wrap: wrap;">
      <div style="display: flex; gap: 10px;">
        <button onclick="openAddProductModal()" class="btn-primary"><i class="fas fa-plus-circle"></i> เพิ่มสินค้า</button>
        <button onclick="openStockLogModal()" style="background: #f1f5f9; padding: 10px 20px; border-radius: 12px; cursor: pointer;"><i class="fas fa-history"></i> ประวัติสต็อก</button>
      </div>
      <div style="flex: 1; max-width: 400px; position: relative;">
        <input type="text" id="inv-search" placeholder="ค้นหาตามชื่อหรือ SKU..." oninput="inventorySearchQuery=this.value; renderInventoryRows();" style="width: 100%; padding-left: 35px;" />
        <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8;"><i class="fas fa-search"></i></span>
      </div>
    </div>
    <div class="card" style="padding: 0; overflow: hidden; border: none;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>รูป</th><th>SKU</th><th>ชื่อ</th><th>หมวดหมู่</th><th style="text-align: right;">ราคา</th><th style="text-align: center;">สต็อก</th><th style="text-align: center;">จัดการ</th></tr>
          </thead>
          <tbody id="inv-tbody"></tbody>
        </table>
      </div>
    </div>
    <div id="inv-modal" class="modal" style="display: none;">
      <div class="modal-content">
        <div class="modal-header"><h2 id="modal-title">ข้อมูลสินค้า</h2><button onclick="closeModal()" class="modal-close"><i class="fas fa-times"></i></button></div>
        <form onsubmit="saveProduct(event)">
          <div style="padding: 24px;"><div class="grid" style="grid-template-columns: 1fr 1fr; gap: 20px;">
            <label>SKU<input type="text" id="m-sku" required /></label>
            <label>ชื่อสินค้า<input type="text" id="m-name" required /></label>
            <label>หมวดหมู่<select id="m-cat">${productTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join("")}</select></label>
            <label>ราคาขาย<input type="number" id="m-price" required /></label>
            <label>จำนวนสต็อก<input type="number" id="m-stock" required /></label>
            <label>ต้นทุน<input type="number" id="m-cost" /></label>
            <label>รูปภาพ<input type="file" id="m-img" accept="image/*" /></label>
          </div></div>
          <div class="modal-footer"><button type="button" onclick="closeModal()">ยกเลิก</button><button type="submit" class="btn-primary">บันทึก</button></div>
        </form>
      </div>
    </div>
    <div id="stock-modal" class="modal" style="display: none;">
      <div class="modal-content" style="width: 400px;">
        <div class="modal-header"><h2><i class="fas fa-plus-circle"></i> เพิ่มสต็อก</h2><button onclick="closeStockModal()" class="modal-close"><i class="fas fa-times"></i></button></div>
        <form onsubmit="addStock(event)">
          <div id="stock-product-info" style="padding: 20px; background: #f8fafc;"></div>
          <div style="padding: 24px;"><label>จำนวนที่ต้องการเพิ่ม<input type="number" id="stock-qty" required min="1" style="width: 100%; text-align: center; font-size: 2rem; border: 2px solid #7c3aed; border-radius: 12px; margin-top: 10px;" /></label></div>
          <div class="modal-footer"><button type="submit" class="btn-primary" style="width: 100%; padding: 15px;">ยืนยันการเพิ่ม</button></div>
        </form>
      </div>
    </div>
    <div id="stock-log-modal" class="modal" style="display: none;">
      <div class="modal-content" style="width: 600px;">
        <div class="modal-header"><h2>ประวัติการนำเข้า</h2><button onclick="document.getElementById('stock-log-modal').style.display='none'" class="modal-close"><i class="fas fa-times"></i></button></div>
        <div id="stock-log-content" style="padding: 20px; max-height: 500px; overflow-y: auto;"></div>
      </div>
    </div>
  `;
  renderInventoryRows();
}

function renderInventoryRows() {
  const q = inventorySearchQuery.toLowerCase();
  const filtered = products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  document.getElementById("inv-tbody").innerHTML = filtered.map(p => `
    <tr>
      <td style="text-align: center;"><img src="${p.image || 'https://via.placeholder.com/50'}" style="width: 48px; height: 48px; border-radius: 8px; object-fit: cover;" /></td>
      <td style="font-family: monospace; font-weight: 600;">${p.sku}</td><td>${p.name}</td><td><span class="badge" style="background: #eff6ff; color: #2563eb;">${p.category || 'ทั่วไป'}</span></td>
      <td style="text-align: right; font-weight: 700;">฿${Number(p.price).toLocaleString()}</td>
      <td style="text-align: center;"><span class="status-badge ${p.stock <= settings.low_stock_threshold ? 'status-low-stock' : 'status-in-stock'}">${p.stock}</span></td>
      <td style="text-align: center;">
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button onclick="openAddStockModal('${p.sku}')" style="background: #ecfdf5; color: #059669; padding: 8px; border-radius: 8px; border: none; cursor: pointer;"><i class="fas fa-plus"></i></button>
          <button onclick="editProduct('${p.sku}')" style="background: #eff6ff; color: #2563eb; padding: 8px; border-radius: 8px; border: none; cursor: pointer;"><i class="fas fa-edit"></i></button>
          <button onclick="delProduct('${p.sku}')" style="background: #fef2f2; color: #ef4444; padding: 8px; border-radius: 8px; border: none; cursor: pointer;"><i class="fas fa-trash-alt"></i></button>
        </div>
      </td>
    </tr>
  `).join("");
}

function openAddProductModal() { editProductSku = null; document.getElementById("modal-title").textContent = "เพิ่มสินค้าใหม่"; document.getElementById("m-sku").value = ""; document.getElementById("m-sku").readOnly = false; document.getElementById("m-name").value = ""; document.getElementById("m-price").value = ""; document.getElementById("m-stock").value = ""; document.getElementById("inv-modal").style.display = "flex"; }
function editProduct(sku) { const p = products.find(x => x.sku === sku); if (!p) return; editProductSku = sku; document.getElementById("modal-title").textContent = "แก้ไขสินค้า"; document.getElementById("m-sku").value = p.sku; document.getElementById("m-sku").readOnly = true; document.getElementById("m-name").value = p.name; document.getElementById("m-price").value = p.price; document.getElementById("m-stock").value = p.stock; document.getElementById("m-cat").value = p.category || ""; document.getElementById("inv-modal").style.display = "flex"; }
function closeModal() { document.getElementById("inv-modal").style.display = "none"; }
function openAddStockModal(sku) { const p = products.find(x => x.sku === sku); if (!p) return; editProductSku = sku; document.getElementById("stock-product-info").innerHTML = `<strong>${p.name}</strong><br/>รหัส: ${p.sku} | คลังปัจจุบัน: <span style="font-weight: 800; color: #7c3aed;">${p.stock}</span>`; document.getElementById("stock-qty").value = ""; document.getElementById("stock-modal").style.display = "flex"; }
function closeStockModal() { document.getElementById("stock-modal").style.display = "none"; }
async function addStock(e) { e.preventDefault(); try { const res = await fetch(`/api/products/${encodeURIComponent(editProductSku)}/add-stock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: document.getElementById("stock-qty").value }) }); if (res.ok) { showToast("เพิ่มสต็อกสำเร็จ", "success"); closeStockModal(); await loadData(); renderInventory(); } } catch (e) { showToast("ล้มเหลว", "error"); } }
async function saveProduct(e) { e.preventDefault(); const fd = new FormData(); fd.append("sku", document.getElementById("m-sku").value); fd.append("name", document.getElementById("m-name").value); fd.append("category", document.getElementById("m-cat").value); fd.append("price", document.getElementById("m-price").value); fd.append("stock", document.getElementById("m-stock").value); const imgFile = document.getElementById("m-img").files[0]; if (imgFile) fd.append("image", imgFile); const url = editProductSku ? `/api/products/${editProductSku}` : "/api/products"; try { const res = await fetch(url, { method: editProductSku ? "PUT" : "POST", body: fd }); if (res.ok) { showToast("บันทึกสำเร็จ"); closeModal(); await loadData(); renderInventory(); } } catch (error) { showToast("ล้มเหลว", "error"); } }
async function delProduct(sku) { if (!confirm(`ลบสินค้า [${sku}]?`)) return; try { const res = await fetch(`/api/products/${sku}`, { method: "DELETE" }); if (res.ok) { showToast("ลบสำเร็จ"); await loadData(); renderInventory(); } } catch (error) { showToast("ล้มเหลว", "error"); } }
async function openStockLogModal() { const content = document.getElementById("stock-log-content"); content.innerHTML = '<div style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</div>'; document.getElementById("stock-log-modal").style.display = "flex"; try { const logs = await fetchJson("/api/stock-logs"); content.innerHTML = logs.map(l => `<div style="border-bottom: 1px solid #eee; padding: 12px 0;"><div style="font-size: 0.8rem; color: #999;">${new Date(l.created_at).toLocaleString("th-TH")}</div><div style="display:flex; justify-content:space-between;"><strong>${l.product_name}</strong><span style="color:#059669; font-weight:800;">+${l.quantity}</span></div><div style="font-size:0.75rem; color:#64748b;">โดย ${l.user_name}</div></div>`).join("") || "ไม่มีประวัติ"; } catch (err) { content.innerHTML = "โหลดล้มเหลว"; } }

// --- Reports Page ---

function renderReports() {
  const orders = {}; sales.forEach(s => { if (!orders[s.order_id]) orders[s.order_id] = { id: s.order_id, cust: s.customer_name || "-", total: 0, date: s.sold_at, method: s.payment_method }; orders[s.order_id].total += Number(s.total); });
  const list = Object.values(orders).sort((a,b) => new Date(b.date) - new Date(a.date));

  document.getElementById("reports").innerHTML = `
    <div class="card"><h2><i class="fas fa-search"></i> ค้นหารายงาน</h2>
      <div class="grid" style="grid-template-columns: 1fr 1fr 1fr auto; gap: 10px;">
        <input type="date" id="rep-start" /><input type="date" id="rep-end" /><input type="text" id="rep-search" placeholder="เลขออเดอร์ / ลูกค้า" /><button onclick="filterReports()" class="btn-primary">ค้นหา</button>
      </div>
    </div>
    <div class="card" style="padding:0;"><div class="table-wrap"><table>
      <thead><tr><th>เลขออเดอร์</th><th>วันที่</th><th>ชำระโดย</th><th>ลูกค้า</th><th>ยอดรวม</th><th>ใบเสร็จ</th></tr></thead>
      <tbody>${list.map(o => `<tr><td style="font-family:monospace;">${o.id}</td><td>${new Date(o.date).toLocaleString("th-TH")}</td><td><span class="badge" style="background:#f3f4f6;">${o.method || 'cash'}</span></td><td>${o.cust}</td><td style="font-weight:700;">฿${o.total.toLocaleString()}</td>
      <td style="text-align:center;"><button onclick="generateReceiptPDF('${o.id}')" style="background:#10b981; color:white; border:none; padding:5px 10px; border-radius:6px; cursor:pointer;"><i class="fas fa-file-pdf"></i></button></td></tr>`).join("")}</tbody>
    </table></div></div>
  `;
}
async function filterReports() { const start = document.getElementById("rep-start").value, end = document.getElementById("rep-end").value, q = document.getElementById("rep-search").value; let url = `/api/sales?`; if (start) url += `start_date=${start}&`; if (end) url += `end_date=${end}&`; if (q) url += `search=${encodeURIComponent(q)}&`; sales = await fetchJson(url); renderReports(); }

// --- Customers & Prescription ---

function renderCustomers() {
  document.getElementById("customers").innerHTML = `
    <div class="card"><h2><i class="fas fa-user-plus"></i> จัดการลูกค้า</h2><form onsubmit="saveCustomer(event)"><div class="grid" style="grid-template-columns: 1fr 1fr auto; gap: 15px;">
      <input type="text" id="c-phone" placeholder="เบอร์โทรศัพท์" required /><input type="text" id="c-name" placeholder="ชื่อ-นามสกุล" required /><button type="submit" class="btn-primary" style="padding: 0 30px;">บันทึก</button>
    </div></form></div>
    <div class="card" style="margin-top: 20px;"><div class="table-wrap"><table><thead><tr><th>เบอร์โทรศัพท์</th><th>ชื่อลูกค้า</th><th style="text-align:center;">จัดการ</th></tr></thead><tbody>
      ${customers.map(c => `<tr><td style="font-weight:600; color:#7c3aed;">${c.phone}</td><td>${c.name}</td><td style="text-align:center;"><button onclick="viewCustomerHistory('${c.phone}')" style="background:#eff6ff; color:#2563eb; border:none; padding:8px 15px; border-radius:8px; cursor:pointer;"><i class="fas fa-history"></i> ประวัติ/ค่าสายตา</button></td></tr>`).join("")}
    </tbody></table></div></div>
    <div id="history-modal" class="modal" style="display: none;">
      <div class="modal-content" style="width: min(100%, 700px);">
        <div class="modal-header"><h2 id="history-title">ประวัติลูกค้า</h2><button onclick="document.getElementById('history-modal').style.display='none'" class="modal-close"><i class="fas fa-times"></i></button></div>
        <div id="history-content" style="padding: 24px; max-height: 500px; overflow-y: auto;"></div>
      </div>
    </div>
  `;
}
async function saveCustomer(e) { e.preventDefault(); await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: document.getElementById("c-phone").value, name: document.getElementById("c-name").value }) }); await loadData(); renderCustomers(); }
async function viewCustomerHistory(phone) {
  const cust = customers.find(x => x.phone === phone); if (!cust) return;
  const custSales = sales.filter(s => s.customer_phone === phone);
  document.getElementById("history-title").textContent = `ข้อมูลลูกค้า: ${cust.name}`;
  document.getElementById("history-content").innerHTML = `
    <div style="background:#f8fafc; padding:15px; border-radius:12px; margin-bottom:20px; border:1px solid #e2e8f0;"><strong>เบอร์โทร:</strong> ${cust.phone}</div>
    <h3>ประวัติการซื้อ</h3><hr/>
    ${custSales.map(s => `<div style="padding:10px 0; border-bottom:1px solid #eee; display:flex; justify-content:space-between;"><span>${new Date(s.sold_at).toLocaleDateString("th-TH")} - ${s.sku} x ${s.qty}</span><strong style="color:#7c3aed;">฿${Number(s.total).toLocaleString()}</strong></div>`).join("") || "ไม่มีประวัติการซื้อ"}
    <div style="margin-top:20px;"><h3>ค่าสายตา (Optical Prescription)</h3><hr/><p style="color:#94a3b8; font-style:italic;">ระบบบันทึกค่าสายตาพร้อมใช้งานในเวอร์ชันถัดไป</p></div>
  `;
  document.getElementById("history-modal").style.display = "flex";
}

// --- PDF & Receipt ---
async function generateReceiptPDF(orderId) { 
  const res = await fetch(`/api/orders/${orderId}`); if (!res.ok) return;
  const order = await res.json();
  showToast("กำลังสร้างใบเสร็จ...", "info");
  // Simple PDF generation using html2pdf
  const element = document.createElement("div"); element.style.padding = "40px";
  element.innerHTML = `<h1>ใบเสร็จรับเงิน</h1><p>เลขออเดอร์: ${order.order_id}</p><p>ลูกค้า: ${order.customer_name}</p><hr/>` + 
    order.items.map(i => `<div>${i.product_name} x ${i.qty} = ฿${Number(i.total).toLocaleString()}</div>`).join("") + 
    `<hr/><h3>ยอดรวมสุทธิ: ฿${order.items.reduce((s,i)=>s+Number(i.total), 0).toLocaleString()}</h3>`;
  html2pdf().from(element).save(`Receipt-${orderId}.pdf`);
}

async function generateSalesReportPDF(period) { showToast("ฟังก์ชันรายงาน PDF จะพร้อมใช้งานเร็วๆ นี้", "info"); }

// --- Init ---
async function init() { 
  if (!checkAuth()) return; 
  setupEventListeners(); 
  const success = await loadData(); 
  if (success) renderHome(); 
}
init();
