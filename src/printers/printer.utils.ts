/* eslint-disable prettier/prettier */
import { Logger } from 'winston';
// import { Status } from 'src/globalTypes';
import * as fs from 'fs';
import * as iconv from 'iconv-lite';
import { getTemplateDirectory } from 'src/path.util';
import { exec } from 'child_process';
import { formatDate, generateLabel, getBoxNetto, getBoxNettoKG, getNettoUnitKG } from './helper';
import {
  generateDataMatrixTSCTemplate,
  generateHandPeopleTemplate,
  generateHandTSCTemplate,
} from 'src/code/helper';
import { promisify } from 'util';
import { EncodingType, LABEL_FORMATS, PrintersTypes } from './types';

const execAsync = promisify(exec);

// let globalPrinterStatus = Status.Connected;
const printer1DecodeType = process.env.PRINTER1_DECODE_TYPE || '';
const printer1EncodeType = process.env.PRINTER1_ENCODE_TYPE || '';
const printer2DecodeType = process.env.PRINTER2_DECODE_TYPE || '';
const printer2EncodeType = process.env.PRINTER2_ENCODE_TYPE || '';
const PCName = process.env.PC_NAME || '';

export async function printLabelBox(
  boxNumber: number,
  countInBox: number,
  printer: any,
  boxTemplate: any[],
  globalMonVar: any,
  logger: Logger,
  printerNameN
) {
  const printerName = printerNameN;
  const encoding = printer1EncodeType === PrintersTypes.ZPL ? EncodingType.UTF8 : EncodingType.WIN1251
  const decoding = printer1DecodeType === PrintersTypes.ZPL ? EncodingType.UTF8 : EncodingType.WIN1251

  if (!printer) {
    logger.warn('Принтер: Принтер не подключен');
    return;
  }
  const task = globalMonVar.task
  logger.warn(`Печать этикетки для коробки ${boxNumber}`);
  if (!task.labelBox) {
    logger.warn('Принтер: Не задана этикетка коробки');
    return;
  }
  try {
    printer.clear();
    const label =
      task.lavel === '1'
        ? task.labelPallet
        : task.labelBox;
    const data = await fs.promises.readFile(
      `${getTemplateDirectory()}/${label}.prn`,
    );
    const decodedData = iconv.decode(data, decoding);
    let modifiedData = decodedData;
    const taskKeys = Object.keys(task);
    taskKeys.forEach((key) => {
      const placeholder = `<${key}>`;
      const value = task[key];
      modifiedData = modifiedData.replace(new RegExp(placeholder, 'g'), value);
    });
    console.log('......', globalMonVar.task);

    const gs1128 = generateLabel(boxTemplate, task, boxNumber, LABEL_FORMATS.ZPL, countInBox)
    const gs1128_dm = generateLabel(boxTemplate, task, boxNumber, LABEL_FORMATS.DM_ZPL, countInBox)
    const gs1128dis = generateLabel(boxTemplate, task, boxNumber, LABEL_FORMATS.PEOPLE_ZPL, countInBox)
    const nnn_batch = `${task.gtin}${formatDate(task.date_manufacture)}${task.batch}`

    console.log('----------=', gs1128, gs1128_dm);

    modifiedData = modifiedData
      .replace('<nnn_package>', `${boxNumber}`)
      .replace('<nnn_pallet>', `${boxNumber}`)
      .replace('<nnn_pieces_per_package>', `${countInBox}`)
      .replace(
        '<nnn_netto_box>',
        `${getBoxNetto(task.nettoUnit, countInBox)}`,
      )
      .replace(
        '<nnn_netto_box_kg>',
        `${getBoxNettoKG(task.nettoUnit, countInBox)}`,
      )
      .replace(
        '<nnn_netto_unit_kg>',
        `${getNettoUnitKG(task.nettoUnit)}`,
      )
      .replace(
        '<gs1128>',
        generateHandTSCTemplate(
          boxTemplate,
          task,
          boxNumber,
          countInBox,
        ),
      )
      .replace(
        '<gs1128dm>',
        generateDataMatrixTSCTemplate(
          boxTemplate,
          task,
          boxNumber,
          countInBox,
        ),
      )
      .replace(
        '<gs1128_dis>',
        generateHandPeopleTemplate(
          boxTemplate,
          task,
          boxNumber,
          countInBox,
        ),
      )
      .replace('<gs1128_a>', gs1128)
      .replace('<gs1128dm_a>', gs1128_dm)
      .replace('<gs1128_dis_a>', gs1128dis)
      .replace('<nnn_batch>', nnn_batch)
    // console.log('----------=', modifiedData);

    const encodedData = iconv.encode(modifiedData, encoding);
    const newFileName = `${getTemplateDirectory()}\\${Date.now()}.prn`.replace(
      /\//g,
      '\\',
    );

    await fs.promises.writeFile(newFileName, encodedData);
    const command = `COPY /B ${newFileName} \\\\${PCName}\\${printerName}`;
    // console.log(command);
    const { stderr } = await execAsync(command);
    if (stderr) {
      logger.error('Ошибка отправки файла на печать:', stderr);
      return;
    }
    setTimeout(async () => {
      try {
        await fs.promises.unlink(newFileName);
        logger.info('Файл успешно удален');
      } catch (unlinkErr) {
        logger.error('Ошибка удаления файла:', unlinkErr);
      }
    }, 500);
    logger.info('Принтер: Печать коробки завершена');
  } catch (err) {
    logger.error('Принтер: Ошибка печати', err);
  }
}

