import { config } from 'src/config/config';
import { TypeOrmModule } from '@nestjs/typeorm';

const host = config.DB_HOST; /* || 'localhost' */
const port = +config.DB_PORT; /* || 5432 */
const username = config.DB_USERNAME; /* || 'postgres' */
const password = config.DB_PASSWORD; /* || 'termet' */
const database = config.DB_DATABASE; /* || 'test1' */

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
