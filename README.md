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

Ứng dụng đọc cấu hình từ file `.env` khi chạy local. Khi deploy Render, cần thêm `DATABASE_URL` hoặc `DATABASE_URL_POOLED` trong **Environment Variables** của service, dùng connection string Neon có `sslmode=require`. Không commit file `.env` lên repository.

Để upload ảnh lên Cloudinary, thêm các biến môi trường sau:

```text
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_UPLOAD_FOLDER=bun-dau-chu-beo
```

Nếu dùng `render.yaml`, chọn **New > Blueprint**, kết nối repository và nhập giá trị Neon khi Render hỏi biến `DATABASE_URL`. Nếu service đã tồn tại, vào **Environment > Add Environment Variable**, tạo key chính xác là `DATABASE_URL`, dán connection string Neon làm value, lưu lại rồi redeploy.

Để Render nhận diện web service, app mặc định bind tại `0.0.0.0` và tự đọc port từ biến `PORT` của Render.

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
		menu/       # Quản lý thực đơn và định mức nguyên liệu
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

### Menu

- `GET /api/menu?active=true|false`
- `GET /api/menu/:id`
- `POST /api/menu` (ADMIN, MANAGER)
- `PATCH /api/menu/:id` (ADMIN, MANAGER)
- `DELETE /api/menu/:id` (ADMIN, MANAGER)

Menu item hỗ trợ `name`, `price`, `category`, `description`, `image`, `active` và danh sách `ingredients`. Xóa món là soft-delete bằng cách đặt `active = false` để không ảnh hưởng các đơn hàng cũ.

### Inventory

- `GET /api/inventory`
- `PATCH /api/inventory/:id/adjust` (ADMIN, MANAGER)

### Reports

- `GET /api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD` (ADMIN, MANAGER)

### Uploads

- `POST /api/uploads/image` (đã đăng nhập)

Gửi request dạng `multipart/form-data` với field `file`. Chỉ nhận ảnh, tối đa 10 MB. Response trả về `secureUrl` và `publicId` của ảnh trên Cloudinary.

Khi tạo đơn, hệ thống kiểm tra và trừ nguyên liệu theo định mức món. Khi hủy đơn, nguyên liệu được hoàn lại. Doanh thu chỉ tính các đơn có trạng thái `COMPLETED`.

## Kiểm tra

```bash
npm run build
npm test -- --runInBand
```

Session được lưu trong PostgreSQL. Khi triển khai production nên bổ sung migration versioning, DTO validation, audit log và secret riêng cho việc hash mật khẩu.
