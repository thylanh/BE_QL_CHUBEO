import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../shared/database.service';

export type CalendarColor = 'danger' | 'success' | 'warning' | 'primary';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  extendedProps: {
    calendar: CalendarColor;
  };
}

export interface CreateCalendarInput {
  id?: string;
  title: string;
  start: string;
  end?: string;
  extendedProps?: {
    calendar?: CalendarColor;
  };
}

interface CalendarRow {
  id: string;
  title: string;
  start: string;
  end?: string | null;
  calendar: CalendarColor;
}

@Injectable()
export class CalendarStoreService {
  private readonly logger = new Logger(CalendarStoreService.name);

  constructor(private readonly database: DatabaseService) {}

  async list(from?: string, to?: string): Promise<CalendarEvent[]> {
    const startDate = parseDate(from, startOfMonth(new Date()));
    const endDate = parseDate(to, endOfMonth(new Date()));
    if (startDate > endDate) {
      throw new BadRequestException('from phải nhỏ hơn hoặc bằng to');
    }

    const result = await this.database.query<CalendarRow>(
      `
        SELECT id, title, start, "end", calendar
        FROM calendar_events
        WHERE start <= $2
          AND COALESCE("end", start) >= $1
        ORDER BY start ASC, id ASC
      `,
      [formatDate(startDate), formatDate(endDate)],
    );

    return result.rows.map(mapRow);
  }

  async create(
    input: Partial<CreateCalendarInput> = {},
  ): Promise<CalendarEvent> {
    const payload = validateEventInput(input);
    const result = await this.database.query<CalendarRow>(
      `
        INSERT INTO calendar_events (id, title, start, "end", calendar)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, title, start, "end", calendar
      `,
      [
        payload.id ?? randomUUID(),
        payload.title,
        payload.start,
        payload.end ?? null,
        payload.extendedProps?.calendar ?? 'success',
      ],
    );
    return mapRow(result.rows[0]);
  }

  async update(
    id: string,
    input: Partial<CreateCalendarInput> = {},
  ): Promise<CalendarEvent> {
    const existing = await this.database.query<CalendarRow>(
      'SELECT id, title, start, "end", calendar FROM calendar_events WHERE id = $1',
      [id],
    );

    if (existing.rowCount === 0) {
      throw new NotFoundException(`Không tìm thấy sự kiện có id = ${id}`);
    }

    const current = existing.rows[0];
    const payload = validateEventInput({
      id: current.id,
      title: input.title ?? current.title,
      start: input.start ?? current.start,
      end: input.end ?? current.end ?? undefined,
      extendedProps: {
        calendar: input.extendedProps?.calendar ?? current.calendar,
      },
    });

    const result = await this.database.query<CalendarRow>(
      `
        UPDATE calendar_events
        SET title = $2,
            start = $3,
            "end" = $4,
            calendar = $5
        WHERE id = $1
        RETURNING id, title, start, "end", calendar
      `,
      [
        id,
        payload.title,
        payload.start,
        payload.end ?? null,
        payload.extendedProps?.calendar ?? 'success',
      ],
    );

    return mapRow(result.rows[0]);
  }

  async delete(id: string): Promise<CalendarEvent> {
    const result = await this.database.query<CalendarRow>(
      `
        DELETE FROM calendar_events
        WHERE id = $1
        RETURNING id, title, start, "end", calendar
      `,
      [id],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException(`Không tìm thấy sự kiện có id = ${id}`);
    }

    return mapRow(result.rows[0]);
  }
}

function validateEventInput(
  input: Partial<CreateCalendarInput>,
): CreateCalendarInput {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) {
    throw new BadRequestException('title không được để trống');
  }

  const start = normalizeEventDate(input.start, 'start');
  const end =
    input.end !== undefined ? normalizeEventDate(input.end, 'end') : undefined;

  if (
    end &&
    new Date(`${end}T00:00:00`).getTime() <
      new Date(`${start}T00:00:00`).getTime()
  ) {
    throw new BadRequestException('end phải lớn hơn hoặc bằng start');
  }

  const calendarValue =
    typeof input.extendedProps?.calendar === 'string'
      ? input.extendedProps.calendar.trim().toLowerCase()
      : 'success';

  if (!['danger', 'success', 'warning', 'primary'].includes(calendarValue)) {
    throw new BadRequestException(
      'extendedProps.calendar phải là danger, success, warning hoặc primary',
    );
  }

  const calendar = calendarValue as CalendarColor;

  return {
    id:
      typeof input.id === 'string' && input.id.trim()
        ? input.id.trim()
        : undefined,
    title,
    start,
    ...(end ? { end } : {}),
    extendedProps: { calendar },
  };
}

function normalizeEventDate(value: unknown, field: 'start' | 'end'): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${field} không được để trống`);
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} phải đúng định dạng ngày`);
  }

  return value.trim();
}

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('from/to phải đúng định dạng YYYY-MM-DD');
  }
  return parsed;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mapRow(row: CalendarRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    start: row.start,
    ...(row.end ? { end: row.end } : {}),
    extendedProps: {
      calendar: row.calendar,
    },
  };
}
