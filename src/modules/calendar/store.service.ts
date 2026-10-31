import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

export type CalendarColor = 'Danger' | 'Success' | 'Warning';

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

@Injectable()
export class CalendarStoreService {
  private readonly events: CalendarEvent[] = this.buildBaseEvents();

  list(from?: string, to?: string): CalendarEvent[] {
    const startDate = parseDate(from, startOfMonth(new Date()));
    const endDate = parseDate(to, endOfMonth(new Date()));

    if (startDate > endDate) {
      throw new BadRequestException('from phải nhỏ hơn hoặc bằng to');
    }

    return this.events.filter((event) => {
      const eventStart = parseDate(event.start, startDate);
      const eventEnd = event.end
        ? parseDate(event.end, eventStart)
        : eventStart;
      return eventStart <= endDate && eventEnd >= startDate;
    });
  }

  create(input: Partial<CreateCalendarInput> = {}): CalendarEvent {
    const payload = validateEventInput(input);
    const event: CalendarEvent = {
      id:
        payload.id ??
        `calendar-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: payload.title.trim(),
      start: payload.start,
      ...(payload.end ? { end: payload.end } : {}),
      extendedProps: {
        calendar: payload.extendedProps?.calendar ?? 'Success',
      },
    };

    this.events.push(event);
    return event;
  }

  update(id: string, input: Partial<CreateCalendarInput> = {}): CalendarEvent {
    const index = this.events.findIndex((event) => event.id === id);
    if (index === -1) {
      throw new NotFoundException(`Không tìm thấy sự kiện có id = ${id}`);
    }

    const current = this.events[index];
    const payload = validateEventInput({
      ...current,
      ...input,
      extendedProps: {
        ...current.extendedProps,
        ...(input.extendedProps ?? {}),
      },
    });

    const event: CalendarEvent = {
      id: current.id,
      title: payload.title.trim(),
      start: payload.start,
      ...(payload.end ? { end: payload.end } : {}),
      extendedProps: {
        calendar:
          payload.extendedProps?.calendar ?? current.extendedProps.calendar,
      },
    };

    this.events[index] = event;
    return event;
  }

  delete(id: string): CalendarEvent {
    const index = this.events.findIndex((event) => event.id === id);
    if (index === -1) {
      throw new NotFoundException(`Không tìm thấy sự kiện có id = ${id}`);
    }

    const [deleted] = this.events.splice(index, 1);
    return deleted;
  }

  private buildBaseEvents(): CalendarEvent[] {
    const seedDate = new Date();
    const start = startOfMonth(seedDate);

    return [
      {
        id: '1',
        title: 'Hội nghị',
        start: formatDate(start),
        extendedProps: { calendar: 'Danger' },
      },
      {
        id: '2',
        title: 'Cuộc họp',
        start: formatDate(addDays(start, 1)),
        extendedProps: { calendar: 'Success' },
      },
      {
        id: '3',
        title: 'Hội thảo',
        start: formatDate(addDays(start, 2)),
        end: formatDate(addDays(start, 5)),
        extendedProps: { calendar: 'Warning' },
      },
    ];
  }
}

function validateEventInput(
  input: Partial<CreateCalendarInput>,
): CreateCalendarInput {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) throw new BadRequestException('title không được để trống');

  const start = normalizeEventDate(input.start, 'start');
  const end =
    input.end !== undefined ? normalizeEventDate(input.end, 'end') : undefined;

  if (end && new Date(end).getTime() < new Date(start).getTime()) {
    throw new BadRequestException('end phải lớn hơn hoặc bằng start');
  }

  const calendar = input.extendedProps?.calendar ?? 'Success';
  if (!['Danger', 'Success', 'Warning'].includes(calendar)) {
    throw new BadRequestException(
      'extendedProps.calendar phải là Danger, Success hoặc Warning',
    );
  }

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

  const parsed = new Date(value);
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

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}
