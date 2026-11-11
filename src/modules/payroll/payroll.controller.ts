import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { PayrollService } from './payroll.service';

@Controller('payroll')
@UseGuards(AuthGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER')
  listPayroll(
    @Query('employeeId') employeeId?: string,
    @Query('month') month?: string,
  ) {
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException('month phải có định dạng YYYY-MM');
    }

    return this.payrollService.listPayroll(employeeId, month);
  }

  @Post('calculate')
  @Roles('ADMIN', 'MANAGER')
  calculatePayroll(
    @Body()
    body: {
      employeeId?: string;
      month?: string;
      hourlyRate?: number;
      baseSalary?: number;
      bonus?: number;
      deduction?: number;
    } = {},
  ) {
    const employeeId = body.employeeId?.trim();
    if (!employeeId) {
      throw new BadRequestException('employeeId là bắt buộc');
    }

    if (
      body.month !== undefined &&
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)
    ) {
      throw new BadRequestException('month phải có định dạng YYYY-MM');
    }

    return this.payrollService.calculatePayroll(employeeId, {
      month: body.month,
      hourlyRate: Number(body.hourlyRate ?? 0),
      baseSalary: Number(body.baseSalary ?? 0),
      bonus: Number(body.bonus ?? 0),
      deduction: Number(body.deduction ?? 0),
    });
  }
}
