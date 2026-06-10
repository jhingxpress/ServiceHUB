import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { debugLogger, DebugLogEntry } from '../../services/debugLogger';
import { COLORS } from '../../constants/theme';

export default function DebugAuthScreen({ onClose }: { onClose: () => void }) {
  const { user, emailJustVerified, passwordResetMode } = useAuthStore();
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);

  useEffect(() => {
    setLogs(debugLogger.getLogs());
    const unsubscribe = debugLogger.subscribe(setLogs);
    return unsubscribe;
  }, []);

  const handleClear = async () => {
    await debugLogger.clear();
  };

  const handleShare = async () => {
    const logText = logs
      .map((log) => {
        const dataStr = Object.entries(log.data)
          .map(([k, v]) => `  ${k}=${JSON.stringify(v)}`)
          .join('\n');
        return `[${log.timestamp}] ${log.event}\n${dataStr}`;
      })
      .join('\n\n');

    await Share.share({
      message: `ServiceHub Debug Logs\n\n${logText}`,
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Auth Debug</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.stateBox}>
        <Text style={styles.stateTitle}>Current State</Text>
        <Text style={styles.stateText}>User ID: {user?.id ?? 'null'}</Text>
        <Text style={styles.stateText}>Email: {user?.email ?? 'null'}</Text>
        <Text style={styles.stateText}>Role: {user?.role ?? 'null'}</Text>
        <Text style={styles.stateText}>Status: {user?.status ?? 'null'}</Text>
        <Text style={styles.stateText}>
          Email Verified: {user?.email_verified?.toString() ?? 'null'}
        </Text>
        <Text style={styles.stateText}>
          Accepted Terms: {user?.accepted_terms_at ?? 'null'}
        </Text>
        <Text style={styles.stateText}>
          Password Reset Mode: {passwordResetMode.toString()}
        </Text>
        <Text style={styles.stateText}>
          Email Just Verified: {emailJustVerified.toString()}
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={handleClear} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={styles.actionText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShare} style={styles.actionBtn}>
          <Ionicons name="share-outline" size={18} color="#fff" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.logContainer}>
        {logs.length === 0 ? (
          <Text style={styles.emptyText}>No logs yet. Perform auth actions to see logs.</Text>
        ) : (
          logs.map((log, idx) => (
            <View key={idx} style={styles.logEntry}>
              <Text style={styles.logTime}>[{log.timestamp}]</Text>
              <Text style={styles.logEvent}>{log.event}</Text>
              {Object.entries(log.data).map(([key, value]) => (
                <Text key={key} style={styles.logData}>
                  {key}={JSON.stringify(value)}
                </Text>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  closeBtn: {
    padding: 4,
  },
  stateBox: {
    backgroundColor: '#2a2a2a',
    margin: 12,
    padding: 12,
    borderRadius: 8,
  },
  stateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginBottom: 8,
  },
  stateText: {
    fontSize: 12,
    color: '#ddd',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  logContainer: {
    flex: 1,
    paddingHorizontal: 12,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  logEntry: {
    backgroundColor: '#2a2a2a',
    padding: 10,
    marginBottom: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  logTime: {
    fontSize: 11,
    color: '#888',
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  logEvent: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 4,
  },
  logData: {
    fontSize: 11,
    color: '#ddd',
    fontFamily: 'monospace',
    marginLeft: 8,
  },
});
