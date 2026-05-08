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
  } catch (error) { showToast("ไม่สามารถโหลดข้อมูลจากเซิร์ฟเวอร์ได้", "error"); return false; }
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
  const lowStockItems = products.filter(p => Number(p.stock) <= Number(settings.low_stock_threshold));
  const activeSales = sales.filter(s => !s.is_voided);
  const totalRevenue = activeSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const totalCost = activeSales.reduce((sum, s) => sum + (Number(s.qty) * Number(products.find(p=>p.sku===s.sku)?.cost || 0)), 0);
  const totalProfit = totalRevenue - totalCost;

  const today = new Date().toLocaleDateString();
  const todaySales = activeSales.filter(s => new Date(s.sold_at).toLocaleDateString() === today);
  const todayRevenue = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const todayCost = todaySales.reduce((sum, s) => sum + (Number(s.qty) * Number(products.find(p=>p.sku===s.sku)?.cost || 0)), 0);
  const todayProfit = todayRevenue - todayCost;

  const productSalesMap = {};
  activeSales.forEach(s => { productSalesMap[s.sku] = (productSalesMap[s.sku] || 0) + s.qty; });
  const topSelling = Object.entries(productSalesMap).map(([sku, qty]) => ({ sku, qty, name: products.find(p => p.sku === sku)?.name || sku })).sort((a, b) => b.qty - a.qty).slice(0, 5);

  document.getElementById("home").innerHTML = `
    <div class="dashboard-grid">
      <div class="metric-card">
        <div class="metric-top"><div><h3>ยอดขายวันนี้</h3></div><div class="icon-circle" style="background: #ecfdf5; color: #059669;"><i class="fas fa-coins"></i></div></div>
        <div class="value">฿${todayRevenue.toFixed(2)}</div>
        <p style="font-size: 0.85rem; color: #059669; font-weight: 600;">กำไร: ฿${todayProfit.toFixed(2)}</p>
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
        <div class="metric-top"><div><h3>ยอดรวมกำไร</h3></div><div class="icon-circle" style="background: #fdf2f8; color: #db2777;"><i class="fas fa-chart-line"></i></div></div>
        <div class="value">฿${totalProfit.toFixed(2)}</div>
        <p style="font-size: 0.85rem; color: #666; margin-top: 4px;">จากรายได้ ฿${totalRevenue.toLocaleString()}</p>
      </div>
    </div>

    <div class="card" style="margin-top: 1.5rem;">
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;">
        <div><h2><i class="fas fa-chart-area"></i> แนวโน้มยอดขาย (7 วันล่าสุด)</h2><div style="height: 300px;"><canvas id="salesChart"></canvas></div></div>
        <div><h2><i class="fas fa-chart-pie"></i> สัดส่วนการขาย</h2><div style="height: 300px;"><canvas id="categoryChart"></canvas></div></div>
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
          <button onclick="generateSalesReportPDF('today')" class="btn-secondary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #0ea5e9; color: white; border: none;"><i class="fas fa-calendar-day"></i><span>รายงานวันนี้ (PDF)</span></button>
          <button onclick="generateSalesReportPDF('month')" class="btn-secondary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #0369a1; color: white; border: none;"><i class="fas fa-calendar-alt"></i><span>รายงานรายเดือน (PDF)</span></button>
        </div>
      </div>
      <div class="card" style="margin: 0;">
        <h2><i class="fas fa-fire"></i> สินค้าขายดี</h2>
        <div style="margin-top: 1rem;">
          ${topSelling.map((p, i) => `<div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: ${i === 4 ? 'none' : '1px solid #eee'};"><div style="width: 24px; height: 24px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">${i+1}</div><div style="flex: 1;"><div>${p.name}</div><div style="font-size: 0.75rem; color: #666;">รหัส: ${p.sku}</div></div><div style="font-weight: bold; color: #6366f1;">${p.qty} ชิ้น</div></div>`).join("") || "ยังไม่มีข้อมูล"}
        </div>
      </div>
      <div class="card" style="margin: 0;">
        <h2><i class="fas fa-receipt"></i> การขายล่าสุด</h2>
        <div style="margin-top: 1rem;">
          ${[...new Map(activeSales.map(item => [item.order_id, item])).values()].slice(0, 5).map((s, i) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: ${i === 4 ? 'none' : '1px solid #f1f5f9'};">
              <div><div style="font-weight: 600; font-size: 0.9rem;">${s.order_id}</div><div style="font-size: 0.75rem; color: #64748b;">${new Date(s.sold_at).toLocaleTimeString('th-TH')}</div></div>
              <div style="text-align: right;"><div style="font-weight: 700; color: #059669;">฿${Number(s.total).toLocaleString()}</div><div style="font-size: 0.7rem; color: #94a3b8;">${s.customer_name || 'ลูกค้าทั่วไป'}</div></div>
            </div>`).join("") || "ยังไม่มีข้อมูล"}
        </div>
      </div>
    </div>
  `;
  renderCharts();
}

function renderCharts() { renderSalesChart(); renderCategoryChart(); }

function renderSalesChart() {
  const ctx = document.getElementById('salesChart'); if (!ctx) return;
  const labels = []; const dataPoints = [];
  const activeSales = sales.filter(s => !s.is_voided);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); const dateStr = d.toLocaleDateString();
    labels.push(d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
    const daySales = activeSales.filter(s => new Date(s.sold_at).toLocaleDateString() === dateStr);
    dataPoints.push(daySales.reduce((sum, s) => sum + Number(s.total || 0), 0));
  }
  if (window.mySalesChart) window.mySalesChart.destroy();
  window.mySalesChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{ label: 'ยอดขาย', data: dataPoints, borderColor: '#7c3aed', backgroundColor: 'rgba(124, 58, 237, 0.1)', fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}

function renderCategoryChart() {
  const ctx = document.getElementById('categoryChart'); if (!ctx) return;
  const catMap = {}; sales.filter(s=>!s.is_voided).forEach(s => { const p = products.find(prod => prod.sku === s.sku); const cat = p?.category || 'ทั่วไป'; catMap[cat] = (catMap[cat] || 0) + Number(s.total); });
  const labels = Object.keys(catMap); const data = Object.values(catMap);
  if (window.myCatChart) window.myCatChart.destroy();
  window.myCatChart = new Chart(ctx, { type: 'doughnut', data: { labels: labels, datasets: [{ data: data, backgroundColor: ['#7c3aed', '#059669', '#0284c7', '#ea580c', '#db2777'] }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } } });
}

async function updateThreshold() {
  const val = parseInt(document.getElementById("threshold").value);
  await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ low_stock_threshold: val }) });
  showToast("บันทึกเรียบร้อย"); await loadData(); renderHome();
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
        <div id="pos-product-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-top: 1rem; max-height: 500px; overflow-y: auto;">
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
        <button onclick="checkout()" class="btn-primary" style="width: 100%; margin-top: 1.5rem; padding: 18px; font-size: 1.2rem; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(124, 58, 237, 0.3);"><i class="fas fa-check"></i> ชำระเงิน</button>
      </div>
    </div>
  `;
  renderCart();
}

function renderPOSProductList(items) {
  return items.map(p => `
    <div onclick="addToCart('${p.sku}')" style="border: 1px solid #eee; padding: 12px; border-radius: 16px; cursor: pointer; text-align: center; background: white; transition: 0.2s; position: relative;" onmouseover="this.style.borderColor='#7c3aed'; this.style.transform='translateY(-3px)';" onmouseout="this.style.borderColor='#f0f0f0'; this.style.transform='translateY(0)'">
      <img src="${p.image || 'https://via.placeholder.com/150?text=?'}" style="width: 100%; height: 110px; object-fit: cover; border-radius: 12px;" />
      <div style="font-weight: 600; margin-top: 10px; font-size: 0.9rem; height: 2.4rem; overflow: hidden; line-height: 1.2;">${p.name}</div>
      <div style="color: #7c3aed; font-weight: 700; font-size: 1.1rem; margin-top: 5px;">฿${Number(p.price).toLocaleString()}</div>
      <div style="font-size: 0.75rem; color: #6b7280;">คลัง: ${p.stock}</div>
    </div>`).join("");
}

function handlePOSSearch(val) { const filtered = products.filter(p => p.name.toLowerCase().includes(val.toLowerCase()) || p.sku.toLowerCase().includes(val.toLowerCase())); document.getElementById("pos-product-grid").innerHTML = renderPOSProductList(filtered); }
function handlePOSCustomer(phone) { const c = customers.find(x => x.phone === phone); const info = document.getElementById("pos-cust-info"); if (c) info.innerHTML = `<i class="fas fa-user-check"></i> ลูกค้าประจำ: ${c.name}`; else if (phone.length>=9) info.innerHTML = `<i class="fas fa-user-plus"></i> ลูกค้าใหม่: จะบันทึกเมื่อขายเสร็จ`; else info.textContent = ""; }
function filterPOSByCategory(cat) { document.querySelectorAll(".btn-category").forEach(btn => btn.classList.remove("active")); const filtered = cat === "" ? products : products.filter(p => p.category === cat); document.getElementById("pos-product-grid").innerHTML = renderPOSProductList(filtered); }
function addToCart(sku) { const p = products.find(x => x.sku === sku); if (!p) return; const item = cart.find(x => x.sku === sku); if (item) { if (item.qty + 1 > p.stock) return showToast("สต็อกไม่พอ", "warning"); item.qty++; } else { if (p.stock < 1) return showToast("สินค้าหมด", "error"); cart.push({ sku, name: p.name, price: Number(p.price), qty: 1 }); } renderCart(); }
function renderCart() {
  let sub = 0, disc = 0;
  const html = cart.map((item, i) => {
    const promo = promotions.filter(p => p.is_active).find(pr => { const skus = pr.applicable_skus ? pr.applicable_skus.split(",").map(s => s.trim()) : []; return (skus.length === 0 || skus.includes(item.sku)) && item.qty >= pr.min_qty; });
    let itemDisc = promo ? (promo.discount_type === "fixed" ? Number(promo.discount_value) : (item.price * Number(promo.discount_value) / 100)) : 0;
    sub += item.price * item.qty; disc += itemDisc * item.qty;
    return `<div style="display: flex; justify-content: space-between; margin-bottom: 10px; align-items: center; background:#f8fafc; padding:8px; border-radius:12px;">
      <div style="flex:1;"><div style="font-weight:600; font-size:0.85rem;">${item.name}</div><div style="font-size:0.75rem; color:#999;">฿${item.price.toLocaleString()} x ${item.qty}</div></div>
      <div style="font-weight:700; margin-right:10px; color:#7c3aed;">฿${((item.price - itemDisc) * item.qty).toLocaleString()}</div>
      <button onclick="removeFromCart(${i})" style="color: #ef4444; border: none; background: none; cursor: pointer; font-size:1.1rem;"><i class="fas fa-times"></i></button>
    </div>`;
  }).join("");
  document.getElementById("cart-list").innerHTML = html || `<div style="text-align:center; color:#94a3b8; padding:40px;">ตะกร้าว่าง</div>`;
  document.getElementById("sub-val").textContent = sub.toLocaleString(); document.getElementById("disc-val").textContent = disc.toLocaleString(); document.getElementById("total-val").textContent = (sub - disc).toLocaleString();
}
function removeFromCart(idx) { cart.splice(idx, 1); renderCart(); }

async function checkout() {
  if (cart.length === 0) return showToast("กรุณาเลือกสินค้า", "warning");
  const sub = cart.reduce((s, i) => s + (i.price * i.qty), 0);
  const total = sub - cart.reduce((sum, item) => {
    const promo = promotions.filter(p => p.is_active).find(pr => { const skus = pr.applicable_skus ? pr.applicable_skus.split(",").map(s => s.trim()) : []; return (skus.length === 0 || skus.includes(item.sku)) && item.qty >= pr.min_qty; });
    return sum + (promo ? (promo.discount_type === "fixed" ? Number(promo.discount_value) : (item.price * Number(promo.discount_value) / 100)) : 0) * item.qty;
  }, 0);

  let modal = document.getElementById("payment-modal"); if (!modal) { modal = document.createElement("div"); modal.id = "payment-modal"; modal.className = "modal"; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div class="modal-content" style="width: min(100%, 450px);">
      <div class="modal-header" style="background:#fdf2f8;"><h2>ชำระเงิน</h2><button onclick="document.getElementById('payment-modal').style.display='none'" class="modal-close">x</button></div>
      <div style="padding: 24px;">
        <div style="text-align: center; margin-bottom: 20px; background: #f8fafc; padding: 15px; border-radius: 16px;">
          <div style="font-size: 0.9rem; color: #64748b;">ยอดสุทธิ</div>
          <div style="font-size: 2.2rem; font-weight: 800; color: #7c3aed;">฿${total.toLocaleString()}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px;">
          ${['cash', 'qr', 'transfer'].map(m => `<label style="display:block; text-align:center; border:2px solid #e2e8f0; padding:10px; border-radius:12px; cursor:pointer;"><input type="radio" name="pay-method" value="${m}" ${m==='cash'?'checked':''} /><br/><span style="font-weight:700;">${m.toUpperCase()}</span></label>`).join('')}
        </div>
        <input type="number" id="pay-received" placeholder="รับเงินมา (บาท)" style="width: 100%; padding: 15px; font-size: 1.8rem; text-align: center; border-radius:16px; border:2px solid #e2e8f0; font-weight:800;" oninput="calculateChange(${total})" />
        <div id="pay-change" style="text-align: right; margin-top: 10px; font-weight: 700; color: #059669; font-size: 1.3rem;">เงินทอน: ฿0.00</div>
      </div>
      <div class="modal-footer"><button onclick="finalizeCheckout(${total})" class="btn-primary" style="width: 100%; padding: 15px; font-size:1.1rem; border-radius:12px;">ยืนยันการชำระเงิน</button></div>
    </div>
  `;
  modal.style.display = "flex";
  setTimeout(() => document.getElementById("pay-received").focus(), 100);
}

