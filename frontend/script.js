/* ═══════════════════════════════════════════════════════════════
   AutoCare — Garage Management System  |  script.js
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ── Config ────────────────────────────────────────────────────
const API = 'https://garageweb.onrender.com';  // same-origin; change to full URL if needed
let token = localStorage.getItem('autocare_token') || null;
let currentUser = JSON.parse(localStorage.getItem('autocare_user') || 'null');

// In-memory cache for selects
let _customers = [];
let _services  = [];
let _parts     = [];
let _staff     = [];

// ── Helpers ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = n => Number(n || 0).toLocaleString('vi-VN') + ' đ';
const fmtDate = s => s ? new Date(s).toLocaleDateString('vi-VN') : '—';
const fmtDateTime = s => s ? new Date(s).toLocaleString('vi-VN') : '—';

function headers() {
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function api(method, path, body) {
  try {
    const res = await fetch(API + path, {
      method,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  }
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fas ${icons[type]}"></i><span>${msg}</span>`;
  $('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ── Modal helpers ─────────────────────────────────────────────
function openModal(id)  { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
window.closeModal = closeModal;

// Close modal on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) backdrop.classList.remove('open');
  });
});

// ── Navigation ────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = $(`page-${page}`);
  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');
  $('topbar-title').textContent = navEl?.textContent.trim().replace(/^\s*\S+\s*/,'') || page;

  // Lazy-load page data
  const loaders = {
    dashboard: loadDashboard,
    customers: loadCustomers,
    vehicles: loadVehicles,
    services: loadServices,
    parts: loadParts,
    'repair-orders': loadRepairOrders,
    appointments: loadAppointments,
    invoices: loadInvoices,
    reports: loadReports,
    staff: loadStaff,
  };
  loaders[page]?.();
}
window.navigate = navigate;

// Sidebar nav clicks
document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});

// ── Auth ──────────────────────────────────────────────────────
$('login-btn').addEventListener('click', doLogin);
$('login-username').addEventListener('keydown', e => e.key === 'Enter' && $('login-password').focus());
$('login-password').addEventListener('keydown', e => e.key === 'Enter' && doLogin());

async function doLogin() {
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  const errEl = $('login-error');
  errEl.classList.remove('show');
  if (!username || !password) { errEl.textContent = 'Vui lòng nhập đầy đủ thông tin'; errEl.classList.add('show'); return; }
  $('login-btn').disabled = true;
  $('login-btn').innerHTML = '<span class="spinner"></span>';
  try {
    const data = await api('POST', '/api/auth/login', { username, password });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('autocare_token', token);
    localStorage.setItem('autocare_user', JSON.stringify(currentUser));
    bootApp();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
  } finally {
    $('login-btn').disabled = false;
    $('login-btn').innerHTML = '<i class="fas fa-sign-in-alt"></i> Đăng nhập';
  }
}

function bootApp() {
  $('login-page').style.display = 'none';
  $('app').classList.add('visible');

  // User info
  const name = currentUser.full_name || currentUser.username;
  $('user-display-name').textContent = name;
  $('user-avatar').textContent = name.charAt(0).toUpperCase();
  const roleLabels = { quan_ly: 'Quản lý', nhan_vien_le_tan: 'Lễ tân', nhan_vien_ky_thuat: 'Kỹ thuật' };
  $('user-display-role').textContent = roleLabels[currentUser.role] || currentUser.role;

  // Role-based visibility
  if (currentUser.role !== 'quan_ly') {
    $('admin-nav')?.querySelectorAll('[data-page="staff"],[data-page="reports"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#add-service-btn').forEach(el => el.style.display = 'none');
  }

  // Date display
  $('dash-date').textContent = new Date().toLocaleDateString('vi-VN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  // Preload caches
  preloadCaches();
  navigate('dashboard');
}

$('logout-btn').addEventListener('click', () => {
  token = null; currentUser = null;
  localStorage.removeItem('autocare_token');
  localStorage.removeItem('autocare_user');
  $('app').classList.remove('visible');
  $('login-page').style.display = '';
  $('login-password').value = '';
});

// Auto-login if token exists
if (token && currentUser) {
  bootApp();
}

// ── Caches ────────────────────────────────────────────────────
async function preloadCaches() {
  [_customers, _services, _parts, _staff] = await Promise.all([
    api('GET', '/api/customers').catch(() => []),
    api('GET', '/api/services').catch(() => []),
    api('GET', '/api/parts').catch(() => []),
    api('GET', '/api/users').catch(() => []),
  ]);
}

// ── DASHBOARD ────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [stats, orders, appts] = await Promise.all([
      api('GET', '/api/reports/dashboard'),
      api('GET', '/api/repair-orders?status=tiep_nhan'),
      api('GET', '/api/appointments?status=cho_xac_nhan'),
    ]);

    // Update badges
    const pending = (orders.filter(o => ['tiep_nhan','dang_sua'].includes(o.status)).length) || stats.pendingOrders;
    const badgePending = $('badge-pending');
    const badgeAppt = $('badge-appt');
    if (stats.pendingOrders > 0) { badgePending.textContent = stats.pendingOrders; badgePending.style.display = ''; }
    if (stats.pendingAppointments > 0) { badgeAppt.textContent = stats.pendingAppointments; badgeAppt.style.display = ''; }

    // Stat cards
    $('dash-stats').innerHTML = `
      <div class="stat-card orange">
        <div class="stat-icon orange"><i class="fas fa-users"></i></div>
        <div class="stat-value">${stats.totalCustomers}</div>
        <div class="stat-label">Tổng khách hàng</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-icon blue"><i class="fas fa-car"></i></div>
        <div class="stat-value">${stats.totalVehicles}</div>
        <div class="stat-label">Tổng xe</div>
      </div>
      <div class="stat-card yellow">
        <div class="stat-icon yellow"><i class="fas fa-clipboard-list"></i></div>
        <div class="stat-value">${stats.ordersToday}</div>
        <div class="stat-label">Phiếu hôm nay</div>
      </div>
      <div class="stat-card green">
        <div class="stat-icon green"><i class="fas fa-dollar-sign"></i></div>
        <div class="stat-value" style="font-size:18px">${fmt(stats.revenueToday)}</div>
        <div class="stat-label">Doanh thu hôm nay</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-icon orange"><i class="fas fa-chart-line"></i></div>
        <div class="stat-value" style="font-size:18px">${fmt(stats.revenueMonth)}</div>
        <div class="stat-label">Doanh thu tháng này</div>
      </div>
      <div class="stat-card red">
        <div class="stat-icon red"><i class="fas fa-exclamation-triangle"></i></div>
        <div class="stat-value">${stats.lowStockParts}</div>
        <div class="stat-label">Phụ tùng sắp hết</div>
      </div>
    `;

    // Recent orders
    const recentOrders = await api('GET', '/api/repair-orders').catch(() => []);
    const top5 = recentOrders.slice(0, 5);
    $('dash-recent-orders').innerHTML = top5.length ? `
      <table style="width:100%">
        <thead><tr><th>Xe</th><th>Khách</th><th>Trạng thái</th></tr></thead>
        <tbody>${top5.map(o => `
          <tr style="cursor:pointer" onclick="viewOrderDetail(${o.id})">
            <td><span class="plate-badge">${o.plate}</span></td>
            <td>${o.customer_name}</td>
            <td>${statusBadge(o.status)}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state" style="padding:24px"><i class="fas fa-clipboard-list"></i><p>Chưa có phiếu nào</p></div>';

    // Upcoming appointments
    const topAppts = appts.slice(0, 5);
    $('dash-upcoming-appts').innerHTML = topAppts.length ? `
      <table style="width:100%">
        <thead><tr><th>Khách</th><th>Xe</th><th>Giờ hẹn</th></tr></thead>
        <tbody>${topAppts.map(a => `
          <tr>
            <td>${a.customer_name}</td>
            <td>${a.plate ? `<span class="plate-badge">${a.plate}</span>` : '—'}</td>
            <td class="text-mono" style="font-size:12px">${fmtDateTime(a.scheduled_at)}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty-state" style="padding:24px"><i class="fas fa-calendar-alt"></i><p>Không có lịch hẹn đang chờ</p></div>';

  } catch (e) { /* silently handled */ }
}

