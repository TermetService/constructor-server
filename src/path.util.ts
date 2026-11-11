/* eslint-disable prettier/prettier */
import * as path from 'path';
import * as dotenv from 'dotenv';
import { machineIdSync } from 'node-machine-id';

dotenv.config();
export const sha = machineIdSync();

// -------- 1s ------------------
export const getFilesDirectory1S = (): string => {
  const filesDirectory1S = process.env.FILES_DIRECTORY_1S;
  if (!filesDirectory1S) {
    console.log('FILES_DIRECTORY_1S is not defined in .env file');
    return '';
  }
  return filesDirectory1S;
};

export const getJsonDirectory1S = (): string => {
  return path.join(getFilesDirectory1S());
};

export const getFilesDirectory1STemplate = (): string => {
  const filesDirectory1STemplate = process.env.FILES_DIRECTORY_1S_TEMPLATE;
  if (!filesDirectory1STemplate) {
    console.log('FILES_DIRECTORY_1S_TEMPLATE is not defined in .env file');
    return '';
  }
  return filesDirectory1STemplate;
};

export const getJsonDirectory1STemplate = (): string => {
  return path.join(getFilesDirectory1STemplate());
};

// -------------- AvailableFiles -----------------
export const getRecordsFilesDirectory = (): string => {
  const filesDirectory = process.env.RECORDS_FILES_DIRECTORY;
  if (!filesDirectory) {
    throw new Error('RECORDS_FILES_DIRECTORY is not defined in .env file');
  }
  return filesDirectory;
};

export const getReserveFilesDirectory = (): string => {
  const filesDirectory = process.env.RESERVE_FILES_DIRECTORY;
  if (!filesDirectory) {
    throw new Error('RESERVE_FILES_DIRECTORY is not defined in .env file');
  }
  return filesDirectory;
};

export const getRecordsTextFilesDirectory = (): string => {
  const filesDirectory = process.env.RECORDS_TEXT_FILE_DIRECTORY;
  if (!filesDirectory) {
    throw new Error('RECORDS_TEXT_FILE_DIRECTORY is not defined in .env file');
  }
  return filesDirectory;
};

// -------------- AvailableFiles -----------------
export const getAvailableFilesDirectory = (): string => {
  const filesDirectory = process.env.AVAILABLE_FILES_DIRECTORY;
  if (!filesDirectory) {
    throw new Error('AVAILABLE_FILES_DIRECTORY is not defined in .env file');
  }
  return filesDirectory;
};

export const getTemplateDirectory = (): string => {
  return path.join(getAvailableFilesDirectory(), 'template_files');
};

export const getRecordsJsonDirectory = (): string[] => {
  const recordsJsonDirectory1 = path.join(
    getRecordsFilesDirectory(),
    'records_json_files',
  );
  const recordsJsonDirectory2 = path.join(
    getFilesDirectory(),
    'records_json_files',
  );

  return [recordsJsonDirectory1, recordsJsonDirectory2];
};

// -------------- Task Files -----------------
// export const getTaskFilesDirectory = (): string => {
//   const filesDirectory = process.env.TASK_FILES_DIRECTORY;
//   if (!filesDirectory) {
//     throw new Error('TASK_FILES_DIRECTORY is not defined in .env file');
//   }
//   return filesDirectory;
// };

// -------------- Files -----------------
export const getFilesDirectory = (): string => {
  const filesDirectory = process.env.FILES_DIRECTORY;
  if (!filesDirectory) {
    throw new Error('FILES_DIRECTORY is not defined in .env file');
  }
  return filesDirectory;
};

export const getNomenclatureJsonDirectory = (): string => {
  return path.join(getFilesDirectory(), 'nomenclature_json_files');
};

export const getTaskJsonDirectory = (): string => {
  return path.join(getFilesDirectory(), 'task_json_files');
};

export const getStartTaskJsonDirectory = (): string => {
  return path.join(getFilesDirectory(), 'finish_task_json_files');
};

export const getSettingJsonDirectory = (): string => {
  return path.join(getFilesDirectory(), 'settings_json_files');
};

