import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../shared/database.service';

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'RESIGNED';
export type AttendanceStatus =
  'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE' | 'OFF' | 'HOLIDAY';

export interface EmployeeUserRef {
  id: string;
  username: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'STAFF';
  active: boolean;
}

export interface Employee {
  id: string;
  userId?: string | null;
  code: string;
  fullName: string;
  email?: string;
  phone?: string;
  department?: string | null;
  position?: string | null;
  hireDate?: string | null;
  status: EmployeeStatus;
  baseSalary: number;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: EmployeeUserRef | null;
}

export interface CreateEmployeeInput {
  userId?: string | null;
  code?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  hireDate?: string;
  status?: EmployeeStatus;
  baseSalary?: number;
  note?: string;
}

export type UpdateEmployeeInput = Partial<CreateEmployeeInput>;

export interface EmployeeAttendance {
  id: string;
  employeeId: string;
  employeeName?: string;
  workDate: string;
  checkIn?: string | null;
  checkOut?: string | null;
  hoursWorked: number;
  status: AttendanceStatus;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeePayroll {
  id: string;
  employeeId: string;
  employeeName?: string;
  periodStart: string;
  periodEnd: string;
  baseSalary: number;
  workingDays: number;
  attendanceDays: number;
  overtimeHours: number;
  allowance: number;
  deduction: number;
  totalSalary: number;
  status: 'DRAFT' | 'PAID';
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class EmployeesService {
  constructor(private readonly database: DatabaseService) {}

  async listEmployees() {
    const result = await this.database.query<
      Employee & { user_name?: string }
    >(`
      SELECT e.id, e.user_id AS "userId", e.code, e.full_name AS "fullName",
             e.email, e.phone, e.department, e.position,
             e.hire_date AS "hireDate", e.status, e.base_salary AS "baseSalary",
             e.note, e.created_at AS "createdAt", e.updated_at AS "updatedAt",
             u.id AS "user.id", u.username AS "user.username", u.name AS "user.name",
             u.role AS "user.role", u.active AS "user.active"
      FROM employees e
      LEFT JOIN users u ON u.id = e.user_id
      ORDER BY e.full_name ASC
    `);

    return result.rows.map((row) => this.mapEmployee(row));
  }

  async getEmployee(id: string) {
    const result = await this.database.query<Employee & { user_name?: string }>(
      `
      SELECT e.id, e.user_id AS "userId", e.code, e.full_name AS "fullName",
             e.email, e.phone, e.department, e.position,
             e.hire_date AS "hireDate", e.status, e.base_salary AS "baseSalary",
             e.note, e.created_at AS "createdAt", e.updated_at AS "updatedAt",
             u.id AS "user.id", u.username AS "user.username", u.name AS "user.name",
             u.role AS "user.role", u.active AS "user.active"
      FROM employees e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE e.id = $1
    `,
      [id],
    );

    const employee = result.rows[0];
    if (!employee) return undefined;
    return this.mapEmployee(employee);
  }

  async createEmployee(input: CreateEmployeeInput) {
    const fullName = input.fullName?.trim();
    if (!fullName) {
      throw new BadRequestException('Tên nhân viên là bắt buộc');
    }

    const code =
      (input.code ?? '').trim() ||
      `NV-${randomUUID().slice(0, 8).toUpperCase()}`;
    const status = input.status ?? 'ACTIVE';
    if (!['ACTIVE', 'INACTIVE', 'RESIGNED'].includes(status)) {
      throw new BadRequestException('Trạng thái nhân viên không hợp lệ');
    }

    const userId = input.userId ?? null;
    if (userId) {
      const userExists = await this.database.query(
        'SELECT id FROM users WHERE id = $1',
        [userId],
      );
      if (!userExists.rowCount) {
        throw new BadRequestException('Tài khoản đăng nhập không tồn tại');
      }
    }

    const id = randomUUID();
    const baseSalary = Number(input.baseSalary ?? 0);

    await this.database.query(
      `INSERT INTO employees (
        id, user_id, code, full_name, email, phone, department, position,
        hire_date, status, base_salary, note, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
      [
        id,
        userId,
        code,
        fullName,
        input.email?.trim() || null,
        input.phone?.trim() || null,
        input.department?.trim() || null,
        input.position?.trim() || null,
        input.hireDate || null,
        status,
        baseSalary,
        input.note?.trim() || null,
      ],
    );

    return this.getEmployee(id);
  }

  async updateEmployee(id: string, input: UpdateEmployeeInput) {
    const current = await this.getEmployee(id);
    if (!current) throw new NotFoundException('Không tìm thấy nhân viên');

    const fullName = input.fullName?.trim() ?? current.fullName;
    if (!fullName) throw new BadRequestException('Tên nhân viên là bắt buộc');

    const status = input.status ?? current.status;
    if (!['ACTIVE', 'INACTIVE', 'RESIGNED'].includes(status)) {
      throw new BadRequestException('Trạng thái nhân viên không hợp lệ');
    }

    const userId = input.userId ?? current.userId ?? null;
    if (userId) {
      const userExists = await this.database.query(
        'SELECT id FROM users WHERE id = $1',
        [userId],
      );
      if (!userExists.rowCount) {
        throw new BadRequestException('Tài khoản đăng nhập không tồn tại');
      }
    }

    const code = (input.code ?? current.code).trim() || current.code;
    const baseSalary = Number(input.baseSalary ?? current.baseSalary);

    await this.database.query(
      `UPDATE employees SET
        user_id = $2,
        code = $3,
        full_name = $4,
        email = $5,
        phone = $6,
        department = $7,
        position = $8,
        hire_date = $9,
        status = $10,
        base_salary = $11,
        note = $12,
        updated_at = NOW()
      WHERE id = $1`,
      [
        id,
        userId,
        code,
        fullName,
        input.email?.trim() ?? current.email ?? null,
        input.phone?.trim() ?? current.phone ?? null,
        input.department?.trim() ?? current.department ?? null,
        input.position?.trim() ?? current.position ?? null,
        input.hireDate ?? current.hireDate ?? null,
        status,
        baseSalary,
        input.note?.trim() ?? current.note ?? null,
      ],
    );

    return this.getEmployee(id);
  }

  async deleteEmployee(id: string) {
    const current = await this.getEmployee(id);
    if (!current) throw new NotFoundException('Không tìm thấy nhân viên');

    await this.database.query('DELETE FROM employees WHERE id = $1', [id]);
    return { message: 'Đã xóa hồ sơ nhân viên', id };
  }

  async listAttendance(employeeId?: string, from?: string, to?: string) {
    const result = await this.database.query<
      EmployeeAttendance & { employee_name?: string }
    >(
      `
      SELECT a.id, a.employee_id AS "employeeId", e.full_name AS "employeeName",
             a.work_date AS "workDate", a.check_in AS "checkIn",
             a.check_out AS "checkOut", a.hours_worked AS "hoursWorked",
             a.status, a.note, a.created_at AS "createdAt", a.updated_at AS "updatedAt"
      FROM employee_attendance a
      LEFT JOIN employees e ON e.id = a.employee_id
      WHERE ($1::uuid IS NULL OR a.employee_id = $1::uuid)
        AND ($2::date IS NULL OR a.work_date >= $2::date)
        AND ($3::date IS NULL OR a.work_date <= $3::date)
      ORDER BY a.work_date DESC, a.created_at DESC
    `,
      [employeeId ?? null, from ?? null, to ?? null],
    );

    return result.rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      workDate: row.workDate,
      checkIn: row.checkIn ? new Date(row.checkIn).toISOString() : null,
      checkOut: row.checkOut ? new Date(row.checkOut).toISOString() : null,
      hoursWorked: Number(row.hoursWorked),
      status: row.status,
      note: row.note ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }));
  }

  async markAttendance(input: {
    employeeId: string;
    workDate?: string;
    checkIn?: string;
    checkOut?: string;
    status?: AttendanceStatus;
    note?: string;
  }) {
    const employee = await this.getEmployee(input.employeeId);
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên');

    const workDate = input.workDate ?? new Date().toISOString().slice(0, 10);
    const status = input.status ?? 'PRESENT';
    if (
      !['PRESENT', 'LATE', 'ABSENT', 'LEAVE', 'OFF', 'HOLIDAY'].includes(status)
    ) {
      throw new BadRequestException('Trạng thái chấm công không hợp lệ');
    }

    const checkIn = input.checkIn
      ? new Date(input.checkIn).toISOString()
      : null;
    const checkOut = input.checkOut
      ? new Date(input.checkOut).toISOString()
      : null;
    const hoursWorked = this.calculateHours(checkIn, checkOut);

    const existing = await this.database.query<EmployeeAttendance>(
      'SELECT id FROM employee_attendance WHERE employee_id = $1 AND work_date = $2',
      [input.employeeId, workDate],
    );

    if (existing.rowCount) {
      await this.database.query(
        `UPDATE employee_attendance SET
          check_in = COALESCE($3, check_in),
          check_out = COALESCE($4, check_out),
          hours_worked = $5,
          status = $6,
          note = COALESCE($7, note),
          updated_at = NOW()
        WHERE employee_id = $1 AND work_date = $2`,
        [
          input.employeeId,
          workDate,
          checkIn,
          checkOut,
          hoursWorked,
          status,
          input.note?.trim() ?? null,
        ],
      );
      const updated = await this.listAttendance(
        input.employeeId,
        workDate,
        workDate,
      );
      return updated[0];
    }

    const id = randomUUID();
    await this.database.query(
      `INSERT INTO employee_attendance (
        id, employee_id, work_date, check_in, check_out, hours_worked, status, note, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [
        id,
        input.employeeId,
        workDate,
        checkIn,
        checkOut,
        hoursWorked,
        status,
        input.note?.trim() ?? null,
      ],
    );

    const result = await this.listAttendance(
      input.employeeId,
      workDate,
      workDate,
    );
    return result[0];
  }

  async listPayrolls(employeeId?: string, from?: string, to?: string) {
    const result = await this.database.query<
      EmployeePayroll & { employee_name?: string }
    >(
      `
      SELECT p.id, p.employee_id AS "employeeId", e.full_name AS "employeeName",
             p.period_start AS "periodStart", p.period_end AS "periodEnd",
             p.base_salary AS "baseSalary", p.working_days AS "workingDays",
             p.attendance_days AS "attendanceDays", p.overtime_hours AS "overtimeHours",
             p.allowance, p.deduction, p.total_salary AS "totalSalary",
             p.status, p.paid_at AS "paidAt", p.created_at AS "createdAt", p.updated_at AS "updatedAt"
      FROM employee_payrolls p
      LEFT JOIN employees e ON e.id = p.employee_id
      WHERE ($1::uuid IS NULL OR p.employee_id = $1::uuid)
        AND ($2::date IS NULL OR p.period_start >= $2::date)
        AND ($3::date IS NULL OR p.period_end <= $3::date)
      ORDER BY p.period_end DESC, p.created_at DESC
    `,
      [employeeId ?? null, from ?? null, to ?? null],
    );

    return result.rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      baseSalary: Number(row.baseSalary),
      workingDays: Number(row.workingDays),
      attendanceDays: Number(row.attendanceDays),
      overtimeHours: Number(row.overtimeHours),
      allowance: Number(row.allowance),
      deduction: Number(row.deduction),
      totalSalary: Number(row.totalSalary),
      status: row.status,
      paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }));
  }

