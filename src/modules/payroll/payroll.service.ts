import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';

export interface PayrollRecord {
  id: string;
  employeeId: string;
  month: string;
  totalMinutes: number;
  hourlyRate: number;
  baseSalary: number;
  bonus: number;
  deduction: number;
  netSalary: number;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

@Injectable()
export class PayrollService {
  constructor(private readonly database: DatabaseService) {}

  async listPayroll(employeeId: string | undefined, month: string) {
    const monthStart = `${month}-01`;
    const tableName = await this.resolveTableName(
      'payroll',
      'employee_payrolls',
    );

    if (tableName === 'employee_payrolls') {
      const result = await this.database.query<{ [key: string]: any }>(
        `
          SELECT p.id, p.employee_id AS "employeeId",
                 TO_CHAR(p.period_end, 'YYYY-MM') AS "month",
                 COALESCE(SUM(a.hours_worked), 0)::int AS "totalMinutes",
                 p.base_salary AS "baseSalary",
                 p.total_salary AS "netSalary",
                 p.status,
                 p.created_at AS "createdAt",
                 p.updated_at AS "updatedAt"
          FROM employee_payrolls p
          LEFT JOIN employee_attendance a
            ON a.employee_id::text = p.employee_id::text
          WHERE ($1::text IS NULL OR p.employee_id::text = $1::text)
            AND p.period_end >= $2::date
            AND p.period_end < ($2::date + INTERVAL '1 month')
          GROUP BY p.id, p.employee_id, p.base_salary, p.total_salary, p.status, p.created_at, p.updated_at
          ORDER BY p.created_at DESC
        `,
        [employeeId ?? null, monthStart],
      );

      return result.rows.map((row) => this.mapPayroll(row));
    }

    const result = await this.database.query<{ [key: string]: any }>(
      `
        SELECT id, employee_id AS "employeeId",
               month,
               total_minutes AS "totalMinutes",
               hourly_rate AS "hourlyRate",
               base_salary AS "baseSalary",
               bonus,
               deduction,
               net_salary AS "netSalary",
               status,
               created_at AS "createdAt",
               updated_at AS "updatedAt"
        FROM payroll
        WHERE ($1::text IS NULL OR employee_id::text = $1::text)
          AND month::text = $2::text
        ORDER BY created_at DESC
      `,
      [employeeId ?? null, month],
    );

    return result.rows.map((row) => this.mapPayroll(row));
  }

