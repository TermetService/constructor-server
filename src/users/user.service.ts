import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import * as bcrypt from 'bcryptjs';
import { Logger } from 'winston';
import { usersLogger } from 'src/logger-winston/winston.config';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject('winston') private readonly logger: Logger = usersLogger,
  ) {}

  async createUser(
    username: string,
    password: string,
    role: string,
  ): Promise<Partial<User>> {
    // console.log('createUser------__________', role);

    this.logger.info(
      `Авторизация: Создание пользователя с именем: ${username}`,
    );
    // Валидация параметров
    if (!username || !password || !role) {
      this.logger.warn(
        'Авторизация: Имя пользователя, пароль и роль являются обязательными параметрами',
      );
      throw new ConflictException('Имя и пароль обязательные параметры');
    }

    // Проверка на существование пользователя
    const existingUser = await this.userRepository.findOne({
      where: { username },
    });
    if (existingUser) {
      this.logger.warn(
        `Авторизация: Пользователь с именем ${username} уже существует`,
      );
      throw new ConflictException('Пользователь с таким именем уже существует');
    }

    // Хэширование пароля
    const hashedPassword = await bcrypt.hash(password, 10); // 10 - это количество раундов хэширования

    const user = this.userRepository.create({
      username,
      password: hashedPassword,
      role,
    });
    const { password: _, ...result } = await this.userRepository.save(user);
    this.logger.info(
      `Авторизация: Пользователь с именем ${username} успешно создан`,
    );
    return result;
  }

  async authUser(username: string, password: string): Promise<Partial<User>> {
    this.logger.info(
      `Авторизация: Аутентификация пользователя с именем: ${username}`,
    );
    // Валидация параметров
    if (!username || !password) {
      this.logger.warn(
        'Авторизация: Имя пользователя и пароль являются обязательными параметрами',
      );
      throw new ConflictException('Имя и пароль обязательные параметры');
    }

    // Поиск пользователя
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) {
      this.logger.warn(
        `Авторизация: Пользователь с именем ${username} не найден`,
      );
      throw new NotFoundException('Пользователь не найден');
    }

    // Сравнение паролей
    const isPasswordMatching = await bcrypt.compare(password, user.password);
    if (!isPasswordMatching) {
      this.logger.warn('Авторизация: Неверный пароль');
      throw new ConflictException('Неверный пароль');
    }

    // Возвращаем пользователя (или его данные, исключая пароль)
    const { password: _, ...result } = user; // Убираем пароль из возвращаемых данных
    this.logger.info(
      `Авторизация: Пользователь с именем ${username} успешно аутентифицирован`,
    );
    return result;
  }

  async findAll(
    page: number,
    limit: number,
  ): Promise<{ data: Partial<User>[]; total: number }> {
    this.logger.info('Авторизация: Получение всех пользователей');
    const [users, total] = await this.userRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
    });

    // Убираем пароли из возвращаемых данных
    const usersWithoutPasswords = users.map(({ password, ...rest }) => rest);

    return { data: usersWithoutPasswords, total };
  }

  async findOne(id: number): Promise<User> {
    this.logger.info(`Авторизация: Получение пользователя с ID: ${id}`);
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      this.logger.warn(`Авторизация: Пользователь с ID ${id} не найден`);
      throw new NotFoundException(`Пользователь с ID ${id} не найден`);
    }
    return user;
  }

  async findByUsername(username: string): Promise<Partial<User>> {
    this.logger.info(
      `Авторизация: Получение пользователя с именем: ${username}`,
    );
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) {
      this.logger.warn(
        `Авторизация: Пользователь с именем ${username} не найден`,
      );
      throw new NotFoundException(
        `Пользователь с именем ${username} не найден`,
      );
    }

    // Убираем пароль из возвращаемых данных
    const { password, ...result } = user;
    return result;
  }

  async update(id: number, userData: Partial<User>): Promise<Partial<User>> {
    this.logger.info(`Авторизация: Обновление пользователя с ID: ${id}`);
    const user = await this.findOne(id); // Проверка существования
    // Обновляем поля
    Object.assign(user, userData);
    const updatedUser = await this.userRepository.save(user);

    // Убираем пароль из возвращаемых данных
    const { password, ...result } = updatedUser;
    this.logger.info(`Авторизация: Пользователь с ID ${id} успешно обновлен`);
    return result;
  }

  async remove(id: number): Promise<void> {
    this.logger.info(`Авторизация: Удаление пользователя с ID: ${id}`);
    const user = await this.findOne(id); // Проверка существования
    await this.userRepository.remove(user);
    this.logger.info(`Авторизация: Пользователь с ID ${id} успешно удален`);
  }
}
