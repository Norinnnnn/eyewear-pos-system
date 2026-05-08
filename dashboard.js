// Eyewear POS Dashboard - Version 1.0.7 (Full Restoration & Polish)
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
    showToast("ไม่สามารถโหลดข้อมูลได้", "error");
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
  const todayStr = new Date().toLocaleDateString();
  const todaySales = sales.filter(s => new Date(s.sold_at).toLocaleDateString() === todayStr);
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

    <div class="card" style="margin-top: 1.5rem;">
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;">
        <div>
          <h2 style="margin-bottom: 20px;"><i class="fas fa-chart-area"></i> แนวโน้มยอดขาย (7 วันล่าสุด)</h2>
          <div style="height: 300px; position: relative;">
            <canvas id="salesChart"></canvas>
          </div>
        </div>
        <div>
          <h2 style="margin-bottom: 20px;"><i class="fas fa-chart-pie"></i> สัดส่วนการขาย</h2>
          <div style="height: 300px; position: relative;">
            <canvas id="categoryChart"></canvas>
          </div>
        </div>
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
          ${topSelling.length === 0 ? "<p style='color: #666; text-align: center; padding: 20px;'>ยังไม่มีข้อมูลการขาย</p>" : 
            topSelling.map((p, i) => `
              <div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: ${i === topSelling.length - 1 ? 'none' : '1px solid #eee'};">
                <div style="width: 24px; height: 24px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">${i+1}</div>
                <div style="flex: 1;"><div>${p.name}</div><div style="font-size: 0.75rem; color: #666;">รหัส: ${p.sku}</div></div>
                <div style="font-weight: bold; color: #6366f1;">${p.qty} ชิ้น</div>
              </div>
            `).join("")}
        </div>
      </div>

      <div class="card" style="margin: 0;">
        <h2><i class="fas fa-receipt"></i> การขายล่าสุด</h2>
        <div style="margin-top: 1rem;">
          ${sales.length === 0 ? "<p style='color: #666; text-align: center; padding: 20px;'>ยังไม่มีข้อมูลการขาย</p>" : 
            [...new Map(sales.map(item => [item.order_id, item])).values()].slice(0, 5).map((s, i) => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: ${i === 4 ? 'none' : '1px solid #f1f5f9'};">
                <div>
                  <div style="font-weight: 600; font-size: 0.9rem;">${s.order_id}</div>
                  <div style="font-size: 0.75rem; color: #64748b;">${new Date(s.sold_at).toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})}</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-weight: 700; color: #059669;">฿${Number(s.total).toLocaleString()}</div>
                  <div style="font-size: 0.7rem; color: #94a3b8;">${s.customer_name || 'ลูกค้าทั่วไป'}</div>
                </div>
              </div>
            `).join("")}
        </div>
      </div>
    </div>
  `;
  renderCharts();
}

function renderCharts() {
  renderSalesChart();
  renderCategoryChart();
}

