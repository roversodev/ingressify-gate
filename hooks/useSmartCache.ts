import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

interface CacheConfig {
  key: string;
  ttl?: number; // Time to live em milissegundos
  fallbackData?: any;
}

export function useSmartCache<T>(config: CacheConfig) {
  const [data, setData] = useState<T | null>(config.fallbackData || null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const getCachedData = async (): Promise<T | null> => {
    try {
      const cached = await AsyncStorage.getItem(config.key);
      if (!cached) return null;

      const parsedData = JSON.parse(cached);
      const now = Date.now();
      
      // Verificar TTL se configurado
      if (config.ttl && parsedData.timestamp) {
        const isExpired = (now - parsedData.timestamp) > config.ttl;
        if (isExpired) {
          await AsyncStorage.removeItem(config.key);
          return null;
        }
      }

      return parsedData.data;
    } catch (err) {
      console.warn(`Cache read error for ${config.key}:`, err);
      return null;
    }
  };

  const setCachedData = async (newData: T): Promise<void> => {
    try {
      const cacheObject = {
        data: newData,
        timestamp: Date.now()
      };
      await AsyncStorage.setItem(config.key, JSON.stringify(cacheObject));
      setData(newData);
    } catch (err) {
      console.warn(`Cache write error for ${config.key}:`, err);
      setError(err as Error);
    }
  };

  const clearCache = async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(config.key);
      setData(config.fallbackData || null);
    } catch (err) {
      console.warn(`Cache clear error for ${config.key}:`, err);
    }
  };

  useEffect(() => {
    const loadCachedData = async () => {
      setIsLoading(true);
      try {
        const cachedData = await getCachedData();
        if (cachedData) {
          setData(cachedData);
        }
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    loadCachedData();
  }, [config.key]);

  return {
    data,
    isLoading,
    error,
    setData: setCachedData,
    clearCache,
    refresh: () => getCachedData()
  };
}