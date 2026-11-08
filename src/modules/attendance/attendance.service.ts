import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  checkIn: string | null;
  checkOut: string | null;
  totalMinutes: number;
  status: AttendanceStatus;
  note?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

@Injectable()
export class AttendanceService {
  constructor(private readonly database: DatabaseService) {}

  async listAttendance(employeeId?: string) {
    const tableName = await this.resolveTableName(
      'attendance',
      'employee_attendance',
    );

    if (tableName === 'employee_attendance') {
      const result = await this.database.query<{ [key: string]: any }>(
        `
          SELECT a.id, a.employee_id AS "employeeId",
                 a.work_date AS "workDate",
                 a.check_in AS "checkIn",
                 a.check_out AS "checkOut",
                 a.hours_worked AS "totalMinutes",
                 a.status,
                 a.note,
                 a.created_at AS "createdAt",
                 a.updated_at AS "updatedAt"
          FROM employee_attendance a
          WHERE ($1::uuid IS NULL OR a.employee_id = $1::uuid)
          ORDER BY a.work_date DESC, a.created_at DESC
        `,
        [employeeId ?? null],
      );

      return result.rows.map((row) => this.mapAttendance(row));
    }

    const result = await this.database.query<{ [key: string]: any }>(
      `
        SELECT id, employee_id AS "employeeId",
               check_in AS "checkIn",
               check_out AS "checkOut",
               total_minutes AS "totalMinutes",
               status,
               note,
               created_at AS "createdAt",
               updated_at AS "updatedAt"
        FROM attendance
        WHERE ($1::text IS NULL OR employee_id = $1::text)
        ORDER BY check_in DESC NULLS LAST
      `,
      [employeeId ?? null],
    );

    return result.rows.map((row) => this.mapAttendance(row));
  }

  async checkIn(employeeId: string, note?: string) {
    const employee = await this.getEmployee(employeeId);
    const tableName = await this.resolveTableName(
      'attendance',
      'employee_attendance',
    );

    if (tableName === 'employee_attendance') {
      const existing = await this.database.query<{ id: string }>(
        `SELECT id FROM employee_attendance WHERE employee_id = $1 AND check_out IS NULL ORDER BY work_date DESC LIMIT 1`,
        [employeeId],
      );

      if (existing.rowCount) {
        throw new BadRequestException(
          'Nhân viên đã chấm công vào và chưa chấm ra',
        );
      }

      const checkIn = new Date();
      const id = randomUUID();
      const status = this.getStatus(checkIn);
      await this.database.query(
        `
          INSERT INTO employee_attendance (
            id, employee_id, work_date, check_in, check_out, hours_worked, status, note, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, NULL, 0, $5, $6, NOW(), NOW())
        `,
        [
          id,
          employee.id,
          checkIn.toISOString().slice(0, 10),
          checkIn.toISOString(),
          status,
          note?.trim() || null,
        ],
      );

      const result = await this.database.query<{ [key: string]: any }>(
        'SELECT * FROM employee_attendance WHERE id = $1',
        [id],
      );

      return this.mapAttendance(result.rows[0]);
    }

    const existing = await this.database.query<{ id: string }>(
      `SELECT id FROM attendance WHERE employee_id = $1 AND check_out IS NULL ORDER BY check_in DESC LIMIT 1`,
      [employeeId],
    );

    if (existing.rowCount) {
      throw new BadRequestException(
        'Nhân viên đã chấm công vào và chưa chấm ra',
      );
    }

    const checkIn = new Date();
    const id = randomUUID();
    const status = this.getStatus(checkIn);
    await this.database.query(
      `
        INSERT INTO attendance (
          id, employee_id, check_in, check_out, total_minutes, status, note, created_at, updated_at
        ) VALUES ($1, $2, $3, NULL, 0, $4, $5, NOW(), NOW())
      `,
      [id, employee.id, checkIn.toISOString(), status, note?.trim() || null],
    );

    const result = await this.database.query<{ [key: string]: any }>(
      'SELECT * FROM attendance WHERE id = $1',
      [id],
    );

    return this.mapAttendance(result.rows[0]);
  }

