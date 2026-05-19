// frontend/script.js

// KHI CHẠY DƯỚI MÁY MÌNH (LOCALHOST): dùng cổng 5000 của server
// KHI NÀO DEPLOY LÊN RENDER THÌ ĐỔI THÀNH LINK RENDER CỦA BẠN (Ví dụ: https://gara-backend.onrender.com/api)
const API_URL = "https://garageweb.onrender.com/api";

// Hàm chuyển đổi qua lại giữa các màn hình (Tabs)
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('bg-blue-600', 'text-white'));
    document.getElementById(`btn-${tabId}`).classList.add('bg-blue-600', 'text-white');

    // Chuyển đến tab nào thì tự động gọi API cập nhật tab đó luôn
    if(tabId === 'dashboard') loadStats();
    if(tabId === 'customers') loadCustomers();
    if(tabId === 'repair') loadRepairOrders();
    if(tabId === 'invoices') loadInvoices();
    if(tabId === 'parts') loadParts();
}

function openModal(id) { document.getElementById(id).classList.replace('hidden', 'flex'); }
function closeModal(id) { document.getElementById(id).classList.replace('flex', 'hidden'); }

// 1. API Dashboard - Lấy số liệu tổng quan
async function loadStats() {
    try {
        const [resOrders, resCust, resInv] = await Promise.all([
            fetch(`${API_URL}/repair-orders`),
            fetch(`${API_URL}/customers`),
            fetch(`${API_URL}/invoices`)
        ]);
        const orders = await resOrders.json();
        const custs = await resCust.json();
        const invs = await resInv.json();

        document.getElementById('stat-orders').innerText = orders.length;
        document.getElementById('stat-customers').innerText = custs.length;
        let total = invs.reduce((sum, i) => sum + i.TotalAmount, 0);
        document.getElementById('stat-revenue').innerText = total.toLocaleString('vi-VN') + " đ";
    } catch (err) { console.error("Lỗi tải thống kê:", err); }
}

// 2. API Khách hàng - Lấy danh sách hiển thị lên bảng
async function loadCustomers() {
    const res = await fetch(`${API_URL}/customers`);
    const data = await res.json();
    const tbody = document.getElementById('customer-table-body');
    tbody.innerHTML = '';
    data.forEach((c, idx) => {
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-4 text-slate-400">${idx+1}</td>
                <td class="p-4 font-semibold text-slate-700">${c.FullName}</td>
                <td class="p-4 font-medium">${c.PhoneNumber}</td>
                <td class="p-4 text-slate-500">${c.Address}</td>
                <td class="p-4"><span class="px-2 py-1 bg-slate-200 font-mono text-xs font-bold rounded text-slate-700">${c.PlateNumber}</span> <span class="text-xs text-slate-400 ml-1">(${c.Brand})</span></td>
            </tr>`;
    });
}

// Gửi dữ liệu khách hàng mới xuống lưu ở Server Backend
async function addCustomer() {
    const bodyData = {
        FullName: document.getElementById('in-name').value,
        PhoneNumber: document.getElementById('in-phone').value,
        Address: document.getElementById('in-address').value,
        PlateNumber: document.getElementById('in-plate').value,
        Brand: document.getElementById('in-brand').value
    };
    await fetch(`${API_URL}/customers`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(bodyData)
    });
    closeModal('customer-modal');
    loadCustomers();
}

// 3. API Tiếp nhận sửa chữa - Đổ danh sách xe vào ô Select và hiển thị phiếu nhận
async function openRepairModal() {
    openModal('repair-modal');
    const res = await fetch(`${API_URL}/customers`);
    const custs = await res.json();
    const select = document.getElementById('select-vehicle');
    select.innerHTML = '';
    custs.forEach(c => {
        select.innerHTML += `<option value="${c.CustomerID}">${c.FullName} - ${c.PlateNumber}</option>`;
    });
}

async function loadRepairOrders() {
    const res = await fetch(`${API_URL}/repair-orders`);
    const data = await res.json();
    const tbody = document.getElementById('repair-table-body');
    tbody.innerHTML = '';
    data.forEach(o => {
        const isDone = o.Status === 'Hoàn thành';
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-4 font-semibold text-blue-600">PSC-00${o.RepairOrderID}</td>
                <td class="p-4 font-medium">${o.CustomerName}</td>
                <td class="p-4 font-mono text-xs font-bold">${o.PlateNumber}</td>
                <td class="p-4 text-slate-400">${o.ReceiveDate}</td>
                <td class="p-4"><span class="px-2 py-0.5 text-xs rounded-full font-semibold ${isDone?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800'}">${o.Status}</span></td>
                <td class="p-4">${!isDone?`<button onclick="completeOrder(${o.RepairOrderID})" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2 py-1 rounded-lg font-medium transition shadow-sm">Xong & Xuất HĐ</button>`:`<span class="text-xs text-slate-400 font-medium"><i class="fa-solid fa-circle-check text-emerald-500"></i> Đã thanh toán</span>`}</td>
            </tr>`;
    });
}

async function createRepairOrder() {
    const bodyData = {
        VehicleID: document.getElementById('select-vehicle').value,
        Note: document.getElementById('in-note').value
    };
    await fetch(`${API_URL}/repair-orders`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(bodyData)
    });
    closeModal('repair-modal');
    loadRepairOrders();
}

// Đánh dấu sửa xong phiếu ➔ Server sẽ tự tính toán sinh ra hóa đơn tương ứng
async function completeOrder(id) {
    await fetch(`${API_URL}/repair-orders/${id}/complete`, { method: 'PUT' });
    alert("Cập nhật thành công! Hệ thống đã tự động tính toán chi phí và lập hóa đơn.");
    loadRepairOrders();
}

// 4. API Hóa đơn - Lấy danh sách hóa đơn đã tính tiền
async function loadInvoices() {
    const res = await fetch(`${API_URL}/invoices`);
    const data = await res.json();
    const tbody = document.getElementById('invoice-table-body');
    tbody.innerHTML = '';
    data.forEach(i => {
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-4 font-semibold text-purple-600">HD-00${i.InvoiceID}</td>
                <td class="p-4 text-blue-600 font-medium">PSC-00${i.RepairOrderID}</td>
                <td class="p-4 text-slate-400">${i.InvoiceDate}</td>
                <td class="p-4">${i.LaborCost.toLocaleString('vi-VN')} đ</td>
                <td class="p-4">${i.PartsTotal.toLocaleString('vi-VN')} đ</td>
                <td class="p-4 font-bold text-slate-800">${i.TotalAmount.toLocaleString('vi-VN')} đ</td>
            </tr>`;
    });
}

// 5. API Phụ tùng - Lấy dữ liệu kho phụ tùng vật tư
async function loadParts() {
    const res = await fetch(`${API_URL}/parts`);
    const data = await res.json();
    const tbody = document.getElementById('parts-table-body');
    tbody.innerHTML = '';
    data.forEach(p => {
        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-4 font-mono text-slate-400">PT-${p.PartID}</td>
                <td class="p-4 font-semibold text-slate-700">${p.PartName}</td>
                <td class="p-4 text-slate-500">${p.Unit}</td>
                <td class="p-4 font-mono">${p.Price.toLocaleString('vi-VN')} đ</td>
                <td class="p-4 font-bold ${p.StockQuantity < 20 ? 'text-rose-500':'text-slate-700'}">${p.StockQuantity}</td>
            </tr>`;
    });
}

// Chạy mặc định khi load trang web lên
loadStats();