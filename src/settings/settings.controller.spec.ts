/**
 * Smoke-тест контроллера настроек: создание и роуты рантайм-флагов/проверок.
 * Сервисы замоканы, база не поднимается.
 */
jest.mock('./settings.service', () => ({ SettingsService: class {} }));
jest.mock('./runtime-flags.service', () => ({ RuntimeFlagsService: class {} }));

import { SettingsController } from './settings.controller';

describe('SettingsController', () => {
  let controller: SettingsController;
  let runtimeFlags: any;

  beforeEach(() => {
    runtimeFlags = {
      getSettings: jest.fn().mockReturnValue({ flags: {}, validationFlags: {} }),
      setFlags: jest.fn().mockImplementation(async (patch) => patch),
      setValidationFlags: jest.fn().mockImplementation(async (patch) => patch),
    };

    controller = new SettingsController({} as any, runtimeFlags);
  });

  it('создаётся с замоканными зависимостями', () => {
    expect(controller).toBeDefined();
  });

  it('GET runtime отдаёт флаги и проверки', () => {
    expect(controller.getRuntimeSettings()).toEqual({
      flags: {},
      validationFlags: {},
    });
    expect(runtimeFlags.getSettings).toHaveBeenCalled();
  });

  it('PUT runtime/flags применяет флаги', async () => {
    const result = await controller.updateRuntimeFlags({
      flagInpallet: true,
      flagInBoxLable: false,
    });

    expect(runtimeFlags.setFlags).toHaveBeenCalledWith({
      flagInpallet: true,
      flagInBoxLable: false,
    });
    expect(result).toEqual({ flagInpallet: true, flagInBoxLable: false });
  });

  it('PUT runtime/validation-flags применяет флаги проверок', async () => {
    const result = await controller.updateValidationFlags({
      codeLength: false,
    });

    expect(runtimeFlags.setValidationFlags).toHaveBeenCalledWith({
      codeLength: false,
    });
    expect(result).toEqual({ codeLength: false });
  });
});
