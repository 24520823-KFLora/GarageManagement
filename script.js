// KHỞI TẠO DỮ LIỆU MẪU (MOCK DATA) LƯU TRONG BỘ NHỚ TRÌNH DUYỆT (LOCALSTORAGE)
let customers = JSON.parse(localStorage.getItem('customers')) || [
    { id: 1, name: 'Nguyễn Văn A', phone: '0901234567', address: 'Hà Nội', plate: '30A-123.45', brand: 'Toyota Vios' },
    { id: 2, name: 'Trần Thị B', phone: '0971234568', address: 'Đà Nẵng', plate: '29C-567.89', brand: 'Hyundai Accent' }
];

let parts = JSON.parse(localStorage.getItem('parts')) || [
    { id: 'PT001', name: 'Má phanh trước', unit: 'Bộ', price: 600000, stock: 25 },
    { id: 'PT002', name: 'Má phanh sau', unit: 'Bộ', price: 570000, stock: 18 },
    { id: 'PT003', name: 'Dầu động cơ (4L)', unit: 'Lít', price: 120000, stock: 40 },
    { id: 'PT004', name: 'Lọc dầu', unit: 'Cái', price: 80000, stock: 35 }
];

let repairOrders = JSON.parse(localStorage.getItem('repairOrders')) || [
    { id: 'PS0001', customerId: 1, date: '2026-05-18 09:15', status: 'Đang sửa', note: 'Kiểm tra hệ thống phanh, thay dầu' },
    { id: 'PS0002', customerId: 2, date: '2026-05-19 10:30', status: 'Hoàn thành', note: 'Thay má phanh sau' }
];

let invoices = JSON.parse(localStorage.getItem('invoices')) || [
    { id: 'HD0001', orderId: 'PS0002', date: '2026-05-19 11:00', laborCost: 200000, partsCost: 570000, total: 770000 }
];

// HÀM LƯU DỮ LIỆU XUỐNG TRÌNH DUYỆT KHÔNG BỊ MẤT KHI REFRESH SH
function saveData() {
    localStorage.setItem('customers', JSON.stringify(customers));
    localStorage.setItem('parts', JSON.stringify(parts));
    localStorage.setItem('repairOrders', JSON.stringify(repairOrders));
    localStorage.setItem('invoices', JSON.stringify(invoices));
    updateStats();
}

// CHUYỂN ĐỔI QUA LẠI GIỮA CÁC MÀN HÌNH CHỨC NĂNG
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');

    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('hover:bg-slate-800', 'text-slate-400');
    });
    const activeBtn = document.getElementById(`btn-${tabId}`);
    activeBtn.classList.add('bg-blue-600', 'text-white');
    activeBtn.classList.remove('hover:bg-slate-800', 'text-slate-400');

    // Tải lại bảng tương ứng khi chuyển tab
    if(tabId === 'dashboard') renderDashboard();
    if(tabId === 'customers') renderCustomers();
    if(tabId === 'repair') renderRepairOrders();
    if(tabId === 'invoices') renderInvoices();
    if(tabId === 'parts') renderParts();
    if(tabId === 'reports') renderReports();
}

// CẬP NHẬT CÁC CON SỐ THỐNG KÊ TRÊN DASHBOARD
function updateStats() {
    if(document.getElementById('stat-orders')) {
        document.getElementById('stat-orders').innerText = repairOrders.length;
        document.getElementById('stat-customers').innerText = customers.length;
        document.getElementById('stat-parts').innerText = parts.reduce((sum, p) => sum + p.stock, 0);
        let totalRev = invoices.reduce((sum, inv) => sum + inv.total, 0);
        document.getElementById('stat-revenue').innerText = totalRev.toLocaleString('vi-VN');
    }
}

// HIỂN THỊ DỮ LIỆU RA MÀN HÌNH DASHBOARD
function renderDashboard() {
    updateStats();
    const tbody = document.getElementById('dashboard-recent-orders');
    tbody.innerHTML = '';
    repairOrders.slice(-3).reverse().forEach(order => {
        const cust = customers.find(c => c.id === order.customerId);
        const statusColor = order.status === 'Hoàn thành' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';
        tbody.innerHTML += `
            <tr class="border-b border-slate-50 hover:bg-slate-50/50 transition">
                <td class="py-3 font-medium text-blue-600">${order.id}</td>
                <td class="py-3">${cust ? cust.name : 'Ẩn danh'}</td>
                <td class="py-3 font-mono">${cust ? cust.plate : 'N/A'}</td>
                <td class="py-3"><span class="px-2 py-1 rounded-md text-xs font-semibold ${statusColor}">${order.status}</span></td>
            </tr>
        `;
    });
}

