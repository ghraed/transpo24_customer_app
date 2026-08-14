import React from 'react';
import { Platform } from 'react-native';

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MapPressEvent = {
  nativeEvent: {
    coordinate: {
      latitude: number;
      longitude: number;
    };
  };
};

type GenericComponent = React.ComponentType<any>;

const UnavailableMapComponent: GenericComponent = () => null;

let MapViewComponent: GenericComponent = UnavailableMapComponent;
let MarkerComponent: GenericComponent = UnavailableMapComponent;
let MapViewDirectionsComponent: GenericComponent = UnavailableMapComponent;
let GoogleProvider: unknown;
let mapRuntimeAvailable = false;

if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Native maps must not load in web bundles.
  const mapsModule = require('react-native-maps') as {
    default: GenericComponent;
    Marker: GenericComponent;
    PROVIDER_GOOGLE?: unknown;
  };

  MapViewComponent = mapsModule.default;
  MarkerComponent = mapsModule.Marker;
  GoogleProvider = mapsModule.PROVIDER_GOOGLE;
  mapRuntimeAvailable = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Directions is a native-only optional dependency.
    const directionsModule = require('react-native-maps-directions') as {
      default: GenericComponent;
    };
    MapViewDirectionsComponent = directionsModule.default;
  } catch {
    MapViewDirectionsComponent = UnavailableMapComponent;
  }
}

export const NativeMapView = MapViewComponent;
export const NativeMarker = MarkerComponent;
export const NativeMapViewDirections = MapViewDirectionsComponent;
export const PROVIDER_GOOGLE = GoogleProvider;
export const isNativeMapRuntimeAvailable =
  Platform.OS !== 'web' && mapRuntimeAvailable;
