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
import { AttendanceService } from './attendance.service';

@Controller('attendance')
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  listAttendance(@Query('employeeId') employeeId?: string) {
    return this.attendanceService.listAttendance(employeeId);
  }

  @Post('check-in')
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  checkIn(@Body() body: { employeeId?: string; note?: string } = {}) {
    const employeeId = body.employeeId?.trim();
    if (!employeeId) {
      throw new BadRequestException('employeeId là bắt buộc');
    }

    return this.attendanceService.checkIn(employeeId, body.note);
  }

  @Post('check-out')
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  checkOut(@Body() body: { employeeId?: string; note?: string } = {}) {
    const employeeId = body.employeeId?.trim();
    if (!employeeId) {
      throw new BadRequestException('employeeId là bắt buộc');
    }

    return this.attendanceService.checkOut(employeeId, body.note);
  }
}
