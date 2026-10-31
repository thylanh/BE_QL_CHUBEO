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
import { CalendarStoreService } from './store.service';
import type { CalendarEvent, CreateCalendarInput } from './store.service';

@Controller('calendar')
@UseGuards(AuthGuard)
export class CalendarController {
  constructor(private readonly store: CalendarStoreService) {}

  @Get()
  list(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): CalendarEvent[] {
    return this.store.list(from, to);
  }

  @Post()
  create(@Body() body: Partial<CreateCalendarInput> = {}): CalendarEvent {
    return this.store.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: Partial<CreateCalendarInput> = {},
  ): CalendarEvent {
    return this.store.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string): CalendarEvent {
    return this.store.delete(id);
  }
}
