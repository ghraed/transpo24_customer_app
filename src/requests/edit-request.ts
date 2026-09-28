import type { Address } from "./vehicle-draft";
import type { UploadedRequestPhoto } from "@/types/customer-request";

export type EditField = {
  key: string;
  label: string;
  kind: "text" | "number" | "boolean" | "choice";
  options?: string[];
};
export type EditableRequest = {
  updatedAt: string;
  serviceId: string;
  pickupLocation: Address;
  dropoffLocation: Address;
  isImmediate: boolean;
  scheduledPickupAt: string | null;
  retainedPhotoIds: string[];
  photos: UploadedRequestPhoto[];
  [key: string]: unknown;
};
export const editFields: Record<string, EditField[]> = {
  common: [
    {
      key: "itemTitle",
      label: "Item title",
      kind: "text",
    },
    {
      key: "itemDescription",
      label: "Description",
      kind: "text",
    },
    {
      key: "itemBrand",
      label: "Brand",
      kind: "text",
    },
    {
      key: "itemModel",
      label: "Model",
      kind: "text",
    },
    {
      key: "itemYear",
      label: "Year",
      kind: "number",
    },
    {
      key: "itemCondition",
      label: "Item condition",
      kind: "choice",
      options: ["WORKING", "NOT_WORKING", "NEW", "USED", "FRAGILE", "UNKNOWN"],
    },
    {
      key: "itemWeightKg",
      label: "Weight (kg)",
      kind: "number",
    },
    {
      key: "itemLengthCm",
      label: "Length (cm)",
      kind: "number",
    },
    {
      key: "itemWidthCm",
      label: "Width (cm)",
      kind: "number",
    },
    {
      key: "itemHeightCm",
      label: "Height (cm)",
      kind: "number",
    },
    {
      key: "requiresLoadingHelp",
      label: "Loading help",
      kind: "boolean",
    },
    {
      key: "loadingWorkersCount",
      label: "Number of helpers",
      kind: "number",
    },
    {
      key: "specialInstructions",
      label: "Special instructions",
      kind: "text",
    },
    {
      key: "customerNote",
      label: "Customer note",
      kind: "text",
    },
  ],
  VEHICLE_TRANSPORT: [
    {
      key: "vehicleVin",
      label: "VIN",
      kind: "text",
    },
    {
      key: "vehicleBrand",
      label: "Vehicle brand",
      kind: "text",
    },
    {
      key: "vehicleModel",
      label: "Vehicle model",
      kind: "text",
    },
    {
      key: "vehicleSeries",
      label: "Series",
      kind: "text",
    },
    {
      key: "vehicleVariant",
      label: "Variant",
      kind: "text",
    },
    {
      key: "vehicleManufactureYear",
      label: "Manufacture year",
      kind: "number",
    },
    {
      key: "vehicleEstimatedWeightKg",
      label: "Vehicle weight (kg)",
      kind: "number",
    },
    {
      key: "vehicleBodyType",
      label: "Body type",
      kind: "text",
    },
    {
      key: "vehicleTransmission",
      label: "Transmission",
      kind: "text",
    },
    {
      key: "vehicleMobility",
      label: "Vehicle mobility",
      kind: "choice",
      options: ["RUNNING", "ROLLABLE", "NOT_ROLLABLE"],
    },
    {
      key: "vehicleCondition",
      label: "Vehicle condition",
      kind: "choice",
      options: [
        "RUNNING",
        "NEEDS_JUMP_START",
        "NEEDS_WINCH",
        "NEEDS_CRANE",
        "MISSING_WHEELS",
      ],
    },
    {
      key: "vehicleConditionNotes",
      label: "Condition notes",
      kind: "text",
    },
  ],
  MOTORCYCLE_TRANSPORT: [
    {
      key: "motorcycleType",
      label: "Motorcycle type",
      kind: "choice",
      options: [
        "SPORT_BIKE",
        "CRUISER",
        "ELECTRIC_MOTORCYCLE",
        "SCOOTER",
        "OTHER",
      ],
    },
    {
      key: "motorcycleChassisNumber",
      label: "Chassis number",
      kind: "text",
    },
    {
      key: "motorcycleCondition",
      label: "Motorcycle condition",
      kind: "choice",
      options: ["WORKING", "NOT_WORKING", "DAMAGED", "UNKNOWN"],
    },
    {
      key: "requiresSpecialWrapping",
      label: "Special wrapping",
      kind: "boolean",
    },
    {
      key: "requiresDedicatedCarrier",
      label: "Dedicated carrier",
      kind: "boolean",
    },
  ],
  GOODS_TRANSPORT: [
    {
      key: "goodsShipmentSize",
      label: "Shipment size",
      kind: "choice",
      options: ["XS", "S", "M", "L", "XL", "XXL"],
    },
    {
      key: "goodsDescription",
      label: "Goods description",
      kind: "text",
    },
    {
      key: "goodsApproximateWeightKg",
      label: "Goods weight (kg)",
      kind: "number",
    },
    {
      key: "goodsNumberOfPieces",
      label: "Number of pieces",
      kind: "number",
    },
    {
      key: "goodsIsFragile",
      label: "Fragile",
      kind: "boolean",
    },
    {
      key: "goodsRequiresRefrigeration",
      label: "Refrigeration",
      kind: "boolean",
    },
    {
      key: "goodsHeavyShipmentType",
      label: "Heavy shipment type",
      kind: "choice",
      options: ["ONE_HEAVY_ITEM", "MULTIPLE_SMALLER_PIECES"],
    },
  ],
  FURNITURE_TRANSPORT: [
    {
      key: "furnitureDescription",
      label: "Furniture description",
      kind: "text",
    },
    {
      key: "furnitureApproximateItemCount",
      label: "Number of items",
      kind: "number",
    },
    {
      key: "furnitureNeedsHelpers",
      label: "Furniture loading help",
      kind: "boolean",
    },
    {
      key: "furnitureCustomerCanHelpLoading",
      label: "I can help with loading",
      kind: "boolean",
    },
  ],
};