function renderSalesChart() {
  const ctx = document.getElementById('salesChart');
  if (!ctx) return;

  const labels = [];
  const dataPoints = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString();
    labels.push(d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
    
    const daySales = sales.filter(s => new Date(s.sold_at).toLocaleDateString() === dateStr);
    const dayRevenue = daySales.reduce((sum, s) => sum + Number(s.total || 0), 0);
    dataPoints.push(dayRevenue);
  }

  if (window.mySalesChart) window.mySalesChart.destroy();
  
  window.mySalesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'ยอดขาย (บาท)',
        data: dataPoints,
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#7c3aed',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { borderDash: [5, 5] } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderCategoryChart() {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;

  const catMap = {};
  sales.forEach(s => {
    const p = products.find(prod => prod.sku === s.sku);
    const cat = p?.category || 'ทั่วไป';
    catMap[cat] = (catMap[cat] || 0) + Number(s.total);
  });

  const labels = Object.keys(catMap);
  const data = Object.values(catMap);

  if (window.myCatChart) window.myCatChart.destroy();
  
  window.myCatChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: ['#7c3aed', '#059669', '#0284c7', '#ea580c', '#db2777', '#6366f1'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15, font: { size: 11 } } } },
      cutout: '70%'
    }
  });
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
      <div class="card">
        <h2 style="display: flex; align-items: center; gap: 10px;"><i class="fas fa-shopping-cart"></i> ระบบ POS ขายหน้าร้าน</h2>
        <div class="grid" style="grid-template-columns: 2fr 1fr; gap: 10px;">
          <label>ค้นหาสินค้า<input type="text" id="pos-search" placeholder="ชื่อหรือรหัสสินค้า" oninput="handlePOSSearch(this.value)" /></label>
          <label>เบอร์โทรลูกค้า<input type="text" id="pos-customer" placeholder="ค้นหาเบอร์" oninput="handlePOSCustomer(this.value)" list="cust-list-pos" /></label>
          <datalist id="cust-list-pos">${customers.map(c => `<option value="${c.phone}">${c.name}</option>`).join("")}</datalist>
        </div>
        <div id="pos-cust-info" style="margin: 10px 0; color: #7c3aed; font-weight: 500; height: 1.2rem;"></div>
        
        <div style="display: flex; gap: 8px; margin: 15px 0; overflow-x: auto; padding-bottom: 5px; scrollbar-width: none;">
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
        <button onclick="checkout()" class="btn-primary" style="width: 100%; margin-top: 1.5rem; padding: 18px; font-size: 1.2rem; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(124, 58, 237, 0.3);"><i class="fas fa-check"></i> ชำระเงิน</button>
      </div>
    </div>
  `;
  renderCart();
}

function renderPOSProductList(items) {
  if (items.length === 0) return `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #999;">ไม่พบสินค้า</div>`;
  return items.map(p => `
    <div onclick="addToCart('${p.sku}')" style="background: white; border: 1px solid #f0f0f0; padding: 12px; border-radius: 16px; cursor: pointer; text-align: center; transition: 0.2s; position: relative;" onmouseover="this.style.borderColor='#7c3aed'; this.style.transform='translateY(-3px)';" onmouseout="this.style.borderColor='#f0f0f0'; this.style.transform='translateY(0)'">
      <img src="${p.image || 'https://via.placeholder.com/150?text=No+Image'}" style="width: 100%; height: 110px; object-fit: cover; border-radius: 12px;" />
      <div style="font-weight: 600; margin-top: 10px; font-size: 0.9rem; height: 2.4rem; overflow: hidden; line-height: 1.2;">${p.name}</div>
      <div style="color: #7c3aed; font-weight: 700; font-size: 1.1rem; margin-top: 5px;">฿${Number(p.price).toLocaleString()}</div>
      <div style="font-size: 0.75rem; color: #6b7280;">คลัง: ${p.stock}</div>
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

function filterPOSByCategory(cat) {
  document.querySelectorAll(".btn-category").forEach(btn => btn.classList.remove("active"));
  if (cat === "") document.getElementById("cat-all").classList.add("active");
  else {
    const type = productTypes.find(t => t.name === cat);
    if (type) document.getElementById(`cat-${type.id}`)?.classList.add("active");
  }

  const filtered = cat === "" ? products : products.filter(p => p.category === cat);
  document.getElementById("pos-product-grid").innerHTML = renderPOSProductList(filtered);
}

function addToCart(sku) {
  const p = products.find(x => x.sku === sku);
  if (!p) return;
  const item = cart.find(x => x.sku === sku);
  if (item) {
    if (item.qty + 1 > p.stock) return showToast("สต็อกไม่เพียงพอ", "warning");
    item.qty++;
  } else {
    if (p.stock < 1) return showToast("สินค้าหมด", "error");
    cart.push({ sku, name: p.name, price: Number(p.price), qty: 1 });
  }
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
    sub += item.price * item.qty;
    disc += itemDisc * item.qty;
    return `
      <div style="background: #f8fafc; border: 1px solid #f1f5f9; padding: 12px; border-radius: 12px; margin-bottom: 8px; position: relative;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="font-weight: 600; font-size: 0.9rem; flex: 1; padding-right: 20px;">${item.name}</div>
          <button onclick="removeFromCart(${i})" style="color: #ef4444; border: none; background: none; cursor: pointer; font-size: 1.1rem;"><i class="fas fa-times"></i></button>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 10px; align-items: center;">
          <div style="display: flex; align-items: center; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: white;">
            <button onclick="updateCartQty(${i}, ${item.qty-1})" style="padding: 5px 12px; border: none; background: transparent; cursor: pointer;">-</button>
            <input type="number" value="${item.qty}" style="width: 45px; text-align: center; border: none; font-weight: 700;" onchange="updateCartQty(${i}, this.value)" />
            <button onclick="updateCartQty(${i}, ${item.qty+1})" style="padding: 5px 12px; border: none; background: transparent; cursor: pointer;">+</button>
          </div>
          <div style="font-weight: 700; color: #7c3aed;">฿${((item.price - itemDisc) * item.qty).toLocaleString()}</div>
        </div>
      </div>
    `;
  }).join("");
  document.getElementById("cart-list").innerHTML = html || `<div style="text-align:center; color:#94a3b8; padding:40px;">ตะกร้าว่าง</div>`;
  document.getElementById("sub-val").textContent = sub.toLocaleString();
  document.getElementById("disc-val").textContent = disc.toLocaleString();
  document.getElementById("total-val").textContent = (sub - disc).toLocaleString();
}

function updateCartQty(idx, val) {
  const qty = parseInt(val);
  const item = cart[idx];
  if (!item) return;
  const p = products.find(x => x.sku === item.sku);
  if (isNaN(qty) || qty < 1) item.qty = 1;
  else if (qty > p.stock) { showToast(`สต็อกไม่พอ (เหลือ ${p.stock})`, "warning"); item.qty = p.stock; }
  else item.qty = qty;
  renderCart();
}

function removeFromCart(idx) { cart.splice(idx, 1); renderCart(); }

async function checkout() {
  if (cart.length === 0) return showToast("กรุณาเลือกสินค้าก่อน", "warning");
  const sub = cart.reduce((s, i) => s + (i.price * i.qty), 0);
  const disc = cart.reduce((itemSum, item) => {
    const promo = promotions.filter(p => p.is_active).find(pr => {
      const skus = pr.applicable_skus ? pr.applicable_skus.split(",").map(s => s.trim()) : [];
      return (skus.length === 0 || skus.includes(item.sku)) && item.qty >= pr.min_qty;
    });
    const itemDisc = promo ? (promo.discount_type === "fixed" ? Number(promo.discount_value) : (item.price * Number(promo.discount_value) / 100)) : 0;
    return itemSum + (itemDisc * item.qty);
  }, 0);
  const total = sub - disc;

  let modal = document.getElementById("payment-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "payment-modal";
    modal.className = "modal";
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content" style="width: min(100%, 450px);">
      <div class="modal-header" style="background: #fdf2f8; border-bottom: 1px solid #fce7f3;">
        <h2 style="color: #be185d;"><i class="fas fa-money-bill-wave"></i> ชำระเงิน</h2>
        <button onclick="document.getElementById('payment-modal').style.display='none'" class="modal-close"><i class="fas fa-times"></i></button>
      </div>
      <div style="padding: 24px;">
        <div style="text-align: center; margin-bottom: 25px; background: #f8fafc; padding: 20px; border-radius: 20px; border: 1px solid #e2e8f0;">
          <div style="font-size: 0.9rem; color: #64748b; margin-bottom: 5px;">ยอดรวมสุทธิ</div>
          <div style="font-size: 2.5rem; font-weight: 800; color: #7c3aed;">฿${total.toLocaleString(undefined, {minimumFractionDigits:2})}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px;">
          ${['cash', 'qr', 'transfer'].map(m => `
            <label style="display: block; cursor: pointer; text-align: center; border: 2px solid #e2e8f0; padding: 10px; border-radius: 12px; transition: 0.2s;">
              <input type="radio" name="pay-method" value="${m}" ${m==='cash'?'checked':''} style="margin-bottom: 5px;" /><br/>
              <span style="font-weight: 700; font-size: 0.8rem;">${m.toUpperCase()}</span>
            </label>
          `).join('')}
        </div>
        <input type="number" id="pay-received" placeholder="รับเงินมา (บาท)" step="0.01" 
          style="width: 100%; font-size: 1.8rem; font-weight: 800; text-align: center; padding: 15px; border-radius: 16px; border: 2px solid #e2e8f0;" 
          oninput="calculateChange(${total})" />
        <div id="pay-change" style="text-align: right; margin-top: 10px; font-weight: 700; color: #059669; font-size: 1.3rem;">เงินทอน: ฿0.00</div>
      </div>
      <div class="modal-footer" style="padding: 15px 24px; background: #f9fafb;">
        <button onclick="finalizeCheckout(${total})" class="btn-primary" style="width: 100%; padding: 15px; font-size: 1.1rem; border-radius: 12px;"><i class="fas fa-check-double"></i> ยืนยันการชำระเงิน</button>
      </div>
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
  if (method === "cash" && received < totalAmount) return showToast("ยอดเงินรับมาไม่เพียงพอ", "warning");
  
  const btn = event.target.closest('button');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...';
  }
  
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        items: cart, 
        customer_phone: document.getElementById("pos-customer").value, 
        payment_method: method 
      }),
    });
    if (res.ok) {
      const data = await res.json();
      showToast("ขายสำเร็จ", "success");
      document.getElementById("payment-modal").style.display = "none";
      generateReceiptPDF(data.order_id);
      cart = [];
      await loadData();
      renderPOS();
    } else {
      const err = await res.json();
      showToast(err.error || "เกิดข้อผิดพลาด", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-double"></i> ยืนยันการชำระเงิน';
      }
    }
  } catch (error) {
    showToast("ไม่สามารถติดต่อเซิร์ฟเวอร์ได้", "error");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check-double"></i> ยืนยันการชำระเงิน';
    }
  }
}

// --- Inventory Page ---

function renderInventory() {
  document.getElementById("inventory").innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 15px; flex-wrap: wrap;">
      <div style="display: flex; gap: 10px;">
        <button onclick="openAddProductModal()" class="btn-primary" style="display: flex; align-items: center; gap: 8px;">
          <i class="fas fa-plus-circle"></i> เพิ่มสินค้า
        </button>
        <button onclick="openStockLogModal()" style="background: #f1f5f9; padding: 10px 20px; border-radius: 12px; cursor: pointer; border: 1px solid #ddd; font-weight: 600; display: flex; align-items: center; gap: 8px;">
          <i class="fas fa-history"></i> ประวัติสต็อก
        </button>
      </div>
      <div style="flex: 1; max-width: 400px; position: relative;">
        <input type="text" id="inv-search" placeholder="ค้นหาตามชื่อหรือรหัส (SKU)..." oninput="inventorySearchQuery=this.value; renderInventoryRows();" style="width: 100%; padding-left: 40px; border-radius: 12px;" />
        <span style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #94a3b8;"><i class="fas fa-search"></i></span>
      </div>
    </div>

    <div class="card" style="padding: 0; overflow: hidden; border: none; box-shadow: var(--shadow);">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width: 80px; text-align: center;">รูปภาพ</th>
              <th>รหัส (SKU)</th>
              <th>ชื่อสินค้า</th>
              <th>หมวดหมู่</th>
              <th style="text-align: right;">ราคาขาย</th>
              <th style="text-align: center;">สต็อก</th>
              <th style="width: 160px; text-align: center;">จัดการ</th>
            </tr>
          </thead>
          <tbody id="inv-tbody"></tbody>
        </table>
      </div>
    </div>

    <!-- Modals -->
    <div id="inv-modal" class="modal" style="display: none;">
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="modal-title">ข้อมูลสินค้า</h2>
          <button onclick="closeModal()" class="modal-close"><i class="fas fa-times"></i></button>
        </div>
        <form onsubmit="saveProduct(event)">
          <div style="padding: 24px 32px;" class="grid">
            <label>รหัสสินค้า (SKU)<input type="text" id="m-sku" required /></label>
            <label>ชื่อสินค้า<input type="text" id="m-name" required /></label>
            <label>หมวดหมู่<select id="m-cat">${productTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join("")}</select></label>
            <label>ราคาขาย (บาท)<input type="number" id="m-price" required step="0.01" /></label>
            <label>จำนวนสต็อก<input type="number" id="m-stock" required /></label>
            <label>ต้นทุน (บาท)<input type="number" id="m-cost" step="0.01" /></label>
            <label>รูปภาพสินค้า<input type="file" id="m-img" accept="image/*" /></label>
          </div>
          <div class="modal-footer" style="padding: 15px 32px; background: #f9fafb;">
            <button type="button" onclick="closeModal()" style="background: #e2e8f0; color: #475569;">ยกเลิก</button>
            <button type="submit" class="btn-primary">บันทึกข้อมูล</button>
          </div>
        </form>
      </div>
    </div>

    <div id="stock-modal" class="modal" style="display: none;">
      <div class="modal-content" style="width: min(100%, 400px);">
        <div class="modal-header" style="background: #ecfdf5; border-bottom: 1px solid #d1fae5;">
          <h2 style="color: #065f46;"><i class="fas fa-plus-circle"></i> เพิ่มสต็อกสินค้า</h2>
          <button onclick="closeStockModal()" class="modal-close"><i class="fas fa-times"></i></button>
        </div>
        <form onsubmit="addStock(event)">
          <div id="stock-product-info" style="padding: 20px; background: #f8fafc; border-bottom: 1px solid #eee;"></div>
          <div style="padding: 24px;">
            <label style="font-weight: 700; color: #374151;">จำนวนที่ต้องการเพิ่ม (ชิ้น)</label>
            <input type="number" id="stock-qty" required placeholder="0" min="1" 
              style="width: 100%; text-align: center; font-size: 2.2rem; border: 2px solid #7c3aed; border-radius: 16px; margin-top: 10px; color: #7c3aed; font-weight: 800;" />
          </div>
          <div class="modal-footer" style="padding: 20px 24px; background: #f9fafb;">
            <button type="submit" class="btn-primary" style="width: 100%; padding: 15px; background: #059669; font-size: 1.1rem; border-radius: 12px;">ยืนยันการเพิ่มสต็อก</button>
          </div>
        </form>
      </div>
    </div>

    <div id="stock-log-modal" class="modal" style="display: none;">
      <div class="modal-content" style="width: min(100%, 650px);">
        <div class="modal-header">
          <h2><i class="fas fa-history"></i> ประวัติการนำเข้าสินค้า</h2>
          <button onclick="document.getElementById('stock-log-modal').style.display='none'" class="modal-close"><i class="fas fa-times"></i></button>
        </div>
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
      <td style="text-align: center;"><img src="${p.image || 'https://via.placeholder.com/50?text=?'}" style="width: 48px; height: 48px; border-radius: 10px; object-fit: cover; border: 1px solid #eee;" /></td>
      <td style="font-family: monospace; font-weight: 700; color: #64748b;">${p.sku}</td>
      <td style="font-weight: 600;">${p.name}</td>
      <td><span class="badge" style="background: #eff6ff; color: #2563eb;">${p.category || 'ทั่วไป'}</span></td>
      <td style="text-align: right; font-weight: 700; color: #7c3aed;">฿${Number(p.price).toLocaleString()}</td>
      <td style="text-align: center;">
        <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
          <span class="status-badge ${p.stock <= settings.low_stock_threshold ? 'status-low-stock' : 'status-in-stock'}" style="font-weight: 800;">${p.stock}</span>
          <div style="width: 60px; height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden;">
            <div style="width: ${Math.min(100, (p.stock/50)*100)}%; height: 100%; background: ${p.stock <= settings.low_stock_threshold ? '#ef4444' : '#059669'}; transition: width 0.5s ease;"></div>
          </div>
        </div>
      </td>
      <td style="text-align: center;">
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button onclick="openAddStockModal('${p.sku}')" style="background: #ecfdf5; color: #059669; padding: 8px; border-radius: 10px; border: none; cursor: pointer;" title="เพิ่มสต็อก"><i class="fas fa-plus"></i></button>
          <button onclick="editProduct('${p.sku}')" style="background: #eff6ff; color: #2563eb; padding: 8px; border-radius: 10px; border: none; cursor: pointer;" title="แก้ไข"><i class="fas fa-edit"></i></button>
          <button onclick="delProduct('${p.sku}')" style="background: #fef2f2; color: #ef4444; padding: 8px; border-radius: 10px; border: none; cursor: pointer;" title="ลบ"><i class="fas fa-trash-alt"></i></button>
        </div>
      </td>
    </tr>
  `).join("");
}

