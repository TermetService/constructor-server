import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { CameraConfig } from './camera-config.entity';

@Injectable()
export class CameraConfigRepository extends Repository<CameraConfig> {}
