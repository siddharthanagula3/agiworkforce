import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { exportAllUserData, type DsarExportProgress } from '@/services/dsarExport';
import { subscribeCloudAccountEpochChange } from '@/src/features/auth/services/cloudAccountSession';
import { buildLocalDataExportSnapshot, LocalExportAuthorityError } from './localDataSnapshot';

export function useLocalDataExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<DsarExportProgress | null>(null);
  const mounted = useRef(false);
  const operation = useRef<{ assertAuthority?: () => void } | null>(null);

  useFocusEffect(
    useCallback(() => {
      mounted.current = true;
      setExporting(false);
      setProgress(null);
      const unsubscribe = subscribeCloudAccountEpochChange(() => {
        const current = operation.current;
        if (!current) return;
        try {
          current.assertAuthority?.();
        } catch {
          operation.current = null;
          if (mounted.current) {
            setExporting(false);
            setProgress(null);
          }
        }
      });
      return () => {
        mounted.current = false;
        operation.current = null;
        unsubscribe();
      };
    }, []),
  );

  const handleExport = useCallback(async () => {
    if (!mounted.current || operation.current) return;
    const current: { assertAuthority?: () => void } = {};
    operation.current = current;
    const isCurrent = () => mounted.current && operation.current === current;
    const assertActive = () => {
      if (!isCurrent()) throw new Error('This export is no longer active.');
      current.assertAuthority?.();
    };
    setExporting(true);
    setProgress(null);
    try {
      const snapshot = buildLocalDataExportSnapshot();
      current.assertAuthority = snapshot.assertAuthority;
      await exportAllUserData(
        (next) => {
          assertActive();
          setProgress(next);
        },
        snapshot,
        assertActive,
      );
    } catch (error) {
      if (isCurrent()) {
        Alert.alert(
          'Export failed',
          error instanceof LocalExportAuthorityError
            ? error.userMessage
            : 'Could not prepare your local data export. Try again.',
        );
      }
    } finally {
      if (isCurrent()) {
        operation.current = null;
        setExporting(false);
        setProgress(null);
      }
    }
  }, []);

  return { exporting, progress, handleExport };
}
