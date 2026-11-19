import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

export function useGreetingTime(): Date {
  const [time, setTime] = useState(() => new Date());

  useFocusEffect(
    useCallback(() => {
      setTime(new Date());
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTime(new Date());
    });
    return () => subscription.remove();
  }, []);

  return time;
}
