interface IKonturAddresses {
  [key: number]: { brak: string; skipLeft: string; skipRight: string };
}
export interface IAllAddresses {
  [key: string]: string;
}

export const konturAddresses: IKonturAddresses = {
  1: { brak: '0x825', skipLeft: '0x826', skipRight: '0x827' },
  2: { brak: '0x828', skipLeft: '0x829', skipRight: '0x82A' },
  3: { brak: '0x82B', skipLeft: '0x82C', skipRight: '0x82D' },
  4: { brak: '0x82E', skipLeft: '0x82F', skipRight: '0x830' },
  5: { brak: '0x831', skipLeft: '0x832', skipRight: '0x833' },
  6: { brak: '0x834', skipLeft: '0x835', skipRight: '0x836' },
  7: { brak: '0x837', skipLeft: '0x838', skipRight: '0x839' },
  8: { brak: '0x83A', skipLeft: '0x83B', skipRight: '0x83C' },
  9: { brak: '0x83D', skipLeft: '0x83E', skipRight: '0x83F' },
  10: { brak: '0x840', skipLeft: '0x841', skipRight: '0x842' },
};

export const allAddresses: IAllAddresses = {
  greenLamp2: '0x0A02',
  redLamp2: '0x0A03',
  greenLampTimer1: '0x1198',
  redLampTimer1: '0x119A',
  greenLamp1: '0x800',
  redLamp1: '0x801',
  sensorTypeLength: '0x0A00',
  sensorTypeReject: '0x0A01',
  sensorTypePress: '0x0A04',
  pressPulse: '0x11BC',
  debounceTimer: '0x119C',
  pusherOperationTimer: '0x119E',
  rejectControlTime: '0x11A0',
  rejectAlarm: '0x805',
  productLength: '0x11A2',
  measuredLength: '0x1000',
  jam: '0x806',
  readinessBit: '0x815',
  photoDelayTimer: '0x11A4',
  photoPulseLength: '0x11A6',
  commandReadinessBit: '0x816',
  pusherDelayTimer: '0x11B8',
  dividerDelay: '0x11BA',
  controlWord1: '0x11AA',
  controlWord2: '0x11AC',
  controlWord3: '0x11AE',
  counter1: '0x11B0',
  counter2: '0x11B2',
  counter3: '0x11B4',
  counter4: '0x11B6',
  pressPause: '0x11C2',
  contourResetTimer: '0x11C3',
  counter5: '0x11BE',
  counter6: '0x11C0',
  rejectAlarmContour1: '0x851',
  rejectAlarmContour2: '0x852',
  rejectAlarmContour3: '0x853',
  rejectAlarmContour4: '0x854',
  rejectAlarmContour5: '0x855',
  rejectAlarmContour6: '0x856',
  rejectAlarmContour7: '0x857',
  rejectAlarmContour8: '0x858',
  rejectAlarmContour9: '0x859',
  rejectAlarmContour10: '0x85A',
  controllerOutputY10: '0x85B',
  controllerOutputY11: '0x85C',
  cameraStart: '0x85D',
  pusherStart: '0x85E',
  dividerControl: '0x85F',
  sensorLogicSelection: '0x0A05',
  memoryClear: '0x860',
  contourResetTime: '0x11C3',
  resetContour1: '0x847', // false
  resetContour2: '0x848', // false
  resetContour3: '0x849', // false
  resetContour4: '0x84A', // false
  resetContour5: '0x84B', // false
  resetContour6: '0x84C', // false
  resetContour7: '0x84D', // false
  resetContour8: '0x84E', // false
  resetContour9: '0x84F', // false
  resetContour10: '0x850', // false
};

// после каждого цикла работы
