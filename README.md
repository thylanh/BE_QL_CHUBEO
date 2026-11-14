## Multi-tenant / branch setup

Dự án hiện đang hiện thực hóa mô hình multi-tenant theo hướng:

- `tenants`: doanh nghiệp
- `branches`: chi nhánh thuộc từng doanh nghiệp
- `users`: người dùng thuộc một tenant, có thể chọn branch đang hoạt động
- `sessions`: lưu tenant_id và branch_id để xác minh quyền truy cập trên mọi API

Migration an toàn cho DB đang chạy nằm trong `migrations/tenant-branch-init.sql`.

Nội dung chính:
1. Tạo bảng `tenants` và `branches`
2. Bổ sung `tenant_id`, `branch_id` cho `users` và `sessions`
3. Gán dữ liệu cũ vào tenant/branch mặc định
4. Khóa ngoại và index cho mối quan hệ

Backend không tin dữ liệu `tenantId`/`branchId` từ frontend; giá trị phải đến từ session token do server sinh ra.

## Cấu trúc module

src/
modules/
menu/ # Quản lý thực đơn và định mức nguyên liệu
auth/ # Đăng nhập, session và AuthGuard
user/ # Quản lý tài khoản người dùng và phân quyền
orders/ # Thực đơn và đơn hàng
inventory/ # Tồn kho
employees/ # Quản lý nhân sự, chấm công và lương
attendance/ # Chấm công nhân viên
payroll/ # Tính lương và bảng lương nhân viên
reports/ # Báo cáo doanh thu
cashbook/ # Ghi nhận khoản thu và chi ngoài đơn hàng
shared/
database.service.ts # Kết nối, transaction và khởi tạo schema
database.module.ts # Module database dùng chung

Chỉ role `ADMIN` được quản lý người dùng/tài khoản:

- `GET /api/users`
- `POST /api/users/register`
- `PATCH /api/users/:id`
- `DELETE /api/users/:id`

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`

### User

- `GET /api/users` (ADMIN)
- `POST /api/users/register` (ADMIN)
- `PATCH /api/users/:id` (ADMIN)
- `DELETE /api/users/:id` (ADMIN)
  `User` module quản lý thông tin tài khoản người dùng và phân quyền. Các API này dùng `AuthGuard` và `Roles('ADMIN')` để kiểm soát quyền admin. Body đăng ký tài khoản bao gồm:
  Dữ liệu trả về gồm `id`, `username`, `name`, `role`, `status`, `email`, `phone` và `createdAt`. Khi cập nhật user, `password` là tùy chọn; nếu gửi thì phải dài tối thiểu 6 ký tự.

### Orders

- `GET /api/orders/menu`
- `GET /api/orders?period=today|week|month` (mặc định `today`)
- `GET /api/orders/:id/receipt` (dữ liệu hóa đơn khổ nhiệt 80 mm)
- `POST /api/orders`
- `PATCH /api/orders/:id/status` (ADMIN, MANAGER)
  `GET /api/orders` lọc đơn theo ngày tạo:
  `GET /api/orders/:id/receipt` trả dữ liệu để giao diện dựng và in bill nhiệt 80 mm:

### Menu

- `GET /api/menu?active=true|false`
- `GET /api/menu/:id`
- `POST /api/menu` (ADMIN, MANAGER)
- `PATCH /api/menu/:id` (ADMIN, MANAGER)
- `PATCH /api/menu/:id/active` (ADMIN, MANAGER)
- `DELETE /api/menu/:id` (ADMIN, MANAGER)

### Inventory

- `GET /api/inventory`
- `GET /api/inventory/summary` (số mặt hàng, mặt hàng sắp hết/hết hàng, giá trị tồn kho)
- `GET /api/inventory/:id`
- `POST /api/inventory` (ADMIN, MANAGER; body: `{"name":"Dồi","unit":"bịch","conversionUnit":15,"quantity":10,"minQuantity":2,"costPrice":25000}`)
- `DELETE /api/inventory/:id` (ADMIN, MANAGER)
- `POST /api/inventory/:id/stock-in` (ADMIN, MANAGER; body: `{"quantity": 10}`)
- `POST /api/inventory/:id/stock-out` (ADMIN, MANAGER; body: `{"quantity": 2}`)
- `GET /api/inventory/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD&inventoryItemId=&type=IN|OUT|ADJUSTMENT` (ADMIN, MANAGER)
- `GET /api/inventory/transactions/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&inventoryItemId=` (ADMIN, MANAGER)

### Employees

- `GET /api/employees` (ADMIN, MANAGER)
- `GET /api/employees/:id` (ADMIN, MANAGER, STAFF)
- `POST /api/employees` (ADMIN, MANAGER)
- `PATCH /api/employees/:id` (ADMIN, MANAGER)
- `DELETE /api/employees/:id` (ADMIN)

### Attendance

- `GET /api/attendance?employeeId=` (ADMIN, MANAGER, STAFF)
- `POST /api/attendance/check-in` (ADMIN, MANAGER, STAFF)
- `POST /api/attendance/check-out` (ADMIN, MANAGER, STAFF)

### Payroll

- `GET /api/payroll?employeeId=<employeeId>&month=YYYY-MM` (ADMIN, MANAGER; ví dụ `month=2026-11`, `month` bắt buộc)
- `POST /api/payroll/calculate` (ADMIN, MANAGER; `month` tùy chọn, định dạng `YYYY-MM`, ví dụ `2026-11`)

### Reports

- `GET /api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD` (ADMIN, MANAGER)
- `GET /api/reports/best-selling?from=YYYY-MM-DD&to=YYYY-MM-DD` (ADMIN, MANAGER; tối đa 5 món, chỉ tính đơn `COMPLETED`)

### Sổ thu chi

- `GET /api/cashbook?type=INCOME|EXPENSE&from=YYYY-MM-DD&to=YYYY-MM-DD` (ADMIN, MANAGER)
- `POST /api/cashbook` (ADMIN, MANAGER)

### Calendar

- `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/calendar`
- `PATCH /api/calendar/:id`
- `DELETE /api/calendar/:id`

### Up Image

- `POST /api/uploads/image` (đã đăng nhập)
