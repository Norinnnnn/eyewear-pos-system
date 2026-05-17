// Eyewear POS Dashboard - Version 1.1.2 (Final Perfection Restoration)
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
    document.getElementById("home").innerHTML = `<div class="card" style="text-align:center; padding:50px;"><h2>ยินดีต้อนรับ</h2><p>กรุณาเพิ่มสินค้าในเมนูคลังสินค้า</p></div>`;
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
          <button onclick="switchPage('reports')" class="btn-secondary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px;"><i class="fas fa-file-invoice-dollar"></i><span>ดูรายงาน</span></button>
          <button onclick="generateSalesReportPDF('today')" class="btn-secondary" style="padding: 15px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #0ea5e9; color: white; border: none;"><i class="fas fa-calendar-day"></i><span>รายงานวันนี้ (PDF)</span></button>
        </div>
      </div>
      <div class="card" style="margin: 0;">
        <h2><i class="fas fa-fire"></i> สินค้าขายดี</h2>
        <div style="margin-top: 1rem;">
          ${topSelling.map((p, i) => `<div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: ${i === 4 ? 'none' : '1px solid #eee'};"><div style="width: 24px; height: 24px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">${i+1}</div><div style="flex: 1;"><div>${p.name}</div><div style="font-size: 0.75rem; color: #666;">รหัสสินค้า: ${p.sku}</div></div><div style="font-weight: bold; color: #6366f1;">${p.qty} ชิ้น</div></div>`).join("") || "ยังไม่มีข้อมูล"}
        </div>
      </div>
      <div class="card" style="margin: 0;">
        <h2><i class="fas fa-receipt"></i> การขายล่าสุด</h2>
        <div style="margin-top: 1rem;">
          ${[...new Map(sales.map(item => [item.order_id, item])).values()].slice(0, 5).map((s, i) => `
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
          <input type="text" id="pos-search" placeholder="ค้นหาชื่อหรือรหัสสินค้า..." oninput="handlePOSSearch(this.value)" />
          <input type="text" id="pos-customer" placeholder="เบอร์โทรลูกค้า" oninput="handlePOSCustomer(this.value)" list="cust-list-pos" />
          <datalist id="cust-list-pos">${customers.map(c => `<option value="${c.phone}">${c.name}</option>`).join("")}</datalist>
        </div>
        <div id="pos-cust-info" style="margin: 10px 0; color: #7c3aed; font-weight: 500; height: 1.2rem;"></div>
        <div style="display: flex; gap: 8px; margin: 15px 0; overflow-x: auto; padding-bottom: 5px; scrollbar-width:none;">
          <button onclick="filterPOSByCategory('')" class="btn-category active" id="cat-all">ทั้งหมด</button>
          ${productTypes.map(t => `<button onclick="filterPOSByCategory('${t.name}')" class="btn-category" id="cat-${t.id}">${t.name}</button>`).join("")}
        </div>
        <div id="pos-product-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-top: 1rem; max-height: 500px; overflow-y: auto;">
          ${renderPOSProductList(products)}
        </div>
      </div>
      <div class="card" style="display: flex; flex-direction: column;">
        <h2 style="display: flex; align-items: center; gap: 10px;"><i class="fas fa-shopping-basket"></i> ตะกร้าสินค้า (<span id="cart-count">0</span>)</h2>
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
  if (items.length === 0) return `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">ไม่พบสินค้า</div>`;
  return items.map(p => `
    <div onclick="addToCart('${p.sku}')" style="border: 1px solid #eee; padding: 12px; border-radius: 16px; cursor: pointer; text-align: center; background: white; transition: 0.2s; position: relative;" onmouseover="this.style.borderColor='#7c3aed'; this.style.transform='translateY(-3px)';" onmouseout="this.style.borderColor='#f0f0f0'; this.style.transform='translateY(0)'">
      <img src="${p.image || 'https://via.placeholder.com/150?text=?'}" style="width: 100%; height: 110px; object-fit: cover; border-radius: 12px;" />
      <div style="font-weight: 600; margin-top: 10px; font-size: 0.9rem; height: 2.4rem; overflow: hidden; line-height: 1.2;">${p.name}</div>
      <div style="font-size: 0.75rem; color: #64748b; margin-top: 4px; min-height: 1rem;">
        ${p.color ? `<i class="fas fa-palette" style="font-size: 0.7rem;"></i> ${p.color}` : ''}
        ${p.prescription ? `${p.color ? ' | ' : ''}<i class="fas fa-eye" style="font-size: 0.7rem;"></i> ${p.prescription}` : ''}
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
        <div style="color: #7c3aed; font-weight: 700; font-size: 1.1rem;">฿${Number(p.price).toLocaleString()}</div>
        <div style="font-size: 0.75rem; color: ${p.stock <= settings.low_stock_threshold ? '#ef4444' : '#6b7280'}; font-weight: 800;">คลัง: ${p.stock}</div>
      </div>
      ${p.stock <= settings.low_stock_threshold ? `<div style="position: absolute; top: 8px; right: 8px; background: #ef4444; color: white; font-size: 9px; padding: 2px 6px; border-radius: 10px; font-weight: bold; box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);">สต็อกต่ำ</div>` : ""}
    </div>`).join("");
}

function handlePOSSearch(val) { const filtered = products.filter(p => p.name.toLowerCase().includes(val.toLowerCase()) || p.sku.toLowerCase().includes(val.toLowerCase())); document.getElementById("pos-product-grid").innerHTML = renderPOSProductList(filtered); }
function handlePOSCustomer(phone) { const c = customers.find(x => x.phone === phone); const info = document.getElementById("pos-cust-info"); if (c) info.innerHTML = `<i class="fas fa-user-check"></i> ลูกค้าประจำ: ${c.name}`; else if (phone.length>=9) info.innerHTML = `<i class="fas fa-user-plus"></i> ลูกค้าใหม่: จะบันทึกเมื่อขายเสร็จ`; else info.textContent = ""; }
function filterPOSByCategory(cat) { document.querySelectorAll(".btn-category").forEach(btn => btn.classList.remove("active")); if(cat==="") document.getElementById("cat-all").classList.add("active"); else { const type = productTypes.find(t=>t.name===cat); if(type) document.getElementById(`cat-${type.id}`)?.classList.add("active"); } const filtered = cat === "" ? products : products.filter(p => p.category === cat); document.getElementById("pos-product-grid").innerHTML = renderPOSProductList(filtered); }
function addToCart(sku) { const p = products.find(x => x.sku === sku); if (!p) return; const item = cart.find(x => x.sku === sku); if (item) { if (item.qty + 1 > p.stock) return showToast("สต็อกไม่พอ", "warning"); item.qty++; } else { if (p.stock < 1) return showToast("สินค้าหมด", "error"); cart.push({ sku, name: p.name, price: Number(p.price), qty: 1, color: p.color, prescription: p.prescription }); } renderCart(); }

function renderCart() {
  let sub = 0, disc = 0, count = 0;
  const html = cart.map((item, i) => {
    const promo = promotions.filter(p => p.is_active).find(pr => { 
      const skus = pr.applicable_skus ? pr.applicable_skus.split(",").map(s => s.trim()) : []; 
      return (skus.length === 0 || skus.includes(item.sku)) && item.qty >= pr.min_qty; 
    });
    let itemDisc = promo ? (promo.discount_type === "fixed" ? Number(promo.discount_value) : (item.price * Number(promo.discount_value) / 100)) : 0;
    sub += item.price * item.qty; 
    disc += itemDisc * item.qty; 
    count += item.qty;
    
    return `
    <div style="display: flex; flex-direction: column; margin-bottom: 12px; background:#ffffff; padding:15px; border-radius:16px; border: 1px solid #f1f5f9; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
        <div style="flex:1;">
          <div style="font-weight:700; font-size:0.95rem; color:#1e293b; margin-bottom: 4px;">${item.name}</div>
          <div style="font-size:0.75rem; color:#64748b; margin-bottom: 4px;">รหัส: <span style="font-family:monospace; font-weight:600;">${item.sku}</span></div>
          <div style="font-size:0.75rem; color:#64748b; display: flex; gap: 8px; flex-wrap: wrap;">
            ${item.color ? `<span><i class="fas fa-palette" style="font-size: 0.7rem;"></i> ${item.color}</span>` : ''}
            ${item.prescription ? `<span><i class="fas fa-eye" style="font-size: 0.7rem;"></i> ${item.prescription}</span>` : ''}
          </div>
        </div>
        <button onclick="removeFromCart(${i})" style="color: #94a3b8; border: none; background: none; cursor: pointer; font-size:1.1rem; padding: 0 0 0 10px;"><i class="fas fa-trash-alt"></i></button>
      </div>
      
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #f1f5f9; padding-top: 10px;">
        <div style="display: flex; align-items: center; background: #f8fafc; border-radius: 10px; padding: 2px; border: 1px solid #e2e8f0;">
          <button onclick="changeCartQty(${i}, -1)" style="width: 28px; height: 28px; border-radius: 8px; border: none; background: white; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'"><i class="fas fa-minus" style="font-size: 0.7rem;"></i></button>
          <input type="number" value="${item.qty}" min="1" onchange="updateCartQty(${i}, this.value)" style="width: 45px; border: none; background: transparent; text-align: center; font-weight: 700; color: #1e293b; font-size: 0.9rem; -moz-appearance: textfield;" />
          <button onclick="changeCartQty(${i}, 1)" style="width: 28px; height: 28px; border-radius: 8px; border: none; background: white; color: #7c3aed; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.background='#f5f3ff'" onmouseout="this.style.background='white'"><i class="fas fa-plus" style="font-size: 0.7rem;"></i></button>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.7rem; color: #94a3b8; text-decoration: line-through; height: 1rem;">${itemDisc > 0 ? `฿${(item.price * item.qty).toLocaleString()}` : ''}</div>
          <div style="font-weight:800; color:#7c3aed; font-size: 1.1rem;">฿${((item.price - itemDisc) * item.qty).toLocaleString()}</div>
        </div>
      </div>
    </div>`;
  }).join("");
  
  document.getElementById("cart-list").innerHTML = html || `<div style="text-align:center; color:#94a3b8; padding:40px;">ตะกร้าว่าง</div>`;
  document.getElementById("sub-val").textContent = sub.toLocaleString(); 
  document.getElementById("disc-val").textContent = disc.toLocaleString(); 
  document.getElementById("total-val").textContent = (sub - disc).toLocaleString(); 
  document.getElementById("cart-count").textContent = count;
}

function removeFromCart(idx) { 
  cart.splice(idx, 1); 
  renderCart(); 
}

function changeCartQty(index, delta) {
  const newQty = cart[index].qty + delta;
  updateCartQty(index, newQty);
}

function updateCartQty(index, newQty) {
  newQty = parseInt(newQty);
  if (isNaN(newQty) || newQty < 1) newQty = 1;
  
  const item = cart[index];
  const p = products.find(x => x.sku === item.sku);
  
  if (p && newQty > p.stock) {
    showToast(`สต็อกไม่พอ (มีเพียง ${p.stock} ชิ้น)`, "warning");
    item.qty = p.stock;
  } else {
    item.qty = newQty;
  }
  renderCart();
}

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
      <div class="modal-header" style="background:#fdf2f8; border-bottom: 1px solid #fce7f3;">
        <h2 style="color: #be185d;"><i class="fas fa-money-bill-wave"></i> ชำระเงิน</h2>
        <button onclick="document.getElementById('payment-modal').style.display='none'" class="modal-close"><i class="fas fa-times"></i></button>
      </div>
      <div style="padding: 24px;">
        <div style="text-align: center; margin-bottom: 25px; background: #f8fafc; padding: 20px; border-radius: 20px; border: 1px solid #e2e8f0;">
          <div style="font-size: 0.9rem; color: #64748b; margin-bottom: 5px;">ยอดที่ต้องชำระ</div>
          <div style="font-size: 2.2rem; font-weight: 800; color: #7c3aed;">฿${total.toLocaleString(undefined, {minimumFractionDigits:2})}</div>
        </div>
        <div style="margin-bottom: 20px;">
          <label style="font-weight: 700; display: block; margin-bottom: 10px; color: #374151;">ช่องทางชำระเงิน</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
            <label class="pay-method-btn">
              <input type="radio" name="pay-method" value="cash" checked onchange="togglePayInputs()" />
              <div class="method-box"><i class="fas fa-money-bill-alt"></i><span>เงินสด</span></div>
            </label>
            <label class="pay-method-btn">
              <input type="radio" name="pay-method" value="qr" onchange="togglePayInputs()" />
              <div class="method-box"><i class="fas fa-qrcode"></i><span>QR Code</span></div>
            </label>
            <label class="pay-method-btn">
              <input type="radio" name="pay-method" value="transfer" onchange="togglePayInputs()" />
              <div class="method-box"><i class="fas fa-university"></i><span>โอนเงิน</span></div>
            </label>
          </div>
        </div>
        <div id="cash-inputs">
          <input type="number" id="pay-received" placeholder="รับเงินมา (บาท)" style="width: 100%; padding: 15px; font-size: 1.8rem; text-align: center; border-radius:16px; border:2px solid #e2e8f0; font-weight:800;" oninput="calculateChange(${total})" />
          <div id="pay-change" style="text-align: right; margin-top: 10px; font-weight: 700; color: #059669; font-size: 1.3rem;">เงินทอน: ฿0.00</div>
        </div>
      </div>
      <div class="modal-footer" style="padding: 15px 24px; background: #f9fafb;">
        <button onclick="finalizeCheckout(${total})" class="btn-primary" style="width: 100%; padding: 15px; font-size:1.1rem; border-radius:12px;"><i class="fas fa-check-double"></i> ยืนยันการชำระเงิน</button>
      </div>
    </div>
    <style>
      .pay-method-btn input { display: none; }
      .method-box { padding: 12px; border: 2px solid #e2e8f0; border-radius: 12px; text-align: center; cursor: pointer; transition: 0.2s; color: #64748b; display: flex; flex-direction: column; gap: 5px; }
      .method-box i { font-size: 1.2rem; }
      .method-box span { font-size: 0.8rem; font-weight: 600; }
      .pay-method-btn input:checked + .method-box { border-color: #7c3aed; background: #f5f3ff; color: #7c3aed; }
    </style>
  `;
  modal.style.display = "flex";
  setTimeout(() => document.getElementById("pay-received").focus(), 100);
}

function togglePayInputs() {
  const method = document.querySelector('input[name="pay-method"]:checked').value;
  document.getElementById("cash-inputs").style.display = method === "cash" ? "block" : "none";
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
    else { const err = await res.json(); showToast(err.error || "ล้มเหลว", "error"); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-double"></i> ยืนยันการชำระเงิน'; }
  } catch (e) { showToast("ไม่สามารถติดต่อเซิร์ฟเวอร์ได้", "error"); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-double"></i> ยืนยันการชำระเงิน'; }
}

// --- Inventory Page ---

function renderInventory() {
  document.getElementById("inventory").innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap:15px; flex-wrap:wrap;">
      <div style="display: flex; gap: 10px;">
        <button onclick="openAddProductModal()" class="btn-primary" style="display:flex; align-items:center; gap:8px;"><i class="fas fa-plus-circle"></i> เพิ่มสินค้า</button>
      </div>
      <div style="flex:1; max-width:400px; position:relative;">
        <input type="text" id="inv-search" placeholder="ค้นหาชื่อหรือรหัสสินค้า..." oninput="inventorySearchQuery=this.value; renderInventoryRows();" style="width: 100%; padding-left:40px; border-radius:12px; border:1px solid #ddd;" />
        <span style="position:absolute; left:15px; top:50%; transform:translateY(-50%); color:#94a3b8;"><i class="fas fa-search"></i></span>
      </div>
    </div>
    <div class="card" style="padding: 0; overflow: hidden; border:none; box-shadow: var(--shadow);">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>รูปภาพ</th><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>หมวดหมู่</th><th style="text-align: right;">ราคาขาย</th><th style="text-align: center;">สต็อก</th><th style="width:160px; text-align: center;">จัดการ</th></tr>
          </thead>
          <tbody id="inv-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top: 2rem; border-left: 5px solid #7c3aed;">
      <h2 style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;"><i class="fas fa-tags"></i> จัดการหมวดหมู่สินค้า</h2>
      <div style="display: flex; gap: 12px; margin-bottom: 20px;">
        <input type="text" id="new-type" placeholder="ชื่อหมวดหมู่ใหม่..." style="flex: 1; max-width: 300px;" />
        <button onclick="addType()" class="btn-primary" style="padding: 0 25px;">เพิ่มหมวดหมู่</button>
      </div>
      <div id="type-list" style="display: flex; flex-wrap: wrap; gap: 10px;">
        ${productTypes.map(t => `<div style="background: #f3f4f6; padding: 8px 16px; border-radius: 99px; font-size: 0.9rem; display: flex; align-items: center; gap: 8px; border: 1px solid #e5e7eb;">${t.name}<button onclick="deleteType(${t.id})" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; padding: 0; display: flex; align-items: center;"><i class="fas fa-times"></i></button></div>`).join("") || "ไม่มีหมวดหมู่"}
      </div>
    </div>

    <div id="inv-modal" class="modal" style="display: none;"><div class="modal-content"><div class="modal-header">
          <h2 id="modal-title">ข้อมูลสินค้า</h2>
          <button onclick="closeModal()" class="modal-close"><i class="fas fa-times"></i></button>
        </div>
      <form onsubmit="saveProduct(event)"><div style="padding: 24px 32px;" class="grid">
        <label>รหัสสินค้า<input type="text" id="m-sku" required /></label>
        <label>ชื่อสินค้า<input type="text" id="m-name" required /></label>
        <label>หมวดหมู่<select id="m-cat">${productTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join("")}</select></label>
        <label>ราคาขาย (บาท)<input type="number" id="m-price" required step="0.01" /></label>
        <label>สต็อก<input type="number" id="m-stock" required /></label>
        <label>ต้นทุน (บาท)<input type="number" id="m-cost" step="0.01" /></label>
        <label>สี<input type="text" id="m-color" /></label>
        <label>ค่าสายตา<input type="text" id="m-prescription" /></label>
        <label>รูปภาพ<input type="file" id="m-img" accept="image/*" /></label>
      </div><div class="modal-footer" style="padding:15px 32px; background:#f9fafb;"><button type="button" onclick="closeModal()" style="background: #e2e8f0; color: #475569;">ยกเลิก</button><button type="submit" class="btn-primary">บันทึกข้อมูลสินค้า</button></div></form>
    </div></div>
    <div id="stock-modal" class="modal" style="display: none;"><div class="modal-content" style="width: min(100%, 450px);"><div class="modal-header" style="background:#ecfdf5; border-bottom: 1px solid #d1fae5;">
          <h2 style="color: #065f46;"><i class="fas fa-plus-circle"></i> เพิ่มสต็อกสินค้า</h2>
          <button onclick="closeStockModal()" class="modal-close"><i class="fas fa-times"></i></button>
        </div>
      <form onsubmit="addStock(event)"><div id="stock-product-info" style="padding: 20px; background:#f8fafc; border-bottom:1px solid #eee;"></div><div style="padding: 24px;"><input type="number" id="stock-qty" required placeholder="จำนวนที่เพิ่ม" style="width: 100%; text-align: center; font-size: 2.2rem; border: 2px solid #7c3aed; border-radius: 16px; color:#7c3aed; font-weight:800;" /></div>
      <div class="modal-footer" style="padding: 20px 24px; background: #f9fafb;"><button type="submit" class="btn-primary" style="width: 100%; padding: 15px; background:#059669; border-radius:12px;">ยืนยันการเพิ่ม</button></div></form>
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

async function addType() { const input = document.getElementById("new-type"); const name = input.value.trim(); if(!name) return; await fetch("/api/product-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); input.value = ""; await loadData(); renderInventory(); }
async function deleteType(id) { if(!confirm("ลบหมวดหมู่?")) return; await fetch(`/api/product-types/${id}`, { method: "DELETE" }); await loadData(); renderInventory(); }

function openAddProductModal() { editProductSku = null; document.getElementById("modal-title").textContent = "เพิ่มสินค้าใหม่"; document.getElementById("m-sku").value = ""; document.getElementById("m-sku").readOnly = false; document.getElementById("m-name").value = ""; document.getElementById("m-price").value = ""; document.getElementById("m-stock").value = ""; document.getElementById("m-color").value = ""; document.getElementById("m-prescription").value = ""; document.getElementById("m-cost").value = ""; document.getElementById("inv-modal").style.display = "flex"; }
function editProduct(sku) { const p = products.find(x => x.sku === sku); if (!p) return; editProductSku = sku; document.getElementById("modal-title").textContent = "แก้ไขข้อมูลสินค้า"; document.getElementById("m-sku").value = p.sku; document.getElementById("m-sku").readOnly = false; document.getElementById("m-name").value = p.name; document.getElementById("m-price").value = p.price; document.getElementById("m-stock").value = p.stock; document.getElementById("m-cat").value = p.category || ""; document.getElementById("m-cost").value = p.cost || 0; document.getElementById("m-color").value = p.color || ""; document.getElementById("m-prescription").value = p.prescription || ""; document.getElementById("inv-modal").style.display = "flex"; }
function closeModal() { document.getElementById("inv-modal").style.display = "none"; }
function openAddStockModal(sku) { const p = products.find(x => x.sku === sku); if (!p) return; editProductSku = sku; const modal = document.getElementById("stock-modal"); document.getElementById("stock-product-info").innerHTML = `<div style="display:flex; gap:12px; align-items:center;"><img src="${p.image || 'https://via.placeholder.com/50'}" style="width:50px; height:50px; border-radius:8px; object-fit:cover;" /><div><div style="font-weight:700; color:#1e293b;">${p.name}</div><div style="font-size:0.8rem; color:#64748b;">รหัสสินค้า: ${p.sku} | ปัจจุบัน: <span style="font-weight:800; color:#7c3aed;">${p.stock}</span></div></div></div>`; document.getElementById("stock-qty").value = ""; modal.style.display = "flex"; setTimeout(() => document.getElementById("stock-qty").focus(), 100); }
function closeStockModal() { document.getElementById("stock-modal").style.display = "none"; }
async function addStock(e) { e.preventDefault(); const qty = document.getElementById("stock-qty").value; try { const res = await fetch(`/api/products/${encodeURIComponent(editProductSku)}/add-stock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: qty }) }); if (res.ok) { showToast(`เพิ่มสำเร็จ (+${qty})`, "success"); closeStockModal(); await loadData(); renderInventory(); } } catch (e) { showToast("ล้มเหลว", "error"); } }
async function saveProduct(e) { e.preventDefault(); const newSku = document.getElementById("m-sku").value; const fd = new FormData(); fd.append("sku", newSku); fd.append("name", document.getElementById("m-name").value); fd.append("category", document.getElementById("m-cat").value); fd.append("price", document.getElementById("m-price").value); fd.append("stock", document.getElementById("m-stock").value); fd.append("cost", document.getElementById("m-cost").value); fd.append("color", document.getElementById("m-color").value); fd.append("prescription", document.getElementById("m-prescription").value); const imgFile = document.getElementById("m-img").files[0]; if (imgFile) fd.append("image", imgFile); const url = editProductSku ? `/api/products/${editProductSku}` : "/api/products"; try { const res = await fetch(url, { method: editProductSku ? "PUT" : "POST", body: fd }); if (res.ok) { showToast("สำเร็จ"); closeModal(); await loadData(); renderInventory(); } else { const err = await res.json(); showToast(err.error || "ล้มเหลว", "error"); } } catch (error) { showToast("ล้มเหลว", "error"); } }
async function delProduct(sku) { if (!confirm(`ยืนยันการลบ [${sku}]?`)) return; try { const res = await fetch(`/api/products/${sku}`, { method: "DELETE" }); if (res.ok) { showToast("ลบสำเร็จ"); await loadData(); renderInventory(); } } catch (error) { showToast("ล้มเหลว", "error"); } }

// --- Reports Page ---

function renderReports() {
  const orders = {}; sales.forEach(s => { if (!orders[s.order_id]) orders[s.order_id] = { id: s.order_id, cust: s.customer_name || "-", total: 0, date: s.sold_at, method: s.payment_method }; orders[s.order_id].total += Number(s.total); });
  const list = Object.values(orders).sort((a,b) => new Date(b.date) - new Date(a.date));
  document.getElementById("reports").innerHTML = `
    <div class="card"><h2><i class="fas fa-search"></i> ค้นหารายงาน</h2>
      <div class="grid" style="grid-template-columns: 1fr 1fr 1fr auto; gap: 10px;">
        <input type="date" id="rep-start" /><input type="date" id="rep-end" /><input type="text" id="rep-search" placeholder="เลขออเดอร์หรือลูกค้า..." /><button onclick="filterReports()" class="btn-primary" style="padding: 0 30px;">ค้นหา</button>
      </div>
    </div>
    <div class="card" style="padding: 0; overflow: hidden; margin-top:20px; border:none; box-shadow:var(--shadow);">
      <div class="table-wrap"><table>
        <thead style="background:#f8fafc;"><tr><th>เลขออเดอร์</th><th>วันที่/เวลา</th><th>ชำระโดย</th><th>ลูกค้า</th><th style="text-align:right;">ยอดรวมสุทธิ</th><th style="text-align:center;">ใบเสร็จ</th></tr></thead>
        <tbody>${list.map(o => `<tr><td style="font-family:monospace; font-weight:700;">${o.id}</td><td>${new Date(o.date).toLocaleString("th-TH")}</td><td><span class="badge" style="background:#f1f5f9; color:#475569;">${o.method || 'cash'}</span></td><td>${o.cust}</td><td style="text-align:right; font-weight:700;">฿${o.total.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
          <td style="text-align:center;"><button onclick="generateReceiptPDF('${o.id}')" style="background:#10b981; color:white; border:none; padding:6px 12px; border-radius:8px; cursor:pointer;"><i class="fas fa-file-pdf"></i></button></td></tr>`).join("")}</tbody>
      </table></div></div>
  `;
}
async function filterReports() { const start = document.getElementById("rep-start").value, end = document.getElementById("rep-end").value, q = document.getElementById("rep-search").value; let url = `/api/sales?`; if (start) url += `start_date=${start}&`; if (end) url += `end_date=${end}&`; if (q) url += `search=${encodeURIComponent(q)}&`; sales = await fetchJson(url); renderReports(); }

// --- Users & Promotions ---
function renderUsers() {
  const editing = editingUserId ? users.find(x => x.id === editingUserId) : null;
  document.getElementById("users").innerHTML = `
    <div class="card"><h2>${editing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}</h2><form onsubmit="saveUser(event)"><div class="grid"><input type="text" id="u-user" value="${editing?.username || ''}" placeholder="User" required /><input type="password" id="u-pass" placeholder="Pass" ${editing?'':'required'} /><input type="text" id="u-name" value="${editing?.name || ''}" placeholder="ชื่อ" required /><select id="u-role"><option value="user" ${editing?.role==='user'?'selected':''}>User</option><option value="admin" ${editing?.role==='admin'?'selected':''}>Admin</option></select></div><button type="submit" class="btn-primary">บันทึก</button></form></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>User</th><th>ชื่อ</th><th>บทบาท</th><th>จัดการ</th></tr></thead><tbody>${users.map(u => `<tr><td>${u.username}</td><td>${u.name}</td><td>${u.role}</td><td><button onclick="editingUserId=${u.id}; renderUsers();">แก้ไข</button><button onclick="delUser(${u.id})">ลบ</button></td></tr>`).join("")}</tbody></table></div></div>
  `;
}
async function saveUser(e) { e.preventDefault(); const data = { username: document.getElementById("u-user").value, password: document.getElementById("u-pass").value, name: document.getElementById("u-name").value, role: document.getElementById("u-role").value }; const method = editingUserId ? "PUT" : "POST"; await fetch(editingUserId ? `/api/users/${editingUserId}` : "/api/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); editingUserId = null; await loadData(); renderUsers(); }
async function delUser(id) { if(id===currentUser.id || !confirm("ลบ?")) return; await fetch(`/api/users/${id}`, { method: "DELETE" }); await loadData(); renderUsers(); }

function renderPromotions() {
  const editing = editingPromotionId ? promotions.find(x => x.id === editingPromotionId) : null;
  document.getElementById("promotions").innerHTML = `
    <div class="card"><h2>${editing ? '<i class="fas fa-tag"></i> แก้ไขโปร' : '<i class="fas fa-plus-circle"></i> เพิ่มโปร'}</h2>
      <form onsubmit="savePromo(event)"><div class="grid">
        <label>ชื่อโปร<input type="text" id="p-name" value="${editing?.name || ''}" required /></label>
        <label>ขั้นต่ำ<input type="number" id="p-qty" value="${editing?.min_qty || 1}" /></label>
        <label>ประเภท<select id="p-type"><option value="fixed" ${editing?.discount_type==='fixed'?'selected':''}>บาท</option><option value="percent" ${editing?.discount_type==='percent'?'selected':''}>%</option></select></label>
        <label>ส่วนลด<input type="number" id="p-val" value="${editing?.discount_value || 0}" /></label>
        <label>สินค้า (รหัสสินค้า, คั่นด้วยคอมม่า)<input type="text" id="p-skus" value="${editing?.applicable_skus || ''}" placeholder="ว่างคือทั้งหมด" /></label>
        <label>สถานะ<select id="p-status"><option value="1" ${editing?.is_active?'selected':''}>เปิด</option><option value="0" ${!editing?.is_active?'selected':''}>ปิด</option></select></label>
      </div><button type="submit" class="btn-primary">${editing ? '<i class="fas fa-save"></i> บันทึก' : '<i class="fas fa-plus"></i> เพิ่ม'}</button>
      ${editing ? `<button type="button" onclick="editingPromotionId=null; renderPromotions();" style="background: #94a3b8; color: white; margin-left: 10px; border: none; padding: 10px 20px; border-radius: 12px; cursor: pointer;"><i class="fas fa-times"></i> ยกเลิก</button>` : ''}</form>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>ชื่อ</th><th>เงื่อนไข</th><th>ส่วนลด</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
      <tbody>${promotions.map(p => `<tr><td>${p.name}</td><td>${p.min_qty} ชิ้น</td><td>${p.discount_type==='fixed'?'฿':''}${p.discount_value}${p.discount_type==='percent'?'%':''}</td>
        <td>${p.is_active?'เปิด':'ปิด'}</td><td><button onclick="editingPromotionId=${p.id}; renderPromotions();" style="background: #eff6ff; color: #2563eb; padding: 8px; border-radius: 8px; margin-right: 5px;"><i class="fas fa-edit"></i></button><button onclick="delPromo(${p.id})" style="background:#fef2f2; color: #ef4444; padding: 8px; border-radius: 8px;"><i class="fas fa-trash-alt"></i></button></td></tr>`).join("")}</tbody>
    </table></div></div>
  `;
}
async function savePromo(e) { e.preventDefault(); const data = { name: document.getElementById("p-name").value, min_qty: document.getElementById("p-qty").value, discount_type: document.getElementById("p-type").value, discount_value: document.getElementById("p-val").value, applicable_skus: document.getElementById("p-skus").value, is_active: document.getElementById("p-status").value }; const method = editingPromotionId ? "PUT" : "POST"; await fetch(editingPromotionId ? `/api/promotions/${editingPromotionId}` : "/api/promotions", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); editingPromotionId = null; await loadData(); renderPromotions(); }
async function delPromo(id) { if(!confirm("ลบ?")) return; await fetch(`/api/promotions/${id}`, { method: "DELETE" }); await loadData(); renderPromotions(); }

// --- Customers & Prescription ---

function renderCustomers() {
  document.getElementById("customers").innerHTML = `
    <div class="card"><h2><i class="fas fa-user-plus"></i> จัดการลูกค้า</h2><form onsubmit="saveCustomer(event)"><div class="grid" style="grid-template-columns: 1fr 1fr auto; gap:15px;"><input type="text" id="c-phone" placeholder="เบอร์โทรศัพท์" required /><input type="text" id="c-name" placeholder="ชื่อลูกค้า" required /><button type="submit" class="btn-primary">บันทึก</button></div></form></div>
    <div class="card" style="margin-top:24px; padding:0; overflow:hidden;"><div class="table-wrap"><table><thead><tr><th>เบอร์โทร</th><th>ชื่อ</th><th>จัดการ</th></tr></thead><tbody>${customers.map(c => `<tr><td style="font-weight:700; color:#7c3aed;">${c.phone}</td><td style="font-weight:600;">${c.name}</td><td style="text-align:center;"><button onclick="viewCustomerHistory('${c.phone}')" style="background:#eff6ff; color:#2563eb; border:none; padding:8px 15px; border-radius:10px; cursor:pointer;"><i class="fas fa-history"></i> ประวัติ/ค่าสายตา</button></td></tr>`).join("")}</tbody></table></div></div>
    <div id="history-modal" class="modal" style="display: none;"><div class="modal-content" style="width: min(100%, 700px);"><div class="modal-header"><h2 id="history-title">ข้อมูลลูกค้า</h2><button onclick="closeHistoryModal()">x</button></div>
    <div id="history-content" style="padding:24px; max-height:550px; overflow-y:auto;"></div></div></div>
  `;
}
async function saveCustomer(e) { e.preventDefault(); await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: document.getElementById("c-phone").value, name: document.getElementById("c-name").value }) }); await loadData(); renderCustomers(); }
function closeHistoryModal() { document.getElementById("history-modal").style.display = "none"; }

async function viewCustomerHistory(phone) {
  const cust = customers.find(x => x.phone === phone); if (!cust) return;
  const modal = document.getElementById("history-modal"); const content = document.getElementById("history-content");
  modal.querySelector("h2").innerHTML = `<i class="fas fa-user-tag"></i> ข้อมูลลูกค้า: ${cust.name}`;
  content.innerHTML = `
    <style>.tab-btn { padding:10px 20px; border:none; background:none; cursor:pointer; font-weight:600; color:#64748b; border-bottom:2px solid transparent; } .tab-btn.active { color:#7c3aed; border-bottom-color:#7c3aed; background:#f5f3ff; border-radius:8px 8px 0 0; }</style>
    <div style="display:flex; gap:10px; margin-bottom:20px; border-bottom:2px solid #f1f5f9; padding-bottom:10px;"><button onclick="switchHistoryTab('sales', '${phone}')" id="tab-sales" class="tab-btn active">ประวัติการซื้อ</button><button onclick="switchHistoryTab('pres', '${phone}')" id="tab-pres" class="tab-btn">ค่าสายตา</button></div>
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
    contentArea.innerHTML = custSales.map(s => `<div style="padding:12px 15px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; background:white; border-radius:12px; margin-bottom:8px;"><div><div style="font-weight:600;">${new Date(s.sold_at).toLocaleDateString("th-TH")} - ${s.sku}</div><div style="font-size:0.8rem; color:#64748b;">${s.qty} ชิ้น | ออเดอร์: ${s.order_id}</div></div><strong style="color:#7c3aed;">฿${Number(s.total).toLocaleString()}</strong></div>`).join("") || "ไม่มีประวัติการซื้อ";
  } else {
    contentArea.innerHTML = 'กำลังโหลด...';
    try {
      const presList = await fetchJson(`/api/customers/${phone}/prescriptions`);
      const cust = customers.find(x => x.phone === phone);
      let html = `<button onclick="openAddPrescriptionModal(${cust.id}, '${phone}')" class="btn-primary" style="width:100%; margin-bottom:20px; background:#059669;"><i class="fas fa-plus-circle"></i> เพิ่มค่าสายตาใหม่</button>`;
      html += presList.map(p => `
        <div style="border:1px solid #e2e8f0; border-radius:16px; margin-bottom:15px; padding:15px; background:white; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:10px;"><strong>${new Date(p.created_at).toLocaleDateString("th-TH")}</strong>
            <div style="display:flex; gap:10px;"><button onclick="generatePrescriptionPDF(${p.id}, '${phone}')" style="background:#eff6ff; color:#2563eb; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;">พิมพ์</button><button onclick="deletePrescription(${p.id}, '${phone}')" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fas fa-trash-alt"></i></button></div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
            <div style="background:#f8fafc; padding:10px; border-radius:12px;"><strong>ขวา (R)</strong><br/>Sph: ${p.sph_r}<br/>Cyl: ${p.cyl_r}<br/>Axis: ${p.axis_r}</div>
            <div style="background:#f8fafc; padding:10px; border-radius:12px;"><strong>ซ้าย (L)</strong><br/>Sph: ${p.sph_l}<br/>Cyl: ${p.cyl_l}<br/>Axis: ${p.axis_l}</div>
          </div>
          <div style="margin-top:12px; display:flex; gap:20px; font-size:0.85rem; background:#f0fdf4; padding:8px 15px; border-radius:10px;"><span>ADD: ${p.add_val}</span><span>PD: ${p.pd}</span></div>
          ${p.note ? `<div style="margin-top:10px; font-size:0.8rem; color:#64748b;">บันทึก: ${p.note}</div>` : ''}
        </div>`).join("") || "ไม่มีประวัติ";
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
    const p = presList.find(x => x.id === id); 
    const cust = customers.find(x => x.phone === phone);
    
    const element = document.createElement("div");
    element.innerHTML = `
      <div style="font-family: 'Prompt', sans-serif; padding: 40px; color: #1f2937; background: white;">
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="margin: 0; color: #2563eb; font-size: 32px; font-weight: 700;">ใบค่าสายตา</h1>
          <p style="margin: 8px 0; color: #6b7280; font-size: 16px; text-transform: uppercase; letter-spacing: 2px;">Prescription Record</p>
          <div style="width: 60px; height: 3px; background: #2563eb; margin: 20px auto;"></div>
        </div>

        <div style="margin-bottom: 40px; padding: 25px; border: 1px solid #e5e7eb; border-radius: 16px; background: #f8fafc;">
          <p style="margin: 0 0 10px 0; color: #64748b; font-size: 12px; text-transform: uppercase;">ข้อมูลลูกค้า</p>
          <div style="display: flex; justify-content: space-between;">
            <p style="margin: 0; font-size: 18px;"><strong>คุณ:</strong> ${cust.name}</p>
            <p style="margin: 0; font-size: 18px;"><strong>เบอร์โทร:</strong> ${cust.phone}</p>
          </div>
          <p style="margin: 10px 0 0 0; color: #64748b; font-size: 14px;">วันที่บันทึก: ${new Date(p.created_at).toLocaleDateString("th-TH", { dateStyle: 'long' })}</p>
        </div>

        <div style="display: flex; gap: 20px; margin-bottom: 30px;">
          <div style="flex: 1; padding: 20px; border: 2px solid #e2e8f0; border-radius: 15px;">
            <h3 style="margin: 0 0 15px 0; color: #2563eb; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">ตาขวา (Right Eye)</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <p style="width: 45%;"><strong>SPH:</strong> ${p.sph_r}</p>
                <p style="width: 45%;"><strong>CYL:</strong> ${p.cyl_r}</p>
                <p style="width: 45%;"><strong>AXIS:</strong> ${p.axis_r}</p>
            </div>
          </div>
          <div style="flex: 1; padding: 20px; border: 2px solid #e2e8f0; border-radius: 15px;">
            <h3 style="margin: 0 0 15px 0; color: #2563eb; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">ตาซ้าย (Left Eye)</h3>
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                <p style="width: 45%;"><strong>SPH:</strong> ${p.sph_l}</p>
                <p style="width: 45%;"><strong>CYL:</strong> ${p.cyl_l}</p>
                <p style="width: 45%;"><strong>AXIS:</strong> ${p.axis_l}</p>
            </div>
          </div>
        </div>

        <div style="padding: 20px; border: 2px solid #e2e8f0; border-radius: 15px; margin-bottom: 40px; background: #f1f5f9;">
            <div style="display: flex; gap: 40px; justify-content: center;">
                <p style="font-size: 18px;"><strong>ADD:</strong> ${p.add_val || '-'}</p>
                <p style="font-size: 18px;"><strong>PD:</strong> ${p.pd || '-'}</p>
            </div>
        </div>

        <div style="margin-top: 100px; display: flex; justify-content: space-around;">
            <div style="text-align: center;">
                <div style="width: 200px; border-bottom: 1px solid #000; margin-bottom: 10px;"></div>
                <p>ผู้ตรวจสายตา</p>
            </div>
            <div style="text-align: center;">
                <div style="width: 200px; border-bottom: 1px solid #000; margin-bottom: 10px;"></div>
                <p>วันที่ตรวจ</p>
            </div>
        </div>

        <div style="margin-top: 60px; text-align: center; color: #94a3b8; font-size: 12px;">
          <p>*** ขอบคุณที่ไว้วางใจร้านแว่นตาอานนท์ ***</p>
        </div>
      </div>
    `;

    const opt = {
      margin: 10,
      filename: `Prescription-${cust.name}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 3, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().from(element).set(opt).save();
  } catch (e) { 
    console.error(e);
    showToast("พิมพ์ไม่สำเร็จ", "error"); 
  }
}

async function generateReceiptPDF(orderId) { 
  try {
    const order = await fetchJson(`/api/orders/${orderId}`);
    const saleEntry = sales.find(s => s.order_id === orderId);
    const methodLabel = saleEntry?.payment_method === 'cash' ? 'เงินสด' : (saleEntry?.payment_method === 'qr' ? 'QR Code' : (saleEntry?.payment_method === 'transfer' ? 'โอนเงิน' : '-'));

    const subtotal = order.items.reduce((s, i) => s + (Number(i.unit_price) * i.qty), 0);
    const totalDiscount = order.items.reduce((s, i) => s + Number(i.discount), 0);
    const total = subtotal - totalDiscount;

    const element = document.createElement("div");
    element.innerHTML = `
      <div style="font-family: 'Prompt', sans-serif; padding: 40px; color: #1f2937; background: white; min-height: 800px;">
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="margin: 0; color: #7c3aed; font-size: 32px; font-weight: 700;">ร้านแว่นตาอานนท์</h1>
          <p style="margin: 8px 0; color: #6b7280; font-size: 16px; text-transform: uppercase; letter-spacing: 2px;">ใบเสร็จรับเงิน / Receipt</p>
          <div style="width: 60px; height: 3px; background: #7c3aed; margin: 20px auto;"></div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 40px; padding: 25px; border: 1px solid #f3f4f6; border-radius: 16px; background: #fafafa;">
          <div style="font-size: 14px; line-height: 1.6;">
            <p style="margin: 0; color: #9ca3af; font-size: 12px; text-transform: uppercase;">ข้อมูลการสั่งซื้อ</p>
            <p style="margin: 4px 0;"><strong>เลขที่ออเดอร์:</strong> ${order.order_id}</p>
            <p style="margin: 4px 0;"><strong>วันที่:</strong> ${new Date(order.sold_at).toLocaleString("th-TH")}</p>
            <p style="margin: 4px 0;"><strong>ช่องทางชำระ:</strong> ${methodLabel}</p>
          </div>
          <div style="font-size: 14px; line-height: 1.6; text-align: right;">
            <p style="margin: 0; color: #9ca3af; font-size: 12px; text-transform: uppercase;">ข้อมูลลูกค้า</p>
            <p style="margin: 4px 0;"><strong>ชื่อลูกค้า:</strong> ${order.customer_name || 'ลูกค้าทั่วไป'}</p>
            <p style="margin: 4px 0;"><strong>เบอร์โทรศัพท์:</strong> ${order.customer_phone || '-'}</p>
          </div>
        </div>

        <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 40px;">
          <thead>
            <tr>
              <th style="padding: 15px; text-align: left; background: #7c3aed; color: white; border-radius: 12px 0 0 12px; font-weight: 500;">รายการสินค้า</th>
              <th style="padding: 15px; text-align: center; background: #7c3aed; color: white; font-weight: 500;">จำนวน</th>
              <th style="padding: 15px; text-align: right; background: #7c3aed; color: white; font-weight: 500;">ราคา/ชิ้น</th>
              <th style="padding: 15px; text-align: right; background: #7c3aed; color: white; border-radius: 0 12px 12px 0; font-weight: 500;">รวม (฿)</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map(i => `
              <tr>
                <td style="padding: 20px 15px; border-bottom: 1px solid #f3f4f6; font-weight: 500; color: #111827;">${i.product_name}</td>
                <td style="padding: 20px 15px; border-bottom: 1px solid #f3f4f6; text-align: center; color: #4b5563;">${i.qty}</td>
                <td style="padding: 20px 15px; border-bottom: 1px solid #f3f4f6; text-align: right; color: #4b5563;">${Number(i.unit_price).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="padding: 20px 15px; border-bottom: 1px solid #f3f4f6; text-align: right; font-weight: 600; color: #111827;">${Number(i.total).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div style="display: flex; justify-content: flex-end;">
          <div style="width: 300px; background: #f9fafb; padding: 25px; border-radius: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px;">
              <span style="color: #6b7280;">รวมเป็นเงิน</span>
              <span style="font-weight: 500;">฿${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px;">
              <span style="color: #ef4444;">ส่วนลดทั้งหมด</span>
              <span style="color: #ef4444; font-weight: 500;">- ฿${totalDiscount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #e5e7eb; padding-top: 15px; margin-top: 10px;">
              <span style="font-size: 16px; font-weight: 700; color: #111827;">ยอดชำระสุทธิ</span>
              <span style="font-size: 24px; font-weight: 800; color: #7c3aed;">฿${total.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
          </div>
        </div>

        <div style="margin-top: 80px; text-align: center; color: #9ca3af;">
          <p style="margin: 5px 0; font-size: 14px; font-weight: 500; color: #4b5563;">ขอขอบคุณที่ใช้บริการ</p>
          <p style="margin: 5px 0; font-size: 12px;">สินค้าซื้อแล้วไม่รับเปลี่ยนหรือคืน</p>
          <div style="margin-top: 20px; font-size: 11px; color: #d1d5db;">
            <p>ร้านแว่นตาอานนท์ - ผู้เชี่ยวชาญด้านสายตา</p>
          </div>
        </div>
      </div>
    `;

    const opt = {
      margin: 0,
      filename: `Receipt-${orderId}.pdf`,
      image: { type: 'jpeg', quality: 1 },
      html2canvas: { scale: 3, useCORS: true, letterRendering: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    await html2pdf().from(element).set(opt).save();
    showToast("ส่งออกใบเสร็จ PDF เรียบร้อย", "success");
  } catch (e) { 
    console.error(e);
    showToast("พิมพ์ไม่สำเร็จ", "error"); 
  }
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
