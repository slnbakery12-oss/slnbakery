import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { reverseGeocodeCoordinates, type ReverseGeocodeResult } from '../lib/geocoding';

// Fix Leaflet's default marker icon paths when bundled with Vite
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
});

interface AddressMapPickerProps {
  onLocationResolved: (address: ReverseGeocodeResult) => void;
  initialStreetAddress?: string;
}

// Center coordinates for Bejjanki, Telangana (Sri Laxmi Narasimha Bakery hometown)
const DEFAULT_CENTER: [number, number] = [18.1504, 79.0343];

export const AddressMapPicker: React.FC<AddressMapPickerProps> = ({
  onLocationResolved,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [locationStatus, setLocationStatus] = useState<{
    type: 'idle' | 'success' | 'warning' | 'error';
    message: string;
  }>({
    type: 'idle',
    message: '',
  });

  const [currentCoords, setCurrentCoords] = useState<[number, number] | null>(null);

  // Reusable helper to geocode coordinates when marker settles
  const handleMarkerSettled = async (lat: number, lng: number) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsGeocoding(true);
    setLocationStatus({
      type: 'idle',
      message: 'Looking up address details...',
    });

    try {
      const result = await reverseGeocodeCoordinates(lat, lng, controller.signal);
      if (result) {
        onLocationResolved(result);
        setLocationStatus({
          type: 'success',
          message: `Location pin set: ${result.displayName.slice(0, 70)}...`,
        });
      } else {
        setLocationStatus({
          type: 'warning',
          message: 'Location selected, but street name could not be identified automatically.',
        });
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Unable to look up address details.';
      setLocationStatus({
        type: 'warning',
        message: `${msg} You can still enter or edit your address fields manually below.`,
      });
    } finally {
      setIsGeocoding(false);
    }
  };

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Create map instance
    const initialCoords = currentCoords || DEFAULT_CENTER;
    const map = L.map(mapContainerRef.current, {
      center: initialCoords,
      zoom: 15,
      zoomControl: true,
      attributionControl: true,
    });
    mapInstanceRef.current = map;

    // Add OpenStreetMap tiles with attribution
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Add draggable marker
    const marker = L.marker(initialCoords, {
      draggable: true,
      icon: defaultIcon,
      title: 'Drag me to adjust delivery pin',
    }).addTo(map);
    markerRef.current = marker;

    // Drag end listener: only reverse-geocode after dragging has fully ended
    marker.on('dragend', () => {
      const latLng = marker.getLatLng();
      setCurrentCoords([latLng.lat, latLng.lng]);
      handleMarkerSettled(latLng.lat, latLng.lng);
    });

    // Click map to reposition marker
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      setCurrentCoords([lat, lng]);
      handleMarkerSettled(lat, lng);
    });

    // Invalidate map size after DOM render inside modal
    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(resizeTimer);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Browser Geolocation API handler
  const handleDetectCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus({
        type: 'warning',
        message: 'Location detection is not supported by your browser. Please type your address manually below.',
      });
      return;
    }

    setIsDetectingLocation(true);
    setLocationStatus({
      type: 'idle',
      message: 'Detecting your device location...',
    });

    navigator.geolocation.getCurrentPosition(
      position => {
        setIsDetectingLocation(false);
        const { latitude, longitude } = position.coords;
        setCurrentCoords([latitude, longitude]);

        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setView([latitude, longitude], 16, { animate: true });
          markerRef.current.setLatLng([latitude, longitude]);
        }

        handleMarkerSettled(latitude, longitude);
      },
      error => {
        setIsDetectingLocation(false);
        let msg = 'Could not retrieve your location. You can still type your address manually below.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location permission was denied. You can manually enter your address details below or drag the map pin.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Location information is currently unavailable. Please enter your address below.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Location request timed out. Please enter your address below.';
        }
        setLocationStatus({
          type: 'warning',
          message: msg,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  };

  return (
    <div className="space-y-2 rounded-xl border border-[#e7ddd2] bg-[#faf6ef]/40 p-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <span className="text-xs sm:text-sm font-semibold text-[#432e26] flex items-center gap-1.5">
            <svg
              className="h-4 w-4 text-[#734738]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Interactive Location Pin
          </span>
          <p className="text-[11px] text-[#79695c]">
            Click or drag the pin to set your delivery spot, or use GPS detection.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDetectCurrentLocation}
          disabled={isDetectingLocation || isGeocoding}
          className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-[#c4ab97] bg-white text-[#734738] shadow-xs hover:bg-[#faf6ef] disabled:opacity-50 transition cursor-pointer"
        >
          {isDetectingLocation ? (
            <>
              <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-[#734738] border-t-transparent" />
              <span>Detecting...</span>
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Use My Current Location</span>
            </>
          )}
        </button>
      </div>

      {/* Map display */}
      <div className="relative w-full h-48 sm:h-52 rounded-lg overflow-hidden border border-[#ded3c9] z-0">
        <div ref={mapContainerRef} className="w-full h-full" />
        {isGeocoding && (
          <div className="absolute top-2 right-2 z-[1000] bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-md border border-[#ddcebd] shadow-xs flex items-center gap-1.5 text-[11px] font-medium text-[#734738]">
            <span className="inline-block animate-spin rounded-full h-3 w-3 border-2 border-[#734738] border-t-transparent" />
            Resolving address...
          </div>
        )}
      </div>

      {/* Inline status / helper notification */}
      {locationStatus.message && (
        <div
          className={`p-2 rounded-md text-[11px] leading-relaxed flex items-start gap-1.5 ${
            locationStatus.type === 'success'
              ? 'bg-[#edf0e5] text-[#334624] border border-[#d2dcb9]'
              : locationStatus.type === 'warning'
              ? 'bg-amber-50 text-amber-900 border border-amber-200'
              : 'bg-[#faf6ef] text-[#6a5649] border border-[#ede3d7]'
          }`}
        >
          <span className="font-semibold shrink-0">
            {locationStatus.type === 'success' ? '✓' : 'ℹ'}
          </span>
          <span>{locationStatus.message}</span>
        </div>
      )}
    </div>
  );
};