function openAddProductModal() {
  editProductSku = null;
  document.getElementById("modal-title").textContent = "เพิ่มสินค้าใหม่";
  document.getElementById("m-sku").value = "";
  document.getElementById("m-sku").readOnly = false;
  document.getElementById("m-name").value = "";
  document.getElementById("m-price").value = "";
  document.getElementById("m-stock").value = "";
  document.getElementById("inv-modal").style.display = "flex";
}

function editProduct(sku) {
  const p = products.find(x => x.sku === sku);
  if (!p) return;
  editProductSku = sku;
  document.getElementById("modal-title").textContent = "แก้ไขข้อมูลสินค้า";
  document.getElementById("m-sku").value = p.sku;
  document.getElementById("m-sku").readOnly = true;
  document.getElementById("m-name").value = p.name;
  document.getElementById("m-price").value = p.price;
  document.getElementById("m-stock").value = p.stock;
  document.getElementById("m-cat").value = p.category || "";
  document.getElementById("m-cost").value = p.cost || 0;
  document.getElementById("inv-modal").style.display = "flex";
}

function closeModal() { document.getElementById("inv-modal").style.display = "none"; }

function openAddStockModal(sku) {
  const p = products.find(x => x.sku === sku);
  if (!p) return;
  editProductSku = sku;
  const modal = document.getElementById("stock-modal");
  document.getElementById("stock-product-info").innerHTML = `
    <div style="display: flex; gap: 12px; align-items: center;">
      <img src="${p.image || 'https://via.placeholder.com/50'}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;" />
      <div>
        <div style="font-weight: 700; color: #1e293b;">${p.name}</div>
        <div style="font-size: 0.8rem; color: #64748b;">SKU: ${p.sku} | ปัจจุบัน: <span style="font-weight: 800; color: #7c3aed;">${p.stock}</span> ชิ้น</div>
      </div>
    </div>
  `;
  document.getElementById("stock-qty").value = "";
  modal.style.display = "flex";
  setTimeout(() => document.getElementById("stock-qty").focus(), 100);
}

