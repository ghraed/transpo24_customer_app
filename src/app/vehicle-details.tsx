import { Redirect, useLocalSearchParams } from 'expo-router';
export default function VehicleDetailsRoute() {
  const { serviceId } = useLocalSearchParams<{ serviceId?: string }>();
  return (
    <Redirect
      href={{
        pathname: '/vehicle-request',
        params: { serviceId: serviceId ?? '' },
      }}
    />
  );
}
