import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn } from 'typeorm';

@Entity()
export class CodeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ unique: true })
  code: string;

  @Column({ nullable: true })
  box_number: number;

  @Column({ nullable: true })
  pallet_number: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
