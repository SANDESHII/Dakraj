import { MatchEngine } from './engine';
import { DataService } from './dataService';
import { ProfileService } from './profileService';
import { BACKTEST_CONFIG } from '../core/constants';

export interface CalibrationResult {
    bestBaseTrust: number;
    bestPurityScale: number;
    minBrierScore: number;
}

export class CalibrationService {
    // calibrate() disabled until 1,000+ matches of paper-trading data is available to prevent overfitting
}
