import {
  BadRequestException,
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
import { AuthGuard, Roles } from '../auth/auth.guard';
import { EmployeesService } from './store.service';

@Controller('employees')
@UseGuards(AuthGuard)
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER')
  listEmployees() {
    return this.service.listEmployees();
  }

  @Get('attendance')
  @Roles('ADMIN', 'MANAGER')
  listAttendance(
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listAttendance(employeeId, from, to);
  }

  @Get('payrolls')
  @Roles('ADMIN', 'MANAGER')
  listPayrolls(
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listPayrolls(employeeId, from, to);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  getEmployee(@Param('id') id: string) {
    return this.service.getEmployee(id);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  createEmployee(@Body() body: Record<string, unknown> = {}) {
    return this.service.createEmployee(normalizeEmployeeInput(body));
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  updateEmployee(
    @Param('id') id: string,
    @Body() body: Record<string, unknown> = {},
  ) {
    return this.service.updateEmployee(id, normalizeEmployeeInput(body));
  }

  @Delete(':id')
  @Roles('ADMIN')
  deleteEmployee(@Param('id') id: string) {
    return this.service.deleteEmployee(id);
  }

  @Post('attendance')
  @Roles('ADMIN', 'MANAGER')
  markAttendance(@Body() body: Record<string, unknown> = {}) {
    const employeeId =
      typeof body.employeeId === 'string' ? body.employeeId.trim() : '';
    if (!employeeId) {
      throw new BadRequestException('employeeId là bắt buộc');
    }

    return this.service.markAttendance({
      employeeId,
      workDate: typeof body.workDate === 'string' ? body.workDate : undefined,
      checkIn: typeof body.checkIn === 'string' ? body.checkIn : undefined,
      checkOut: typeof body.checkOut === 'string' ? body.checkOut : undefined,
      status:
        typeof body.status === 'string' &&
        ['PRESENT', 'LATE', 'ABSENT', 'LEAVE', 'OFF', 'HOLIDAY'].includes(
          body.status,
        )
          ? (body.status as
              'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE' | 'OFF' | 'HOLIDAY')
          : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    });
  }

  @Post('payrolls/generate')
  @Roles('ADMIN', 'MANAGER')
  generatePayroll(
    @Body()
    body: {
      employeeId?: string;
      periodStart?: string;
      periodEnd?: string;
      allowance?: number;
      deduction?: number;
      overtimeHours?: number;
      paid?: boolean;
    } = {},
  ) {
    const employeeId = body.employeeId?.trim();
    if (!employeeId) {
      throw new BadRequestException('employeeId là bắt buộc');
    }

    return this.service.generatePayroll(employeeId, {
      periodStart: body.periodStart ?? new Date().toISOString().slice(0, 10),
      periodEnd: body.periodEnd ?? new Date().toISOString().slice(0, 10),
      allowance: Number(body.allowance ?? 0),
      deduction: Number(body.deduction ?? 0),
      overtimeHours: Number(body.overtimeHours ?? 0),
      paid: Boolean(body.paid),
    });
  }
}

function normalizeEmployeeInput(body: Record<string, unknown>) {
  const fullName =
    typeof body.fullName === 'string' ? body.fullName.trim() : undefined;
  const code = typeof body.code === 'string' ? body.code.trim() : undefined;
  const userId =
    typeof body.userId === 'string' ? body.userId.trim() || null : null;
  const email =
    typeof body.email === 'string' ? body.email.trim() || undefined : undefined;
  const phone =
    typeof body.phone === 'string' ? body.phone.trim() || undefined : undefined;
  const department =
    typeof body.department === 'string'
      ? body.department.trim() || undefined
      : undefined;
  const position =
    typeof body.position === 'string'
      ? body.position.trim() || undefined
      : undefined;
  const hireDate =
    typeof body.hireDate === 'string' ? body.hireDate : undefined;
  const status =
    typeof body.status === 'string' &&
    ['ACTIVE', 'INACTIVE', 'RESIGNED'].includes(body.status)
      ? (body.status as 'ACTIVE' | 'INACTIVE' | 'RESIGNED')
      : undefined;
  const baseSalary =
    typeof body.baseSalary === 'number' ? body.baseSalary : undefined;
  const note =
    typeof body.note === 'string' ? body.note.trim() || undefined : undefined;

  return {
    userId,
    code,
    fullName,
    email,
    phone,
    department,
    position,
    hireDate,
    status,
    baseSalary,
    note,
  };
}
