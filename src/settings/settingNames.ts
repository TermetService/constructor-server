export enum SettingNames { // Актуальность с фронтендом
  ProductLength = 'productLength',
  PusherOperationTimer = 'pusherOperationTimer', // установить 0, значение устанавливается только при запуске сканирования
  PusherDelayTimer = 'pusherDelayTimer',
  RejectControlTime = 'rejectControlTime',
  DividerDelay = 'dividerDelay',
  GreenLampTimer1 = 'greenLampTimer1',
  RedLampTimer1 = 'redLampTimer1',
  PhotoDelayTimer = 'photoDelayTimer',
  PhotoPulseLength = 'photoPulseLength', // установить 0, значение устанавливается только при запуске сканирования
  SensorTypeLength = 'sensorTypeLength',
  SensorLogicSelection = 'sensorLogicSelection',
  DebounceTimer = 'debounceTimer',
  SensorTypeReject = 'sensorTypeReject',
  SensorTypePress = 'sensorTypePress',
  PressPause = 'pressPause',
  PressPulse = 'pressPulse',
  ContourResetTime = 'contourResetTime',
}

export enum TestNames {
  Divider = 'Тест делителя',
  Lamp = 'Тест ламп',
  Camera = 'Тест камеры',
  Pusher = 'Тест толкателя',
}
