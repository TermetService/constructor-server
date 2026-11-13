import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'winston';
import { AppGateway } from 'src/app.gateway';
import {
  IAllCounts,
  IMonitoringVariables,
  MonitoringStatusActions,
  RootStatus,
} from 'src/globalTypes';
import { codeLogger } from 'src/logger-winston/winston.config';
import { IRecords, SearchFrom } from './types';
import { CodeCountsService } from './helpers/code-counts.service';
import { CodeLabelsService } from './helpers/code-labels.service';
import { CodeLayersService } from './helpers/code-layers.service';
import { CodeRemoteService } from './helpers/code-remote.service';
import { CodeReportsService } from './helpers/code-reports.service';
import { CodeSaveService } from './helpers/code-save.service';
import { CodeScanService } from './helpers/code-scan.service';
import { CodeTablesService } from './helpers/code-tables.service';
import { CodeWeightsService } from './helpers/code-weights.service';

/**
 * Единая точка входа для работы с кодами задания.
 *
 * Сам ничего не считает: разложен на пять сервисов в `helpers/`
 *   - CodeTablesService  — таблицы задания и их очистка
 *   - CodeCountsService  — счётчики, отправка на фронт, сводка
 *   - CodeSaveService    — проверка списка задания и запись кода
 *   - CodeLabelsService  — закрытие коробки/паллеты и печать этикеток
 *   - CodeReportsService — отчёты Databy/Термет и txt с кодами
 *
 * Публичные методы и конструктор сохранены, чтобы не менять DI и вызовы.
 */
@Injectable()
export class CodeHelperService {
  constructor(
    private readonly tables: CodeTablesService,
    private readonly counts: CodeCountsService,
    private readonly saveCodes: CodeSaveService,
    private readonly labels: CodeLabelsService,
    private readonly reports: CodeReportsService,
    private readonly scan: CodeScanService,
    private readonly weights: CodeWeightsService,
    private readonly remote: CodeRemoteService,
    private readonly layers: CodeLayersService,
    private readonly appGateway: AppGateway,
    @Inject('GLOBAL_MONITORING_VARIABLES')
    private readonly globalMonVar: IMonitoringVariables,
    @Inject('winston') private readonly logger: Logger = codeLogger,
  ) {}

  // ---------------------------------------------------------------- ошибки

  /** Единая обработка отказа: статус, лог, счётчики на фронт, сообщение оператору */
  handleValidationError(
    message: string,
    status: MonitoringStatusActions = MonitoringStatusActions.Reject,
  ): void {
    this.globalMonVar.codeStatus = status;
    this.logger.error(`Код: ${message}`);

    this.counts.sendCurrentStateToFrontend(this.counts.getCurrentCounts());
    this.appGateway.sendRootMessage({ status: RootStatus.Error, message });
  }

  // --------------------------------------------------------------- таблицы

  initializeTables(): Promise<void> {
    return this.tables.initializeTables();
  }

  checkTableExists(tableName: string): Promise<void> {
    return this.tables.checkTableExists(tableName);
  }

  createCleanupMetadataTable(): Promise<void> {
    return this.tables.createCleanupMetadataTable();
  }

  deleteOldTablesIfNeeded(): Promise<void> {
    return this.tables.deleteOldTablesIfNeeded();
  }

  deleteTablesOlderThan(): Promise<void> {
    return this.tables.deleteTablesOlderThan();
  }

  // -------------------------------------------------------------- счётчики

  getTableName(): string {
    return this.counts.getTableName();
  }

  getCurrentCounts(): IAllCounts {
    return this.counts.getCurrentCounts();
  }

  sendCurrentStateToFrontend(allCounts: IAllCounts): Promise<void> {
    return this.counts.sendCurrentStateToFrontend(allCounts);
  }

  sendDataToFrontend(allCounts: IAllCounts): void {
    this.counts.sendDataToFrontend(allCounts);
  }

  async sendDBDataToFrontend(): Promise<void> {
    return this.counts.sendDBDataToFrontend();
  }

  updateGlobalVariablesFromCounts(
    allCounts: Partial<IAllCounts>,
  ): Promise<void> {
    return this.counts.updateGlobalVariablesFromCounts(allCounts);
  }

  getLastBoxAndPalletInfo(): Promise<{
    lastBoxNumber: number;
    lastPalletNumber: number;
    productsInLastBox: number;
    boxesInLastPallet: number;
  }> {
    return this.counts.getLastBoxAndPalletInfo();
  }

  getSummary(): Promise<{
    productCount: number;
    boxCount: number;
    palletCount: number;
    lastBox: number | null;
    lastPallet: number | null;
    productsInLastBox: number;
    boxesInLastPallet: number;
  }> {
    return this.counts.getSummary();
  }

  // ---------------------------------------------------------------- запись

  isCodeTask(codes: string[], code: string): boolean {
    return this.saveCodes.isCodeTask(codes, code);
  }

