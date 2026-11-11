export interface IMonitoringStatus {
  status: boolean;
  taskName: string;
}

export interface IIsUnfinishedTask {
  isUnfinishedTask: boolean;
  taskFileName: string;
}

export enum ReportType {
  Termet = 'termet',
  Databy = 'databy'
}
