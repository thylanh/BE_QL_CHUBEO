# Backend quản lý Bún đậu chú Béo

Backend NestJS cho quán ăn, gồm đăng nhập, phân quyền, quản lý tài khoản, thực đơn, đơn hàng, tồn kho và báo cáo doanh thu.

## Yêu cầu

- Node.js 20 trở lên
- PostgreSQL đang chạy
- Database `db_chubeo`

## Cài đặt và chạy

```bash
npm install
npm run start:dev
```

Ứng dụng đọc cấu hình từ file `.env`. Cấu hình hiện tại dùng PostgreSQL tại `localhost:5433`, database `db_chubeo`, user `postgres`. Có thể thay đổi bằng các biến `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGPOOL_MAX` và `PGSSL`.

Khi khởi động, `DatabaseService` tự tạo các bảng còn thiếu. File `Postgres Enterprise Manager - chubeo localhost.session.sql` có thể dùng để tạo dữ liệu mẫu hoặc kiểm tra thủ công.

API mặc định chạy tại:

```text
http://localhost:3000/api
```

Đổi port trên Windows PowerShell:

```powershell
$env:PORT=3002; npm run start:dev
```

Nếu gặp `EADDRINUSE`, port đang được process khác sử dụng. Đổi sang port khác, ví dụ `3003`, hoặc dừng process đang giữ port đó.

## Cấu trúc module

```text
src/
	modules/
		auth/       # Đăng nhập, session, tài khoản và AuthGuard
		orders/     # Thực đơn và đơn hàng
		inventory/  # Tồn kho
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

Chỉ role `ADMIN` được quản lý tài khoản:

- `GET /api/auth/users`
- `POST /api/auth/register`
- `PATCH /api/auth/users/:id`
- `DELETE /api/auth/users/:id`

Các quyền nghiệp vụ:

| Thao tác                | Role                  |
| ----------------------- | --------------------- |
| Xem và tạo đơn hàng     | ADMIN, MANAGER, STAFF |
| Đổi trạng thái đơn hàng | ADMIN, MANAGER        |
| Xem tồn kho             | ADMIN, MANAGER, STAFF |
| Điều chỉnh tồn kho      | ADMIN, MANAGER        |
| Xem báo cáo doanh thu   | ADMIN, MANAGER        |

## API chính

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/users` (ADMIN)
- `POST /api/auth/register` (ADMIN)
- `PATCH /api/auth/users/:id` (ADMIN)
- `DELETE /api/auth/users/:id` (ADMIN)

### Orders

- `GET /api/orders/menu`
- `GET /api/orders`
- `POST /api/orders`
- `PATCH /api/orders/:id/status` (ADMIN, MANAGER)

### Inventory

- `GET /api/inventory`
- `PATCH /api/inventory/:id/adjust` (ADMIN, MANAGER)

### Reports

- `GET /api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD` (ADMIN, MANAGER)

Khi tạo đơn, hệ thống kiểm tra và trừ nguyên liệu theo định mức món. Khi hủy đơn, nguyên liệu được hoàn lại. Doanh thu chỉ tính các đơn có trạng thái `COMPLETED`.

## Kiểm tra

```bash
npm run build
npm test -- --runInBand
```

Session được lưu trong PostgreSQL. Khi triển khai production nên bổ sung migration versioning, DTO validation, audit log và secret riêng cho việc hash mật khẩu.
