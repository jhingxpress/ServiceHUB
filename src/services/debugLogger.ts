import AsyncStorage from '@react-native-async-storage/async-storage';

const DEBUG_LOG_KEY = '@ServiceHub:DebugLogs';
const MAX_LOGS = 100;

export interface DebugLogEntry {
  timestamp: string;
  event: string;
  data: Record<string, unknown>;
}

class DebugLogger {
  private logs: DebugLogEntry[] = [];
  private listeners: Array<(logs: DebugLogEntry[]) => void> = [];

  async initialize() {
    try {
      const stored = await AsyncStorage.getItem(DEBUG_LOG_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      console.error('[DebugLogger] Failed to load logs:', e);
    }
  }

  log(event: string, data: Record<string, unknown> = {}) {
    const entry: DebugLogEntry = {
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
      event,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }

    this.persist();
    this.notifyListeners();

    // Also log to console for adb fallback
    console.log(`[DEBUG] ${entry.timestamp} ${event}`, data);
  }

  private async persist() {
    try {
      await AsyncStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(this.logs));
    } catch (e) {
      console.error('[DebugLogger] Failed to persist logs:', e);
    }
  }

  getLogs(): DebugLogEntry[] {
    return [...this.logs];
  }

  subscribe(listener: (logs: DebugLogEntry[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener([...this.logs]));
  }

  async clear() {
    this.logs = [];
    await AsyncStorage.removeItem(DEBUG_LOG_KEY);
    this.notifyListeners();
  }
}

export const debugLogger = new DebugLogger();
