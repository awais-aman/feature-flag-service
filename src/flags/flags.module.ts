import { Module } from '@nestjs/common';
import { FlagsController } from './flags.controller';
import { FlagsService } from './flags.service';
import { AuditService } from '../audit/audit.service';

@Module({
  controllers: [FlagsController],
  providers: [FlagsService, AuditService],
  exports: [FlagsService],
})
export class FlagsModule {}