// Each service exposes the inputs offered by its request flow. Notes are
// included by service capability, regardless of whether a note was saved.
export function getServiceEditFields(
  serviceKey: string,
  draft: EditableRequest,
): EditField[] {
  const note: EditField = {
    key: "customerNote",
    label: "Optional Note",
    kind: "text",
  };
  switch (serviceKey) {
    case "GOODS_TRANSPORT":
      return [
        ...editFields.GOODS_TRANSPORT.filter(
          (field) =>
            field.key !== "goodsHeavyShipmentType" ||
            Number(String(draft.goodsApproximateWeightKg).replace(",", ".")) >=
              50,
        ),
        note,
      ];
    case "FURNITURE_TRANSPORT":
      return [
        ...editFields.FURNITURE_TRANSPORT,
        ...(draft.furnitureNeedsHelpers
          ? [
              editFields.common.find(
                (field) => field.key === "loadingWorkersCount",
              )!,
            ]
          : []),
        note,
      ];
    case "MOTORCYCLE_TRANSPORT":
      return [
        ...(draft.itemType === "OTHER"
          ? [
              {
                key: "itemDescription",
                label: "Bicycle Type",
                kind: "text" as const,
              },
              {
                key: "itemBrand",
                label: "Brand (optional)",
                kind: "text" as const,
              },
              {
                key: "itemModel",
                label: "Model (optional)",
                kind: "text" as const,
              },
            ]
          : editFields.MOTORCYCLE_TRANSPORT.filter((field) =>
              [
                "motorcycleType",
                "motorcycleChassisNumber",
                "motorcycleCondition",
              ].includes(field.key),
            )),
        {
          key: "specialInstructions",
          label: "Additional Notes (optional)",
          kind: "text",
        },
      ];
    case "VEHICLE_TRANSPORT":
      return editFields.VEHICLE_TRANSPORT.filter(
        (field) =>
          !["vehicleCondition", "vehicleSeries", "vehicleVariant"].includes(
            field.key,
          ),
      );
    default:
      return [];
  }
}

// Older request forms prepended schedule/helper metadata to the note. Remove
// only that leading generated line; preserve the client's remaining text.
export function prepareRequestForEdit(
  draft: EditableRequest,
  serviceKey?: string,
): EditableRequest {
  const note = typeof draft.customerNote === "string" ? draft.customerNote : "";
  if (serviceKey === "GOODS_TRANSPORT") {
    return {
      ...draft,
      customerNote: note.replace(
        /^Requested pickup: (?:Immediate pickup|[^\r\n]*\p{N}{1,4}[./-]\p{N}{1,2}[./-]\p{N}{1,4}[^\r\n]*)(?:\r?\n|$)/u,
        "",
      ),
    };
  }
  if (serviceKey === "FURNITURE_TRANSPORT") {
    const helpers = /^Requested helpers: (\d+)(?:\r?\n|$)/.exec(note);
    return {
      ...draft,
      customerNote: helpers ? note.slice(helpers[0].length) : note,
      loadingWorkersCount:
        draft.loadingWorkersCount ?? (helpers ? Number(helpers[1]) : null),
    };
  }
  if (serviceKey === "MOTORCYCLE_TRANSPORT") {
    return {
      ...draft,
      specialInstructions:
        draft.specialInstructions ?? draft.customerNote ?? "",
    };
  }
  return draft;
}

export function editRequestPayload(draft: EditableRequest) {
  const { photos: _photos, ...payload } = draft;
  const requestLocation = ({ latitude, longitude, address, placeId }: Address): Address => ({
    latitude,
    longitude,
    address,
    ...(placeId != null ? { placeId } : {}),
  });
  payload.pickupLocation = requestLocation(draft.pickupLocation);
  payload.dropoffLocation = requestLocation(draft.dropoffLocation);
  for (const field of Object.values(editFields).flat()) {
    if (field.kind === "number") {
      const raw = payload[field.key];
      payload[field.key] =
        raw === "" || raw == null
          ? null
          : Number(String(raw).replace(",", "."));
      if (payload[field.key] !== null && !Number.isFinite(payload[field.key]))
        throw new Error("editRequest.invalidNumber");
    } else if (field.kind === "boolean") {
      payload[field.key] = Boolean(payload[field.key]);
    } else if (payload[field.key] === "") {
      payload[field.key] = null;
    }
  }
  if (draft.isImmediate) payload.scheduledPickupAt = null;
  return payload;
}
