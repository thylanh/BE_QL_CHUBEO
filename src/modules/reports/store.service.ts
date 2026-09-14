import { Injectable } from '@nestjs/common';
import { OrdersStoreService } from '../orders/store.service';

@Injectable()
export class ReportsStoreService {
  constructor(private readonly ordersStore: OrdersStoreService) {}

  revenue(from?: string, to?: string) {
    return this.ordersStore.revenue(from, to);
  }
}
