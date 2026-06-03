declare module 'react-native-maps-directions' {
  import * as React from 'react';
  import type { LatLng } from 'react-native-maps';

  export interface MapViewDirectionsProps {
    origin: LatLng;
    destination: LatLng;
    apikey: string;
    mode?: 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';
    strokeWidth?: number;
    strokeColor?: string;
    onReady?: (result: { distance: number; duration: number; coordinates: LatLng[] }) => void;
    onError?: (message: string) => void;
  }

  const MapViewDirections: React.ComponentType<MapViewDirectionsProps>;
  export default MapViewDirections;
}
