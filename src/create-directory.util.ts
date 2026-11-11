import * as fs from 'fs';

export const createDirectoryIfNotExists = (directoryPath: string): void => {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
    // console.log(`Директория ${directoryPath} успешно создана`);
  } else {
    console.log(`Директория ${directoryPath} уже существует`);
  }
};
