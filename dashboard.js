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
  const todayDate = new Date().toLocaleDateString();
  const todaySales = sales.filter(s => new Date(s.sold_at).toLocaleDateString() === todayDate);
  const todayRevenue = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0);

  const productSalesMap = {};
  sales.forEach(s => { productSalesMap[s.sku] = (productSalesMap[s.sku] || 0) + s.qty; });
  const topSelling = Object.entries(productSalesMap).map(([sku, qty]) => ({ sku, qty, name: products.find(p => p.sku === sku)?.name || sku })).sort((a, b) => b.qty - a.qty).slice(0, 5);

  document.getElementById("home").innerHTML = `
    <div class="dashboard-grid">
      <div class="metric-card"><h3>ยอดขายวันนี้</h3><div class="value">฿${todayRevenue.toFixed(2)}</div><p>${todaySales.length} รายการ</p></div>
      <div class="metric-card"><h3>สินค้าทั้งหมด</h3><div class="value">${products.length}</div><p>รวม ${products.reduce((s, p) => s + p.stock, 0)} ชิ้น</p></div>
      <div class="metric-card"><h3>สินค้าใกล้หมด</h3><div class="value">${lowStockItems.length}</div><p>เกณฑ์: ${settings.low_stock_threshold}</p></div>
      <div class="metric-card"><h3>ยอดขายสะสม</h3><div class="value">฿${totalRevenue.toFixed(2)}</div></div>
    </div>
    <div class="card" style="margin-top: 1.5rem;">
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;">
        <div><h2><i class="fas fa-chart-area"></i> แนวโน้มยอดขาย (7 วันล่าสุด)</h2><div style="height: 300px;"><canvas id="salesChart"></canvas></div></div>
        <div><h2><i class="fas fa-chart-pie"></i> สัดส่วนการขาย</h2><div style="height: 300px;"><canvas id="categoryChart"></canvas></div></div>
      </div>
    </div>
    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
      <div class="card"><h2><i class="fas fa-fire"></i> สินค้าขายดี</h2>
        <div style="margin-top: 1rem;">${topSelling.map((p, i) => `<div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;"><span>${i+1}. ${p.name}</span><span style="font-weight: bold; color: #6366f1;">${p.qty} ชิ้น</span></div>`).join("")}</div>
      </div>
      <div class="card"><h2><i class="fas fa-receipt"></i> การขายล่าสุด</h2>
        <div style="margin-top: 1rem;">${[...new Map(sales.map(item => [item.order_id, item])).values()].slice(0, 5).map(s => `<div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f1f5f9;"><div><div style="font-weight: 600;">${s.order_id}</div><div style="font-size: 0.7rem; color: #64748b;">${new Date(s.sold_at).toLocaleString("th-TH")}</div></div><div style="font-weight: 700; color: #059669;">฿${Number(s.total).toLocaleString()}</div></div>`).join("")}</div>
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
        <h2><i class="fas fa-shopping-cart"></i> ขายหน้าร้าน</h2>
        <div class="grid" style="grid-template-columns: 2fr 1fr; gap: 10px;">
          <input type="text" id="pos-search" placeholder="ค้นหาสินค้า..." oninput="handlePOSSearch(this.value)" />
          <input type="text" id="pos-customer" placeholder="เบอร์โทรลูกค้า" />
        </div>
        <div style="display: flex; gap: 8px; margin: 15px 0; overflow-x: auto; padding-bottom: 5px;">
          <button onclick="filterPOSByCategory('')" class="btn-category active" id="cat-all">ทั้งหมด</button>
          ${productTypes.map(t => `<button onclick="filterPOSByCategory('${t.name}')" class="btn-category">${t.name}</button>`).join("")}
        </div>
        <div id="pos-product-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-top: 1rem; max-height: 500px; overflow-y: auto;">
          ${renderPOSProductList(products)}
        </div>
      </div>
      <div class="card">
        <h2><i class="fas fa-shopping-basket"></i> ตะกร้า</h2>
        <div id="cart-list" style="min-height: 200px; max-height: 400px; overflow-y: auto;"></div>
        <div class="cart-total" style="margin-top: 20px; font-size: 1.5rem; font-weight: bold; text-align:right;">สุทธิ: ฿<span id="total-val">0</span></div>
        <button onclick="checkout()" class="btn-primary" style="width: 100%; margin-top: 1.5rem; padding: 15px; font-size: 1.2rem; border-radius:12px;">ชำระเงิน</button>
      </div>
    </div>
  `;
  renderCart();
}

function renderPOSProductList(items) {
  return items.map(p => `<div onclick="addToCart('${p.sku}')" style="border: 1px solid #eee; padding: 12px; border-radius: 12px; cursor: pointer; text-align: center; background: white; transition:0.2s;" onmouseover="this.style.borderColor='#7c3aed'" onmouseout="this.style.borderColor='#eee'">
    <img src="${p.image || 'https://via.placeholder.com/150?text=No+Image'}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 8px;" />
    <div style="font-weight: 600; margin-top: 8px; font-size: 0.9rem; height: 2.4rem; overflow: hidden;">${p.name}</div>
    <div style="color: #7c3aed; font-weight: 700;">฿${Number(p.price).toLocaleString()}</div>
    <div style="font-size: 0.75rem; color: #999;">คลัง: ${p.stock}</div>
  </div>`).join("");
}

function handlePOSSearch(val) { const filtered = products.filter(p => p.name.toLowerCase().includes(val.toLowerCase()) || p.sku.toLowerCase().includes(val.toLowerCase())); document.getElementById("pos-product-grid").innerHTML = renderPOSProductList(filtered); }
function filterPOSByCategory(cat) { document.querySelectorAll(".btn-category").forEach(btn => btn.classList.remove("active")); const filtered = cat === "" ? products : products.filter(p => p.category === cat); document.getElementById("pos-product-grid").innerHTML = renderPOSProductList(filtered); }

function addToCart(sku) {
  const p = products.find(x => x.sku === sku); if (!p) return;
  const item = cart.find(x => x.sku === sku);
  if (item) { if (item.qty + 1 > p.stock) return showToast("สต็อกไม่พอ", "warning"); item.qty++; }
  else { if (p.stock < 1) return showToast("สินค้าหมด", "error"); cart.push({ sku, name: p.name, price: Number(p.price), qty: 1 }); }
  renderCart();
}

function renderCart() {
  let sub = 0;
  const html = cart.map((item, i) => {
    sub += item.price * item.qty;
    return `<div style="display: flex; justify-content: space-between; margin-bottom: 12px; align-items: center; background:#f8fafc; padding:8px; border-radius:8px;">
      <div style="flex:1;"><div style="font-weight:600; font-size:0.85rem;">${item.name}</div><div style="font-size:0.75rem; color:#999;">฿${item.price.toLocaleString()} x ${item.qty}</div></div>
      <div style="font-weight:700; margin-right:10px;">฿${(item.price * item.qty).toLocaleString()}</div>
      <button onclick="removeFromCart(${i})" style="color: #ef4444; border: none; background: none; cursor: pointer;"><i class="fas fa-trash-alt"></i></button>
    </div>`;
  }).join("");
  document.getElementById("cart-list").innerHTML = html || `<div style="text-align:center; color:#999; padding:40px;">ไม่มีสินค้า</div>`;
  document.getElementById("total-val").textContent = sub.toLocaleString();
}
function removeFromCart(idx) { cart.splice(idx, 1); renderCart(); }

async function checkout() {
  if (cart.length === 0) return showToast("กรุณาเลือกสินค้า", "warning");
  const total = cart.reduce((s, i) => s + (i.price * i.qty), 0);
  let modal = document.getElementById("payment-modal"); if (!modal) { modal = document.createElement("div"); modal.id = "payment-modal"; modal.className = "modal"; document.body.appendChild(modal); }
  modal.innerHTML = `
    <div class="modal-content" style="width: 350px;">
      <div class="modal-header"><h2>ชำระเงิน</h2><button onclick="document.getElementById('payment-modal').style.display='none'" class="modal-close">x</button></div>
      <div style="padding: 24px;">
        <div style="text-align: center; margin-bottom: 15px; font-size: 1.8rem; font-weight: 800; color: #7c3aed;">฿${total.toLocaleString()}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 15px;">
          ${['cash', 'qr', 'transfer'].map(m => `<label style="font-size:0.8rem; text-align:center; border:1px solid #ddd; padding:5px; border-radius:8px; cursor:pointer;"><input type="radio" name="pay-method" value="${m}" ${m==='cash'?'checked':''} /><br/>${m.toUpperCase()}</label>`).join('')}
        </div>
        <input type="number" id="pay-received" placeholder="รับเงินมา" style="width: 100%; padding: 12px; font-size: 1.5rem; text-align: center; border-radius:12px; border:1px solid #ddd;" oninput="calculateChange(${total})" />
        <div id="pay-change" style="text-align: right; margin-top: 10px; font-weight: 700; color: #059669; font-size: 1.2rem;">เงินทอน: ฿0.00</div>
      </div>
      <div class="modal-footer"><button onclick="finalizeCheckout(${total})" class="btn-primary" style="width: 100%; padding: 12px;">ยืนยันการขาย</button></div>
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
  if (method === "cash" && received < totalAmount) return showToast("ยอดเงินไม่พอ", "warning");
  
  const btn = event.target; btn.disabled = true; btn.innerHTML = "กำลังบันทึก...";
  try {
    const res = await fetch("/api/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart, customer_phone: document.getElementById("pos-customer").value, payment_method: method }),
    });
    if (res.ok) {
      const data = await res.json();
      showToast("ขายสำเร็จ", "success");
      document.getElementById("payment-modal").style.display = "none";
      generateReceiptPDF(data.order_id);
      cart = []; await loadData(); renderPOS();
    }
  } catch (e) { showToast("เกิดข้อผิดพลาด", "error"); }
  btn.disabled = false; btn.innerHTML = "ยืนยันการขาย";
}

