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
    const parsedMonth = month ? Number(month) : undefined;
    return this.payrollService.listPayroll(employeeId, parsedMonth);
  }

  @Post('calculate')
  @Roles('ADMIN', 'MANAGER')
  calculatePayroll(
    @Body()
    body: {
      employeeId?: string;
      month?: number;
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

    return this.payrollService.calculatePayroll(employeeId, {
      month: body.month,
      hourlyRate: Number(body.hourlyRate ?? 0),
      baseSalary: Number(body.baseSalary ?? 0),
      bonus: Number(body.bonus ?? 0),
      deduction: Number(body.deduction ?? 0),
    });
  }
}
