const { Pool } = require('pg');
const { scryptSync } = require('node:crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  ssl: process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
});

const hashPassword = (password) =>
  scryptSync(password, 'bun-dau-chu-beo', 64).toString('hex');

const users = [
  ['usr-admin', 'admin@bunchubeo.com', 'Chủ Quán Béo (Admin)', 'admin123', 'ADMIN', '0987654321', '2025-01-01T08:00:00.000Z'],
  ['usr-manager', 'manager@bunchubeo.com', 'Quản Lý Cửa Hàng', 'manager123', 'MANAGER', '0912345678', '2025-01-02T08:00:00.000Z'],
  ['usr-staff', 'staff@bunchubeo.com', 'Nhân Viên Phục Vụ', 'staff123', 'STAFF', '0909090909', '2025-01-03T08:00:00.000Z'],
];

const inventory = [
  ['INV-BUN', 'Bún lá Phú Đô', 'kg', 50, 10, 15000],
  ['INV-DAU', 'Đậu hũ Mơ tươi', 'bìa', 200, 30, 4000],
  ['INV-THIT', 'Thịt bắp giò luộc', 'kg', 20, 5, 160000],
  ['INV-CHACOM', 'Chả cốm Hà Nội', 'chiếc', 150, 25, 6000],
  ['INV-NEMCHUA', 'Nem chua rán', 'chiếc', 120, 20, 5000],
  ['INV-DOISUN', 'Dồi sụn nướng', 'chiếc', 100, 20, 8000],
  ['INV-MAMTOM', 'Mắm tôm Thanh Hóa', 'lít', 15, 3, 60000],
  ['INV-TAC', 'Quất (Tắc) tươi', 'kg', 10, 2, 20000],
  ['INV-TRA', 'Trà lài khô', 'kg', 5, 1, 120000],
  ['INV-COCA', 'Lon Coca-Cola 330ml', 'lon', 80, 15, 9000],
  ['INV-SAU', 'Nước cốt sấu ngâm', 'lít', 10, 2, 50000],
  ['INV-MO', 'Nước cốt mơ ngâm', 'lít', 10, 2, 50000],
];

const menu = [
  ['1', 'Bún đậu thập cẩm', 'Món chính', 69000, 'Đậu, chả cốm, thịt luộc, nem rán', 'from-amber-100 to-orange-50', [['INV-BUN', 0.3], ['INV-DAU', 2], ['INV-THIT', 0.1], ['INV-CHACOM', 2], ['INV-NEMCHUA', 2], ['INV-MAMTOM', 0.05], ['INV-TAC', 0.02]]],
  ['2', 'Bún chả Hà Nội', 'Món chính', 55000, 'Chả nướng than hoa, bún tươi', 'from-rose-100 to-orange-50', [['INV-BUN', 0.35], ['INV-THIT', 0.15], ['INV-TAC', 0.02]]],
  ['3', 'Bún nem nướng', 'Món chính', 59000, 'Nem nướng, rau sống, bún tươi', 'from-emerald-100 to-lime-50', [['INV-BUN', 0.3], ['INV-NEMCHUA', 3]]],
  ['4', 'Dồi sụn nướng', 'Món thêm', 45000, 'Phần 5 chiếc, dồi nướng thơm phức', 'from-red-100 to-amber-50', [['INV-DOISUN', 5]]],
  ['5', 'Nem rán giòn', 'Món thêm', 32000, 'Phần 4 chiếc giòn rụm', 'from-yellow-100 to-orange-50', [['INV-NEMCHUA', 4]]],
  ['6', 'Trà tắc mật ong', 'Đồ uống', 22000, 'Trà nhài, tắc tươi, mật ong', 'from-lime-100 to-emerald-50', [['INV-TRA', 0.015], ['INV-TAC', 0.04]]],
  ['7', 'Nước mơ Hà Nội', 'Đồ uống', 25000, 'Mơ ngâm thủ công, đá viên', 'from-yellow-100 to-amber-50', [['INV-MO', 0.05]]],
  ['8', 'Coca-Cola', 'Đồ uống', 18000, 'Lon 330ml, ướp lạnh', 'from-sky-100 to-blue-50', [['INV-COCA', 1]]],
];