// ── STATUS helpers ────────────────────────────────────────────
function statusBadge(status) {
  const map = {
    tiep_nhan:     ['badge-blue',   'Tiếp nhận'],
    dang_sua:      ['badge-yellow', 'Đang sửa'],
    hoan_thanh:    ['badge-green',  'Hoàn thành'],
    da_thanh_toan: ['badge-gray',   'Đã thanh toán'],
    huy:           ['badge-red',    'Hủy'],
  };
  const [cls, label] = map[status] || ['badge-gray', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function apptStatusBadge(status) {
  const map = {
    cho_xac_nhan: ['badge-yellow', 'Chờ xác nhận'],
    da_xac_nhan:  ['badge-blue',   'Đã xác nhận'],
    hoan_thanh:   ['badge-green',  'Hoàn thành'],
    huy:          ['badge-red',    'Hủy'],
  };
  const [cls, label] = map[status] || ['badge-gray', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function roleBadge(role) {
  const map = {
    quan_ly:             ['badge-orange', 'Quản lý'],
    nhan_vien_le_tan:    ['badge-blue',   'Lễ tân'],
    nhan_vien_ky_thuat:  ['badge-green',  'Kỹ thuật'],
  };
  const [cls, label] = map[role] || ['badge-gray', role];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── CUSTOMERS ────────────────────────────────────────────────
async function loadCustomers() {
  const search = $('customer-search')?.value || '';
  const data = await api('GET', `/api/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`).catch(() => []);
  _customers = data;
  const tbody = $('customer-table');
  const empty = $('customer-empty');
  if (!data.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = data.map(c => `
    <tr>
      <td class="text-muted text-mono" style="font-size:12px">#${c.id}</td>
      <td><span class="font-bold">${c.name}</span></td>
      <td class="text-mono">${c.phone}</td>
      <td>${c.address || '—'}</td>
      <td><span class="badge badge-blue">${c.vehicle_count} xe</span></td>
      <td class="text-muted" style="font-size:12px">${fmtDate(c.created_at)}</td>
      <td>
        <div class="td-actions">
          <button class="btn btn-ghost btn-sm btn-icon" title="Sửa" onclick="openCustomerModal(${c.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm btn-icon" title="Xóa" onclick="deleteCustomer(${c.id},'${c.name}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}
window.loadCustomers = loadCustomers;

function openCustomerModal(id) {
  $('customer-id').value = id || '';
  $('customer-name').value = '';
  $('customer-phone').value = '';
  $('customer-address').value = '';
  if (id) {
    $('customer-modal-title').textContent = 'Sửa thông tin khách hàng';
    api('GET', `/api/customers/${id}`).then(c => {
      $('customer-name').value = c.name;
      $('customer-phone').value = c.phone;
      $('customer-address').value = c.address || '';
    });
  } else {
    $('customer-modal-title').textContent = 'Thêm khách hàng';
  }
  openModal('modal-customer');
}
window.openCustomerModal = openCustomerModal;

async function saveCustomer() {
  const id = $('customer-id').value;
  const body = { name: $('customer-name').value.trim(), phone: $('customer-phone').value.trim(), address: $('customer-address').value.trim() };
  if (!body.name || !body.phone) return toast('Tên và SĐT là bắt buộc', 'error');
  await api(id ? 'PUT' : 'POST', id ? `/api/customers/${id}` : '/api/customers', body);
  toast(id ? 'Đã cập nhật khách hàng' : 'Thêm khách hàng thành công', 'success');
  closeModal('modal-customer');
  loadCustomers();
}
window.saveCustomer = saveCustomer;

async function deleteCustomer(id, name) {
  if (!confirm(`Xóa khách hàng "${name}"? Tất cả xe liên quan cũng sẽ bị xóa.`)) return;
  await api('DELETE', `/api/customers/${id}`);
  toast('Đã xóa khách hàng', 'success');
  loadCustomers();
}
window.deleteCustomer = deleteCustomer;

// ── VEHICLES ──────────────────────────────────────────────────
async function loadVehicles() {
  const search = $('vehicle-search')?.value || '';
  const data = await api('GET', `/api/vehicles${search ? `?search=${encodeURIComponent(search)}` : ''}`).catch(() => []);
  const tbody = $('vehicle-table');
  const empty = $('vehicle-empty');
  if (!data.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = data.map(v => `
    <tr>
      <td><span class="plate-badge">${v.plate}</span></td>
      <td><span class="font-bold">${v.brand}</span> ${v.model}</td>
      <td>${v.color || '—'} ${v.year ? `/ ${v.year}` : ''}</td>
      <td>${v.customer_name}</td>
      <td class="text-mono">${v.customer_phone}</td>
      <td>
        <div class="td-actions">
          <button class="btn btn-ghost btn-sm btn-icon" title="Sửa" onclick="openVehicleModal(${v.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm btn-icon" title="Xóa" onclick="deleteVehicle(${v.id},'${v.plate}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}
window.loadVehicles = loadVehicles;

function openVehicleModal(id) {
  $('vehicle-id').value = id || '';
  $('vehicle-plate').value = '';
  $('vehicle-brand').value = '';
  $('vehicle-model').value = '';
  $('vehicle-color').value = '';
  $('vehicle-year').value = '';

  // Populate customer select
  const sel = $('vehicle-customer-id');
  sel.innerHTML = _customers.map(c => `<option value="${c.id}">${c.name} — ${c.phone}</option>`).join('');

  if (id) {
    $('vehicle-modal-title').textContent = 'Sửa thông tin xe';
    api('GET', `/api/vehicles?customer_id=0`).catch(() => []);
    // Fetch single vehicle via vehicles list
    api('GET', `/api/vehicles`).then(all => {
      const v = all.find(x => x.id == id);
      if (!v) return;
      $('vehicle-customer-id').value = v.customer_id;
      $('vehicle-plate').value = v.plate;
      $('vehicle-plate').disabled = true;
      $('vehicle-brand').value = v.brand;
      $('vehicle-model').value = v.model;
      $('vehicle-color').value = v.color || '';
      $('vehicle-year').value = v.year || '';
    });
  } else {
    $('vehicle-modal-title').textContent = 'Thêm xe';
    $('vehicle-plate').disabled = false;
  }
  openModal('modal-vehicle');
}
window.openVehicleModal = openVehicleModal;

async function saveVehicle() {
  const id = $('vehicle-id').value;
  const body = {
    customer_id: $('vehicle-customer-id').value,
    plate: $('vehicle-plate').value.trim().toUpperCase(),
    brand: $('vehicle-brand').value.trim(),
    model: $('vehicle-model').value.trim(),
    color: $('vehicle-color').value.trim(),
    year: $('vehicle-year').value || null,
  };
  if (!body.customer_id || !body.plate || !body.brand || !body.model) return toast('Thiếu thông tin bắt buộc', 'error');
  await api(id ? 'PUT' : 'POST', id ? `/api/vehicles/${id}` : '/api/vehicles', body);
  toast(id ? 'Đã cập nhật xe' : 'Thêm xe thành công', 'success');
  closeModal('modal-vehicle');
  loadVehicles();
}
window.saveVehicle = saveVehicle;

async function deleteVehicle(id, plate) {
  if (!confirm(`Xóa xe "${plate}"?`)) return;
  await api('DELETE', `/api/vehicles/${id}`);
  toast('Đã xóa xe', 'success');
  loadVehicles();
}
window.deleteVehicle = deleteVehicle;

// ── SERVICES ──────────────────────────────────────────────────
async function loadServices() {
  const data = await api('GET', '/api/services').catch(() => []);
  _services = data;
  const tbody = $('service-table');
  tbody.innerHTML = data.map(s => `
    <tr>
      <td class="text-muted text-mono" style="font-size:12px">#${s.id}</td>
      <td class="font-bold">${s.name}</td>
      <td class="text-muted">${s.description || '—'}</td>
      <td class="amount text-accent">${fmt(s.price)}</td>
      <td>${s.duration_min} phút</td>
      <td>${s.active ? '<span class="badge badge-green">Hoạt động</span>' : '<span class="badge badge-gray">Dừng</span>'}</td>
      <td>
        <div class="td-actions">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="openServiceModal(${s.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="deleteService(${s.id},'${s.name}')"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}
window.loadServices = loadServices;

function openServiceModal(id) {
  $('service-id').value = id || '';
  $('service-name').value = '';
  $('service-desc').value = '';
  $('service-price').value = '';
  $('service-duration').value = '60';
  if (id) {
    $('service-modal-title').textContent = 'Sửa dịch vụ';
    const s = _services.find(x => x.id == id);
    if (s) {
      $('service-name').value = s.name;
      $('service-desc').value = s.description || '';
      $('service-price').value = s.price;
      $('service-duration').value = s.duration_min;
    }
  } else {
    $('service-modal-title').textContent = 'Thêm dịch vụ';
  }
  openModal('modal-service');
}
window.openServiceModal = openServiceModal;

async function saveService() {
  const id = $('service-id').value;
  const body = {
    name: $('service-name').value.trim(),
    description: $('service-desc').value.trim(),
    price: parseFloat($('service-price').value),
    duration_min: parseInt($('service-duration').value) || 60,
    active: 1,
  };
  if (!body.name || isNaN(body.price)) return toast('Thiếu thông tin bắt buộc', 'error');
  await api(id ? 'PUT' : 'POST', id ? `/api/services/${id}` : '/api/services', body);
  toast(id ? 'Đã cập nhật dịch vụ' : 'Thêm dịch vụ thành công', 'success');
  closeModal('modal-service');
  loadServices();
}
window.saveService = saveService;

async function deleteService(id, name) {
  if (!confirm(`Xóa dịch vụ "${name}"?`)) return;
  await api('DELETE', `/api/services/${id}`);
  toast('Đã xóa dịch vụ', 'success');
  loadServices();
}
window.deleteService = deleteService;

// ── PARTS ────────────────────────────────────────────────────
async function loadParts() {
  const data = await api('GET', '/api/parts').catch(() => []);
  _parts = data;
  const tbody = $('part-table');
  const empty = $('part-empty');
  if (!data.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = data.map(p => {
    const lowStock = p.stock_qty <= p.min_stock;
    return `
      <tr>
        <td class="text-muted text-mono" style="font-size:12px">#${p.id}</td>
        <td class="font-bold">${p.name}</td>
        <td>${p.unit}</td>
        <td class="amount">${fmt(p.price)}</td>
        <td>
          <span class="${lowStock ? 'badge badge-red' : 'badge badge-green'}">${p.stock_qty} ${p.unit}</span>
        </td>
        <td class="text-muted">${p.min_stock} ${p.unit}</td>
        <td>
          <div class="td-actions">
            <button class="btn btn-success btn-sm" onclick="openRestockModal(${p.id},'${p.name}')"><i class="fas fa-plus"></i> Nhập</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="openPartModal(${p.id})"><i class="fas fa-edit"></i></button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="deletePart(${p.id},'${p.name}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
  }).join('');
}
window.loadParts = loadParts;

function openPartModal(id) {
  $('part-id').value = id || '';
  $('part-name').value = '';
  $('part-unit').value = 'cái';
  $('part-price').value = '';
  $('part-stock').value = '0';
  $('part-min-stock').value = '5';
  if (id) {
    $('part-modal-title').textContent = 'Sửa phụ tùng';
    const p = _parts.find(x => x.id == id);
    if (p) {
      $('part-name').value = p.name;
      $('part-unit').value = p.unit;
      $('part-price').value = p.price;
      $('part-stock').value = p.stock_qty;
      $('part-min-stock').value = p.min_stock;
    }
  } else {
    $('part-modal-title').textContent = 'Thêm phụ tùng';
  }
  openModal('modal-part');
}
window.openPartModal = openPartModal;

async function savePart() {
  const id = $('part-id').value;
  const body = {
    name: $('part-name').value.trim(),
    unit: $('part-unit').value.trim() || 'cái',
    price: parseFloat($('part-price').value),
    stock_qty: parseInt($('part-stock').value) || 0,
    min_stock: parseInt($('part-min-stock').value) || 5,
  };
  if (!body.name || isNaN(body.price)) return toast('Thiếu thông tin bắt buộc', 'error');
  await api(id ? 'PUT' : 'POST', id ? `/api/parts/${id}` : '/api/parts', body);
  toast(id ? 'Đã cập nhật phụ tùng' : 'Thêm phụ tùng thành công', 'success');
  closeModal('modal-part');
  loadParts();
}
window.savePart = savePart;

async function deletePart(id, name) {
  if (!confirm(`Xóa phụ tùng "${name}"?`)) return;
  await api('DELETE', `/api/parts/${id}`);
  toast('Đã xóa phụ tùng', 'success');
  loadParts();
}
window.deletePart = deletePart;

function openRestockModal(id, name) {
  $('restock-part-id').value = id;
  $('restock-part-name').textContent = `Phụ tùng: ${name}`;
  $('restock-qty').value = '';
  openModal('modal-restock');
}
window.openRestockModal = openRestockModal;

async function doRestock() {
  const id = $('restock-part-id').value;
  const qty = parseInt($('restock-qty').value);
  if (!qty || qty <= 0) return toast('Số lượng không hợp lệ', 'error');
  const res = await api('POST', `/api/parts/${id}/restock`, { qty });
  toast(res.message, 'success');
  closeModal('modal-restock');
  loadParts();
}
window.doRestock = doRestock;

// ── REPAIR ORDERS ────────────────────────────────────────────
async function loadRepairOrders() {
  const status = $('ro-filter-status')?.value || '';
  const search = $('ro-search')?.value || '';
  let qs = [];
  if (status) qs.push(`status=${status}`);
  if (search) qs.push(`search=${encodeURIComponent(search)}`);
  const data = await api('GET', `/api/repair-orders${qs.length ? '?' + qs.join('&') : ''}`).catch(() => []);
  const tbody = $('ro-table');
  const empty = $('ro-empty');
  if (!data.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = data.map(o => `
    <tr style="cursor:pointer" onclick="viewOrderDetail(${o.id})">
      <td class="text-mono text-muted" style="font-size:12px">#${o.id}</td>
      <td><span class="plate-badge">${o.plate}</span><br><span class="text-muted" style="font-size:12px">${o.brand} ${o.model}</span></td>
      <td>${o.customer_name}<br><span class="text-muted text-mono" style="font-size:12px">${o.customer_phone}</span></td>
      <td>${statusBadge(o.status)}</td>
      <td>${o.staff_name || '—'}</td>
      <td class="amount text-accent">${fmt(o.total_amount)}</td>
      <td class="text-muted" style="font-size:12px">${fmtDate(o.created_at)}</td>
      <td>
        <div class="td-actions" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="viewOrderDetail(${o.id})"><i class="fas fa-eye"></i></button>
          ${o.status === 'hoan_thanh' && !o.invoice ? `<button class="btn btn-success btn-sm" onclick="openInvoiceModal(${o.id})"><i class="fas fa-file-invoice"></i> HĐ</button>` : ''}
        </div>
      </td>
    </tr>`).join('');
}
window.loadRepairOrders = loadRepairOrders;

function openRepairOrderModal() {
  $('ro-customer-id').innerHTML = _customers.map(c => `<option value="${c.id}">${c.name} — ${c.phone}</option>`).join('');
  $('ro-staff-id').innerHTML = '<option value="">-- Tự động --</option>' + _staff.map(s => `<option value="${s.id}">${s.full_name}</option>`).join('');
  $('ro-condition').value = '';
  $('ro-note').value = '';
  loadVehiclesForCustomer();
  openModal('modal-repair-order');
}
window.openRepairOrderModal = openRepairOrderModal;

async function loadVehiclesForCustomer() {
  const cid = $('ro-customer-id').value;
  if (!cid) return;
  const vehicles = await api('GET', `/api/vehicles?customer_id=${cid}`).catch(() => []);
  $('ro-vehicle-id').innerHTML = vehicles.length
    ? vehicles.map(v => `<option value="${v.id}">${v.plate} — ${v.brand} ${v.model}</option>`).join('')
    : '<option value="">Không có xe</option>';
}
window.loadVehiclesForCustomer = loadVehiclesForCustomer;

async function saveRepairOrder() {
  const body = {
    customer_id: $('ro-customer-id').value,
    vehicle_id: $('ro-vehicle-id').value,
    staff_id: $('ro-staff-id').value || null,
    initial_condition: $('ro-condition').value.trim(),
    note: $('ro-note').value.trim(),
  };
  if (!body.customer_id || !body.vehicle_id) return toast('Vui lòng chọn khách hàng và xe', 'error');
  const res = await api('POST', '/api/repair-orders', body);
  toast(res.message, 'success');
  closeModal('modal-repair-order');
  loadRepairOrders();
  viewOrderDetail(res.id);
}
window.saveRepairOrder = saveRepairOrder;

// ── ORDER DETAIL ─────────────────────────────────────────────
async function viewOrderDetail(id) {
  const order = await api('GET', `/api/repair-orders/${id}`).catch(() => null);
  if (!order) return;

  $('order-detail-title').textContent = `Phiếu sửa #${order.id} — ${order.plate}`;

  const canEdit = !['da_thanh_toan','huy'].includes(order.status);

  const statusOptions = [
    ['tiep_nhan','Tiếp nhận'],
    ['dang_sua','Đang sửa'],
    ['hoan_thanh','Hoàn thành'],
    ['huy','Hủy'],
  ];

  $('order-detail-body').innerHTML = `
    <div class="order-detail-layout">
      <div>
        <!-- Info -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-header"><span class="card-title">Thông tin chung</span>
            <div style="display:flex;gap:8px;align-items:center">
              ${statusBadge(order.status)}
              ${canEdit ? `<select class="filter-select" id="od-status-sel" style="width:auto;padding:4px 10px;font-size:12px">
                ${statusOptions.map(([v,l]) => `<option value="${v}"${order.status===v?' selected':''}>${l}</option>`).join('')}
              </select>
              <button class="btn btn-primary btn-sm" onclick="updateOrderStatus(${order.id})"><i class="fas fa-save"></i> Cập nhật</button>` : ''}
            </div>
          </div>
          <div class="card-body">
            <div class="detail-grid">
              <div class="detail-item"><label>Khách hàng</label><span>${order.customer_name}</span></div>
              <div class="detail-item"><label>SĐT</label><span class="text-mono">${order.customer_phone}</span></div>
              <div class="detail-item"><label>Xe</label><span><span class="plate-badge">${order.plate}</span> ${order.brand} ${order.model}</span></div>
              <div class="detail-item"><label>Màu / Năm</label><span>${order.color || '—'} / ${order.year || '—'}</span></div>
              <div class="detail-item"><label>Nhân viên</label><span>${order.staff_name || '—'}</span></div>
              <div class="detail-item"><label>Ngày tiếp nhận</label><span>${fmtDateTime(order.created_at)}</span></div>
              ${order.initial_condition ? `<div class="detail-item" style="grid-column:1/-1"><label>Tình trạng ban đầu</label><span>${order.initial_condition}</span></div>` : ''}
              ${order.note ? `<div class="detail-item" style="grid-column:1/-1"><label>Ghi chú</label><span>${order.note}</span></div>` : ''}
            </div>
          </div>
        </div>

        <!-- Services -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <span class="card-title">Dịch vụ thực hiện</span>
            ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openAddServiceToOrder(${order.id})"><i class="fas fa-plus"></i> Thêm</button>` : ''}
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Dịch vụ</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th>${canEdit ? '<th></th>' : ''}</tr></thead>
              <tbody id="od-services">
                ${order.services.length ? order.services.map(s => `
                  <tr>
                    <td>${s.service_name}</td>
                    <td>${s.qty}</td>
                    <td class="amount">${fmt(s.price_at_time)}</td>
                    <td class="amount text-accent">${fmt(s.price_at_time * s.qty)}</td>
                    ${canEdit ? `<td><button class="btn btn-danger btn-sm btn-icon" onclick="removeServiceFromOrder(${order.id},${s.id})"><i class="fas fa-times"></i></button></td>` : ''}
                  </tr>`).join('') : `<tr><td colspan="5" class="text-center text-muted">Chưa có dịch vụ</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Parts -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Phụ tùng sử dụng</span>
            ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="openAddPartToOrder(${order.id})"><i class="fas fa-plus"></i> Thêm</button>` : ''}
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Phụ tùng</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th>${canEdit ? '<th></th>' : ''}</tr></thead>
              <tbody>
                ${order.parts.length ? order.parts.map(p => `
                  <tr>
                    <td>${p.part_name} <span class="text-muted">(${p.unit})</span></td>
                    <td>${p.qty}</td>
                    <td class="amount">${fmt(p.price_at_time)}</td>
                    <td class="amount text-accent">${fmt(p.price_at_time * p.qty)}</td>
                    ${canEdit ? `<td><button class="btn btn-danger btn-sm btn-icon" onclick="removePartFromOrder(${order.id},${p.id})"><i class="fas fa-times"></i></button></td>` : ''}
                  </tr>`).join('') : `<tr><td colspan="5" class="text-center text-muted">Chưa có phụ tùng</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Right sidebar -->
      <div>
        <div class="card">
          <div class="card-header"><span class="card-title">Tổng kết</span></div>
          <div class="card-body">
            <div class="invoice-total-row"><span>Tiền dịch vụ</span><span class="amount">${fmt(order.services.reduce((s,x)=>s+x.price_at_time*x.qty,0))}</span></div>
            <div class="invoice-total-row"><span>Tiền phụ tùng</span><span class="amount">${fmt(order.parts.reduce((s,x)=>s+x.price_at_time*x.qty,0))}</span></div>
            <div class="invoice-total-row grand"><span>Tổng cộng</span><span class="amount">${fmt(order.total_amount)}</span></div>
            <div class="divider"></div>
            ${order.invoice ? `
              <div style="background:var(--greenbg);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:12px;text-align:center">
                <i class="fas fa-check-circle text-green" style="font-size:20px;margin-bottom:6px;display:block"></i>
                <div class="font-bold text-green">Đã thanh toán</div>
                <div class="text-muted" style="font-size:12px;margin-top:4px">${fmtDateTime(order.invoice.paid_at)}</div>
                <button class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%" onclick="viewInvoiceDetail(${order.invoice.id})"><i class="fas fa-file-invoice"></i> Xem hóa đơn</button>
              </div>` :
              order.status === 'hoan_thanh' ? `
              <button class="btn btn-primary btn-full" onclick="openInvoiceModal(${order.id});closeModal('modal-order-detail')">
                <i class="fas fa-file-invoice-dollar"></i> Lập hóa đơn
              </button>` :
              `<p class="text-muted text-center" style="font-size:12px">Hoàn thành phiếu để lập hóa đơn</p>`
            }
          </div>
        </div>
      </div>
    </div>`;

  openModal('modal-order-detail');
}
window.viewOrderDetail = viewOrderDetail;

async function updateOrderStatus(id) {
  const status = $('od-status-sel').value;
  await api('PUT', `/api/repair-orders/${id}/status`, { status });
  toast('Đã cập nhật trạng thái', 'success');
  closeModal('modal-order-detail');
  loadRepairOrders();
}
window.updateOrderStatus = updateOrderStatus;

// Add service to order
let _currentOrderId = null;

function openAddServiceToOrder(orderId) {
  _currentOrderId = orderId;
  const sel = document.createElement('div');
  sel.innerHTML = `
    <div class="modal-backdrop open" id="modal-add-service-order" style="z-index:1100">
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <span class="modal-title">Thêm dịch vụ vào phiếu</span>
          <button class="btn-close" onclick="document.getElementById('modal-add-service-order').remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div class="field"><label>Dịch vụ *</label>
            <select id="add-svc-id">${_services.filter(s=>s.active).map(s=>`<option value="${s.id}">${s.name} — ${fmt(s.price)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Số lượng</label><input id="add-svc-qty" type="number" value="1" min="1" /></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="document.getElementById('modal-add-service-order').remove()">Hủy</button>
          <button class="btn btn-primary" onclick="confirmAddService()"><i class="fas fa-plus"></i> Thêm</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(sel.firstElementChild);
}
window.openAddServiceToOrder = openAddServiceToOrder;

async function confirmAddService() {
  const service_id = $('add-svc-id').value;
  const qty = parseInt($('add-svc-qty').value) || 1;
  await api('POST', `/api/repair-orders/${_currentOrderId}/services`, { service_id, qty });
  toast('Đã thêm dịch vụ', 'success');
  document.getElementById('modal-add-service-order')?.remove();
  closeModal('modal-order-detail');
  viewOrderDetail(_currentOrderId);
}
window.confirmAddService = confirmAddService;

async function removeServiceFromOrder(orderId, sid) {
  await api('DELETE', `/api/repair-orders/${orderId}/services/${sid}`);
  toast('Đã xóa dịch vụ', 'success');
  closeModal('modal-order-detail');
  viewOrderDetail(orderId);
}
window.removeServiceFromOrder = removeServiceFromOrder;

function openAddPartToOrder(orderId) {
  _currentOrderId = orderId;
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="modal-backdrop open" id="modal-add-part-order" style="z-index:1100">
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <span class="modal-title">Thêm phụ tùng vào phiếu</span>
          <button class="btn-close" onclick="document.getElementById('modal-add-part-order').remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div class="field"><label>Phụ tùng *</label>
            <select id="add-part-id">${_parts.map(p=>`<option value="${p.id}">${p.name} (còn: ${p.stock_qty} ${p.unit}) — ${fmt(p.price)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Số lượng</label><input id="add-part-qty" type="number" value="1" min="1" /></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="document.getElementById('modal-add-part-order').remove()">Hủy</button>
          <button class="btn btn-primary" onclick="confirmAddPart()"><i class="fas fa-plus"></i> Thêm</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el.firstElementChild);
}
window.openAddPartToOrder = openAddPartToOrder;

async function confirmAddPart() {
  const part_id = $('add-part-id').value;
  const qty = parseInt($('add-part-qty').value) || 1;
  await api('POST', `/api/repair-orders/${_currentOrderId}/parts`, { part_id, qty });
  toast('Đã thêm phụ tùng', 'success');
  document.getElementById('modal-add-part-order')?.remove();
  closeModal('modal-order-detail');
  viewOrderDetail(_currentOrderId);
}
window.confirmAddPart = confirmAddPart;

async function removePartFromOrder(orderId, pid) {
  await api('DELETE', `/api/repair-orders/${orderId}/parts/${pid}`);
  toast('Đã xóa phụ tùng', 'success');
  closeModal('modal-order-detail');
  viewOrderDetail(orderId);
}
window.removePartFromOrder = removePartFromOrder;

// ── INVOICES ─────────────────────────────────────────────────
let _invoiceOrder = null;

async function openInvoiceModal(orderId) {
  const order = await api('GET', `/api/repair-orders/${orderId}`).catch(() => null);
  if (!order) return;
  _invoiceOrder = order;
  $('inv-order-id').value = orderId;
  $('inv-discount').value = '0';
  $('inv-payment').value = 'tien_mat';

  const svcTotal = order.services.reduce((s,x) => s + x.price_at_time * x.qty, 0);
  const partsTotal = order.parts.reduce((s,x) => s + x.price_at_time * x.qty, 0);

  $('inv-svc-total').textContent = fmt(svcTotal);
  $('inv-parts-total').textContent = fmt(partsTotal);
  $('inv-discount-display').textContent = fmt(0);
  $('inv-grand-total').textContent = fmt(svcTotal + partsTotal);

  // Summary
  $('inv-summary').innerHTML = `
    <div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:13px;color:var(--text2)">Khách hàng: <span class="font-bold text-text">${order.customer_name}</span></div>
      <div style="font-size:13px;color:var(--text2)">Xe: <span class="plate-badge">${order.plate}</span> ${order.brand} ${order.model}</div>
    </div>`;

  openModal('modal-invoice');
}
window.openInvoiceModal = openInvoiceModal;

function calcInvoiceTotal() {
  if (!_invoiceOrder) return;
  const svcTotal = _invoiceOrder.services.reduce((s,x) => s + x.price_at_time * x.qty, 0);
  const partsTotal = _invoiceOrder.parts.reduce((s,x) => s + x.price_at_time * x.qty, 0);
  const discount = parseFloat($('inv-discount').value) || 0;
  $('inv-discount-display').textContent = fmt(discount);
  $('inv-grand-total').textContent = fmt(svcTotal + partsTotal - discount);
}
window.calcInvoiceTotal = calcInvoiceTotal;

async function createInvoice() {
  const repair_order_id = $('inv-order-id').value;
  const discount = parseFloat($('inv-discount').value) || 0;
  const payment_method = $('inv-payment').value;
  const res = await api('POST', '/api/invoices', { repair_order_id, discount, payment_method });
  toast(`Hóa đơn đã tạo — Tổng: ${fmt(res.total)}`, 'success');
  closeModal('modal-invoice');
  loadRepairOrders();
  loadInvoices();
}
window.createInvoice = createInvoice;

async function loadInvoices() {
  const orders = await api('GET', '/api/repair-orders?status=da_thanh_toan').catch(() => []);
  const tbody = $('invoice-table');
  const empty = $('invoice-empty');
  if (!orders.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';

  // Get invoices for all paid orders
  const invRows = await Promise.all(orders.map(o => api('GET', `/api/repair-orders/${o.id}`).catch(() => null)));
  const rows = invRows.filter(Boolean).filter(r => r.invoice);

  tbody.innerHTML = rows.map(r => `
    <tr style="cursor:pointer" onclick="viewInvoiceDetail(${r.invoice.id})">
      <td class="text-mono text-accent">#${r.invoice.id}</td>
      <td>${r.customer_name}</td>
      <td><span class="plate-badge">${r.plate}</span></td>
      <td class="amount">${fmt(r.invoice.service_total)}</td>
      <td class="amount">${fmt(r.invoice.parts_total)}</td>
      <td class="amount text-red">${r.invoice.discount ? fmt(r.invoice.discount) : '—'}</td>
      <td class="amount text-accent font-bold">${fmt(r.invoice.total)}</td>
      <td>${r.invoice.payment_method === 'tien_mat' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}</td>
      <td class="text-muted" style="font-size:12px">${fmtDate(r.invoice.paid_at)}</td>
      <td>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="event.stopPropagation();viewInvoiceDetail(${r.invoice.id})"><i class="fas fa-eye"></i></button>
      </td>
    </tr>`).join('');
}
window.loadInvoices = loadInvoices;

async function viewInvoiceDetail(id) {
  const inv = await api('GET', `/api/invoices/${id}`).catch(() => null);
  if (!inv) return;
  $('inv-detail-title').textContent = `Hóa đơn #${inv.id}`;
  $('inv-detail-body').innerHTML = `
    <div style="background:var(--bg3);border-radius:8px;padding:16px;margin-bottom:16px">
      <div class="detail-grid">
        <div class="detail-item"><label>Khách hàng</label><span>${inv.customer_name}</span></div>
        <div class="detail-item"><label>SĐT</label><span class="text-mono">${inv.customer_phone}</span></div>
        <div class="detail-item"><label>Xe</label><span><span class="plate-badge">${inv.plate}</span> ${inv.brand} ${inv.model}</span></div>
        <div class="detail-item"><label>Thanh toán</label><span>${inv.payment_method === 'tien_mat' ? '💵 Tiền mặt' : '🏦 Chuyển khoản'}</span></div>
        <div class="detail-item"><label>Nhân viên lập HĐ</label><span>${inv.created_by_name || '—'}</span></div>
        <div class="detail-item"><label>Ngày thanh toán</label><span>${fmtDateTime(inv.paid_at)}</span></div>
      </div>
    </div>
    <div class="card-title" style="margin-bottom:8px">Dịch vụ</div>
    <table class="invoice-table" style="margin-bottom:16px">
      <thead><tr><th>Dịch vụ</th><th class="text-right">SL</th><th class="text-right">Đơn giá</th><th class="text-right">Thành tiền</th></tr></thead>
      <tbody>${inv.services.length ? inv.services.map(s=>`
        <tr><td>${s.name}</td><td class="text-right">${s.qty}</td><td class="text-right amount">${fmt(s.price_at_time)}</td><td class="text-right amount">${fmt(s.price_at_time*s.qty)}</td></tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted">Không có</td></tr>'}</tbody>
    </table>
    <div class="card-title" style="margin-bottom:8px">Phụ tùng</div>
    <table class="invoice-table" style="margin-bottom:16px">
      <thead><tr><th>Phụ tùng</th><th class="text-right">SL</th><th class="text-right">Đơn giá</th><th class="text-right">Thành tiền</th></tr></thead>
      <tbody>${inv.parts.length ? inv.parts.map(p=>`
        <tr><td>${p.name} <span class="text-muted">(${p.unit})</span></td><td class="text-right">${p.qty}</td><td class="text-right amount">${fmt(p.price_at_time)}</td><td class="text-right amount">${fmt(p.price_at_time*p.qty)}</td></tr>`).join('') : '<tr><td colspan="4" class="text-center text-muted">Không có</td></tr>'}</tbody>
    </table>
    <div class="invoice-total">
      <div class="invoice-total-box">
        <div class="invoice-total-row"><span>Tiền dịch vụ</span><span class="amount">${fmt(inv.service_total)}</span></div>
        <div class="invoice-total-row"><span>Tiền phụ tùng</span><span class="amount">${fmt(inv.parts_total)}</span></div>
        ${inv.discount ? `<div class="invoice-total-row" style="color:var(--red)"><span>Giảm giá</span><span class="amount">-${fmt(inv.discount)}</span></div>` : ''}
        <div class="invoice-total-row grand"><span>Tổng cộng</span><span class="amount">${fmt(inv.total)}</span></div>
      </div>
    </div>`;
  openModal('modal-invoice-detail');
}
window.viewInvoiceDetail = viewInvoiceDetail;

// ── APPOINTMENTS ──────────────────────────────────────────────
async function loadAppointments() {
  const status = $('appt-filter')?.value || '';
  const data = await api('GET', `/api/appointments${status ? '?status=' + status : ''}`).catch(() => []);
  const tbody = $('appt-table');
  const empty = $('appt-empty');
  if (!data.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = data.map(a => `
    <tr>
      <td>${a.customer_name}</td>
      <td class="text-mono">${a.customer_phone}</td>
      <td>${a.plate ? `<span class="plate-badge">${a.plate}</span>` : '—'}</td>
      <td class="text-mono" style="font-size:12px">${fmtDateTime(a.scheduled_at)}</td>
      <td class="text-muted">${a.note || '—'}</td>
      <td>${apptStatusBadge(a.status)}</td>
      <td>
        <div class="td-actions">
          ${a.status === 'cho_xac_nhan' ? `<button class="btn btn-success btn-sm" onclick="confirmAppt(${a.id})"><i class="fas fa-check"></i> Xác nhận</button>` : ''}
          ${['cho_xac_nhan','da_xac_nhan'].includes(a.status) ? `<button class="btn btn-danger btn-sm btn-icon" onclick="cancelAppt(${a.id})"><i class="fas fa-times"></i></button>` : ''}
        </div>
      </td>
    </tr>`).join('');
}
window.loadAppointments = loadAppointments;

function openAppointmentModal() {
  $('appt-customer-id').innerHTML = _customers.map(c => `<option value="${c.id}">${c.name} — ${c.phone}</option>`).join('');
  $('appt-datetime').value = '';
  $('appt-note').value = '';
  loadVehiclesForAppt();
  openModal('modal-appointment');
}
window.openAppointmentModal = openAppointmentModal;

async function loadVehiclesForAppt() {
  const cid = $('appt-customer-id').value;
  if (!cid) return;
  const vehicles = await api('GET', `/api/vehicles?customer_id=${cid}`).catch(() => []);
  $('appt-vehicle-id').innerHTML = '<option value="">-- Chưa chọn xe --</option>' +
    vehicles.map(v => `<option value="${v.id}">${v.plate} — ${v.brand} ${v.model}</option>`).join('');
}
window.loadVehiclesForAppt = loadVehiclesForAppt;

async function saveAppointment() {
  const body = {
    customer_id: $('appt-customer-id').value,
    vehicle_id: $('appt-vehicle-id').value || null,
    scheduled_at: $('appt-datetime').value,
    note: $('appt-note').value.trim(),
  };
  if (!body.customer_id || !body.scheduled_at) return toast('Vui lòng chọn đủ thông tin', 'error');
  const res = await api('POST', '/api/appointments', body);
  toast(res.message, 'success');
  closeModal('modal-appointment');
  loadAppointments();
}
window.saveAppointment = saveAppointment;

async function confirmAppt(id) {
  await api('PUT', `/api/appointments/${id}/confirm`);
  toast('Đã xác nhận lịch hẹn', 'success');
  loadAppointments();
  loadDashboard();
}
window.confirmAppt = confirmAppt;

async function cancelAppt(id) {
  if (!confirm('Hủy lịch hẹn này?')) return;
  await api('PUT', `/api/appointments/${id}/status`, { status: 'huy' });
  toast('Đã hủy lịch hẹn', 'success');
  loadAppointments();
}
window.cancelAppt = cancelAppt;

// ── REPORTS ───────────────────────────────────────────────────
async function loadReports() {
  const period = $('report-period').value;
  const month = $('report-month').value;
  const year = $('report-year').value;

  let qs = `period=${period}`;
  if (period === 'day' && month) qs += `&month=${month}`;
  if (period === 'month' && year) qs += `&year=${year}`;

  const [revenue, services] = await Promise.all([
    api('GET', `/api/reports/revenue?${qs}`).catch(() => []),
    api('GET', '/api/reports/services').catch(() => []),
  ]);

  const titles = { day: 'Doanh thu theo ngày', month: 'Doanh thu theo tháng', year: 'Doanh thu theo năm' };
  $('report-chart-title').textContent = titles[period] || 'Doanh thu';

  // Chart bars
  const maxRev = Math.max(...revenue.map(r => r.revenue), 1);
  $('revenue-chart').innerHTML = revenue.map(r => `
    <div class="chart-bar ${r.revenue === maxRev ? 'active' : ''}"
      style="height:${Math.max(4, (r.revenue/maxRev)*100)}%"
      title="${r.label}: ${fmt(r.revenue)}"></div>`).join('');

  // Revenue table
  $('report-revenue-table').innerHTML = revenue.length
    ? revenue.map(r => `
        <tr>
          <td class="text-mono">${r.label}</td>
          <td class="text-right amount text-accent">${fmt(r.revenue)}</td>
          <td class="text-right">${r.count}</td>
        </tr>`).join('')
    : '<tr><td colspan="3" class="text-center text-muted">Không có dữ liệu</td></tr>';

  // Services
  $('report-services-list').innerHTML = services.length
    ? services.map((s, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:13px;font-weight:500">${i+1}. ${s.name}</div>
            <div class="text-muted" style="font-size:11px">${s.usage_count} lần sử dụng</div>
          </div>
          <div class="amount text-accent" style="font-size:13px">${fmt(s.total_revenue)}</div>
        </div>`).join('')
    : '<p class="text-muted text-center" style="padding:20px">Chưa có dữ liệu</p>';
}
window.loadReports = loadReports;

// Init report filters
document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const reportMonth = $('report-month');
  const reportYear = $('report-year');
  if (reportMonth) reportMonth.value = now.toISOString().slice(0,7);
  if (reportYear) reportYear.value = now.getFullYear();

  $('report-period')?.addEventListener('change', () => {
    const period = $('report-period').value;
    if ($('report-month')) $('report-month').style.display = period === 'day' ? '' : 'none';
    if ($('report-year')) $('report-year').style.display = period === 'month' ? '' : 'none';
  });
  // Trigger once to set initial visibility
  $('report-period')?.dispatchEvent(new Event('change'));
});

// ── STAFF ─────────────────────────────────────────────────────
async function loadStaff() {
  const data = await api('GET', '/api/users').catch(() => []);
  _staff = data;
  $('staff-table').innerHTML = data.map(s => `
    <tr>
      <td class="text-mono text-muted" style="font-size:12px">#${s.id}</td>
      <td class="font-bold">${s.full_name}</td>
      <td class="text-mono">${s.username}</td>
      <td>${roleBadge(s.role)}</td>
      <td class="text-mono">${s.phone || '—'}</td>
      <td class="text-muted" style="font-size:12px">${fmtDate(s.created_at)}</td>
      <td>
        <div class="td-actions">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="openStaffModal(${s.id})"><i class="fas fa-edit"></i></button>
          ${s.id !== currentUser?.id ? `<button class="btn btn-danger btn-sm btn-icon" onclick="deleteStaff(${s.id},'${s.full_name}')"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </td>
    </tr>`).join('');
}
window.loadStaff = loadStaff;

function openStaffModal(id) {
  $('staff-id').value = id || '';
  $('staff-name').value = '';
  $('staff-phone').value = '';
  $('staff-username').value = '';
  $('staff-password').value = '';
  $('staff-role').value = 'nhan_vien_le_tan';
  $('staff-pwd-hint').style.display = id ? '' : 'none';

  if (id) {
    $('staff-modal-title').textContent = 'Sửa nhân viên';
    $('staff-username').disabled = true;
    const s = _staff.find(x => x.id == id);
    if (s) {
      $('staff-name').value = s.full_name;
      $('staff-phone').value = s.phone || '';
      $('staff-username').value = s.username;
      $('staff-role').value = s.role;
    }
  } else {
    $('staff-modal-title').textContent = 'Thêm nhân viên';
    $('staff-username').disabled = false;
  }
  openModal('modal-staff');
}
window.openStaffModal = openStaffModal;

async function saveStaff() {
  const id = $('staff-id').value;
  const body = {
    full_name: $('staff-name').value.trim(),
    username: $('staff-username').value.trim(),
    password: $('staff-password').value,
    role: $('staff-role').value,
    phone: $('staff-phone').value.trim(),
  };
  if (!body.full_name || !body.role) return toast('Thiếu thông tin bắt buộc', 'error');
  if (!id && !body.password) return toast('Mật khẩu là bắt buộc khi tạo mới', 'error');
  await api(id ? 'PUT' : 'POST', id ? `/api/users/${id}` : '/api/users', body);
  toast(id ? 'Đã cập nhật nhân viên' : 'Thêm nhân viên thành công', 'success');
  closeModal('modal-staff');
  loadStaff();
}
window.saveStaff = saveStaff;

async function deleteStaff(id, name) {
  if (!confirm(`Xóa nhân viên "${name}"?`)) return;
  await api('DELETE', `/api/users/${id}`);
  toast('Đã xóa nhân viên', 'success');
  loadStaff();
}
window.deleteStaff = deleteStaff;