export interface VehicleVinDecodeResult {
  vin: string;
  brand?: string;
  model?: string;
  series?: string;
  variant?: string;
  manufactureYear?: number;
  estimatedWeightKg?: number;
  bodyType?: string;
  source: 'VIN_API' | 'MANUAL';
}

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
}

export interface VehicleCatalogYearOption {
  year: number;
}
