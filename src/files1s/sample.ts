interface IDefaultTask {
  name: string;
  label: string;
  comment: string;
  required?: boolean;
  allowSpace?: boolean; // Новый флаг для разрешения пробела
}

export const TASK: IDefaultTask[] = [
  { name: 'gtin', label: 'GTIN продукта', comment: 'GTIN', required: true },
  {
    name: 'name',
    label: 'Название продукта',
    comment: 'название отображаемое в окне программы для оператора',
    required: true,
  },
  {
    name: 'description',
    label: 'Описание продукта',
    comment: 'Описание продукта',
    allowSpace: true
  },
  {
    name: 'ITF14',
    label: 'ITF14',
    comment: 'Код который печатается на коробке',
    allowSpace: true
  },
  {
    name: 'labelBox',
    label: 'Название шаблона этикетка',
    comment: 'Название шаблона этикетка.',
    required: true,
  },
  {
    name: 'labelPallet',
    label: 'Название шаблона паллеты',
    comment: 'Название шаблона Паллеты',
    required: true,
  },
  {
    name: 'inscriptionLabel',
    label: 'Имя на этикетке продукта',
    comment: 'Имя на этикетке продукта',
    allowSpace: true
  },
  {
    name: 'techConditions',
    label: 'Технические условия',
    comment: 'Технические условия',
    allowSpace: true
  },
  { name: 'gost', label: 'ГОСТ', comment: 'ГОСТ', allowSpace: true },
  {
    name: 'otherTechConditions',
    label: 'Прочие условия',
    comment: 'Прочие условия',
    allowSpace: true
  },
  {
    name: 'nettoUnit',
    label: 'Нетто одной единицы',
    comment: 'Вес нетто одной единицы продукта в граммах',
    allowSpace: true
  },
  {
    name: 'bruttoUnit',
    label: 'Брутто одной единицы',
    comment: 'Вес брутто одной единицы продукта в граммах.',
    allowSpace: true
  },
  {
    name: 'bruttoBox',
    label: 'Брутто коробки',
    comment: 'Вес брутто одной коробки.',
    allowSpace: true
  },
  {
    name: 'tempCond1',
    label: 'Температурные условия 1',
    comment: 'Температурные условия 1.',
    allowSpace: true
  },
  {
    name: 'tempCond2',
    label: 'Температурные условия 2',
    comment: 'Температурные условия 2.',
    allowSpace: true
  },
  {
    name: 'tempCond3',
    label: 'Температурные условия 3',
    comment: 'Температурные условия 3.',
    allowSpace: true
  },
  {
    name: 'tempCond4',
    label: 'Температурные условия 4',
    comment: 'Температурные условия 4.',
    allowSpace: true
  },
  {
    name: 'adInfo1',
    label: 'Дополнительная информация1',
    comment: 'Дополнительная динамическая информация, текстовая1',
    allowSpace: true
  },
  {
    name: 'adInfo2',
    label: 'Дополнительная информация2',
    comment: 'Дополнительная динамическая информация, текстовая2',
    allowSpace: true
  },
  {
    name: 'adInfo3',
    label: 'Дополнительная информация3',
    comment: 'Дополнительная динамическая информация, текстовая3',
    allowSpace: true
  },
  {
    name: 'adInfo4',
    label: 'Дополнительная информация4',
    comment: 'Дополнительная динамическая информация, текстовая4',
    allowSpace: true
  },
  {
    name: 'adInfo5',
    label: 'Дополнительная информация5',
    comment: 'Дополнительная динамическая информация, текстовая5',
    allowSpace: true
  },
  {
    name: 'adInfo6',
    label: 'Дополнительная информация6',
    comment: 'Дополнительная динамическая информация, текстовая6',
    allowSpace: true
  },

  { name: 'batch', label: 'Партия', comment: '', required: true },
  { name: 'packer', label: 'Упаковщик', comment: '', allowSpace: true },
  {
    name: 'date_manufacture',
    label: 'Дата начала срока годности',
    comment: '',
    required: true,
  },
  {
    name: 'date_expiration',
    label: 'Дата окончания срока годности',
    comment: '',
    required: true,
  },
  {
    name: 'pieces_per_package',
    label: 'Количество продуктов в коробе',
    comment: '',
    required: true,
  },
  {
    name: 'packaging_per_pallet',
    label: 'Количество коробов в паллете',
    comment: '',
    required: true,
  },
  {
    name: 'startCorob',
    label: 'Номер начального короба',
    comment: '',
    required: true,
  },
  {
    name: 'startPallet',
    label: 'Номер начальной паллеты',
    comment: '',
    required: true,
  },
  {
    name: 'workSH',
    label: 'Номер рабочей смены',
    comment: '',
    required: true,
  },
];
