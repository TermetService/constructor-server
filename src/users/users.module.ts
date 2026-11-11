// user.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './users.controller';
import { usersLogger } from 'src/logger-winston/winston.config';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UserService, { provide: 'winston', useValue: usersLogger }],
  controllers: [UserController],
})
export class UserModule {}
