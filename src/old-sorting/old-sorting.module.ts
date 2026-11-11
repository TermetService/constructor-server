import { Module } from '@nestjs/common';
import { oldSortingLogger } from 'src/logger-winston/winston.config';
import { OldSortingController } from './old-sorting.controller';
import { OldSortingFilesService } from './old-sorting-files.service';
import { OldSortingService } from './old-sorting.service';

@Module({
  controllers: [OldSortingController],
  providers: [
    OldSortingFilesService,
    OldSortingService,
    { provide: 'winston', useValue: oldSortingLogger },
  ],
})
export class OldSortingModule {}
