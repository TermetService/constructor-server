// trialPeriod.entity.ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class TrialPeriodEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'timestamp', nullable: false })
    startDate: Date;

    @Column({ type: 'timestamp', nullable: true })
    endDate: Date;

    @Column({ type: 'int', nullable: true })
    countTime: number;

    @Column({ type: 'boolean', nullable: true })
    isTrial: boolean;
}