// --- Inventory Page ---

function renderInventory() {
  document.getElementById("inventory").innerHTML = `
    <div style="display: flex; justify-content: space-between; margin-bottom: 24px; align-items: center;">
      <div style="display: flex; gap: 10px;">
        <button onclick="openAddProductModal()" class="btn-primary">+ เพิ่มสินค้า</button>
        <button onclick="openStockLogModal()" style="background: #f1f5f9; padding: 10px 20px; border-radius: 12px; cursor: pointer; border: 1px solid #ddd;">ประวัติสต็อก</button>
      </div>
      <input type="text" id="inv-search" placeholder="ค้นหาตามชื่อ/รหัส..." oninput="inventorySearchQuery=this.value; renderInventoryRows();" style="width: 300px; padding: 10px; border-radius: 12px; border: 1px solid #ddd;" />
    </div>
    <div class="card" style="padding: 0; overflow: hidden;">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>รูป</th><th>SKU</th><th>ชื่อสินค้า</th><th>หมวดหมู่</th><th style="text-align: right;">ราคา</th><th style="text-align: center;">สต็อก</th><th style="text-align: center;">จัดการ</th></tr>
          </thead>
          <tbody id="inv-tbody"></tbody>
        </table>
      </div>
    </div>
    <!-- Modals -->
    <div id="inv-modal" class="modal" style="display: none;"><div class="modal-content"><div class="modal-header"><h2 id="modal-title">ข้อมูลสินค้า</h2><button onclick="closeModal()">x</button></div>
      <form onsubmit="saveProduct(event)"><div style="padding: 24px;" class="grid">
        <label>SKU<input type="text" id="m-sku" required /></label>
        <label>ชื่อสินค้า<input type="text" id="m-name" required /></label>
        <label>หมวดหมู่<select id="m-cat">${productTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join("")}</select></label>
        <label>ราคา<input type="number" id="m-price" required /></label>
        <label>สต็อก<input type="number" id="m-stock" required /></label>
        <label>รูปภาพ<input type="file" id="m-img" /></label>
      </div><div class="modal-footer"><button type="submit" class="btn-primary">บันทึก</button></div></form>
    </div></div>
    <div id="stock-modal" class="modal" style="display: none;"><div class="modal-content" style="width: 350px;"><div class="modal-header"><h2>เพิ่มสต็อก</h2><button onclick="closeStockModal()">x</button></div>
      <form onsubmit="addStock(event)"><div id="stock-product-info" style="padding: 24px; background: #f8fafc;"></div><div style="padding: 24px;"><input type="number" id="stock-qty" required placeholder="จำนวนที่เพิ่ม" style="width: 100%; text-align: center; font-size: 2rem; border: 2px solid #7c3aed; border-radius: 12px;" /></div>
      <div class="modal-footer"><button type="submit" class="btn-primary" style="width: 100%;">บวกสต็อกเพิ่ม</button></div></form>
    </div></div>
    <div id="stock-log-modal" class="modal" style="display: none;"><div class="modal-content" style="width: 600px;"><div class="modal-header"><h2>ประวัติสต็อก</h2><button onclick="document.getElementById('stock-log-modal').style.display='none'">x</button></div>
      <div id="stock-log-content" style="padding: 20px; max-height: 400px; overflow-y: auto;"></div>
    </div></div>
  `;
  renderInventoryRows();
}