export async function printLabelPallet(
  palletNumber: number,
  countInPallet: number,
  printer: any,
  palletTemplate: any[],
  globalMonVar: any,
  logger: Logger,
  itemsPerPallet: any,
) {
  const printerName = process.env.PRINTER_NAME || '';
  const encoding = printer2EncodeType === PrintersTypes.ZPL ? EncodingType.UTF8 : EncodingType.WIN1251
  const decoding = printer2DecodeType === PrintersTypes.ZPL ? EncodingType.UTF8 : EncodingType.WIN1251

  if (!printer) {
    logger.warn('Принтер: Принтер не подключен');
    return;
  }
  const task = globalMonVar.task
  if (!task.labelPallet) {
    logger.warn('Принтер: Не задана этикетка паллеты');
    return;
  }
  try {
    logger.warn(`Печать этикетки для паллеты ${palletNumber}`);
    printer.clear();
    fs.readFile(
      `${getTemplateDirectory()}/${task.labelPallet}.prn`,
      (err, data) => {
        if (err) {
          logger.error('Ошибка чтения файла паллеты:', err);
          return;
        }
        const decodedData = iconv.decode(data, decoding);
        let modifiedData = decodedData;
        const taskKeys = Object.keys(task);
        taskKeys.forEach((key) => {
          const placeholder = `<${key}>`;
          const value = task[key];
          modifiedData = modifiedData.replace(
            new RegExp(placeholder, 'g'),
            value,
          );
        });

        const itemsPerPalletValue = itemsPerPallet ? `${itemsPerPallet}` : '';

        const gs1128 = generateLabel(palletTemplate, task, palletNumber, LABEL_FORMATS.ZPL, +itemsPerPalletValue, countInPallet)
        const gs1128_dm = generateLabel(palletTemplate, task, palletNumber, LABEL_FORMATS.DM_ZPL, +itemsPerPalletValue, countInPallet)
        const gs1128dis = generateLabel(palletTemplate, task, palletNumber, LABEL_FORMATS.PEOPLE_ZPL, +itemsPerPalletValue, countInPallet)
        const nnn_batch = `${task.gtin}${formatDate(task.date_manufacture)}${task.batch}`

        modifiedData = modifiedData
          .replace('<nnn_pallet>', `${palletNumber}`)
          .replace('<nnn_items_per_pallet>', itemsPerPalletValue)
          .replace('<nnn_box_per_pallet>', `${countInPallet}`)
          .replace(
            '<gs1128>',
            generateHandTSCTemplate(
              palletTemplate,
              task,
              palletNumber,
              +itemsPerPalletValue,
            ),
          )
          .replace(
            '<gs1128_dis>',
            generateHandPeopleTemplate(
              palletTemplate,
              task,
              palletNumber,
              +itemsPerPalletValue,
            ),
          )
          .replace('<gs1128_a>', gs1128)
          .replace('<gs1128dm_a>', gs1128_dm)
          .replace('<gs1128_dis_a>', gs1128dis)
          .replace('<nnn_batch>', nnn_batch);
        const encodedData = iconv.encode(modifiedData, encoding);
        const newFileName =
          `${getTemplateDirectory()}\\${Date.now()}.prn`.replace(/\//g, '\\');
        fs.writeFile(newFileName, encodedData, (writeErr) => {
          if (writeErr) {
            logger.error('Ошибка записи файла:', writeErr);
            return;
          }
          const command = `COPY /B ${newFileName} \\\\${PCName}\\${printerName}`;
          exec(command, (execErr) => {
            if (execErr) {
              logger.error('Ошибка отправки файла на печать:', execErr);
              return;
            }
            setTimeout(async () => {
              try {
                await fs.promises.unlink(newFileName);
                logger.info('Файл успешно удален');
              } catch (unlinkErr) {
                logger.error('Ошибка удаления файла:', unlinkErr);
              }
            }, 500);
            logger.info('Принтер: Печать паллеты завершена');
          });
        });
      },
    );
  } catch (err) {
    logger.error('Принтер: Ошибка печати:', err);
  }
}
