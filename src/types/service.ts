export interface Service {
  id: string;
  key: 'VEHICLE_TRANSPORT' | 'MOTORCYCLE_TRANSPORT' | 'GOODS_TRANSPORT' | 'FURNITURE_TRANSPORT';
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  icon: string;
  isActive: boolean;
  sortOrder: number;
}
