import { allAddresses, konturAddresses } from 'src/addresses';
import { TestNames } from './settingNames';

export const getAddresses = (name: string) => {
  if (name === TestNames.Lamp) {
    return [
      allAddresses.redLamp1,
      allAddresses.greenLamp1,
      allAddresses.greenLamp2,
      allAddresses.redLamp2,
    ];
  } else if (name === TestNames.Camera) {
    return [allAddresses.cameraStart];
  } else if (name === TestNames.Pusher) {
    return [allAddresses.pusherStart];
  } else {
    return [allAddresses.dividerControl];
  }
};
