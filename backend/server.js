// backend/server.js
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors()); // Cho phép Frontend gọi API công khai
app.use(express.json());

// GIẢ LẬP DATABASE (MOCK DATA) KHỚP VỚI CÁC BẢNG TRONG FILE DB_SE104.SQL
let data = {
    customers: [
        { CustomerID: 1, FullName: "Nguyễn Văn A", PhoneNumber: "0901234567", Address: "Hà Nội", Email: "a@gmail.com" },
        { CustomerID: 2, FullName: "Trần Thị B", PhoneNumber: "0971234568", Address: "Đà Nẵng", Email: "b@gmail.com" }
    ],
    vehicles: [
        { VehicleID: 1, CustomerID: 1, PlateNumber: "30A-123.45", Brand: "Toyota Vios" },
        { VehicleID: 2, CustomerID: 2, PlateNumber: "29C-567.89", Brand: "Hyundai Accent" }
    ],
    parts: [
        { PartID: 1, PartName: "Má phanh trước", Price: 600000, StockQuantity: 25, Unit: "Bộ" },
        { PartID: 2, PartName: "Má phanh sau", Price: 570000, StockQuantity: 18, Unit: "Bộ" },
        { PartID: 3, PartName: "Dầu động cơ (4L)", Price: 120000, StockQuantity: 40, Unit: "Lít" }
    ],
    repairOrders: [
        { RepairOrderID: 1, VehicleID: 1, ReceiveDate: "2026-05-19 09:15", Status: "Đang sửa", Note: "Kiểm tra phanh" },
        { RepairOrderID: 2, VehicleID: 2, ReceiveDate: "2026-05-19 10:30", Status: "Hoàn thành", Note: "Thay nhớt" }
    ],
    invoices: [
        { InvoiceID: 1, RepairOrderID: 2, InvoiceDate: "2026-05-19 11:00", LaborCost: 200000, PartsTotal: 570000, TotalAmount: 770000 }
    ]
};

// --- ĐỊNH NGHĨA CÁC ĐƯỜNG DẪN WEB SERVICE (RESTful API) ---

// 1. API Khách hàng (Customer Service)
app.get('/api/customers', (req, res) => {
    // Trả về danh sách kết hợp Khách hàng với Xe tương ứng
    const result = data.customers.map(c => {
        const v = data.vehicles.find(v => v.CustomerID === c.CustomerID);
        return { ...c, PlateNumber: v ? v.PlateNumber : "N/A", Brand: v ? v.Brand : "N/A" };
    });
    res.json(result);
});

app.post('/api/customers', (req, res) => {
    const { FullName, PhoneNumber, Address, Email, PlateNumber, Brand } = req.body;
    const newCustId = data.customers.length + 1;
    
    const newCustomer = { CustomerID: newCustId, FullName, PhoneNumber, Address, Email };
    const newVehicle = { VehicleID: data.vehicles.length + 1, CustomerID: newCustId, PlateNumber, Brand };
    
    data.customers.push(newCustomer);
    data.vehicles.push(newVehicle);
    res.status(201).json({ message: "Thêm thành công!", customer: newCustomer });
});

// 2. API Tiếp nhận sửa chữa (Order Service)
app.get('/api/repair-orders', (req, res) => {
    const result = data.repairOrders.map(o => {
        const v = data.vehicles.find(v => v.VehicleID === o.VehicleID);
        const c = v ? data.customers.find(cust => cust.CustomerID === v.CustomerID) : null;
        return { ...o, CustomerName: c ? c.FullName : "N/A", PlateNumber: v ? v.PlateNumber : "N/A" };
    });
    res.json(result);
});

app.post('/api/repair-orders', (req, res) => {
    const { VehicleID, Note } = req.body;
    const now = new Date();
    const dateStr = now.toISOString().slice(0,10) + " " + now.toTimeString().slice(0,5);
    
    const newOrder = {
        RepairOrderID: data.repairOrders.length + 1,
        VehicleID: parseInt(VehicleID),
        ReceiveDate: dateStr,
        Status: "Đang sửa",
        Note: Note
    };
    data.repairOrders.push(newOrder);
    res.status(201).json(newOrder);
});

// Cập nhật trạng thái xong phiếu và TỰ ĐỘNG TÍNH TOÁN xuất Hóa đơn (Billing Service)
app.put('/api/repair-orders/:id/complete', (req, res) => {
    const orderId = parseInt(req.params.id);
    const order = data.repairOrders.find(o => o.RepairOrderID === orderId);
    if (!order) return res.status(404).json({ message: "Không tìm thấy phiếu!" });

    order.Status = "Hoàn thành";
    
    // Tự động tính tiền dựa trên công thức hệ thống: TotalAmount = LaborCost + PartsTotal
    const laborCost = 200000;
    const partsTotal = 600000;
    const totalAmount = laborCost + partsTotal;
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0,10) + " " + now.toTimeString().slice(0,5);

    const newInvoice = {
        InvoiceID: data.invoices.length + 1,
        RepairOrderID: orderId,
        InvoiceDate: dateStr,
        LaborCost: laborCost,
        PartsTotal: partsTotal,
        TotalAmount: totalAmount
    };
    data.invoices.push(newInvoice);
    res.json({ message: "Đã hoàn thành và lập hóa đơn!", invoice: newInvoice });
});

// 3. API Kho phụ tùng (Catalog Service)
app.get('/api/parts', (req, res) => res.json(data.parts));

// 4. API Hóa đơn & Báo cáo (Payment/Report Service)
app.get('/api/invoices', (req, res) => res.json(data.invoices));

// Khởi chạy Web Service trên cổng do Render cấp hoặc 5000 tại máy cục bộ
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Web Service Gara đang chạy trên cổng ${PORT}`));