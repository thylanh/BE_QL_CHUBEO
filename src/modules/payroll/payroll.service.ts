import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';

export interface PayrollRecord {
  id: string;
  employeeId: string;
  month: number;
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

  async listPayroll(employeeId?: string, month?: number) {
    const tableName = await this.resolveTableName(
      'payroll',
      'employee_payrolls',
    );

    if (tableName === 'employee_payrolls') {
      const result = await this.database.query<{ [key: string]: any }>(
        `
          SELECT p.id, p.employee_id AS "employeeId",
                 EXTRACT(MONTH FROM p.period_end)::int AS "month",
                 COALESCE(SUM(a.hours_worked), 0)::int AS "totalMinutes",
                 p.base_salary AS "baseSalary",
                 p.total_salary AS "netSalary",
                 p.status,
                 p.created_at AS "createdAt",
                 p.updated_at AS "updatedAt"
          FROM employee_payrolls p
          LEFT JOIN employee_attendance a ON a.employee_id = p.employee_id
          WHERE ($1::uuid IS NULL OR p.employee_id = $1::uuid)
            AND ($2::int IS NULL OR EXTRACT(MONTH FROM p.period_end)::int = $2)
          GROUP BY p.id, p.employee_id, p.base_salary, p.total_salary, p.status, p.created_at, p.updated_at
          ORDER BY p.created_at DESC
        `,
        [employeeId ?? null, month ?? null],
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
        WHERE ($1::text IS NULL OR employee_id = $1::text)
          AND ($2::int IS NULL OR month = $2)
        ORDER BY month DESC, created_at DESC
      `,
      [employeeId ?? null, month ?? null],
    );

    return result.rows.map((row) => this.mapPayroll(row));
  }

  async calculatePayroll(
    employeeId: string,
    input: {
      month?: number;
      hourlyRate?: number;
      baseSalary?: number;
      bonus?: number;
      deduction?: number;
    } = {},
  ) {
    const employee = await this.getEmployee(employeeId);
    const month = input.month ?? new Date().getMonth() + 1;
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
            AND EXTRACT(MONTH FROM work_date)::int = $2
        `,
        [employeeId, month],
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
      const periodStart = new Date(
        Date.UTC(new Date().getFullYear(), month - 1, 1),
      )
        .toISOString()
        .slice(0, 10);
      const periodEnd = new Date(Date.UTC(new Date().getFullYear(), month, 0))
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
          AND EXTRACT(MONTH FROM check_in)::int = $2
      `,
      [employeeId, month],
    );

    const baseSalary = Number(input.baseSalary ?? 0);
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

  private mapPayroll(row: Record<string, any>): PayrollRecord {
    return {
      id: row.id,
      employeeId: row.employeeId,
      month: Number(row.month ?? 0),
      totalMinutes: Number(row.totalMinutes ?? 0),
      hourlyRate: Number(row.hourlyRate ?? 0),
      baseSalary: Number(row.baseSalary ?? 0),
      bonus: Number(row.bonus ?? 0),
      deduction: Number(row.deduction ?? 0),
      netSalary: Number(row.netSalary ?? 0),
      status: row.status ?? 'DRAFT',
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
  }
}
