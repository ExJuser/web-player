import type { MosaicTargetRotation } from "./mosaicTypes";

export function normalizeMosaicTargetRotation(value?: number): MosaicTargetRotation {
  return value === 90 || value === 180 || value === 270 ? value : 0;
}

export function getMosaicRotatedDimensions(width: number, height: number, rotation: MosaicTargetRotation) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}