function renderInventoryRows() {
  const q = inventorySearchQuery.toLowerCase();
  const filtered = products.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  document.getElementById("inv-tbody").innerHTML = filtered.map(p => `<tr>
    <td style="text-align: center;"><img src="${p.image || 'https://via.placeholder.com/50'}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;" /></td>
    <td>${p.sku}</td><td>${p.name}</td><td>${p.category || 'ทั่วไป'}</td><td style="text-align: right;">฿${Number(p.price).toLocaleString()}</td><td style="text-align: center;"><span class="status-badge ${p.stock <= settings.low_stock_threshold ? 'status-low-stock' : 'status-in-stock'}">${p.stock}</span></td>
    <td style="text-align: center;">
      <button onclick="openAddStockModal('${p.sku}')" style="background: #ecfdf5; color: #059669; padding: 6px; border-radius: 6px; border: none; cursor: pointer;"><i class="fas fa-plus"></i></button>
      <button onclick="editProduct('${p.sku}')" style="background: #eff6ff; color: #2563eb; padding: 6px; border-radius: 6px; border: none; cursor: pointer;"><i class="fas fa-edit"></i></button>
      <button onclick="delProduct('${p.sku}')" style="background: #fef2f2; color: #ef4444; padding: 6px; border-radius: 6px; border: none; cursor: pointer;"><i class="fas fa-trash-alt"></i></button>
    </td></tr>`).join("");
}

