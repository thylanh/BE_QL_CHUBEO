// import { InventoryStoreService } from '../inventory/store.service';
// import { OrdersStoreService } from './store.service';

// describe('menu and inventory image fields', () => {
//   it('returns menu item image and inventory image in API payloads', async () => {
//     const db = {
//       query: jest.fn(),
//     } as any;

//     db.query.mockImplementation((sql: string) => {
//       if (sql.includes('FROM menu_items')) {
//         return Promise.resolve({
//           rows: [
//             {
//               id: 'm1',
//               name: 'Bún đậu',
//               price: '69000',
//               category: 'Món chính',
//               description: 'Mô tả',
//               color: 'red',
//               created_at: '2026-09-19T00:00:00.000Z',
//               active: true,
//               image: 'https://example.com/menu.jpg',
//               ingredient_id: 'i1',
//               amount: '0.2',
//             },
//           ],
//         });
//       }

//       if (sql.includes('FROM inventory')) {
//         return Promise.resolve({
//           rows: [
//             {
//               id: 'i1',
//               name: 'Bún',
//               unit: 'kg',
//               quantity: 10,
//               minQuantity: 2,
//               updatedAt: '2026-09-19T00:00:00.000Z',
//               image: 'https://example.com/ingredient.jpg',
//             },
//           ],
//         });
//       }

//       return Promise.resolve({ rows: [] });
//     });

//     const ordersStore = new OrdersStoreService(db);
//     const inventoryStore = new InventoryStoreService(db);

//     const menu = await ordersStore.listMenuItems();
//     expect(menu[0]).toMatchObject({
//       id: 'm1',
//       image: 'https://example.com/menu.jpg',
//     });

//     const inventory = await inventoryStore.listInventory();
//     expect(inventory[0]).toMatchObject({
//       id: 'i1',
//       image: 'https://example.com/ingredient.jpg',
//     });
//   });
// });
