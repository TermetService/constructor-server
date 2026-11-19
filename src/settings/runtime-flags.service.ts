import { config } from 'src/config/config';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Logger } from 'winston';
import { settingsLogger } from 'src/logger-winston/winston.config';
import {
  getConfigPath,
  getPublicConfig,
  readConfig,
  writeConfig,
} from 'src/config/app-config';
import { onConfigChange } from 'src/config/config';
import {
  IValidationFlagMeta,
  VALIDATION_FLAGS,
  VALIDATION_FLAG_KEYS,
  ValidationFlag,
} from './validation-flags';

export interface IRuntimeFlags {
  /** true — общая паллета на все коробки, false — своя паллета */
  flagInpallet: boolean;
  /** true — коробка закрывается и получает label автоматически */
  flagInBoxLable: boolean;
}

const FLAG_KEYS: (keyof IRuntimeFlags)[] = ['flagInpallet', 'flagInBoxLable'];

/**
 * Рантайм-флаги из config.json. Меняются со страницы конфигурации,
 * сохраняются в тот же файл и применяются без перезапуска.
 */
@Injectable()
export class RuntimeFlagsService implements OnModuleInit {
  private flags: IRuntimeFlags;
  private validationFlags: Record<string, boolean>;
  private readonly logger: Logger;

  constructor(@Inject('winston') logger?: Logger) {
    this.logger = logger ?? settingsLogger;
    this.flags = this.defaultsFromEnv();
    this.validationFlags = this.defaultValidationFlags();

    // config.json изменили вручную — флаги применяем сразу
    onConfigChange(() => this.reload());
  }

  onModuleInit(): void {
    this.reload();
  }

  /** Перечитать флаги из config.json */
  reload(): void {
    const file = readConfig();

    for (const key of FLAG_KEYS) {
      const value = file[key];

      if (typeof value === 'boolean') {
        this.flags[key] = value;
      } else if (value === 'true' || value === 'false') {
        this.flags[key] = value === 'true';
      }
    }

    for (const key of VALIDATION_FLAG_KEYS) {
      const value = file[key];
      // всё, что не явное false/'false', считаем включённой проверкой
      this.validationFlags[key] = !(value === false || value === 'false');
    }
  }

  isPalletShared(): boolean {
    return this.flags.flagInpallet;
  }

  isBoxLabel(): boolean {
    return this.flags.flagInBoxLable;
  }

  getFlags(): IRuntimeFlags {
    return { ...this.flags };
  }

  /** Сохранить флаги в config.json и применить сразу */
  async setFlags(patch: Partial<IRuntimeFlags>): Promise<IRuntimeFlags> {
    const next: Partial<IRuntimeFlags> = {};

    for (const key of FLAG_KEYS) {
      const value = patch[key];

      if (typeof value === 'boolean') {
        this.flags[key] = value;
        next[key] = value;
      }
    }

    if (Object.keys(next).length) {
      writeConfig(next);
      this.logger.info(`Конфиг: флаги изменены ${JSON.stringify(this.flags)}`);
    }

    return this.getFlags();
  }

  /** Включена ли конкретная проверка (по умолчанию — да) */
  isValidationEnabled(key: ValidationFlag): boolean {
    return this.validationFlags[key] !== false;
  }

  getValidationFlags(): Record<string, boolean> {
    return { ...this.validationFlags };
  }

  getValidationFlagsMeta(): IValidationFlagMeta[] {
    return VALIDATION_FLAGS;
  }

  /** Сохранить флаги проверок в config.json и применить сразу */
  async setValidationFlags(
    patch: Partial<Record<ValidationFlag, boolean>>,
  ): Promise<Record<string, boolean>> {
    const next: Record<string, boolean> = {};

    for (const key of VALIDATION_FLAG_KEYS) {
      const value = patch[key];

      if (typeof value === 'boolean') {
        this.validationFlags[key] = value;
        next[key] = value;
      }
    }

    if (Object.keys(next).length) {
      writeConfig(next);
      this.logger.info(
        `Конфиг: флаги проверок изменены (${Object.keys(next).length})`,
      );
    }

    return this.getValidationFlags();
  }

  /** Всё для страницы конфигурации: флаги, путь к файлу и настройки JSON */
  getSettings() {
    return {
      flags: this.getFlags(),
      validationFlags: this.getValidationFlags(),
      validationFlagsMeta: this.getValidationFlagsMeta(),
      configPath: getConfigPath(),
      settings: getPublicConfig(),
    };
  }

  private defaultValidationFlags(): Record<string, boolean> {
    return Object.fromEntries(VALIDATION_FLAG_KEYS.map((key) => [key, true]));
  }

  private defaultsFromEnv(): IRuntimeFlags {
    return {
      flagInpallet: config.FLAG_IN_PALLET === 'true',
      flagInBoxLable: config.FLAG_IN_BOX_LABLE !== 'false',
    };
  }
}
