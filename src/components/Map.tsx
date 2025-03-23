// @ts-nocheck - Skip type checking for the whole file - Leaflet types are incompatible
import { useEffect, useRef } from 'react';
// @ts-ignore - Ignore TypeScript error for Leaflet import
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ConnectionWithLocation } from '../contexts/LocationContext';

// Fix Leaflet marker icon issue
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Define default icon
let DefaultIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Define custom icons
const userIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  className: 'user-marker'
});

const selectedConnectionIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconSize: [30, 46],
  iconAnchor: [15, 46],
  className: 'connection-marker-selected'
});

const connectionIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  className: 'connection-marker'
});

interface Location {
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number;
}

interface MapProps {
  currentLocation: Location | null;
  connections: ConnectionWithLocation[];
  selectedConnectionId: string | null;
  onUpdateLocation: () => Promise<Location | undefined>;
}

// Add setPopupContent to Marker interface
declare module 'leaflet' {
  interface Marker {
    setPopupContent(content: string): this;
  }
}

export function Map({ currentLocation, connections, selectedConnectionId, onUpdateLocation }: MapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});
  const polylineRef = useRef<L.Polyline | null>(null);
  
  // Initialize map
  useEffect(() => {
    if (!mapRef.current) {
      // Create the map with a default view
      const mapInstance = L.map('map').setView([0, 0], 2);
      
      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapInstance);
      
      mapRef.current = mapInstance;
      
      // Add zoom controls
      mapInstance.zoomControl.setPosition('topright');
      
      // Add scale control
      L.control.scale().addTo(mapInstance);
    }
    
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);
  
  // Update user marker when location changes
  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance || !currentLocation) return;
    
    const { latitude, longitude } = currentLocation;
    console.log('Updating map with user location:', { latitude, longitude, accuracy: currentLocation.accuracy });
    
    // Create or update user marker
    if (markersRef.current['user']) {
      markersRef.current['user'].setLatLng([latitude, longitude]);
      markersRef.current['user'].setPopupContent(`
        <div>
          <strong>Your Location</strong>
          <p>Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}</p>
          <p>Accuracy: ${currentLocation.accuracy ? `${Math.round(currentLocation.accuracy)}m` : 'Unknown'}</p>
          <p>Updated: ${new Date(currentLocation.timestamp).toLocaleTimeString()}</p>
        </div>
      `);
    } else {
      const marker = L.marker([latitude, longitude], { icon: userIcon })
        .addTo(mapInstance)
        .bindPopup(`
          <div>
            <strong>Your Location</strong>
            <p>Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}</p>
            <p>Accuracy: ${currentLocation.accuracy ? `${Math.round(currentLocation.accuracy)}m` : 'Unknown'}</p>
            <p>Updated: ${new Date(currentLocation.timestamp).toLocaleTimeString()}</p>
          </div>
        `);
      
      markersRef.current['user'] = marker;
    }
    
    // Center map on user's location if no connection is selected
    if (!selectedConnectionId) {
      mapInstance.setView([latitude, longitude], 15);
    }
    
    // Update accuracy circle
    if (currentLocation.accuracy) {
      if (markersRef.current['accuracy']) {
        mapInstance.removeLayer(markersRef.current['accuracy']);
      }
      
      const circle = L.circle([latitude, longitude], {
        radius: currentLocation.accuracy,
        fill: true,
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
        stroke: true,
        color: '#3b82f6',
        weight: 1
      }).addTo(mapInstance);
      
      markersRef.current['accuracy'] = circle as unknown as L.Marker;
    }
  }, [currentLocation, selectedConnectionId]);
  
  // Update connection markers
  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance) return;
    
    // Keep track of active connection IDs
    const activeConnectionIds = new Set();
    
    connections.forEach(connection => {
      if (!connection.location) return;
      
      const { latitude, longitude } = connection.location;
      const isSelected = connection.id === selectedConnectionId;
      activeConnectionIds.add(connection.id);
      
      // Create or update marker
      if (markersRef.current[connection.id]) {
        const marker = markersRef.current[connection.id];
        marker.setLatLng([latitude, longitude]);
        
        // Update icon if selection state changed
        if (isSelected) {
          marker.setIcon(selectedConnectionIcon);
        } else {
          marker.setIcon(connectionIcon);
        }
        
        // Update popup content
        marker.setPopupContent(`
          <div>
            <strong>${connection.displayName}</strong>
            <p>Last updated: ${new Date(connection.location.timestamp).toLocaleString()}</p>
          </div>
        `);
      } else {
        // Create new marker
        const marker = L.marker([latitude, longitude], {
          icon: isSelected ? selectedConnectionIcon : connectionIcon
        })
          .addTo(mapInstance)
          .bindPopup(`
            <div>
              <strong>${connection.displayName}</strong>
              <p>Last updated: ${new Date(connection.location.timestamp).toLocaleString()}</p>
            </div>
          `);
        
        markersRef.current[connection.id] = marker;
      }
    });
    
    // Remove markers for connections that no longer exist
    Object.keys(markersRef.current).forEach(id => {
      if (id !== 'user' && id !== 'accuracy' && !activeConnectionIds.has(id)) {
        mapInstance.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
    });
  }, [connections, selectedConnectionId]);
  
  // Draw line between user and selected connection
  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance || !currentLocation) return;
    
    // Clear existing polyline
    if (polylineRef.current) {
      mapInstance.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }
    
    // If a connection is selected and has location, draw a line
    if (selectedConnectionId) {
      const selectedConnection = connections.find(c => c.id === selectedConnectionId);
      
      if (selectedConnection?.location) {
        const userLatLng = [currentLocation.latitude, currentLocation.longitude];
        const connectionLatLng = [
          selectedConnection.location.latitude, 
          selectedConnection.location.longitude
        ];
        
        // Create polyline
        const polyline = L.polyline([userLatLng, connectionLatLng], {
          color: '#3b82f6',
          weight: 3,
          opacity: 0.7,
          dashArray: '5, 10',
        }).addTo(mapInstance);
        
        polylineRef.current = polyline;
        
        // Fit bounds to include both markers
        mapInstance.fitBounds([
          [currentLocation.latitude, currentLocation.longitude],
          [selectedConnection.location.latitude, selectedConnection.location.longitude]
        ], { 
          padding: [50, 50] 
        });
      }
    }
  }, [currentLocation, connections, selectedConnectionId]);
  
  return (
    <div className="h-full w-full relative">
      <div id="map" className="h-full w-full z-0"></div>
      
      {/* Map controls */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
        <button
          onClick={async () => {
            const location = await onUpdateLocation();
            if (location && mapRef.current) {
              console.log('Recentering map on updated location');
              mapRef.current.setView([location.latitude, location.longitude], 16);
            }
          }}
          className="bg-card text-card-foreground shadow-md rounded-full p-3 hover:bg-accent"
          title="Update your location and recenter map"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="1" />
            <line x1="12" y1="9" x2="12" y2="2" />
            <line x1="12" y1="22" x2="12" y2="15" />
            <line x1="15" y1="12" x2="22" y2="12" />
            <line x1="2" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
} 