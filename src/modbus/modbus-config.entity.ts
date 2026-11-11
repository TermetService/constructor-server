import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class ModbusConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  type: string;

  @Column()
  host: string;

  @Column()
  port: number;
}