  saveCode(
    tableName: string,
    code: string,
    boxNumber: number,
    cameraName?: string,
    palletNumber?: number,
  ): Promise<boolean> {
    return this.saveCodes.saveCode(
      tableName,
      code,
      boxNumber,
      cameraName,
      palletNumber,
    );
  }

  saveCodeAndAdvanceState(
    tableName: string,
    code: string,
    boxNumber: number,
  ): Promise<boolean> {
    return this.saveCodes.saveCodeAndAdvanceState(tableName, code, boxNumber);
  }

  updateCodeStatus(): void {
    this.saveCodes.updateCodeStatus();
  }

  // --------------------------------------------------------------- этикетки

  getFullBoxCode(boxNumber: number, countInBox: number): Promise<string> {
    return this.labels.getFullBoxCode(boxNumber, countInBox);
  }

  getFullPalletCode(
    palletNumber: number,
    countInPallet: number,
    productCountInPallet: number,
  ): Promise<string> {
    return this.labels.getFullPalletCode(
      palletNumber,
      countInPallet,
      productCountInPallet,
    );
  }

  closeAutoBoxAndPrint(
    boxNumber: number,
    countInBox: number,
    cameraName?: string,
  ): Promise<void> {
    return this.labels.closeAutoBoxAndPrint(boxNumber, countInBox, cameraName);
  }

  closeAutoPalletAndPrint(
    palletNumber: number,
    countInBoxesInPallet: number,
  ): Promise<void> {
    return this.labels.closeAutoPalletAndPrint(
      palletNumber,
      countInBoxesInPallet,
    );
  }

  // ---------------------------------------------------------------- отчёты

  createReportHeaderDataby(): any {
    return this.reports.createReportHeaderDataby();
  }

  formatDate(inputDate: string): string {
    return this.reports.formatDate(inputDate);
  }

  getReportDataby(): Promise<any> {
    return this.reports.getReportDataby();
  }

  getReportTermet(isTrailEnd?: boolean): Promise<IRecords> {
    return this.reports.getReportTermet(isTrailEnd);
  }

  getSearchType(code: string): SearchFrom {
    return this.reports.getSearchType(code);
  }

  private createCodesTextFile(codes: string[]): Promise<void> {
    return this.reports.createCodesTextFile(codes);
  }

  // ------------------------------------------------------------ разбор скана

  getApiStatus(): { isUsingApi: boolean } {
    return this.scan.getApiStatus();
  }

  ParseCode(codes: string): any {
    return this.scan.ParseCode(codes);
  }

  simpleDetectCodeType(code: string): { type: string; value: string } {
    return this.scan.simpleDetectCodeType(code);
  }

  determineCodeType(code: string): { type: any; reason?: string } {
    return this.scan.determineCodeType(code);
  }

  extractCodeAfter21(fullCode: string): string | null {
    return this.scan.extractCodeAfter21(fullCode);
  }

  parseCodeForBezerba(raw: string): { serial: string; payload: string } {
    return this.scan.parseCodeForBezerba(raw);
  }

  // ---------------------------------------------------------------- слои

  getTotalLayers(): number {
    return this.layers.getTotalLayers();
  }

  getLayersConfig(): number[] {
    return this.layers.getLayersConfig();
  }

  calculateTotalExpectedProducts(): number {
    return this.layers.calculateTotalExpectedProducts();
  }

  getExpectedCodesForLayer(layerIndex: number): number {
    return this.layers.getExpectedCodesForLayer(layerIndex);
  }

  calculateCurrentLayerIndex(productsInBox: number): number {
    return this.layers.calculateCurrentLayerIndex(productsInBox);
  }

  calculateCodesInCurrentLayer(
    layerIndex: number,
    productsInBox: number,
  ): number {
    return this.layers.calculateCodesInCurrentLayer(layerIndex, productsInBox);
  }

  getLayerProgress(productsInBox: number): any {
    return this.layers.getLayerProgress(productsInBox);
  }

  // ---------------------------------------------------------------- веса

  getWeightOfCurrentBox(): Promise<any> {
    return this.weights.getWeightOfCurrentBox();
  }

  getWeightOfCurrentPallet(): Promise<any> {
    return this.weights.getWeightOfCurrentPallet();
  }

  getCommonWeightOfCurrentPacking(): Promise<any> {
    return this.weights.getCommonWeightOfCurrentPacking();
  }

  getWeightFromRemoteDb(code: string): Promise<string | null> {
    return this.weights.getWeightFromRemoteDb(code);
  }

  checkRemoteDatabaseConnection(): Promise<void> {
    return this.weights.checkRemoteDatabaseConnection();
  }

  // -------------------------------------------------- внешний сервис кодов

  saveCurrentCode(code: string): Promise<any> {
    return this.remote.saveCurrentCode(code);
  }

  getDuplicatesCodes(codes: string[]): Promise<any> {
    return this.remote.getDuplicatesCodes(codes);
  }

  deleteCode(code: string): Promise<void> {
    return this.remote.deleteCode(code);
  }

  removeLaserCodesPresentInCodeEntity(code: string): Promise<void> {
    return this.remote.removeLaserCodesPresentInCodeEntity(code);
  }
}
