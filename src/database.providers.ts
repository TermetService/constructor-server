import { TypeOrmModule } from '@nestjs/typeorm';

const host = process.env.DB_HOST; /* || 'localhost' */
const port = +process.env.DB_PORT; /* || 5432 */
const username = process.env.DB_USERNAME; /* || 'postgres' */
const password = process.env.DB_PASSWORD; /* || 'termet' */
const database = process.env.DB_DATABASE; /* || 'test1' */

export const DatabaseProviders = TypeOrmModule.forRoot({
  type: 'postgres',
  host,
  port,
  username,
  password,
  database,
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  synchronize: true,
});