function calculateChange(total) {
  const received = parseFloat(document.getElementById("pay-received").value) || 0;
  document.getElementById("pay-change").textContent = `เงินทอน: ฿${Math.max(0, received - total).toLocaleString(undefined, {minimumFractionDigits:2})}`;
}

async function finalizeCheckout(totalAmount) {
  const method = document.querySelector('input[name="pay-method"]:checked').value;
  const received = parseFloat(document.getElementById("pay-received").value) || 0;
  if (method === "cash" && received < totalAmount) return showToast("ยอดเงินไม่พอ", "warning");
  const btn = event.target.closest('button'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...';
  try {
    const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cart, customer_phone: document.getElementById("pos-customer").value, payment_method: method }) });
    if (res.ok) { const data = await res.json(); showToast("ขายสำเร็จ", "success"); document.getElementById("payment-modal").style.display = "none"; generateReceiptPDF(data.order_id); cart = []; await loadData(); renderPOS(); }
    else { const err = await res.json(); showToast(err.error || "ล้มเหลว", "error"); btn.disabled = false; btn.innerHTML = "ยืนยันการชำระเงิน"; }
  } catch (e) { showToast("ไม่สามารถติดต่อเซิร์ฟเวอร์ได้", "error"); btn.disabled = false; btn.innerHTML = "ยืนยันการชำระเงิน"; }
}

