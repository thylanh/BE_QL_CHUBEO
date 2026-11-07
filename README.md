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
| Xem tồn kho và tổng quan     | ADMIN, MANAGER, STAFF |
| Nhập, xuất, điều chỉnh tồn kho | ADMIN, MANAGER       |
| Xem báo cáo doanh thu        | ADMIN, MANAGER        |

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
- `GET /api/orders?period=today|week|month` (mặc định `today`)
- `POST /api/orders`
- `PATCH /api/orders/:id/status` (ADMIN, MANAGER)

`GET /api/orders` lọc đơn theo ngày tạo: `today` là hôm nay, `week` là 7 ngày gần nhất và `month` là tháng hiện tại. Hệ thống chỉ lưu đơn hàng trong tháng hiện tại; khi sang tháng mới, đơn và chi tiết đơn của các tháng trước được tự động xóa (kiểm tra lúc khởi động, mỗi giờ và trước khi lấy danh sách). Giá trị `period` khác các lựa chọn trên trả về `400`.

`POST /api/orders` (ADMIN, MANAGER, STAFF) nhận body:

```json
{
  "table": "Bàn 1",
  "orderType": "Tại quán",
  "customerCount": 2,
  "serviceFee": 5000,
  "note": "Ít cay",
  "lines": [
    {
      "menuItemId": "550e8400-e29b-41d4-a716-446655440000",
      "quantity": 2,
      "ingredients": [
        { "ingredientId": "550e8400-e29b-41d4-a716-446655440001", "amount": 0.2 }
      ]
    }
  ]
}
```

`table`, `orderType` và `note` có thể bỏ qua; mặc định lần lượt là chuỗi rỗng, `Tại quán` và không có ghi chú. Frontend bắt buộc gửi `customerCount` dưới dạng số nguyên không âm và `serviceFee` dưới dạng số không âm. Giá món và subtotal được tính từ thực đơn trong database; tổng tiền bằng subtotal cộng `serviceFee`. API kiểm tra món còn hoạt động và đủ tồn kho, sau đó tạo đơn cùng chi tiết và trừ nguyên liệu trong cùng transaction.

Mỗi phần tử `lines` khi tạo đơn bắt buộc có `ingredients`, gồm các phần tử `{ ingredientId, amount }`; giá trị `amount` dùng trực tiếp từ request, không đối chiếu với định mức món trong database. Tồn kho sẽ bị trừ theo `amount * quantity`. API chỉ kiểm tra nguyên liệu tồn tại và đủ số lượng tổng cộng trong kho; nếu thiếu sẽ từ chối tạo đơn. Danh sách nguyên liệu đã chọn được lưu theo từng dòng đơn, trả lại trong response và dùng để hoàn kho khi hủy đơn.

Chạy migration `migrations/20261017_add_order_item_ingredients.sql` trước khi triển khai phiên bản này. Migration thêm nơi lưu nguyên liệu đã chọn cho từng dòng đơn và điền công thức hiện tại cho các đơn cũ để hỗ trợ hoàn kho.

Mã đơn `code` được BE lấy từ nhóm thứ tư của UUID `id` (ví dụ `d913b844-a4af-44da-acb4-70ec90234155` → `acb4`) và lưu vào `orders.code`. Chạy migration `migrations/20261016_add_orders_code.sql` một lần để đảm bảo cột tồn tại, có dữ liệu cho các đơn cũ và có ràng buộc `NOT NULL`/`UNIQUE`.

### Menu

- `GET /api/menu?active=true|false`
- `GET /api/menu/:id`
- `POST /api/menu` (ADMIN, MANAGER)
- `PATCH /api/menu/:id` (ADMIN, MANAGER)
- `PATCH /api/menu/:id/active` (ADMIN, MANAGER)
- `DELETE /api/menu/:id` (ADMIN, MANAGER)

Menu item hỗ trợ `name`, `price`, `category`, `description`, `image`, `active` và danh sách `ingredients`. Mỗi nguyên liệu trả về có `amount` (định mức dùng cho một món) và `quantity` (tồn kho hiện tại). `active` trả về `false` khi món bị tắt thủ công hoặc bất kỳ nguyên liệu nào không đủ định mức; khi nhập thêm tồn kho, trạng thái khả dụng tự cập nhật mà không cần bật lại món. Khi tạo/cập nhật chỉ cần gửi `ingredient_id` và `amount`. Xóa món là soft-delete bằng cách đặt `active = false` để không ảnh hưởng các đơn hàng cũ.

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
- `GET /api/employees/attendance?employeeId=&from=&to=` (ADMIN, MANAGER)
- `POST /api/employees/attendance` (ADMIN, MANAGER)
- `GET /api/employees/payrolls?employeeId=&from=&to=` (ADMIN, MANAGER)
- `POST /api/employees/payrolls/generate` (ADMIN, MANAGER)