  async checkOut(employeeId: string, note?: string) {
    const tableName = await this.resolveTableName(
      'attendance',
      'employee_attendance',
    );

    if (tableName === 'employee_attendance') {
      const current = await this.database.query<{ [key: string]: any }>(
        `
          SELECT *
          FROM employee_attendance
          WHERE employee_id = $1 AND check_out IS NULL
          ORDER BY work_date DESC, check_in DESC
          LIMIT 1
        `,
        [employeeId],
      );

      if (!current.rowCount) {
        throw new NotFoundException('Nhân viên chưa chấm công vào');
      }

      const record = current.rows[0];
      const checkOut = new Date();
      const totalMinutes = this.calculateMinutes(
        new Date(record.check_in),
        checkOut,
      );
      const status = record.status === 'LATE' ? 'LATE' : 'PRESENT';

      await this.database.query(
        `
          UPDATE employee_attendance
          SET check_out = $1,
              hours_worked = $2,
              status = $3,
              note = COALESCE($4, note),
              updated_at = NOW()
          WHERE id = $5
        `,
        [
          checkOut.toISOString(),
          totalMinutes,
          status,
          note?.trim() || record.note || null,
          record.id,
        ],
      );

      const result = await this.database.query<{ [key: string]: any }>(
        'SELECT * FROM employee_attendance WHERE id = $1',
        [record.id],
      );

      return this.mapAttendance(result.rows[0]);
    }

    const current = await this.database.query<{ [key: string]: any }>(
      `
        SELECT *
        FROM attendance
        WHERE employee_id = $1 AND check_out IS NULL
        ORDER BY check_in DESC
        LIMIT 1
      `,
      [employeeId],
    );

    if (!current.rowCount) {
      throw new NotFoundException('Nhân viên chưa chấm công vào');
    }

    const record = current.rows[0];
    const checkOut = new Date();
    const totalMinutes = this.calculateMinutes(
      new Date(record.check_in),
      checkOut,
    );

    await this.database.query(
      `
        UPDATE attendance
        SET check_out = $1,
            total_minutes = $2,
            status = $3,
            note = COALESCE($4, note),
            updated_at = NOW()
        WHERE id = $5
      `,
      [
        checkOut.toISOString(),
        totalMinutes,
        record.status || 'PRESENT',
        note?.trim() || record.note || null,
        record.id,
      ],
    );

    const result = await this.database.query<{ [key: string]: any }>(
      'SELECT * FROM attendance WHERE id = $1',
      [record.id],
    );

    return this.mapAttendance(result.rows[0]);
  }

  private async resolveTableName(primary: string, fallback: string) {
    const primaryCheck = await this.database.query<{ exists: boolean }>(
      'SELECT to_regclass($1) IS NOT NULL AS exists',
      [primary],
    );
    if (primaryCheck.rows[0]?.exists) {
      return primary;
    }

    const fallbackCheck = await this.database.query<{ exists: boolean }>(
      'SELECT to_regclass($1) IS NOT NULL AS exists',
      [fallback],
    );
    if (fallbackCheck.rows[0]?.exists) {
      return fallback;
    }

    return primary;
  }

  private async getEmployee(employeeId: string) {
    const result = await this.database.query<{ id: string }>(
      'SELECT id FROM employees WHERE id = $1',
      [employeeId],
    );

    if (!result.rowCount) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }

    return result.rows[0];
  }

  private getStatus(date: Date): AttendanceStatus {
    const expectedCheckIn = new Date(date);
    expectedCheckIn.setHours(8, 30, 0, 0);
    return date > expectedCheckIn ? 'LATE' : 'PRESENT';
  }

  private calculateMinutes(checkIn: Date, checkOut: Date) {
    const diffMs = checkOut.getTime() - checkIn.getTime();
    if (Number.isNaN(diffMs) || diffMs <= 0) {
      return 0;
    }
    return Math.round(diffMs / 60000);
  }

  private mapAttendance(row: Record<string, any>): AttendanceRecord {
    return {
      id: row.id,
      employeeId: row.employeeId,
      checkIn: row.checkIn ? new Date(row.checkIn).toISOString() : null,
      checkOut: row.checkOut ? new Date(row.checkOut).toISOString() : null,
      totalMinutes: Number(row.totalMinutes ?? row.hours_worked ?? 0),
      status: (row.status ?? 'PRESENT') as AttendanceStatus,
      note: row.note ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
  }
}