// --- Inventory Page ---

function renderInventory() {
  document.getElementById("inventory").innerHTML = `
    <div style="display: flex; justify-content: space-between; margin-bottom: 24px; align-items: center; gap:15px; flex-wrap:wrap;">
      <div style="display: flex; gap: 10px;">
        <button onclick="openAddProductModal()" class="btn-primary" style="display:flex; align-items:center; gap:8px;"><i class="fas fa-plus-circle"></i> เพิ่มสินค้า</button>
        <button onclick="openStockLogModal()" style="background: #f1f5f9; padding: 10px 20px; border-radius: 12px; cursor: pointer; border: 1px solid #ddd; font-weight:600; display:flex; align-items:center; gap:8px;"><i class="fas fa-history"></i> ประวัติสต็อก</button>
      </div>
      <div style="flex:1; max-width:400px; position:relative;">
        <input type="text" id="inv-search" placeholder="ค้นหาชื่อหรือรหัส (SKU)..." oninput="inventorySearchQuery=this.value; renderInventoryRows();" style="width: 100%; padding-left:40px; border-radius:12px;" />
        <span style="position:absolute; left:15px; top:50%; transform:translateY(-50%); color:#94a3b8;"><i class="fas fa-search"></i></span>
      </div>
    </div>
    <div class="card" style="padding: 0; overflow: hidden; border:none; box-shadow: var(--shadow);">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>รูปภาพ</th><th>รหัส (SKU)</th><th>ชื่อสินค้า</th><th>หมวดหมู่</th><th style="text-align: right;">ราคาขาย</th><th style="text-align: center;">สต็อก</th><th style="width:160px; text-align: center;">จัดการ</th></tr>
          </thead>
          <tbody id="inv-tbody"></tbody>
        </table>
      </div>
    </div>
    <div id="inv-modal" class="modal" style="display: none;"><div class="modal-content"><div class="modal-header"><h2 id="modal-title">ข้อมูลสินค้า</h2><button onclick="closeModal()">x</button></div>
      <form onsubmit="saveProduct(event)"><div style="padding: 24px;" class="grid">
        <label>SKU<input type="text" id="m-sku" required /></label>
        <label>ชื่อสินค้า<input type="text" id="m-name" required /></label>
        <label>หมวดหมู่<select id="m-cat">${productTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join("")}</select></label>
        <label>ราคาขาย<input type="number" id="m-price" required step="0.01" /></label>
        <label>สต็อก<input type="number" id="m-stock" required /></label>
        <label>ต้นทุน<input type="number" id="m-cost" step="0.01" /></label>
        <label>รูปภาพ<input type="file" id="m-img" accept="image/*" /></label>
      </div><div class="modal-footer"><button type="submit" class="btn-primary">บันทึก</button></div></form>
    </div></div>
    <div id="stock-modal" class="modal" style="display: none;"><div class="modal-content" style="width: min(100%, 400px);"><div class="modal-header" style="background:#ecfdf5;"><h2>เพิ่มสต็อก</h2><button onclick="closeStockModal()">x</button></div>
      <form onsubmit="addStock(event)"><div id="stock-product-info" style="padding: 20px; background:#f8fafc; border-bottom:1px solid #eee;"></div><div style="padding: 24px;"><input type="number" id="stock-qty" required placeholder="จำนวนที่เพิ่ม" style="width: 100%; text-align: center; font-size: 2.2rem; border: 2px solid #7c3aed; border-radius: 16px; color:#7c3aed; font-weight:800;" /></div>
      <div class="modal-footer"><button type="submit" class="btn-primary" style="width: 100%; padding: 15px; background:#059669; border-radius:12px;">ยืนยันการเพิ่ม</button></div></form>
    </div></div>
    <div id="stock-log-modal" class="modal" style="display: none;"><div class="modal-content" style="width: min(100%, 650px);"><div class="modal-header"><h2>ประวัติการนำเข้าสินค้า</h2><button onclick="document.getElementById('stock-log-modal').style.display='none'">x</button></div>
      <div id="stock-log-content" style="padding: 20px; max-height: 500px; overflow-y: auto;"></div>
    </div></div>
  `;
  renderInventoryRows();
}

