import { Module } from '@nestjs/common';
import { NumberBoxETEService } from './numberBoxETE.service';
import { numberBoxETE } from './numberBoxETE.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([numberBoxETE])],
  providers: [NumberBoxETEService],
  exports: [NumberBoxETEService],
})
export class numberBoxETEModule {}