  async generatePayroll(
    employeeId: string,
    input: {
      periodStart: string;
      periodEnd: string;
      allowance?: number;
      deduction?: number;
      overtimeHours?: number;
      paid?: boolean;
    },
  ) {
    const employee = await this.getEmployee(employeeId);
    if (!employee) throw new NotFoundException('Không tìm thấy nhân viên');

    const periodStart =
      input.periodStart || new Date().toISOString().slice(0, 10);
    const periodEnd = input.periodEnd || periodStart;
    const overtimeHours = Number(input.overtimeHours ?? 0);
    const allowance = Number(input.allowance ?? 0);
    const deduction = Number(input.deduction ?? 0);

    const attendance = await this.database.query<{
      attendance_days: number;
      working_days: number;
      overtime_hours: number;
    }>(
      `
      SELECT COUNT(*)::int AS "attendance_days",
             COUNT(DISTINCT work_date)::int AS "working_days",
             COALESCE(SUM(CASE WHEN hours_worked > 0 THEN hours_worked ELSE 0 END), 0)::float8 AS "overtime_hours"
      FROM employee_attendance
      WHERE employee_id = $1
        AND work_date >= $2::date
        AND work_date <= $3::date
    `,
      [employeeId, periodStart, periodEnd],
    );

    const attendanceDays = Number(attendance.rows[0]?.attendance_days ?? 0);
    const workingDays = Number(attendance.rows[0]?.working_days ?? 0);
    const overtimeCarry =
      Number(attendance.rows[0]?.overtime_hours ?? 0) || overtimeHours;

    const hourlyRate =
      employee.baseSalary > 0 ? employee.baseSalary / 26 / 8 : 0;
    const overtimePay = overtimeCarry * hourlyRate;
    const totalSalary =
      employee.baseSalary + allowance + overtimePay - deduction;

    const id = randomUUID();
    const status = input.paid ? 'PAID' : 'DRAFT';

    await this.database.query(
      `INSERT INTO employee_payrolls (
        id, employee_id, period_start, period_end, base_salary, working_days,
        attendance_days, overtime_hours, allowance, deduction, total_salary,
        status, paid_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
      [
        id,
        employeeId,
        periodStart,
        periodEnd,
        employee.baseSalary,
        workingDays,
        attendanceDays,
        overtimeCarry,
        allowance,
        deduction,
        totalSalary,
        status,
        input.paid ? new Date().toISOString() : null,
      ],
    );

    const payrolls = await this.listPayrolls(
      employeeId,
      periodStart,
      periodEnd,
    );
    return payrolls[0];
  }

  private calculateHours(checkIn?: string | null, checkOut?: string | null) {
    if (!checkIn || !checkOut) return 0;
    const diffMs = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    if (Number.isNaN(diffMs) || diffMs <= 0) return 0;
    return Number((diffMs / 3600000).toFixed(2));
  }

  private mapEmployee(row: Employee): Employee {
    const user = row['user.id']
      ? {
          id: row['user.id'] as string,
          username: row['user.username'] as string,
          name: row['user.name'] as string,
          role: row['user.role'] as 'ADMIN' | 'MANAGER' | 'STAFF',
          active: Boolean(row['user.active']),
        }
      : null;
    return {
      id: row.id,
      userId: row.userId ?? null,
      code: row.code,
      fullName: row.fullName,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      department: row.department ?? null,
      position: row.position ?? null,
      hireDate: row.hireDate ?? null,
      status: row.status,
      baseSalary: Number(row.baseSalary ?? 0),
      note: row.note ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
      user,
    };
  }
}
