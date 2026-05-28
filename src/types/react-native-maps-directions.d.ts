declare module 'react-native-maps-directions' {
  import * as React from 'react';
  import type { LatLng } from 'react-native-maps';

  export interface MapViewDirectionsProps {
    origin: LatLng;
    destination: LatLng;
    apikey: string;
    strokeWidth?: number;
    strokeColor?: string;
  }

  const MapViewDirections: React.ComponentType<MapViewDirectionsProps>;
  export default MapViewDirections;
}