function renderInventoryRows() {
  const q = inventorySearchQuery.toLowerCase();
  const filtered = products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  document.getElementById("inv-tbody").innerHTML = filtered.map(p => `<tr>
    <td style="text-align: center;"><img src="${p.image || 'https://via.placeholder.com/50?text=?'}" style="width: 48px; height: 48px; border-radius: 10px; object-fit: cover; border: 1px solid #eee;" /></td>
    <td style="font-family: monospace; font-weight: 700;">${p.sku}</td><td>${p.name}</td><td><span class="badge" style="background: #eff6ff; color: #2563eb;">${p.category || 'ทั่วไป'}</span></td><td style="text-align: right; font-weight: 700; color: #7c3aed;">฿${Number(p.price).toLocaleString()}</td>
    <td style="text-align: center;"><div style="display:flex; flex-direction:column; gap:4px; align-items:center;"><span class="status-badge ${p.stock <= settings.low_stock_threshold ? 'status-low-stock' : 'status-in-stock'}" style="font-weight:800;">${p.stock}</span><div style="width:60px; height:4px; background:#e2e8f0; border-radius:2px; overflow:hidden;"><div style="width:${Math.min(100, (p.stock/50)*100)}%; height:100%; background:${p.stock <= settings.low_stock_threshold ? '#ef4444' : '#059669'}; transition:width 0.5s ease;"></div></div></div></td>
    <td style="text-align: center;"><div style="display: flex; gap: 8px; justify-content: center;">
      <button onclick="openAddStockModal('${p.sku}')" style="background: #ecfdf5; color: #059669; padding: 8px; border-radius: 10px; border: none; cursor: pointer;"><i class="fas fa-plus"></i></button>
      <button onclick="editProduct('${p.sku}')" style="background: #eff6ff; color: #2563eb; padding: 8px; border-radius: 10px; border: none; cursor: pointer;"><i class="fas fa-edit"></i></button>
      <button onclick="delProduct('${p.sku}')" style="background: #fef2f2; color: #ef4444; padding: 8px; border-radius: 10px; border: none; cursor: pointer;"><i class="fas fa-trash-alt"></i></button>
    </div></td></tr>`).join("");
}