  async calculatePayroll(
    employeeId: string,
    input: {
      month?: string;
      hourlyRate?: number;
      baseSalary?: number;
      bonus?: number;
      deduction?: number;
    } = {},
  ) {
    const employee = await this.getEmployee(employeeId);
    const month =
      input.month ??
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const monthStart = `${month}-01`;
    const tableName = await this.resolveTableName(
      'payroll',
      'employee_payrolls',
    );

    if (tableName === 'employee_payrolls') {
      const attendance = await this.database.query<{ total_minutes: number }>(
        `
          SELECT COALESCE(SUM(hours_worked), 0)::float8 AS total_minutes
          FROM employee_attendance
          WHERE employee_id = $1
            AND work_date >= $2::date
            AND work_date < ($2::date + INTERVAL '1 month')
        `,
        [employeeId, monthStart],
      );

      const totalMinutes = Number(attendance.rows[0]?.total_minutes ?? 0);
      const baseSalary = Number(input.baseSalary ?? employee.base_salary ?? 0);
      const hourlyRate = Number(
        input.hourlyRate ?? (baseSalary > 0 ? baseSalary / 160 : 0),
      );
      const bonus = Number(input.bonus ?? 0);
      const deduction = Number(input.deduction ?? 0);
      const netSalary =
        baseSalary + (totalMinutes / 60) * hourlyRate + bonus - deduction;

      const id = randomUUID();
      const periodStart = monthStart;
      const periodEnd = new Date(
        Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
      )
        .toISOString()
        .slice(0, 10);

      await this.database.query(
        `
          INSERT INTO employee_payrolls (
            id, employee_id, period_start, period_end, base_salary,
            working_days, attendance_days, overtime_hours, allowance,
            deduction, total_salary, status, paid_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 0, 0, 0, $6, $7, $8, 'DRAFT', NULL, NOW(), NOW())
        `,
        [
          id,
          employeeId,
          periodStart,
          periodEnd,
          baseSalary,
          bonus,
          deduction,
          netSalary,
        ],
      );

      const result = await this.database.query<{ [key: string]: any }>(
        'SELECT * FROM employee_payrolls WHERE id = $1',
        [id],
      );

      return this.mapPayroll(result.rows[0]);
    }

    const attendance = await this.database.query<{ total_minutes: number }>(
      `
        SELECT COALESCE(SUM(total_minutes), 0)::int AS total_minutes
        FROM attendance
        WHERE employee_id = $1
          AND check_in >= $2::date
          AND check_in < ($2::date + INTERVAL '1 month')
      `,
      [employeeId, monthStart],
    );

    const baseSalary = Number(input.baseSalary ?? employee.base_salary ?? 0);
    const hourlyRate = Number(
      input.hourlyRate ?? (baseSalary > 0 ? baseSalary / 160 : 0),
    );
    const bonus = Number(input.bonus ?? 0);
    const deduction = Number(input.deduction ?? 0);
    const totalMinutes = Number(attendance.rows[0]?.total_minutes ?? 0);
    const netSalary =
      baseSalary + (totalMinutes / 60) * hourlyRate + bonus - deduction;

    const id = randomUUID();
    await this.database.query(
      `
        INSERT INTO payroll (
          id, employee_id, month, total_minutes, hourly_rate,
          base_salary, bonus, deduction, net_salary, status,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'DRAFT', NOW(), NOW())
      `,
      [
        id,
        employeeId,
        month,
        totalMinutes,
        hourlyRate,
        baseSalary,
        bonus,
        deduction,
        netSalary,
      ],
    );

    const result = await this.database.query<{ [key: string]: any }>(
      'SELECT * FROM payroll WHERE id = $1',
      [id],
    );

    return this.mapPayroll(result.rows[0]);
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
    const result = await this.database.query<{
      id: string;
      base_salary: number;
    }>('SELECT id, base_salary AS "base_salary" FROM employees WHERE id = $1', [
      employeeId,
    ]);

    if (!result.rowCount) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }

    return result.rows[0];
  }

  private mapPayroll(row: Record<string, unknown>): PayrollRecord {
    const value = (...keys: string[]) =>
      keys
        .map((key) => row[key])
        .find((item) => item !== undefined && item !== null);
    const dateToIso = (value: unknown) => {
      if (value instanceof Date) {
        return value.toISOString();
      }

      if (typeof value === 'string' && value) {
        return new Date(value).toISOString();
      }

      return null;
    };
    const status =
      typeof row.status === 'string' && row.status.trim()
        ? row.status
        : 'DRAFT';

    const toNumber = (value: unknown, fallback = 0): number => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      }

      return fallback;
    };
    const monthValue = value('month', 'period_end');
    const month =
      typeof monthValue === 'string' && /^\d{4}-\d{2}$/.test(monthValue)
        ? monthValue
        : (dateToIso(monthValue)?.slice(0, 7) ?? '');
    const employeeId = value('employeeId', 'employee_id');
    const id = value('id');

    return {
      id: typeof id === 'string' || typeof id === 'number' ? String(id) : '',
      employeeId:
        typeof employeeId === 'string' || typeof employeeId === 'number'
          ? String(employeeId)
          : '',
      month,
      totalMinutes: toNumber(value('totalMinutes', 'total_minutes')),
      hourlyRate: toNumber(value('hourlyRate', 'hourly_rate')),
      baseSalary: toNumber(value('baseSalary', 'base_salary')),
      bonus: toNumber(value('bonus', 'allowance')),
      deduction: toNumber(value('deduction')),
      netSalary: toNumber(value('netSalary', 'net_salary', 'total_salary')),
      status,
      createdAt: dateToIso(value('createdAt', 'created_at')),
      updatedAt: dateToIso(value('updatedAt', 'updated_at')),
    };
  }
}
