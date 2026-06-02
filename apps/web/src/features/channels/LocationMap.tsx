import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../../lib/api';
import { wsClient } from '../../lib/ws';

interface Location {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updatedAt: string;
  displayName: string;
}

interface Props {
  channelId: string;
  userId: string;
}

let leafletLoaded = false;
async function ensureLeaflet(): Promise<void> {
  if (leafletLoaded) return;
  leafletLoaded = true;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);

  await new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve();
    script.onerror = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
      s2.onload = () => resolve();
      document.head.appendChild(s2);
    };
    document.head.appendChild(script);
  });
}

export default function LocationMap({ channelId, userId }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const mapInstance = useRef<any>(null);
  const markers = useRef<any[]>([]);
  const watchId = useRef<number | null>(null);
  const intervalRef = useRef<any>(null);
  const locationSendInterval = useRef<any>(null);

  const sendPosition = useCallback((pos: GeolocationPosition) => {
    wsClient.send({
      type: 'location.update',
      channelId,
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    });
  }, [channelId]);

  const loadLocations = useCallback(async () => {
    try {
      const data: any = await api.get(`/channels/${channelId}/locations`);
      if (data.locations) {
        setLocations(data.locations);
      }
    } catch {}
  }, [channelId]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    ensureLeaflet().then(() => {
      setReady(true);
      const L = (window as any).L;
      mapInstance.current = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
      }).setView([55.7558, 37.6173], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(mapInstance.current);
      loadLocations();
    });
  }, [channelId]);

  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapInstance.current) return;

    markers.current.forEach((m) => mapInstance.current.removeLayer(m));
    markers.current = [];

    if (locations.length === 0) return;

    const bounds: any[] = [];
    locations.forEach((loc) => {
      const isMe = loc.userId === userId;
      const markerColor = isMe ? '#3b82f6' : '#ef4444';
      const dotSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" fill="${markerColor}" stroke="white" stroke-width="3"/>
      </svg>`;
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;cursor:pointer">
          ${dotSvg}
          <div style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);white-space:nowrap;background:${isMe ? '#1e3a5f' : '#5f1e1e'};color:white;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;pointer-events:none;border:1px solid ${markerColor}">${loc.displayName}</div>
        </div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const m = L.marker([loc.latitude, loc.longitude], { icon })
        .addTo(mapInstance.current);
      m.bindPopup(`<b>${loc.displayName}</b>${isMe ? ' (you)' : ''}<br/>${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}<br/><span style="color:#888">Updated: ${new Date(loc.updatedAt).toLocaleTimeString()}</span>`);
      markers.current.push(m);
      bounds.push([loc.latitude, loc.longitude]);
    });

    if (bounds.length > 0) {
      mapInstance.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }, [locations, userId]);

  useEffect(() => {
    const handler = () => { loadLocations(); };
    wsClient.on('location.updated', handler);
    return () => { wsClient.off('location.updated', handler); };
  }, [loadLocations]);

  useEffect(() => {
    loadLocations();
    const interval = setInterval(loadLocations, 30000);
    return () => clearInterval(interval);
  }, [loadLocations]);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(sendPosition, () => {}, { enableHighAccuracy: true, timeout: 10000 });
    watchId.current = navigator.geolocation.watchPosition(sendPosition, () => {}, { enableHighAccuracy: true, timeout: 10000 });
    locationSendInterval.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(sendPosition, () => {}, { enableHighAccuracy: true, timeout: 10000 });
    }, 30000);

    return () => {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (locationSendInterval.current) {
        clearInterval(locationSendInterval.current);
        locationSendInterval.current = null;
      }
    };
  }, [sendPosition]);

  useEffect(() => {
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full min-h-[160px] lg:min-h-[200px]">
      <div className="flex items-center justify-between px-3 pt-2 lg:px-4 lg:pt-3">
        <span className="text-[10px] font-semibold text-slate-300 lg:text-xs">Live Map</span>
        <span className="text-[9px] text-slate-500 lg:text-[10px]">{locations.length} user{locations.length !== 1 ? 's' : ''}</span>
      </div>
      <div ref={mapRef} className="flex-1 min-h-[120px] lg:min-h-[180px]" style={{ background: '#1e293b' }} />
    </div>
  );
}