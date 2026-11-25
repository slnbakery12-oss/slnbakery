/**
 * Reverse-Geocoding Service for Sri Laxmi Narasimha Bakery
 * 
 * Provides an isolated and swappable reverse-geocoding abstraction.
 * Currently uses OpenStreetMap Nominatim with strict rate-limiting,
 * caching, and graceful failure handling.
 */

export interface ReverseGeocodeResult {
  streetAddress: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  displayName: string;
}

// In-memory cache for recent reverse-geocoding requests (coordinates rounded to 4 decimals ~ 11 meters)
const geocodeCache = new Map<string, ReverseGeocodeResult>();

// Enforce 1 request per second to respect OSM Nominatim usage policy
let lastRequestTimestamp = 0;
const MIN_REQUEST_INTERVAL_MS = 1100;

function getCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/**
 * Reverse-geocodes latitude and longitude into structured Indian address fields.
 */
export async function reverseGeocodeCoordinates(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<ReverseGeocodeResult | null> {
  const cacheKey = getCacheKey(lat, lng);
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Ensure minimum interval between network calls
  const now = Date.now();
  const timeSinceLast = now - lastRequestTimestamp;
  if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - timeSinceLast));
  }
  lastRequestTimestamp = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lng)}&addressdetails=1&accept-language=en`;

    const response = await fetch(url, {
      signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Address service is busy. Please wait a moment or enter manually.');
      }
      throw new Error(`Location lookup returned status ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.address) {
      return null;
    }

    const addr = data.address;

    // Build street address from street, road, neighbourhood, suburb
    const streetParts: string[] = [];
    if (addr.house_number) streetParts.push(addr.house_number);
    if (addr.building) streetParts.push(addr.building);
    if (addr.road || addr.street) streetParts.push(addr.road || addr.street);
    if (addr.neighbourhood || addr.suburb || addr.residential) {
      streetParts.push(addr.neighbourhood || addr.suburb || addr.residential);
    }

    const streetAddress = streetParts.filter(Boolean).join(', ').trim();

    // Landmark detection if available in OSM POI tags
    const landmark = addr.amenity || addr.place || addr.landmark || addr.commercial || '';

    // City determination (handles Indian cities, towns, mandals, and villages)
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      'Bejjanki';

    // State determination
    const state = addr.state || 'Telangana';

    // Postal code
    const postalCode = addr.postcode ? addr.postcode.replace(/\D/g, '').slice(0, 6) : '505528';

    const result: ReverseGeocodeResult = {
      streetAddress: streetAddress || data.name || '',
      landmark: landmark.trim(),
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode.length === 6 ? postalCode : '505528',
      displayName: data.display_name || '',
    };

    // Store in cache
    geocodeCache.set(cacheKey, result);

    return result;
  } catch (err: unknown) {
    if (signal?.aborted) return null;
    throw err;
  }
}