const orders = [
  ['DH-101', 'Bàn 03', 'Tại quán', 182000, 'COMPLETED', 'usr-staff', '2026-09-12T11:30:00.000Z', '2026-09-12T12:15:00.000Z', [['1', 'Bún đậu thập cẩm', 69000, 2], ['6', 'Trà tắc mật ong', 22000, 2]]],
  ['DH-102', 'Bàn 07', 'Tại quán', 114000, 'COMPLETED', 'usr-staff', '2026-09-13T09:15:00.000Z', '2026-09-13T09:50:00.000Z', [['1', 'Bún đậu thập cẩm', 69000, 1], ['4', 'Dồi sụn nướng', 45000, 1]]],
  ['DH-103', 'Giao tận nơi', 'Giao hàng', 189000, 'PROCESSING', 'usr-manager', '2026-09-13T11:00:00.000Z', null, [['1', 'Bún đậu thập cẩm', 69000, 2], ['8', 'Coca-Cola', 18000, 2]]],
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE inventory ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0;
      ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category TEXT;
      ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS color TEXT;
      ALTER TABLE menu_item_ingredients ALTER COLUMN amount TYPE NUMERIC(12, 3);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_name TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_fee NUMERIC(12, 2) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_deducted BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
      ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'));
    `);
    for (const [id, email, name, password, role, phone, createdAt] of users) {
      await client.query(`
        INSERT INTO users (id, username, name, role, password_hash, active, email, phone, created_at)
        VALUES ($1, $2, $3, $4, $5, TRUE, $2, $6, $7)
        ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, name = EXCLUDED.name,
          role = EXCLUDED.role, password_hash = EXCLUDED.password_hash, active = TRUE,
          email = EXCLUDED.email, phone = EXCLUDED.phone, created_at = EXCLUDED.created_at`,
        [id, email, name, role, hashPassword(password), phone, createdAt],
      );
    }
    for (const [id, name, unit, quantity, minQuantity, costPrice] of inventory) {
      await client.query(`
        INSERT INTO inventory (id, name, unit, quantity, min_quantity, cost_price)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, unit = EXCLUDED.unit,
          quantity = EXCLUDED.quantity, min_quantity = EXCLUDED.min_quantity, cost_price = EXCLUDED.cost_price,
          updated_at = NOW()`,
        [id, name, unit, quantity, minQuantity, costPrice],
      );
    }
    for (const [id, name, category, price, description, color, ingredients] of menu) {
      await client.query(`
        INSERT INTO menu_items (id, name, price, category, description, color, active)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price,
          category = EXCLUDED.category, description = EXCLUDED.description, color = EXCLUDED.color, active = TRUE`,
        [id, name, price, category, description, color],
      );
      await client.query('DELETE FROM menu_item_ingredients WHERE menu_item_id = $1', [id]);
      for (const [ingredientId, amount] of ingredients) {
        await client.query(
          'INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id, amount) VALUES ($1, $2, $3)',
          [id, ingredientId, amount],
        );
      }
    }
    for (const [code, tableName, orderType, total, status, createdBy, createdAt, completedAt, lines] of orders) {
      const orderId = code;
      const serviceFee = code === 'DH-103' ? 15000 : 0;
      await client.query(`
        INSERT INTO orders (id, code, total, status, created_by, table_name, order_type, service_fee,
          inventory_deducted, created_at, updated_at, completed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $9, $10)
        ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, total = EXCLUDED.total, status = EXCLUDED.status,
          created_by = EXCLUDED.created_by, table_name = EXCLUDED.table_name, order_type = EXCLUDED.order_type,
          service_fee = EXCLUDED.service_fee, inventory_deducted = EXCLUDED.inventory_deducted,
          created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at, completed_at = EXCLUDED.completed_at`,
        [orderId, code, total, status, createdBy, tableName, orderType, serviceFee, createdAt, completedAt],
      );
      await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
      for (const [menuItemId, name, unitPrice, quantity] of lines) {
        await client.query(
          'INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price, total) VALUES ($1, $2, $3, $4, $5, $6)',
          [orderId, menuItemId, name, quantity, unitPrice, unitPrice * quantity],
        );
      }
    }
    await client.query('COMMIT');
    console.log('Demo data seeded successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});