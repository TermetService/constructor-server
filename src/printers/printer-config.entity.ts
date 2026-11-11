import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class PrinterConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  enabled: boolean;

  @Column()
  type: string;

  @Column()
  host: string;

  @Column()
  port: number;
}
