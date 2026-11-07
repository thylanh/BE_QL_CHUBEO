import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { CalendarEvent, CreateCalendarInput } from './calendar.service';
import { CalendarStoreService } from './calendar.service';

@Controller('calendar')
@UseGuards(AuthGuard)
export class CalendarController {
  constructor(private readonly store: CalendarStoreService) {}

  @Get()
  async list(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<CalendarEvent[]> {
    return this.store.list(from, to);
  }

  @Post()
  async create(
    @Body() body: Partial<CreateCalendarInput> = {},
  ): Promise<CalendarEvent> {
    return this.store.create(body);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<CreateCalendarInput> = {},
  ): Promise<CalendarEvent> {
    return this.store.update(id, body);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<CalendarEvent> {
    return this.store.delete(id);
  }
}
