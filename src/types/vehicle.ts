export interface DecodedVinResult {
  vin: string;
  make?: string;
  year?: string;
  trim?: string;
  vehicleType?: string;
  bodyClass?: string;
  manufacturer?: string;
  plantCountry?: string;
  engineCylinders?: string;
  displacementL?: string;
  fuelTypePrimary?: string;
  transmissionStyle?: string;
  driveType?: string;
  doors?: string;
  errorCode?: string;
  errorText?: string;
  brand?: string;
  model?: string;
  series?: string;
  variant?: string;
  manufactureYear?: number;
  estimatedWeightKg?: number;
  bodyType?: string;
  source: 'NHTSA_VPIC';
}

export type VehicleVinDecodeResult = DecodedVinResult;

export interface VehicleDetailsFormValues {
  vin?: string;
  brandId?: string;
  brandName: string;
  modelId?: string;
  modelName: string;
  seriesId?: string;
  seriesName?: string;
  variantName?: string;
  manufactureYear?: number;
  estimatedWeightKg?: number;
  bodyType?: string;
  source: 'VIN_API' | 'MANUAL';
}

export interface VehicleDetailsPayload {
  vehicleVin?: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleSeries?: string;
  vehicleVariant?: string;
  vehicleManufactureYear?: number;
  vehicleEstimatedWeightKg?: number;
  vehicleBodyType?: string;
  vehicleDataSource: 'VIN_API' | 'MANUAL';
}

export interface VehicleCatalogBrand {
  id: string;
  name: string;
}

export interface VehicleCatalogModel {
  id: string;
  name: string;
  brandId?: string;
}

export interface VehicleCatalogSeries {
  id: string;
  name: string;
  modelId?: string;
  variantName?: string | null;
  bodyType?: string | null;
  estimatedWeightKg?: number | null;
}

export interface VehicleCatalogYearOption {
  year: number;
}
