import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { UserController } from './users.controller';

describe('UserController', () => {
  let controller: UserController;
  let service: UserService;

  const mockUserService = {
    createUser: jest.fn((username, password, role) => {
      return {
        id: Date.now(),
        username,
        role,
      };
    }),
    authUser: jest.fn((username, password) => {
      return {
        id: Date.now(),
        username,
      };
    }),
    findAll: jest.fn(() => {
      return {
        data: [],
        total: 0,
      };
    }),
    findOne: jest.fn((id) => {
      return {
        id,
        username: 'testuser',
      };
    }),
    update: jest.fn((id, userData) => {
      return {
        id,
        ...userData,
      };
    }),
    remove: jest.fn((id) => {
      return;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create a user', async () => {
    const createUserDto = {
      username: 'testuser',
      password: 'testpass',
      role: 'user',
    };
    const result = await controller.create(createUserDto);
    expect(result).toEqual({
      id: expect.any(Number),
      username: 'testuser',
      role: 'user',
    });
    expect(service.createUser).toHaveBeenCalledWith(
      'testuser',
      'testpass',
      'user',
    );
  });

  it('should authenticate a user', async () => {
    const authUserDto = { username: 'testuser', password: 'testpass' };
    const result = await controller.auth(authUserDto);
    expect(result).toEqual({
      id: expect.any(Number),
      username: 'testuser',
    });
    expect(service.authUser).toHaveBeenCalledWith('testuser', 'testpass');
  });

  it('should find all users', async () => {
    const result = await controller.findAll(1, 10);
    expect(result).toEqual({
      data: [],
      total: 0,
    });
    expect(service.findAll).toHaveBeenCalledWith(1, 10);
  });

  it('should find one user by id', async () => {
    const result = await controller.findOne(1);
    expect(result).toEqual({
      id: 1,
      username: 'testuser',
    });
    expect(service.findOne).toHaveBeenCalledWith(1);
  });

  it('should update a user', async () => {
    const updateUserDto = { username: 'updateduser' };
    const result = await controller.update(1, updateUserDto);
    expect(result).toEqual({
      id: 1,
      username: 'updateduser',
    });
    expect(service.update).toHaveBeenCalledWith(1, updateUserDto);
  });

  it('should remove a user', async () => {
    await controller.remove(1);
    expect(service.remove).toHaveBeenCalledWith(1);
  });
});
