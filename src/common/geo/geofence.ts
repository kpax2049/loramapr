import { distanceMeters } from './haversine';

export function isInsideGeofence(
  pointLat: number,
  pointLon: number,
  homeLat: number,
  homeLon: number,
  radiusMeters: number
): boolean {
  return distanceMeters(pointLat, pointLon, homeLat, homeLon) <= radiusMeters;
}
