## Cấu trúc module

```text
src/
	modules/
		menu/       # Quản lý thực đơn và định mức nguyên liệu
		auth/       # Đăng nhập, session và AuthGuard
		user/       # Quản lý tài khoản người dùng và phân quyền
		orders/     # Thực đơn và đơn hàng
		inventory/  # Tồn kho
		employees/  # Quản lý nhân sự, chấm công và lương
		attendance/ # Chấm công nhân viên
		payroll/    # Tính lương và bảng lương nhân viên
		reports/    # Báo cáo doanh thu
	shared/
		database.service.ts  # Kết nối, transaction và khởi tạo schema
		database.module.ts   # Module database dùng chung
```

Mỗi domain tự quản lý controller và `store.service.ts` của mình. `AppModule` chỉ lắp ghép các module domain.

## Xác thực và phân quyền

Đăng nhập bằng `POST /api/auth/login`, sau đó gửi token trong header:

```text
Authorization: Bearer <accessToken>
```

Chỉ role `ADMIN` được quản lý người dùng/tài khoản:

- `GET /api/users`
- `POST /api/users/register`
- `PATCH /api/users/:id`
- `DELETE /api/users/:id`

Các quyền nghiệp vụ:| Thao tác | Role |
| ----------------------- | --------------------- |
| Xem và tạo đơn hàng | ADMIN, MANAGER, STAFF |
| Đổi trạng thái đơn hàng | ADMIN, MANAGER |
| Xem tồn kho và tổng quan | ADMIN, MANAGER, STAFF |
| Nhập, xuất, điều chỉnh tồn kho | ADMIN, MANAGER |
| Xem báo cáo doanh thu | ADMIN, MANAGER |

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
- `POST /api/orders`
- `PATCH /api/orders/:id/status` (ADMIN, MANAGER)
  `GET /api/orders` lọc đơn theo ngày tạo: `today` là hôm nay, `week` là 7 ngày gần nhất và `month` là tháng hiện tại. Hệ thống chỉ lưu đơn hàng trong tháng hiện tại; khi sang tháng mới, đơn và chi tiết đơn của các tháng trước được tự động xóa (kiểm tra lúc khởi động, mỗi giờ và trước khi lấy danh sách). Giá trị `period` khác các lựa chọn trên trả về `400`.

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
```sql
attendance (
  id TEXT,
  employee_id TEXT,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  total_minutes INTEGER,
  status TEXT,
  note TEXT
)
```

### Payroll
- `GET /api/payroll?employeeId=&month=` (ADMIN, MANAGER)
- `POST /api/payroll/calculate` (ADMIN, MANAGER)
```sql
payroll (
  id TEXT,
  employee_id TEXT,
  month INTEGER,
  total_minutes INTEGER,
  hourly_rate NUMERIC,
  base_salary NUMERIC,
  bonus NUMERIC,
  deduction NUMERIC,
  net_salary NUMERIC,
  status TEXT
)
```

### Reports

- `GET /api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD` (ADMIN, MANAGER)
- `GET /api/reports/best-selling?from=YYYY-MM-DD&to=YYYY-MM-DD` (ADMIN, MANAGER; tối đa 5 món, chỉ tính đơn `COMPLETED`)

### Calendar

- `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/calendar`
- `PATCH /api/calendar/:id`
- `DELETE /api/calendar/:id`

- `POST /api/uploads/image` (đã đăng nhập)
