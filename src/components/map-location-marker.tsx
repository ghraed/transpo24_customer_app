import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { MapMarkerProps } from 'react-native-maps';
import { NativeMarker } from './native-maps';

import { MAP_COLORS } from '@/config/map-style';
export { MAP_COLORS } from '@/config/map-style';

export type MapLocationKind = 'pickup' | 'dropoff' | 'driver';

export function MapLocationIcon({ kind }: { kind: MapLocationKind }) {
  return (
    <View collapsable={false} style={{ width: 40, height: 44 }}>
      <Svg width={40} height={44} viewBox="0 0 40 44">
        {kind === 'driver' ? <>
          <Rect x={7} y={12} width={5} height={9} rx={2} fill={MAP_COLORS.driver} stroke="#FFFFFF" strokeWidth={1.5} />
          <Rect x={28} y={12} width={5} height={9} rx={2} fill={MAP_COLORS.driver} stroke="#FFFFFF" strokeWidth={1.5} />
          <Rect x={7} y={27} width={5} height={9} rx={2} fill={MAP_COLORS.driver} stroke="#FFFFFF" strokeWidth={1.5} />
          <Rect x={28} y={27} width={5} height={9} rx={2} fill={MAP_COLORS.driver} stroke="#FFFFFF" strokeWidth={1.5} />
          <Rect x={11} y={3} width={18} height={38} rx={6} fill={MAP_COLORS.driver} stroke="#FFFFFF" strokeWidth={2} />
          <Rect x={14} y={10} width={12} height={8} rx={2} fill="#FFFFFF" />
          <Rect x={14} y={28} width={12} height={6} rx={2} fill="#FFFFFF" />
        </> : <>
          <Path d="M20 42C17 37 5 26 5 17a15 15 0 0 1 30 0c0 9-12 20-15 25Z" fill={MAP_COLORS[kind]} stroke="#FFFFFF" strokeWidth={2} />
          {kind === 'pickup'
            ? <Circle cx={20} cy={17} r={5} fill="#FFFFFF" />
            : <Rect x={15} y={12} width={10} height={10} rx={1} fill="#FFFFFF" />}
        </>}
      </Svg>
    </View>
  );
}

// Native bitmap markers avoid Android capturing an empty SVG child view.
const MARKER_IMAGES = {
  pickup: require('../../assets/map-markers/pickup.png'),
  dropoff: require('../../assets/map-markers/dropoff.png'),
  driver: require('../../assets/map-markers/driver.png'),
} as const;

type Props = Omit<MapMarkerProps, 'children' | 'pinColor' | 'anchor' | 'image'> & { kind: MapLocationKind };
export function MapLocationMarker({ kind, ...props }: Props) {
  if (!NativeMarker) return null;
  return (
    <NativeMarker
      {...props}
      image={MARKER_IMAGES[kind]}
      tracksViewChanges={false}
      anchor={{ x: 0.5, y: kind === 'driver' ? 0.5 : 42 / 44 }}
    />
  );
}
