import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AnalysisResult } from '../types';

export class CacheService {
    private static COLLECTION = 'analysis_cache';
    private static TTL_MS = 60 * 60 * 1000; // 1 hour cache for persistent storage

    static async get(key: string): Promise<AnalysisResult | null> {
        try {
            const docRef = doc(db, this.COLLECTION, key);
            const snap = await getDoc(docRef);
            
            if (snap.exists()) {
                const data = snap.data();
                const timestamp = data.timestamp as Timestamp;
                
                // Check TTL
                if (Date.now() - timestamp.toMillis() < this.TTL_MS) {
                    return data.result as AnalysisResult;
                }
            }
            return null;
        } catch (error) {
            console.error('Cache Read Error:', error);
            return null;
        }
    }

    static async set(key: string, result: AnalysisResult): Promise<void> {
        try {
            const docRef = doc(db, this.COLLECTION, key);
            await setDoc(docRef, {
                result,
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error('Cache Write Error:', error);
        }
    }
}