Module nhân viên dùng để quản lý hồ sơ, chấm công và tính lương. Mỗi nhân viên có các trường chính:

```json
{
  "userId": "uuid",
  "code": "NV-ABCD1234",
  "fullName": "Nguyễn Văn A",
  "email": "nv.a@company.com",
  "phone": "0909123456",
  "department": "Bếp",
  "position": "Pha chế",
  "hireDate": "2026-11-01",
  "status": "ACTIVE",
  "baseSalary": 15000000,
  "note": "Nhân viên full-time"
}
```

Các trạng thái nhân viên:

- `ACTIVE`: đang làm việc
- `INACTIVE`: tạm ngưng
- `RESIGNED`: đã nghỉ việc

API tạo/sửa nhân viên chấp nhận các trường trên. Nếu `code` không gửi, hệ thống tự tạo mã theo định dạng `NV-<8 ký tự UUID>`; nếu `userId` gửi thì phải là tài khoản người dùng đã tồn tại.

### Chấm công

`POST /api/employees/attendance` dùng để ghi nhận buổi làm trong ngày:

```json
{
  "employeeId": "550e8400-e29b-41d4-a716-446655440000",
  "workDate": "2026-11-07",
  "checkIn": "2026-11-07T08:00:00.000Z",
  "checkOut": "2026-11-07T17:00:00.000Z",
  "status": "PRESENT",
  "note": "Làm việc bình thường"
}
```

Trạng thái chấm công hợp lệ:

- `PRESENT`, `LATE`, `ABSENT`, `LEAVE`, `OFF`, `HOLIDAY`

Hệ thống tự tính số giờ làm (`hoursWorked`) dựa trên thời gian check-in/check-out; nếu thiếu một trong hai thời điểm thì `hoursWorked` sẽ là 0.

### Tính lương

`POST /api/employees/payrolls/generate` tạo bảng lương theo kỳ cho một nhân viên:

```json
{
  "employeeId": "550e8400-e29b-41d4-a716-446655440000",
  "periodStart": "2026-11-01",
  "periodEnd": "2026-11-30",
  "allowance": 500000,
  "deduction": 200000,
  "overtimeHours": 4,
  "paid": false
}
```

Hệ thống tính:

- `baseSalary`: lương cơ bản
- `workingDays`: số ngày làm việc trong kỳ
- `attendanceDays`: số ngày có chấm công
- `overtimeHours`: tổng giờ tăng ca
- `totalSalary = baseSalary + allowance + overtimePay - deduction`

Trạng thái payroll:

- `DRAFT`: bản nháp
- `PAID`: đã thanh toán

### Reports

- `GET /api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD` (ADMIN, MANAGER)
- `GET /api/reports/best-selling?from=YYYY-MM-DD&to=YYYY-MM-DD` (ADMIN, MANAGER; tối đa 5 món, chỉ tính đơn `COMPLETED`)

### Calendar

- `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/calendar`
- `PATCH /api/calendar/:id`
- `DELETE /api/calendar/:id`

Dữ liệu calendar lưu trong bảng `calendar_events` của PostgreSQL. Mỗi record gồm:

```json
{
  "id": "1",
  "title": "Hội nghị",
  "start": "2026-11-01",
  "end": "2026-11-05",
  "extendedProps": {
    "calendar": "danger"
  }
}
```

`extendedProps.calendar` chỉ chấp nhận các giá trị `danger`, `success`, `warning`, `primary`. Cột `end` trong SQL cần được đặt trong dấu ngoặc kép vì đây là keyword của PostgreSQL.

### Uploads

- `POST /api/uploads/image` (đã đăng nhập)

Gửi request dạng `multipart/form-data` với field `file`. Chỉ nhận ảnh, tối đa 10 MB. Response trả về `secureUrl` và `publicId` của ảnh trên Cloudinary.
Khi tạo đơn, hệ thống kiểm tra và trừ nguyên liệu theo định mức món. Khi hủy đơn, nguyên liệu được hoàn lại. Doanh thu chỉ tính các đơn có trạng thái `COMPLETED`.

## Kiểm tra

```bash
npm run build
npm test -- --runInBand
```

Session được lưu trong PostgreSQL. Khi triển khai production nên bổ sung migration versioning, DTO validation, audit log và secret riêng cho việc hash mật khẩu.
