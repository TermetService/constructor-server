import { TemplateTypes } from 'src/globalTypes';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Templates {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'simple-array' })
  template: string[];

  @Column({
    type: 'enum',
    enum: TemplateTypes,
  })
  type: TemplateTypes;
}
