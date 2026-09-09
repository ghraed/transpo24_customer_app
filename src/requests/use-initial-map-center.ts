import { useCallback, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useAuthSession } from '@/lib/auth-token';
import { getAccountCountryCenter } from '@/lib/places';
import type { Region } from '@/components/native-maps';

export const WORLD_REGION: Region = {
  latitude: 0, longitude: 0, latitudeDelta: 120, longitudeDelta: 300,
};

// Center the camera only; an address still needs an explicit selection/confirmation.
export function useInitialMapCenter(
  setRegion: (region: Region) => void,
  hasAddress: boolean,
) {
  const { user } = useAuthSession();
  const interacted = useRef(hasAddress);
  useEffect(() => {
    let active = true;
    if (hasAddress || interacted.current) return;
    void (async () => {
      let point: { latitude: number; longitude: number } | null = null;
      let delta = 0.03;
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.granted) {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          point = position.coords;
        }
      } catch { /* Fall back to the account country. */ }
      if (!point && user?.countryCode) {
        try {
          point = await getAccountCountryCenter(user.countryCode);
          delta = 3;
        } catch { /* Address search remains available. */ }
      }
      if (active && !interacted.current && point) {
        setRegion({ ...point, latitudeDelta: delta, longitudeDelta: delta });
      }
    })();
    return () => { active = false; };
  }, [hasAddress, setRegion, user?.countryCode]);
  return useCallback(() => { interacted.current = true; }, []);
}
