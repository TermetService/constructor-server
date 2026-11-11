import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('number_box_ete')
export class numberBoxETE {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  gtin: string;

  @Column()
  BoxNumber: number;

  @Column({ nullable: true })
  PalletNumber: number;

  @Column()
  DateTask: string;

  @CreateDateColumn()
  createdAt: Date; // Автоматически устанавливается при создании
}