// HIỂN THỊ DANH SÁCH KHÁCH HÀNG & XE
function renderCustomers() {
    const tbody = document.getElementById('customer-table-body');
    tbody.innerHTML = '';
    customers.forEach((cust, index) => {
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-4 text-slate-400">${index + 1}</td>
                <td class="p-4 font-semibold text-slate-700">${cust.name}</td>
                <td class="p-4 text-slate-600">${cust.phone}</td>
                <td class="p-4 text-slate-500">${cust.address}</td>
                <td class="p-4"><span class="px-2 py-1 bg-slate-100 rounded text-xs font-mono font-bold">${cust.plate}</span> - ${cust.brand}</td>
            </tr>
        `;
    });
}

// HIỂN THỊ PHIẾU SỬA CHỮA
function renderRepairOrders() {
    const tbody = document.getElementById('repair-table-body');
    tbody.innerHTML = '';
    repairOrders.forEach(order => {
        const cust = customers.find(c => c.id === order.customerId);
        const isDone = order.status === 'Hoàn thành';
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-4 font-medium text-blue-600">${order.id}</td>
                <td class="p-4">${cust ? cust.name : 'N/A'}</td>
                <td class="p-4 font-mono">${cust ? cust.plate : 'N/A'}</td>
                <td class="p-4 text-slate-500">${order.date}</td>
                <td class="p-4"><span class="px-2.5 py-1 rounded-full text-xs font-medium ${isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${order.status}</span></td>
                <td class="p-4">
                    ${!isDone ? `<button onclick="completeRepair('${order.id}')" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-md transition shadow-sm">Xong & Xuất HĐ</button>` : `<span class="text-xs text-slate-400"><i class="fa-solid fa-check-double"></i> Đã thanh toán</span>`}
                </td>
            </tr>
        `;
    });
}

// HIỂN THỊ KHO PHỤ TÙNG
function renderParts() {
    const tbody = document.getElementById('parts-table-body');
    tbody.innerHTML = '';
    parts.forEach(p => {
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-4 font-mono text-slate-500">${p.id}</td>
                <td class="p-4 font-medium">${p.name}</td>
                <td class="p-4 text-slate-500">${p.unit}</td>
                <td class="p-4 font-mono">${p.price.toLocaleString('vi-VN')} đ</td>
                <td class="p-4 font-semibold ${p.stock < 20 ? 'text-rose-600' : 'text-slate-700'}">${p.stock}</td>
            </tr>
        `;
    });
}

// HIỂN THỊ HÓA ĐƠN
function renderInvoices() {
    const tbody = document.getElementById('invoice-table-body');
    tbody.innerHTML = '';
    invoices.forEach(inv => {
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-4 font-medium text-purple-600">${inv.id}</td>
                <td class="p-4 text-blue-600 font-medium">${inv.orderId}</td>
                <td class="p-4 text-slate-500">${inv.date}</td>
                <td class="p-4">${inv.laborCost.toLocaleString('vi-VN')} đ</td>
                <td class="p-4">${inv.partsCost.toLocaleString('vi-VN')} đ</td>
                <td class="p-4 font-bold text-slate-800">${inv.total.toLocaleString('vi-VN')} đ</td>
            </tr>
        `;
    });
}

// HIỂN THỊ BÁO CÁO DOANH THU
function renderReports() {
    let totalRev = invoices.reduce((sum, inv) => sum + inv.total, 0);
    document.getElementById('report-total-revenue').innerText = totalRev.toLocaleString('vi-VN') + " đ";
}

// CÁC HÀM XỬ LÝ POPUP VÀ LƯU DỮ LIỆU MỚI
function openCustomerModal() { document.getElementById('customer-modal').classList.remove('hidden'); document.getElementById('customer-modal').classList.add('flex'); }
function closeCustomerModal() { document.getElementById('customer-modal').classList.add('hidden'); document.getElementById('customer-modal').classList.remove('flex'); }

function saveCustomer() {
    const name = document.getElementById('input-cust-name').value;
    const phone = document.getElementById('input-cust-phone').value;
    const address = document.getElementById('input-cust-address').value;
    const plate = document.getElementById('input-car-plate').value;
    const brand = document.getElementById('input-car-brand').value;

    if(!name || !phone || !plate) return alert('Vui lòng điền đầy đủ Tên, SĐT và Biển số xe!');

    const newCust = { id: Date.now(), name, phone, address, plate, brand };
    customers.push(newCust);
    saveData();
    closeCustomerModal();
    renderCustomers();
}

function openRepairModal() {
    document.getElementById('repair-modal').classList.remove('hidden');
    document.getElementById('repair-modal').classList.add('flex');
    const select = document.getElementById('select-vehicle');
    select.innerHTML = '';
    customers.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.name} - Biển số: ${c.plate}</option>`;
    });
}
function closeRepairModal() { document.getElementById('repair-modal').classList.add('hidden'); document.getElementById('repair-modal').classList.remove('flex'); }

function saveRepairOrder() {
    const custId = parseInt(document.getElementById('select-vehicle').value);
    const note = document.getElementById('input-repair-note').value;
    const orderId = 'PS00' + (repairOrders.length + 1);

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    repairOrders.push({ id: orderId, customerId: custId, date: dateStr, status: 'Đang sửa', note: note });
    saveData();
    closeRepairModal();
    renderRepairOrders();
}

// BẤM HOÀN THÀNH SỬA CHỮA -> TỰ ĐỘNG TÍNH TIỀN TẠO HÓA ĐƠN
function completeRepair(orderId) {
    const order = repairOrders.find(o => o.id === orderId);
    if(order) {
        order.status = 'Hoàn thành';
        const invId = 'HD00' + (invoices.length + 1);
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        
        // Mô phỏng chi phí ngẫu nhiên dựa trên cấu trúc database
        const laborCost = 200000;
        const partsCost = 600000; 
        const total = laborCost + partsCost;

        invoices.push({ id: invId, orderId: orderId, date: dateStr, laborCost, partsCost, total });
        saveData();
        renderRepairOrders();
        alert(`Đã hoàn thành phiếu ${orderId}! Hóa đơn ${invId} đã được lập với tổng tiền ${total.toLocaleString('vi-VN')} đ.`);
    }
}

// KHỞI CHẠY TRANG WEB LẦN ĐẦU
renderDashboard();