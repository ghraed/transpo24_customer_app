import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { MapPolylineProps } from 'react-native-maps';
import { decodePolyline } from '@/lib/map-polyline';

const RETRY_MS = 5000;
const REFRESH_MS = 15000;
const CACHE_MS = 5 * 60 * 1000;
type Point = { latitude: number; longitude: number };
type DirectionsProps = Pick<MapPolylineProps, 'strokeWidth' | 'strokeColor'> & {
  origin: Point;
  destination: Point;
  apikey: string;
  mode?: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';
  onReady?: (route: Route) => void;
  onError?: (message: string) => void;
};
type Route = {
  coordinates: { latitude: number; longitude: number }[];
  distance: number;
  duration: number;
};
const cache = new Map<string, { route: Route; savedAt: number }>();
function cachedRoute(key: string) {
  const entry = cache.get(key);
  return entry && Date.now() - entry.savedAt < CACHE_MS
    ? entry.route
    : undefined;
}

// Built around a supplied native Polyline so web never imports native map modules.
export function createReliableMapDirections(
  Polyline: React.ComponentType<MapPolylineProps>,
): React.ComponentType<DirectionsProps> {
  return function ReliableMapDirections({
    origin,
    destination,
    apikey,
    mode = 'DRIVING',
    onReady,
    onError,
    ...style
  }: DirectionsProps) {
    const originLat = origin.latitude;
    const originLng = origin.longitude;
    const destLat = destination.latitude;
    const destLng = destination.longitude;
    const destinationKey = `${destLat},${destLng}:${mode}:${apikey}`;
    const key = `${originLat},${originLng}:${destinationKey}`;
    const [result, setResult] = useState<{
      destinationKey: string;
      route: Route;
    } | null>(null);
    const latest = useRef({ originLat, originLng, onReady, onError });
    useEffect(() => {
      latest.current = { originLat, originLng, onReady, onError };
    }, [originLat, originLng, onReady, onError]);

    useEffect(() => {
      if (!apikey || ![destLat, destLng].every(Number.isFinite)) return;
      let active = true;
      let inFlight = false;
      let successfulOrigin = '';
      let timer: ReturnType<typeof setTimeout>;
      let request: AbortController | undefined;
      const load = async () => {
        const { originLat: lat, originLng: lng } = latest.current;
        if (!active || inFlight || ![lat, lng].every(Number.isFinite)) return;
        const originKey = `${lat},${lng}`;
        if (successfulOrigin === originKey) return;
        inFlight = true;
        clearTimeout(timer);
        const routeKey = `${originKey}:${destinationKey}`;
        request = new AbortController();
        const timeout = setTimeout(() => request?.abort(), 20000);
        let failed = false;
        try {
          let route = cachedRoute(routeKey);
          if (!route) {
            const query = new URLSearchParams({
              origin: originKey,
              destination: `${destLat},${destLng}`,
              key: apikey,
              mode: mode.toLowerCase(),
            });
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/directions/json?${query}`,
              { signal: request.signal },
            );
            if (!response.ok) throw new Error();
            const data = await response.json();
            const first = data.routes?.[0];
            const coordinates = first?.overview_polyline?.points
              ? decodePolyline(first.overview_polyline.points)
              : [];
            if (
              data.status !== 'OK' ||
              coordinates.length < 2 ||
              !first.legs?.length
            )
              throw new Error();
            const distance =
              first.legs.reduce(
                (total: number, leg: { distance: { value: number } }) =>
                  total + leg.distance.value,
                0,
              ) / 1000;
            const duration =
              first.legs.reduce(
                (total: number, leg: { duration: { value: number } }) =>
                  total + leg.duration.value,
                0,
              ) / 60;
            if (
              ![distance, duration].every(
                (value) => Number.isFinite(value) && value >= 0,
              )
            )
              throw new Error();
            route = { coordinates, distance, duration };
            if (active) {
              if (cache.size >= 30) cache.delete(cache.keys().next().value!);
              cache.set(routeKey, { route, savedAt: Date.now() });
            }
          }
          if (!active) return;
          successfulOrigin = originKey;
          setResult({ destinationKey, route });
          latest.current.onReady?.(route);
        } catch {
          if (!active) return;
          failed = true;
          latest.current.onError?.('Unable to fetch route directions.');
        } finally {
          clearTimeout(timeout);
          inFlight = false;
          if (active)
            timer = setTimeout(
              () => void load(),
              failed ? RETRY_MS : REFRESH_MS,
            );
        }
      };
      void load();
      const interval = setInterval(() => void load(), REFRESH_MS);
      const listener = AppState.addEventListener('change', (state) => {
        if (state === 'active') void load();
      });
      return () => {
        active = false;
        clearTimeout(timer);
        clearInterval(interval);
        request?.abort();
        listener.remove();
      };
    }, [apikey, destLat, destLng, destinationKey, mode]);

    const route =
      result?.destinationKey === destinationKey
        ? result.route
        : cachedRoute(key);
    return route ? (
      <Polyline {...style} coordinates={route.coordinates} />
    ) : null;
  };
}