function openAddProductModal() { editProductSku = null; document.getElementById("modal-title").textContent = "เพิ่มสินค้าใหม่"; document.getElementById("m-sku").value = ""; document.getElementById("m-sku").readOnly = false; document.getElementById("m-name").value = ""; document.getElementById("m-price").value = ""; document.getElementById("m-stock").value = ""; document.getElementById("inv-modal").style.display = "flex"; }
function editProduct(sku) { const p = products.find(x => x.sku === sku); if (!p) return; editProductSku = sku; document.getElementById("modal-title").textContent = "แก้ไขสินค้า"; document.getElementById("m-sku").value = p.sku; document.getElementById("m-sku").readOnly = true; document.getElementById("m-name").value = p.name; document.getElementById("m-price").value = p.price; document.getElementById("m-stock").value = p.stock; document.getElementById("m-cat").value = p.category || ""; document.getElementById("inv-modal").style.display = "flex"; }
function closeModal() { document.getElementById("inv-modal").style.display = "none"; }
function openAddStockModal(sku) { const p = products.find(x => x.sku === sku); if (!p) return; editProductSku = sku; document.getElementById("stock-product-info").innerHTML = `<strong>${p.name}</strong> (SKU: ${p.sku})<br/>คลังปัจจุบัน: ${p.stock}`; document.getElementById("stock-qty").value = ""; document.getElementById("stock-modal").style.display = "flex"; }
function closeStockModal() { document.getElementById("stock-modal").style.display = "none"; }
async function addStock(e) { e.preventDefault(); try { const res = await fetch(`/api/products/${encodeURIComponent(editProductSku)}/add-stock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: document.getElementById("stock-qty").value }) }); if (res.ok) { showToast("เพิ่มสต็อกสำเร็จ"); closeStockModal(); await loadData(); renderInventory(); } } catch (e) { showToast("ล้มเหลว", "error"); } }
async function saveProduct(e) { e.preventDefault(); const fd = new FormData(); fd.append("sku", document.getElementById("m-sku").value); fd.append("name", document.getElementById("m-name").value); fd.append("category", document.getElementById("m-cat").value); fd.append("price", document.getElementById("m-price").value); fd.append("stock", document.getElementById("m-stock").value); const imgFile = document.getElementById("m-img").files[0]; if (imgFile) fd.append("image", imgFile); const url = editProductSku ? `/api/products/${editProductSku}` : "/api/products"; try { const res = await fetch(url, { method: editProductSku ? "PUT" : "POST", body: fd }); if (res.ok) { showToast("สำเร็จ"); closeModal(); await loadData(); renderInventory(); } } catch (error) { showToast("ล้มเหลว", "error"); } }
async function delProduct(sku) { if (!confirm("ลบสินค้า?")) return; try { const res = await fetch(`/api/products/${sku}`, { method: "DELETE" }); if (res.ok) { showToast("ลบสำเร็จ"); await loadData(); renderInventory(); } } catch (error) { showToast("ล้มเหลว", "error"); } }
async function openStockLogModal() { const content = document.getElementById("stock-log-content"); content.innerHTML = "กำลังโหลด..."; document.getElementById("stock-log-modal").style.display = "flex"; try { const logs = await fetchJson("/api/stock-logs"); content.innerHTML = logs.map(l => `<div style="border-bottom: 1px solid #eee; padding: 10px 0;"><div style="font-size: 0.8rem; color: #999;">${new Date(l.created_at).toLocaleString()}</div><strong>${l.product_name}</strong> (+${l.quantity})</div>`).join("") || "ไม่มีประวัติ"; } catch (err) { content.innerHTML = "โหลดล้มเหลว"; } }

// --- Reports Page ---

function renderReports() {
  const orders = {}; sales.forEach(s => { if (!orders[s.order_id]) orders[s.order_id] = { id: s.order_id, cust: s.customer_name || "-", total: 0, date: s.sold_at, method: s.payment_method }; orders[s.order_id].total += Number(s.total); });
  const list = Object.values(orders).sort((a,b) => new Date(b.date) - new Date(a.date));
  document.getElementById("reports").innerHTML = `
    <div class="card"><h2>ค้นหารายงาน</h2><div class="grid" style="grid-template-columns: 1fr 1fr 1fr auto; gap: 10px;">
      <input type="date" id="rep-start" /><input type="date" id="rep-end" /><input type="text" id="rep-search" placeholder="เลขออเดอร์/ลูกค้า" /><button onclick="filterReports()" class="btn-primary">ค้นหา</button>
    </div></div>
    <div class="card"><div class="table-wrap"><table><thead><tr><th>ออเดอร์</th><th>วันที่</th><th>ชำระโดย</th><th>ลูกค้า</th><th>ยอดรวม</th><th>ใบเสร็จ</th></tr></thead>
    <tbody>${list.map(o => `<tr><td>${o.id}</td><td>${new Date(o.date).toLocaleString()}</td><td>${o.method || 'cash'}</td><td>${o.cust}</td><td>฿${o.total.toLocaleString()}</td><td><button onclick="generateReceiptPDF('${o.id}')"><i class="fas fa-file-pdf"></i></button></td></tr>`).join("")}</tbody>
    </table></div></div>
  `;
}
async function filterReports() { const start = document.getElementById("rep-start").value, end = document.getElementById("rep-end").value, q = document.getElementById("rep-search").value; let url = `/api/sales?`; if (start) url += `start_date=${start}&`; if (end) url += `end_date=${end}&`; if (q) url += `search=${encodeURIComponent(q)}&`; sales = await fetchJson(url); renderReports(); }

// --- Users & Customers ---

function renderUsers() { document.getElementById("users").innerHTML = `<div class="card"><h2>จัดการผู้ใช้</h2><p>ฟังก์ชันนี้จำกัดเฉพาะผู้ดูแลระบบขั้นสูง</p></div>`; }
function renderPromotions() { document.getElementById("promotions").innerHTML = `<div class="card"><h2>จัดการโปรโมชั่น</h2><p>อยู่ระหว่างการปรับปรุง</p></div>`; }
function renderCustomers() {
  document.getElementById("customers").innerHTML = `
    <div class="card"><h2><i class="fas fa-user-plus"></i> จัดการลูกค้า</h2><form onsubmit="saveCustomer(event)"><div class="grid" style="grid-template-columns: 1fr 1fr auto; gap:15px;"><input type="text" id="c-phone" placeholder="เบอร์โทร" required /><input type="text" id="c-name" placeholder="ชื่อ" required /><button type="submit" class="btn-primary">บันทึก</button></div></form></div>
    <div class="card" style="margin-top:20px;"><div class="table-wrap"><table><thead><tr><th>เบอร์โทร</th><th>ชื่อ</th><th>จัดการ</th></tr></thead><tbody>${customers.map(c => `<tr><td>${c.phone}</td><td>${c.name}</td><td><button onclick="viewCustomerHistory('${c.phone}')" style="background:#eff6ff; color:#2563eb; border:none; padding:5px 10px; border-radius:8px; cursor:pointer;">ประวัติ</button></td></tr>`).join("")}</tbody></table></div></div>
    <div id="history-modal" class="modal" style="display: none;"><div class="modal-content" style="width: 500px;"><div class="modal-header"><h2>ประวัติลูกค้า</h2><button onclick="document.getElementById('history-modal').style.display='none'">x</button></div><div id="history-content" style="padding: 20px; max-height: 400px; overflow-y: auto;"></div></div></div>
  `;
}
async function saveCustomer(e) { e.preventDefault(); await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: document.getElementById("c-phone").value, name: document.getElementById("c-name").value }) }); await loadData(); renderCustomers(); }
async function viewCustomerHistory(phone) {
  const cust = customers.find(x => x.phone === phone); if (!cust) return;
  const custSales = sales.filter(s => s.customer_phone === phone);
  document.getElementById("history-content").innerHTML = `<strong>${cust.name}</strong> (${cust.phone})<hr/>` + (custSales.map(s => `<div>${new Date(s.sold_at).toLocaleDateString("th-TH")} - ${s.sku} x ${s.qty} (฿${Number(s.total).toLocaleString()})</div>`).join("") || "ไม่มีประวัติ");
  document.getElementById("history-modal").style.display = "flex";
}

// --- PDF & Receipt ---

async function generateReceiptPDF(orderId) { 
  try {
    const res = await fetch(`/api/orders/${orderId}`); if (!res.ok) return showToast("ไม่พบข้อมูล", "error");
    const order = await res.json();
    const element = document.createElement("div"); element.style.padding = "40px";
    element.innerHTML = `<h1 style="text-align:center;">ใบเสร็จรับเงิน</h1><p>เลขออเดอร์: ${order.order_id}</p><p>วันที่: ${new Date(order.sold_at).toLocaleString("th-TH")}</p><p>ลูกค้า: ${order.customer_name}</p><hr/>` + 
      order.items.map(i => `<div style="display:flex; justify-content:space-between;"><span>${i.product_name} x ${i.qty}</span><span>฿${Number(i.total).toLocaleString()}</span></div>`).join("") + 
      `<hr/><h3 style="text-align:right;">ยอดรวมสุทธิ: ฿${order.items.reduce((s,i)=>s+Number(i.total), 0).toLocaleString()}</h3>`;
    html2pdf().from(element).save(`Receipt-${orderId}.pdf`);
  } catch (e) { showToast("พิมพ์ไม่สำเร็จ", "error"); }
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
