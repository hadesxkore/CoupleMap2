// @ts-nocheck - Skip type checking for the whole file - Leaflet types are incompatible
import { useEffect, useRef, useState } from 'react';
// @ts-ignore - Ignore TypeScript error for Leaflet import
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ConnectionWithLocation } from '../contexts/LocationContext';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

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

// Create a custom div marker for user profiles
const createProfileMarker = (imgSrc, size = 48, selected = false) => {
  return L.divIcon({
    className: 'custom-profile-marker',
    html: `
      <div class="profile-marker ${selected ? 'selected' : ''}" style="width: ${size}px; height: ${size}px;">
        <img src="${imgSrc || iconUrl}" class="profile-img" />
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2],
  });
};

// Add styles to document for the custom markers
const addMarkerStyles = () => {
  const style = document.createElement('style');
  style.textContent = `
    .custom-profile-marker {
      background: transparent;
      border: none;
    }
    .profile-marker {
      border-radius: 50%;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      border: 3px solid white;
      transition: all 0.3s ease;
      background: white;
    }
    .profile-marker.selected {
      transform: scale(1.2);
      box-shadow: 0 3px 12px rgba(59, 130, 246, 0.5);
      border: 3px solid #3b82f6;
      z-index: 1000 !important;
    }
    .profile-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .leaflet-routing-container {
      background: white;
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      max-width: 250px;
      max-height: 300px;
      overflow-y: auto;
    }
    .leaflet-routing-alt h2 {
      font-size: 14px;
      margin: 0 0 5px 0;
    }
    .leaflet-routing-alt h3 {
      font-size: 12px;
      margin: 5px 0;
    }
    @media (max-width: 768px) {
      .leaflet-routing-container {
        max-width: 200px;
      }
    }
  `;
  document.head.appendChild(style);
};

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
  const routingControlRef = useRef<any>(null);
  const [mapStyle, setMapStyle] = useState('streets'); // 'streets' or 'satellite'
  const { currentUser } = useAuth();

  // Initialize map and add styles
  useEffect(() => {
    // Add marker styles to the document
    addMarkerStyles();
    
    if (!mapRef.current) {
      // Create the map with a default view
      const mapInstance = L.map('map', {
        zoomControl: false, // We'll add zoom control manually in a better position
        attributionControl: false // We'll add attribution control manually
      }).setView([0, 0], 2);
      
      // Add OpenStreetMap tile layer - Streets style by default
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapInstance);
      
      mapRef.current = mapInstance;
      
      // Add zoom controls in a better position
      L.control.zoom({
        position: 'bottomright'
      }).addTo(mapInstance);
      
      // Add attribution in a better position
      L.control.attribution({
        position: 'bottomleft'
      }).addTo(mapInstance);
      
      // Add scale control
      L.control.scale({
        position: 'bottomleft'
      }).addTo(mapInstance);

      // Load Leaflet Routing Machine dynamically
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet-routing-machine/dist/leaflet-routing-machine.min.js';
      script.async = true;
      document.head.appendChild(script);
    }
    
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);
  
  // Update map style
  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance) return;
    
    // Remove existing layers
    mapInstance.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        mapInstance.removeLayer(layer);
      }
    });
    
    // Add new tile layer based on style
    if (mapStyle === 'streets') {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapInstance);
    } else if (mapStyle === 'satellite') {
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }).addTo(mapInstance);
    }
  }, [mapStyle]);
  
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
        <div style="text-align: center; padding: 5px;">
          <strong>${currentUser?.displayName || 'You'}</strong>
          <p style="margin: 5px 0;">Last updated:<br>${new Date(currentLocation.timestamp).toLocaleTimeString()}</p>
          ${currentLocation.accuracy ? `<p style="margin: 5px 0;">Accuracy: ${Math.round(currentLocation.accuracy)}m</p>` : ''}
        </div>
      `);
    } else {
      // Get profile image URL or use default
      const profileImageUrl = currentUser?.photoURL || 'https://api.dicebear.com/7.x/thumbs/svg?seed=' + (currentUser?.displayName || 'user');
      
      const marker = L.marker([latitude, longitude], { 
        icon: createProfileMarker(profileImageUrl, 48, false)
      })
        .addTo(mapInstance)
        .bindPopup(`
          <div style="text-align: center; padding: 5px;">
            <strong>${currentUser?.displayName || 'You'}</strong>
            <p style="margin: 5px 0;">Last updated:<br>${new Date(currentLocation.timestamp).toLocaleTimeString()}</p>
            ${currentLocation.accuracy ? `<p style="margin: 5px 0;">Accuracy: ${Math.round(currentLocation.accuracy)}m</p>` : ''}
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
  }, [currentLocation, selectedConnectionId, currentUser]);
  
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
      
      // Get profile image URL using DiceBear API
      const profileImageUrl = `https://api.dicebear.com/7.x/thumbs/svg?seed=${connection.displayName}`;
      
      // Create or update marker
      if (markersRef.current[connection.id]) {
        const marker = markersRef.current[connection.id];
        marker.setLatLng([latitude, longitude]);
        
        // Update icon if selection state changed
        marker.setIcon(createProfileMarker(profileImageUrl, 48, isSelected));
        
        // Update popup content
        marker.setPopupContent(`
          <div style="text-align: center; padding: 5px;">
            <strong>${connection.displayName}</strong>
            <p style="margin: 5px 0;">Last updated:<br>${new Date(connection.location.timestamp).toLocaleString()}</p>
          </div>
        `);
      } else {
        // Create new marker
        const marker = L.marker([latitude, longitude], {
          icon: createProfileMarker(profileImageUrl, 48, isSelected)
        })
          .addTo(mapInstance)
          .bindPopup(`
            <div style="text-align: center; padding: 5px;">
              <strong>${connection.displayName}</strong>
              <p style="margin: 5px 0;">Last updated:<br>${new Date(connection.location.timestamp).toLocaleString()}</p>
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
  
  // Update routing when selection changes
  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance || !currentLocation) return;
    
    // Remove existing routing control
    if (routingControlRef.current) {
      mapInstance.removeControl(routingControlRef.current);
      routingControlRef.current = null;
    }
    
    // If a connection is selected and has location, add routing
    if (selectedConnectionId) {
      const selectedConnection = connections.find(c => c.id === selectedConnectionId);
      
      if (selectedConnection?.location && window.L.Routing) {
        const userLatLng = L.latLng(currentLocation.latitude, currentLocation.longitude);
        const connectionLatLng = L.latLng(
          selectedConnection.location.latitude, 
          selectedConnection.location.longitude
        );
        
        // Create routing control
        const routingControl = window.L.Routing.control({
          waypoints: [userLatLng, connectionLatLng],
          routeWhileDragging: false,
          showAlternatives: false,
          fitSelectedRoutes: true,
          show: false, // Don't show the instructions by default
          lineOptions: {
            styles: [{ color: '#3b82f6', opacity: 0.8, weight: 5 }],
            extendToWaypoints: true,
            missingRouteTolerance: 0
          },
          router: window.L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1'
          })
        }).addTo(mapInstance);
        
        routingControlRef.current = routingControl;
        
        // Fit bounds with padding for mobile
        mapInstance.fitBounds([
          [currentLocation.latitude, currentLocation.longitude],
          [selectedConnection.location.latitude, selectedConnection.location.longitude]
        ], { 
          padding: [50, 50] 
        });
      } else if (!window.L.Routing) {
        // If routing library isn't loaded yet, use a simple line
        const userLatLng = [currentLocation.latitude, currentLocation.longitude];
        const connectionLatLng = [
          selectedConnection.location.latitude, 
          selectedConnection.location.longitude
        ];
        
        // Create polyline
        const polyline = L.polyline([userLatLng, connectionLatLng], {
          color: '#3b82f6',
          weight: 5,
          opacity: 0.8
        }).addTo(mapInstance);
        
        routingControlRef.current = polyline;
        
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
              toast.success('Location updated');
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
        
        {/* Toggle map style button */}
        <button
          onClick={() => setMapStyle(mapStyle === 'streets' ? 'satellite' : 'streets')}
          className="bg-card text-card-foreground shadow-md rounded-full p-3 hover:bg-accent"
          title={`Switch to ${mapStyle === 'streets' ? 'satellite' : 'streets'} view`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
            <line x1="8" y1="2" x2="8" y2="18"></line>
            <line x1="16" y1="6" x2="16" y2="22"></line>
          </svg>
        </button>
        
        {/* Toggle routing instructions button - only show when a connection is selected */}
        {selectedConnectionId && routingControlRef.current && window.L.Routing && (
          <button
            onClick={() => {
              if (routingControlRef.current._container.style.display === 'none') {
                routingControlRef.current._container.style.display = 'block';
              } else {
                routingControlRef.current._container.style.display = 'none';
              }
            }}
            className="bg-card text-card-foreground shadow-md rounded-full p-3 hover:bg-accent"
            title="Toggle routing instructions"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
} 