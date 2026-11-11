import { Controller, Get } from '@nestjs/common';
import { FileService1S } from './files1s.service';

@Controller('files1s')
export class FileController1S {
  constructor(private readonly fileService1S: FileService1S) { }

  @Get('check')
  async checkFilesInDirectory(): Promise<any> {
    return await this.fileService1S.checkFilesInDirectory();
  }

  @Get()
  async getFiles(): Promise<string[]> {
    return this.fileService1S.getFiles();
  }

  @Get('refresh')
  async refreshFiles(): Promise<string[]> {
    return this.fileService1S.refreshFiles();
  }
}