function openAddProductModal() { editProductSku = null; document.getElementById("modal-title").textContent = "เพิ่มสินค้าใหม่"; document.getElementById("m-sku").value = ""; document.getElementById("m-sku").readOnly = false; document.getElementById("m-name").value = ""; document.getElementById("m-price").value = ""; document.getElementById("m-stock").value = ""; document.getElementById("inv-modal").style.display = "flex"; }
function editProduct(sku) { const p = products.find(x => x.sku === sku); if (!p) return; editProductSku = sku; document.getElementById("modal-title").textContent = "แก้ไขข้อมูลสินค้า"; document.getElementById("m-sku").value = p.sku; document.getElementById("m-sku").readOnly = true; document.getElementById("m-name").value = p.name; document.getElementById("m-price").value = p.price; document.getElementById("m-stock").value = p.stock; document.getElementById("m-cat").value = p.category || ""; document.getElementById("m-cost").value = p.cost || 0; document.getElementById("inv-modal").style.display = "flex"; }
function closeModal() { document.getElementById("inv-modal").style.display = "none"; }
function openAddStockModal(sku) { const p = products.find(x => x.sku === sku); if (!p) return; editProductSku = sku; const modal = document.getElementById("stock-modal"); document.getElementById("stock-product-info").innerHTML = `<div style="display:flex; gap:12px; align-items:center;"><img src="${p.image || 'https://via.placeholder.com/50'}" style="width:50px; height:50px; border-radius:8px; object-fit:cover;" /><div><div style="font-weight:700; color:#1e293b;">${p.name}</div><div style="font-size:0.8rem; color:#64748b;">SKU: ${p.sku} | ปัจจุบัน: <span style="font-weight:800; color:#7c3aed;">${p.stock}</span></div></div></div>`; document.getElementById("stock-qty").value = ""; modal.style.display = "flex"; setTimeout(() => document.getElementById("stock-qty").focus(), 100); }
function closeStockModal() { document.getElementById("stock-modal").style.display = "none"; }
async function addStock(e) { e.preventDefault(); const qty = document.getElementById("stock-qty").value; try { const res = await fetch(`/api/products/${encodeURIComponent(editProductSku)}/add-stock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: qty }) }); if (res.ok) { showToast(`เพิ่มสำเร็จ (+${qty})`, "success"); closeStockModal(); await loadData(); renderInventory(); } } catch (e) { showToast("ล้มเหลว", "error"); } }
async function saveProduct(e) { e.preventDefault(); const fd = new FormData(); fd.append("sku", document.getElementById("m-sku").value); fd.append("name", document.getElementById("m-name").value); fd.append("category", document.getElementById("m-cat").value); fd.append("price", document.getElementById("m-price").value); fd.append("stock", document.getElementById("m-stock").value); fd.append("cost", document.getElementById("m-cost").value); const imgFile = document.getElementById("m-img").files[0]; if (imgFile) fd.append("image", imgFile); const url = editProductSku ? `/api/products/${editProductSku}` : "/api/products"; try { const res = await fetch(url, { method: editProductSku ? "PUT" : "POST", body: fd }); if (res.ok) { showToast("สำเร็จ"); closeModal(); await loadData(); renderInventory(); } } catch (error) { showToast("ล้มเหลว", "error"); } }
async function delProduct(sku) { if (!confirm(`ยืนยันการลบ [${sku}]?`)) return; try { const res = await fetch(`/api/products/${sku}`, { method: "DELETE" }); if (res.ok) { showToast("ลบสำเร็จ"); await loadData(); renderInventory(); } } catch (error) { showToast("ล้มเหลว", "error"); } }
async function openStockLogModal() { const content = document.getElementById("stock-log-content"); content.innerHTML = '<div style="text-align:center;"><i class="fas fa-circle-notch fa-spin"></i></div>'; document.getElementById("stock-log-modal").style.display = "flex"; try { const logs = await fetchJson("/api/stock-logs"); content.innerHTML = `<table style="width:100%; border-collapse:collapse; font-size:0.9rem;"><thead style="background:#f8fafc;"><tr><th style="padding:12px; text-align:left;">วันที่/เวลา</th><th style="padding:12px; text-align:left;">สินค้า</th><th style="padding:12px; text-align:center;">จำนวน</th><th style="padding:12px; text-align:right;">โดย</th></tr></thead><tbody>${logs.map(l => `<tr style="border-bottom:1px solid #f8fafc;"><td style="padding:12px; color:#64748b;">${new Date(l.created_at).toLocaleString("th-TH")}</td><td style="padding:12px; font-weight:600;">${l.product_name || l.sku}</td><td style="padding:12px; text-align:center; font-weight:800; color:#059669;">+${l.quantity}</td><td style="padding:12px; text-align:right; color:#64748b;">${l.user_name}</td></tr>`).join("")}</tbody></table>` || "ไม่มีประวัติ"; } catch (err) { content.innerHTML = "ล้มเหลว"; } }

// --- Reports Page ---

function renderReports() {
  const orders = {}; sales.forEach(s => { if (!orders[s.order_id]) orders[s.order_id] = { id: s.order_id, cust: s.customer_name || "-", total: 0, date: s.sold_at, method: s.payment_method, is_voided: s.is_voided }; orders[s.order_id].total += Number(s.total); });
  const list = Object.values(orders).sort((a,b) => new Date(b.date) - new Date(a.date));
  const activeSales = sales.filter(s => !s.is_voided);

  document.getElementById("reports").innerHTML = `
    <div class="card"><h2><i class="fas fa-search"></i> ค้นหารายงาน</h2>
      <div class="grid" style="grid-template-columns: 1fr 1fr 1fr auto; gap: 10px;">
        <input type="date" id="rep-start" /><input type="date" id="rep-end" /><input type="text" id="rep-search" placeholder="เลขออเดอร์หรือชื่อลูกค้า..." /><button onclick="filterReports()" class="btn-primary" style="padding: 0 30px;">ค้นหา</button>
      </div>
    </div>
    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top:1.5rem; margin-bottom:1.5rem;">
      <div class="metric-card" style="padding:15px; border-left:5px solid #059669;">ยอดขายรวม (ปกติ): ฿${list.filter(o=>!o.is_voided).reduce((sum,o)=>sum+o.total, 0).toLocaleString(undefined, {minimumFractionDigits:2})}</div>
      <div class="metric-card" style="padding:15px; border-left:5px solid #7c3aed;">กำไรเบื้องต้น (ปกติ): ฿${activeSales.reduce((sum, s) => sum + (Number(s.total) - (Number(s.qty) * Number(products.find(p=>p.sku===s.sku)?.cost || 0))), 0).toLocaleString(undefined, {minimumFractionDigits:2})}</div>
    </div>
    <div class="card" style="padding: 0; overflow: hidden; border:none; box-shadow: var(--shadow);">
      <div class="table-wrap"><table>
        <thead style="background:#f8fafc;"><tr><th>เลขออเดอร์</th><th>วันที่/เวลา</th><th>ชำระโดย</th><th>ลูกค้า</th><th style="text-align:right;">ยอดรวมสุทธิ</th><th style="text-align:center;">จัดการ</th></tr></thead>
        <tbody>${list.map(o => `
          <tr style="${o.is_voided ? 'opacity:0.5; text-decoration:line-through; background:#f9fafb;' : ''}">
            <td style="font-family:monospace; font-weight:700;">${o.id} ${o.is_voided ? '<span style="color:red; font-size:10px;">[ยกเลิกแล้ว]</span>' : ''}</td>
            <td>${new Date(o.date).toLocaleString("th-TH")}</td>
            <td><span class="badge" style="background:#f1f5f9; color:#475569;">${o.method || 'cash'}</span></td>
            <td>${o.cust}</td>
            <td style="text-align:right; font-weight:700;">฿${o.total.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td style="text-align:center;"><div style="display:flex; gap:5px; justify-content:center;">
              <button onclick="generateReceiptPDF('${o.id}')" style="background:#10b981; color:white; border:none; padding:6px 12px; border-radius:8px; cursor:pointer;"><i class="fas fa-file-pdf"></i></button>
              ${(!o.is_voided && currentUser.role === 'admin') ? `<button onclick="voidOrder('${o.id}')" style="background:#ef4444; color:white; border:none; padding:6px 12px; border-radius:8px; cursor:pointer;"><i class="fas fa-ban"></i></button>` : ''}
            </div></td></tr>`).join("")}
        </tbody></table></div></div>
  `;
}

async function voidOrder(orderId) {
  if (!confirm(`⚠️ ยืนยันการยกเลิกออเดอร์ [${orderId}]?\nการยกเลิกจะคืนสต็อกสินค้าและหักยอดขายออกจากระบบ (ทำย้อนกลับไม่ได้)`)) return;
  try {
    const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
    if (res.ok) { showToast("ยกเลิกเรียบร้อย", "success"); await loadData(); renderReports(); }
    else { const err = await res.json(); showToast(err.error || "ล้มเหลว", "error"); }
  } catch (e) { showToast("การเชื่อมต่อขัดข้อง", "error"); }
}

async function filterReports() {
  const start = document.getElementById("rep-start").value;
  const end = document.getElementById("rep-end").value;
  const q = document.getElementById("rep-search").value;
  let url = `/api/sales?`;
  if (start) url += `start_date=${start}&`;
  if (end) url += `end_date=${end}&`;
  if (q) url += `search=${encodeURIComponent(q)}&`;
  sales = await fetchJson(url); renderReports();
}

// --- Customers & Prescription ---

function renderCustomers() {
  document.getElementById("customers").innerHTML = `
    <div class="card"><h2><i class="fas fa-user-plus"></i> จัดการลูกค้า</h2><form onsubmit="saveCustomer(event)"><div class="grid" style="grid-template-columns: 1fr 1fr auto; gap:15px;"><input type="text" id="c-phone" placeholder="เบอร์โทรศัพท์" required /><input type="text" id="c-name" placeholder="ชื่อ-นามสกุลลูกค้า" required /><button type="submit" class="btn-primary" style="padding:0 40px;">บันทึก</button></div></form></div>
    <div class="card" style="margin-top:24px; padding:0; overflow:hidden; border:none; box-shadow:var(--shadow);"><div class="table-wrap"><table><thead><tr><th>เบอร์โทรศัพท์</th><th>ชื่อลูกค้า</th><th style="text-align:center;">จัดการ</th></tr></thead><tbody>${customers.map(c => `<tr><td style="font-weight:700; color:#7c3aed;">${c.phone}</td><td style="font-weight:600;">${c.name}</td><td style="text-align:center;"><button onclick="viewCustomerHistory('${c.phone}')" style="background:#eff6ff; color:#2563eb; border:none; padding:8px 16px; border-radius:10px; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:6px; margin:auto;"><i class="fas fa-history"></i> ประวัติ/ค่าสายตา</button></td></tr>`).join("")}</tbody></table></div></div>
    <div id="history-modal" class="modal" style="display: none;"><div class="modal-content" style="width: min(100%, 700px);"><div class="modal-header"><h2 id="history-title">ข้อมูลลูกค้า</h2><button onclick="document.getElementById('history-modal').style.display='none'" class="modal-close">x</button></div>
    <div id="history-content" style="padding:24px; max-height:550px; overflow-y:auto;"></div></div></div>
  `;
}
async function saveCustomer(e) { e.preventDefault(); try { const res = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: document.getElementById("c-phone").value, name: document.getElementById("c-name").value }) }); if (res.ok) { showToast("สำเร็จ"); await loadData(); renderCustomers(); } } catch (err) { showToast("ล้มเหลว", "error"); } }

async function viewCustomerHistory(phone) {
  const cust = customers.find(x => x.phone === phone); if (!cust) return;
  const modal = document.getElementById("history-modal"); const content = document.getElementById("history-content");
  modal.querySelector("h2").innerHTML = `<i class="fas fa-user-tag"></i> ข้อมูลลูกค้า: ${cust.name}`;
  content.innerHTML = `
    <style>
      .tab-btn { padding:10px 20px; border:none; background:none; cursor:pointer; font-weight:600; color:#64748b; border-bottom:2px solid transparent; transition:0.2s; }
      .tab-btn.active { color:#7c3aed; border-bottom-color:#7c3aed; background:#f5f3ff; border-radius:8px 8px 0 0; }
    </style>
    <div style="display:flex; gap:10px; margin-bottom:20px; border-bottom:2px solid #f1f5f9; padding-bottom:10px;">
      <button onclick="switchHistoryTab('sales', '${phone}')" id="tab-sales" class="tab-btn active">ประวัติการซื้อ</button>
      <button onclick="switchHistoryTab('pres', '${phone}')" id="tab-pres" class="tab-btn">ค่าสายตา (Prescription)</button>
    </div>
    <div id="tab-content-area"></div>
  `;
  switchHistoryTab('sales', phone); modal.style.display = "flex";
}

async function switchHistoryTab(tab, phone) {
  const contentArea = document.getElementById("tab-content-area");
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`tab-${tab}`).classList.add("active");
  if (tab === 'sales') {
    const custSales = sales.filter(s => s.customer_phone === phone);
    contentArea.innerHTML = custSales.map(s => `<div style="padding:12px 15px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; background:white; border-radius:12px; margin-bottom:8px; ${s.is_voided ? 'opacity:0.5; text-decoration:line-through;' : ''}"><div><div style="font-weight:600;">${new Date(s.sold_at).toLocaleDateString("th-TH")} - ${s.sku}</div><div style="font-size:0.8rem; color:#64748b;">${s.qty} ชิ้น | ออเดอร์: ${s.order_id}</div></div><strong style="color:#7c3aed;">฿${Number(s.total).toLocaleString()}</strong></div>`).join("") || "ไม่มีประวัติการซื้อ";
  } else {
    contentArea.innerHTML = 'กำลังโหลด...';
    try {
      const presList = await fetchJson(`/api/customers/${phone}/prescriptions`);
      const cust = customers.find(x => x.phone === phone);
      let html = `<button onclick="openAddPrescriptionModal(${cust.id}, '${phone}')" class="btn-primary" style="width:100%; margin-bottom:20px; background:#059669;"><i class="fas fa-plus-circle"></i> เพิ่มค่าสายตาใหม่</button>`;
      html += presList.map(p => `
        <div style="border:1px solid #e2e8f0; border-radius:16px; margin-bottom:15px; padding:15px; background:white; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:10px;"><strong><i class="far fa-calendar-alt"></i> ${new Date(p.created_at).toLocaleDateString("th-TH")}</strong>
            <div style="display:flex; gap:10px;"><button onclick="generatePrescriptionPDF(${p.id}, '${phone}')" style="background:#eff6ff; color:#2563eb; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;"><i class="fas fa-print"></i> พิมพ์</button><button onclick="deletePrescription(${p.id}, '${phone}')" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fas fa-trash-alt"></i></button></div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
            <div style="background:#f8fafc; padding:10px; border-radius:12px;"><strong>ขวา (R)</strong><br/>Sph: ${p.sph_r}<br/>Cyl: ${p.cyl_r}<br/>Axis: ${p.axis_r}</div>
            <div style="background:#f8fafc; padding:10px; border-radius:12px;"><strong>ซ้าย (L)</strong><br/>Sph: ${p.sph_l}<br/>Cyl: ${p.cyl_l}<br/>Axis: ${p.axis_l}</div>
          </div>
          <div style="margin-top:12px; display:flex; gap:20px; font-size:0.85rem; background:#f0fdf4; padding:8px 15px; border-radius:10px;"><span>ADD: ${p.add_val}</span><span>PD: ${p.pd}</span></div>
          ${p.note ? `<div style="margin-top:10px; font-size:0.8rem; color:#64748b;">บันทึก: ${p.note}</div>` : ''}
        </div>`).join("") || "ยังไม่มีบันทึก";
      contentArea.innerHTML = html;
    } catch (e) { contentArea.innerHTML = "ล้มเหลว"; }
  }
}

function openAddPrescriptionModal(customerId, phone) {
  let subModal = document.getElementById("pres-modal"); if (!subModal) { subModal = document.createElement("div"); subModal.id = "pres-modal"; subModal.className = "modal"; subModal.style.zIndex = "2000"; document.body.appendChild(subModal); }
  subModal.innerHTML = `<div class="modal-content" style="width: min(100%, 500px);"><div class="modal-header" style="background:#ecfdf5;"><h2>บันทึกค่าสายตา</h2><button onclick="document.getElementById('pres-modal').style.display='none'">x</button></div>
    <form onsubmit="savePrescription(event, ${customerId}, '${phone}')"><div style="padding:24px;"><div class="grid" style="grid-template-columns:1fr 1fr; gap:20px;">
      <div style="background:#f5f3ff; padding:15px; border-radius:16px;"><h4>ตาขวา (R)</h4><label>Sph<input id="pr-sph-r" /></label><label>Cyl<input id="pr-cyl-r" /></label><label>Axis<input id="pr-axis-r" /></label></div>
      <div style="background:#f0f9ff; padding:15px; border-radius:16px;"><h4>ตาซ้าย (L)</h4><label>Sph<input id="pr-sph-l" /></label><label>Cyl<input id="pr-cyl-l" /></label><label>Axis<input id="pr-axis-l" /></label></div>
    </div><div class="grid" style="grid-template-columns:1fr 1fr; gap:20px;"><label>ADD<input id="pr-add" /></label><label>PD<input id="pr-pd" /></label></div><label>บันทึก<textarea id="pr-note" rows="2"></textarea></label></div>
    <div class="modal-footer"><button type="submit" class="btn-primary" style="background:#059669; width:100%;">บันทึกข้อมูล</button></div></form></div>`;
  subModal.style.display = "flex";
}
async function savePrescription(e, customerId, phone) { e.preventDefault(); const data = { customer_id: customerId, sph_r: document.getElementById("pr-sph-r").value, cyl_r: document.getElementById("pr-cyl-r").value, axis_r: document.getElementById("pr-axis-r").value, sph_l: document.getElementById("pr-sph-l").value, cyl_l: document.getElementById("pr-cyl-l").value, axis_l: document.getElementById("pr-axis-l").value, add_val: document.getElementById("pr-add").value, pd: document.getElementById("pr-pd").value, note: document.getElementById("pr-note").value }; await fetch("/api/prescriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); document.getElementById("pres-modal").style.display = "none"; switchHistoryTab('pres', phone); }
async function deletePrescription(id, phone) { if (confirm("ลบ?")) { await fetch(`/api/prescriptions/${id}`, { method: "DELETE" }); switchHistoryTab('pres', phone); } }

// --- PDF & Receipt ---

async function generatePrescriptionPDF(id, phone) {
  try {
    const presList = await fetchJson(`/api/customers/${phone}/prescriptions`);
    const p = presList.find(x => x.id === id); const cust = customers.find(x => x.phone === phone);
    const element = document.createElement("div"); element.style.padding = "40px";
    element.innerHTML = `<h1>ใบค่าสายตา</h1><p>ลูกค้า: ${cust.name}</p><hr/>` + `<p>ตาขวา: Sph ${p.sph_r} Cyl ${p.cyl_r} Axis ${p.axis_r}</p><p>ตาซ้าย: Sph ${p.sph_l} Cyl ${p.cyl_l} Axis ${p.axis_l}</p>` + `<p>ADD: ${p.add_val} PD: ${p.pd}</p>`;
    html2pdf().from(element).save(`Prescription-${cust.name}.pdf`);
  } catch (e) { showToast("พิมพ์ไม่สำเร็จ", "error"); }
}

async function generateReceiptPDF(orderId) { 
  try {
    const order = await fetchJson(`/api/orders/${orderId}`);
    const element = document.createElement("div"); element.style.padding = "40px";
    element.innerHTML = `<h1>ใบเสร็จ</h1><p>ออเดอร์: ${order.order_id}</p><p>ลูกค้า: ${order.customer_name}</p><hr/>` + order.items.map(i => `<div>${i.product_name} x ${i.qty} = ฿${Number(i.total).toLocaleString()}</div>`).join("") + `<hr/><h3>ยอดสุทธิ: ฿${order.items.reduce((s,i)=>s+Number(i.total), 0).toLocaleString()}</h3>`;
    html2pdf().from(element).save(`Receipt-${orderId}.pdf`);
  } catch (e) { showToast("พิมพ์ไม่สำเร็จ", "error"); }
}

async function generateSalesReportPDF(period) { showToast("กำลังสร้างรายงาน...", "info"); }

// --- Initialization ---

async function init() {
  if (!checkAuth()) return;
  setupEventListeners();
  const success = await loadData();
  if (success) renderHome();
}

init();