function closeStockModal() { document.getElementById("stock-modal").style.display = "none"; }

async function addStock(e) {
  e.preventDefault();
  const qty = document.getElementById("stock-qty").value;
  if (!qty || qty <= 0) return showToast("กรุณาระบุจำนวนที่ถูกต้อง", "warning");
  
  try {
    const res = await fetch(`/api/products/${encodeURIComponent(editProductSku)}/add-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: qty })
    });
    if (res.ok) {
      showToast(`เพิ่มสต็อกสำเร็จ (+${qty} ชิ้น)`, "success");
      closeStockModal();
      await loadData();
      renderInventory();
    }
  } catch (e) {
    showToast("เกิดข้อผิดพลาดในการเพิ่มสต็อก", "error");
  }
}

async function saveProduct(e) {
  e.preventDefault();
  const fd = new FormData();
  fd.append("sku", document.getElementById("m-sku").value);
  fd.append("name", document.getElementById("m-name").value);
  fd.append("category", document.getElementById("m-cat").value);
  fd.append("price", document.getElementById("m-price").value);
  fd.append("stock", document.getElementById("m-stock").value);
  fd.append("cost", document.getElementById("m-cost").value);
  const imgFile = document.getElementById("m-img").files[0];
  if (imgFile) fd.append("image", imgFile);

  const url = editProductSku ? `/api/products/${editProductSku}` : "/api/products";
  try {
    const res = await fetch(url, { method: editProductSku ? "PUT" : "POST", body: fd });
    if (res.ok) {
      showToast("บันทึกข้อมูลสินค้าเรียบร้อย", "success");
      closeModal();
      await loadData();
      renderInventory();
    }
  } catch (error) {
    showToast("ไม่สามารถบันทึกข้อมูลได้", "error");
  }
}

async function delProduct(sku) {
  if (!confirm(`ยืนยันการลบสินค้า [${sku}]?`)) return;
  try {
    const res = await fetch(`/api/products/${sku}`, { method: "DELETE" });
    if (res.ok) {
      showToast("ลบสินค้าเรียบร้อย", "success");
      await loadData();
      renderInventory();
    }
  } catch (error) {
    showToast("ไม่สามารถลบสินค้าได้", "error");
  }
}

async function openStockLogModal() {
  const content = document.getElementById("stock-log-content");
  content.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-circle-notch fa-spin"></i> กำลังโหลด...</div>';
  document.getElementById("stock-log-modal").style.display = "flex";
  try {
    const logs = await fetchJson("/api/stock-logs");
    if (logs.length === 0) {
      content.innerHTML = '<div style="text-align: center; padding: 40px; color: #94a3b8;">ยังไม่มีประวัติการนำเข้า</div>';
    } else {
      content.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
          <thead style="background: #f8fafc; border-bottom: 2px solid #f1f5f9;">
            <tr><th style="padding: 12px; text-align: left;">วันที่/เวลา</th><th style="padding: 12px; text-align: left;">สินค้า</th><th style="padding: 12px; text-align: center;">จำนวน</th><th style="padding: 12px; text-align: right;">โดย</th></tr>
          </thead>
          <tbody>
            ${logs.map(l => `
              <tr style="border-bottom: 1px solid #f8fafc;">
                <td style="padding: 12px; color: #64748b;">${new Date(l.created_at).toLocaleString("th-TH")}</td>
                <td style="padding: 12px; font-weight: 600;">${l.product_name || l.sku}</td>
                <td style="padding: 12px; text-align: center; font-weight: 800; color: #059669;">+${l.quantity}</td>
                <td style="padding: 12px; text-align: right; color: #64748b;">${l.user_name}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    content.innerHTML = '<div style="color: #ef4444; text-align: center; padding: 20px;">โหลดข้อมูลล้มเหลว</div>';
  }
}

// --- Reports Page ---

function renderReports() {
  const orders = {};
  sales.forEach(s => {
    if (!orders[s.order_id]) {
      orders[s.order_id] = { 
        id: s.order_id, 
        cust: s.customer_name || "-", 
        total: 0, 
        date: s.sold_at, 
        method: s.payment_method 
      };
    }
    orders[s.order_id].total += Number(s.total);
  });
  const list = Object.values(orders).sort((a,b) => new Date(b.date) - new Date(a.date));

  document.getElementById("reports").innerHTML = `
    <div class="card">
      <h2><i class="fas fa-search"></i> ค้นหารายงาน</h2>
      <div class="grid" style="grid-template-columns: 1fr 1fr 1fr auto; gap: 10px;">
        <input type="date" id="rep-start" />
        <input type="date" id="rep-end" />
        <input type="text" id="rep-search" placeholder="เลขออเดอร์หรือชื่อลูกค้า..." />
        <button onclick="filterReports()" class="btn-primary" style="padding: 0 30px;">ค้นหา</button>
      </div>
    </div>
    
    <div class="card" style="margin-top: 20px; padding: 0; overflow: hidden;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>เลขออเดอร์</th><th>วันที่/เวลา</th><th>ชำระโดย</th><th>ลูกค้า</th><th style="text-align: right;">ยอดรวมสุทธิ</th><th style="text-align: center;">ใบเสร็จ</th></tr>
          </thead>
          <tbody>
            ${list.map(o => `
              <tr>
                <td style="font-family: monospace; font-weight: 700;">${o.id}</td>
                <td>${new Date(o.date).toLocaleString("th-TH")}</td>
                <td><span class="badge" style="background: #f1f5f9; color: #475569;">${o.method || 'cash'}</span></td>
                <td>${o.cust}</td>
                <td style="text-align: right; font-weight: 700; color: #1e293b;">฿${o.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="text-align: center;">
                  <button onclick="generateReceiptPDF('${o.id}')" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer;"><i class="fas fa-file-pdf"></i> PDF</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
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

// --- Customers & Prescription ---

function renderCustomers() {
  document.getElementById("customers").innerHTML = `
    <div class="card">
      <h2><i class="fas fa-user-plus"></i> จัดการลูกค้า</h2>
      <form onsubmit="saveCustomer(event)">
        <div class="grid" style="grid-template-columns: 1fr 1fr auto; gap: 15px;">
          <input type="text" id="c-phone" placeholder="เบอร์โทรศัพท์" required />
          <input type="text" id="c-name" placeholder="ชื่อ-นามสกุลลูกค้า" required />
          <button type="submit" class="btn-primary" style="padding: 0 40px;">บันทึกข้อมูล</button>
        </div>
      </form>
    </div>
    
    <div class="card" style="margin-top: 24px; padding: 0; overflow: hidden;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>เบอร์โทรศัพท์</th><th>ชื่อลูกค้า</th><th style="text-align: center;">จัดการ</th></tr>
          </thead>
          <tbody>
            ${customers.map(c => `
              <tr>
                <td style="font-weight: 700; color: #7c3aed;">${c.phone}</td>
                <td style="font-weight: 600;">${c.name}</td>
                <td style="text-align: center;">
                  <button onclick="viewCustomerHistory('${c.phone}')" style="background: #eff6ff; color: #2563eb; border: none; padding: 8px 16px; border-radius: 10px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 6px; margin: auto;">
                    <i class="fas fa-history"></i> ดูประวัติ/ค่าสายตา
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div id="history-modal" class="modal" style="display: none;">
      <div class="modal-content" style="width: min(100%, 700px);">
        <div class="modal-header">
          <h2 id="history-title">ประวัติลูกค้า</h2>
          <button onclick="document.getElementById('history-modal').style.display='none'" class="modal-close"><i class="fas fa-times"></i></button>
        </div>
        <div id="history-content" style="padding: 24px; max-height: 550px; overflow-y: auto;"></div>
        <div class="modal-footer" style="padding: 15px 24px; background: #f8fafc;">
          <button type="button" onclick="document.getElementById('history-modal').style.display='none'" style="background: #e2e8f0; color: #475569;">ปิดหน้าต่าง</button>
        </div>
      </div>
    </div>
  `;
}

async function saveCustomer(e) {
  e.preventDefault();
  const phone = document.getElementById("c-phone").value;
  const name = document.getElementById("c-name").value;
  try {
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, name })
    });
    if (res.ok) {
      showToast("บันทึกข้อมูลลูกค้าเรียบร้อย", "success");
      await loadData();
      renderCustomers();
    }
  } catch (err) {
    showToast("บันทึกข้อมูลลูกค้าไม่สำเร็จ", "error");
  }
}

async function viewCustomerHistory(phone) {
  const cust = customers.find(x => x.phone === phone);
  if (!cust) return;
  
  const custSales = sales.filter(s => s.customer_phone === phone);
  document.getElementById("history-title").textContent = `ข้อมูลลูกค้า: ${cust.name}`;
  
  let salesHtml = custSales.map(s => `
    <div style="padding: 12px 15px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: white; border-radius: 12px; margin-bottom: 8px;">
      <div>
        <div style="font-weight: 600; color: #1e293b;">${new Date(s.sold_at).toLocaleDateString("th-TH")} - SKU: ${s.sku}</div>
        <div style="font-size: 0.8rem; color: #64748b;">จำนวน: ${s.qty} ชิ้น | ออเดอร์: ${s.order_id}</div>
      </div>
      <strong style="color: #7c3aed; font-size: 1.1rem;">฿${Number(s.total).toLocaleString()}</strong>
    </div>
  `).join("") || '<div style="text-align: center; padding: 20px; color: #94a3b8;">ยังไม่มีประวัติการซื้อ</div>';

  document.getElementById("history-content").innerHTML = `
    <div style="background: #f5f3ff; padding: 15px 20px; border-radius: 16px; margin-bottom: 24px; border: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-size: 0.8rem; color: #6d28d9; font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">เบอร์โทรศัพท์</div>
        <div style="font-size: 1.2rem; font-weight: 800; color: #1e293b;">${cust.phone}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 0.8rem; color: #6d28d9; font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">ออเดอร์ทั้งหมด</div>
        <div style="font-size: 1.2rem; font-weight: 800; color: #1e293b;">${[...new Set(custSales.map(s=>s.order_id))].length}</div>
      </div>
    </div>
    
    <div style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; margin-bottom: 15px; color: #1e293b; display: flex; align-items: center; gap: 8px;"><i class="fas fa-shopping-bag"></i> ประวัติการซื้อสินค้า</h3>
      ${salesHtml}
    </div>

    <div style="margin-top: 30px;">
      <h3 style="font-size: 1.1rem; margin-bottom: 15px; color: #1e293b; display: flex; align-items: center; gap: 8px;"><i class="fas fa-eye"></i> ข้อมูลค่าสายตา (Optical Prescription)</h3>
      <div style="background: #f8fafc; padding: 30px; border-radius: 16px; text-align: center; border: 1px dashed #cbd5e1;">
        <i class="fas fa-glasses fa-3x" style="color: #cbd5e1; margin-bottom: 15px;"></i>
        <p style="color: #94a3b8; font-style: italic;">ระบบบันทึกค่าสายตาพร้อมใช้งานในเวอร์ชันถัดไป</p>
      </div>
    </div>
  `;
  document.getElementById("history-modal").style.display = "flex";
}

// --- PDF & Receipt ---

async function generateReceiptPDF(orderId) { 
  try {
    const res = await fetch(`/api/orders/${orderId}`);
    if (!res.ok) return showToast("ไม่พบข้อมูลออเดอร์", "error");
    const order = await res.json();
    
    showToast("กำลังสร้างใบเสร็จ...", "info");
    
    const element = document.createElement("div");
    element.style.padding = "40px";
    element.style.fontFamily = "'Prompt', sans-serif";
    
    element.innerHTML = `
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 24px;">ร้านแว่นตาอานนท์</h1>
        <p style="margin: 5px 0; color: #666;">ใบเสร็จรับเงิน / Receipt</p>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; border-bottom: 2px solid #333; padding-bottom: 15px;">
        <div>
          <p style="margin: 3px 0;"><strong>เลขออเดอร์:</strong> ${order.order_id}</p>
          <p style="margin: 3px 0;"><strong>วันที่:</strong> ${new Date(order.sold_at).toLocaleString("th-TH")}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 3px 0;"><strong>ลูกค้า:</strong> ${order.customer_name || 'ลูกค้าทั่วไป'}</p>
          <p style="margin: 3px 0;"><strong>เบอร์โทร:</strong> ${order.customer_phone || '-'}</p>
        </div>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <thead>
          <tr style="border-bottom: 1px solid #333; background: #f8fafc;">
            <th style="padding: 10px; text-align: left;">รายการ</th>
            <th style="padding: 10px; text-align: center;">จำนวน</th>
            <th style="padding: 10px; text-align: right;">รวม</th>
          </tr>
        </thead>
        <tbody>
          ${order.items.map(i => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 12px 10px;">${i.product_name}</td>
              <td style="padding: 12px 10px; text-align: center;">${i.qty}</td>
              <td style="padding: 12px 10px; text-align: right;">฿${Number(i.total).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div style="text-align: right; margin-top: 20px;">
        <h3 style="font-size: 1.5rem; color: #7c3aed;">ยอดรวมสุทธิ: ฿${order.items.reduce((s,i)=>s+Number(i.total), 0).toLocaleString(undefined, {minimumFractionDigits:2})}</h3>
      </div>
      <div style="text-align: center; margin-top: 50px; color: #999; font-size: 12px;">
        <p>*** ขอบคุณที่ใช้บริการร้านแว่นตาอานนท์ ***</p>
      </div>
    `;
    
    const opt = {
      margin: 10,
      filename: `Receipt-${orderId}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().from(element).set(opt).save();
  } catch (e) {
    showToast("ไม่สามารถสร้างใบเสร็จได้", "error");
  }
}

async function generateSalesReportPDF(period) { showToast("กำลังพัฒนา...", "info"); }

// --- Initialization ---

async function init() {
  if (!checkAuth()) return;
  setupEventListeners();
  const success = await loadData();
  if (success) renderHome();
}

init();
