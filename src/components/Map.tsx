// @ts-nocheck - Skip type checking for the whole file - Leaflet types are incompatible
import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore - Ignore TypeScript error for Leaflet import
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
// @ts-ignore - Import polyline decorator
import 'leaflet-polylinedecorator';
import { ConnectionWithLocation, ConnectionRequest } from '../contexts/LocationContext';
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

// Philippines bounds coordinates
const PHILIPPINES_BOUNDS = {
  north: 21.120611, // Northern tip of Luzon
  south: 4.566667,  // Southern tip of Tawi-Tawi
  east: 126.604393, // Eastern tip of Mindanao
  west: 116.704153, // Western tip of Palawan
};

// Philippines center point (approximate)
const PHILIPPINES_CENTER = {
  lat: 12.8797,
  lng: 121.7740,
};

// Define the map boundaries for the Philippines
const PH_BOUNDS = L.latLngBounds(
  L.latLng(4.2158, 114.0952), // Southwest corner
  L.latLng(21.3217, 126.6040)  // Northeast corner
);

// Default center to Manila if location is not available
const DEFAULT_CENTER = [14.5995, 120.9842];
const DEFAULT_ZOOM = 13;

// Create a custom icon with the user's profile image
const createProfileMarker = (profileImageUrl: string, userName: string, isSelected: boolean) => {
  const iconSize = isSelected ? 50 : 40;
  
  return L.divIcon({
    className: 'custom-profile-marker',
    html: `
      <div style="
        width: ${iconSize}px;
        height: ${iconSize}px;
        border-radius: 50%;
        overflow: hidden;
        border: 4px solid ${isSelected ? '#0284c7' : 'white'};
        box-shadow: 0 3px 14px rgba(0,0,0,0.4);
        transition: all 0.3s ease;
      ">
        <img 
          src="${profileImageUrl}" 
          alt="${userName}" 
          style="width: 100%; height: 100%; object-fit: cover;"
          onerror="this.onerror=null; this.src='https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(userName)}';"
        />
      </div>
      <div style="
        background: ${isSelected ? '#0284c7' : 'white'};
        color: ${isSelected ? 'white' : 'black'};
        padding: 3px 8px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: bold;
        text-align: center;
        margin-top: 3px;
        box-shadow: 0 3px 14px rgba(0,0,0,0.2);
        max-width: 100px;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
      ">${userName}</div>
    `,
    iconSize: [iconSize, iconSize],
    iconAnchor: [iconSize/2, iconSize + 15],
    popupAnchor: [0, -iconSize - 15]
  });
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
  connectionRequests?: ConnectionRequest[]; // Make it optional for backward compatibility
  selectedConnectionId: string | null;
  onUpdateLocation: () => Promise<Location | undefined>;
}

// Add setPopupContent to Marker interface
declare module 'leaflet' {
  interface Marker {
    setPopupContent(content: string): this;
  }
}

export function Map({ 
  currentLocation, 
  connections, 
  connectionRequests = [], // Default to empty array
  selectedConnectionId,
  onUpdateLocation
}: MapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<{[key: string]: L.Marker}>({});
  const routingControlRef = useRef<L.Routing.Control | null>(null);
  const [mapType, setMapType] = useState<'streets' | 'satellite'>('streets');
  const [isMapLoading, setIsMapLoading] = useState(true);
  const { currentUser } = useAuth();

  // Combine connections with accepted connection requests
  const allConnections = [...connections];
  
  // Add connection requests to the connections list if they're not already present
  connectionRequests.forEach(request => {
    const existingConnection = connections.find(conn => conn.id === request.fromId);
    if (!existingConnection) {
      allConnections.push({
        id: request.fromId,
        userId: request.fromId,
        displayName: request.fromName,
        email: request.fromEmail,
        photoURL: null,
        location: null
      });
    }
  });
  
  // Initialize map
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      // Show loading state
      setIsMapLoading(true);
      
      // Define faster loading tile layer with smaller tile size
      const fastTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className: 'fast-tiles',
        updateWhenIdle: false,      // Update continuously while panning
        updateWhenZooming: false,   // Update continuously while zooming
        keepBuffer: 4,              // Keep more tiles in memory
        maxZoom: 19,
        crossOrigin: true,
      });
      
      // Create the map with reduced initial zoom level for faster loading
      const map = L.map(mapContainerRef.current, {
        center: currentLocation 
          ? [currentLocation.latitude, currentLocation.longitude] 
          : DEFAULT_CENTER,
        zoom: 10, // Lower initial zoom for faster loading
        maxBounds: PH_BOUNDS,
        maxBoundsViscosity: 1.0,
        minZoom: 7,
        preferCanvas: true, // Use canvas rendering for better performance
        renderer: L.canvas(),
        zoomControl: false,
        fadeAnimation: false,
        zoomAnimation: window.innerWidth > 768, // Disable zoom animation on mobile
        markerZoomAnimation: window.innerWidth > 768
      });
      
      // Add the tile layer to the map
      fastTileLayer.addTo(map);
      
      // Mark tiles loaded when ready
      fastTileLayer.on('load', () => {
        setIsMapLoading(false);
      });
      
      // Preload surrounding tiles for smoother experience
      setTimeout(() => {
        // Force loading tiles in advance
        const currentZoom = map.getZoom();
        const currentCenter = map.getCenter();
        
        // Zoom out slightly to load more tiles at once
        map.setZoom(currentZoom - 1);
        
        // Then zoom back in after a short delay
        setTimeout(() => {
          map.setZoom(currentZoom);
          
          // Zoom to actual location and proper zoom
          if (currentLocation) {
            map.setView([currentLocation.latitude, currentLocation.longitude], DEFAULT_ZOOM, {
              animate: false
            });
          }
        }, 100);
      }, 300);
      
      // Add map controls in better positions for mobile
      L.control.zoom({
        position: 'bottomright'
      }).addTo(map);
      
      // Add satellite/streets toggle
      const mapTypeControl = L.control({position: 'bottomleft'});
      mapTypeControl.onAdd = () => {
        const div = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
        div.innerHTML = `
          <button 
            id="map-type-toggle" 
            class="bg-white px-3 py-2 rounded-md shadow-md text-sm font-medium"
            style="display: flex; align-items: center;"
          >
            <img 
              src="/satellite.svg" 
              alt="Toggle Satellite" 
              style="width: 16px; height: 16px; margin-right: 6px;"
            />
            Satellite
          </button>
        `;
        
        div.onclick = () => {
          setMapType(currentType => {
            const newType = currentType === 'streets' ? 'satellite' : 'streets';
            updateMapType(map, newType);
            return newType;
          });
        };
        
        return div;
      };
      mapTypeControl.addTo(map);
      
      // Save map instance to ref
      mapRef.current = map;
      
      // Set loading to false after a timeout as fallback
      setTimeout(() => {
        setIsMapLoading(false);
      }, 2000);
    }
    
    // Add Leaflet routing machine CSS
    const addRoutingStyles = () => {
      const style = document.createElement('style');
      style.textContent = `
        .leaflet-routing-container {
          background: white;
          padding: 10px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          max-width: 300px;
          max-height: 300px;
          overflow-y: auto;
          font-size: 12px;
          z-index: 1000;
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
        
        /* Style for faster tile loading */
        .fast-tiles {
          will-change: transform;
          image-rendering: high-quality;
        }
      `;
      document.head.appendChild(style);
    };
    
    addRoutingStyles();
  }, [currentLocation]);
  
  // Update map type (satellite or streets)
  const updateMapType = (map: L.Map, type: 'streets' | 'satellite') => {
    // Show loading indicator during tile switch
    setIsMapLoading(true);
    
    // Remove all existing tile layers
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });
    
    // Add the appropriate tile layer
    let newTileLayer;
    
    if (type === 'satellite') {
      newTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        className: 'fast-tiles',
        updateWhenIdle: false,
        updateWhenZooming: false,
        keepBuffer: 4,
        maxZoom: 19,
        crossOrigin: true,
      }).addTo(map);
      
      // Update button text
      const button = document.getElementById('map-type-toggle');
      if (button) {
        button.innerHTML = `
          <img 
            src="/map.svg" 
            alt="Toggle Streets" 
            style="width: 16px; height: 16px; margin-right: 6px;"
          />
          Streets
        `;
      }
    } else {
      newTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className: 'fast-tiles',
        updateWhenIdle: false,
        updateWhenZooming: false,
        keepBuffer: 4,
        maxZoom: 19,
        crossOrigin: true,
      }).addTo(map);
      
      // Update button text
      const button = document.getElementById('map-type-toggle');
      if (button) {
        button.innerHTML = `
          <img 
            src="/satellite.svg" 
            alt="Toggle Satellite" 
            style="width: 16px; height: 16px; margin-right: 6px;"
          />
          Satellite
        `;
      }
    }
    
    // Hide loading indicator when tiles are loaded
    newTileLayer.on('load', () => {
      setIsMapLoading(false);
    });
    
    // Fallback to hide loading indicator after timeout
    setTimeout(() => {
      setIsMapLoading(false);
    }, 2000);
  };
  
  // Update current user location marker
  useEffect(() => {
    if (!mapRef.current || !currentLocation) return;
    
    const { latitude, longitude } = currentLocation;
    const latLng = L.latLng(latitude, longitude);
    
    // Check if the location is within the Philippines bounds
    if (!PH_BOUNDS.contains(latLng)) {
      console.warn('Location outside Philippines bounds, defaulting to Manila');
      return;
    }
    
    // Update current user marker
    if (markersRef.current['currentUser']) {
      markersRef.current['currentUser'].setLatLng([latitude, longitude]);
    } else {
      // Create a profile marker for the current user
      const userPhoto = currentUser?.photoURL || `https://api.dicebear.com/7.x/thumbs/svg?seed=${currentUser?.displayName || 'You'}`;
      const marker = L.marker([latitude, longitude], {
        icon: createProfileMarker(userPhoto, 'You', false),
        zIndexOffset: 1000
      }).addTo(mapRef.current);
      
      // Add to markers ref
      markersRef.current['currentUser'] = marker;
    }
    
    // Center map on first location update
    if (!mapRef.current.getCenter().equals([latitude, longitude])) {
      mapRef.current.setView([latitude, longitude], DEFAULT_ZOOM, {
        animate: false // Disable animation for faster response
      });
    }
  }, [currentLocation, currentUser]);
  
  // Helper function to create a simple route line
  const createRouteLine = (from: L.LatLng, to: L.LatLng, map: L.Map) => {
    // Create a polyline with decent styling that will be visible
    const routeLine = L.polyline([from, to], {
      color: '#0284c7',
      weight: 5,
      opacity: 0.7,
      lineJoin: 'round',
      zIndex: 900 // Ensure it stays on top
    }).addTo(map);
    
    // Add directional arrow
    const decorator = L.polylineDecorator(routeLine, {
      patterns: [
        {
          offset: '50%', 
          repeat: 0, 
          symbol: L.Symbol.arrowHead({
            pixelSize: 15,
            polygon: false,
            pathOptions: {
              stroke: true,
              weight: 3,
              color: '#0284c7',
              opacity: 0.8
            }
          })
        }
      ]
    }).addTo(map);
    
    // Fit map bounds to include both points
    map.fitBounds(L.latLngBounds([from, to]), {
      padding: [50, 50], // Add padding around the bounds
      animate: false // Disable animation for faster response
    });
    
    return { routeLine, decorator };
  };
  
  // Update connection markers and create route to selected connection
  useEffect(() => {
    if (!mapRef.current) return;
    
    const map = mapRef.current;
    
    // Remove existing routing control if it exists
    if (routingControlRef.current) {
      map.removeControl(routingControlRef.current);
      routingControlRef.current = null;
    }
    
    // Clear existing connection markers
    Object.keys(markersRef.current).forEach(key => {
      if (key !== 'currentUser') {
        map.removeLayer(markersRef.current[key]);
        delete markersRef.current[key];
      }
    });
    
    // Add markers for connections with locations
    allConnections.forEach(connection => {
      if (connection.location) {
        const { latitude, longitude } = connection.location;
        const latLng = L.latLng(latitude, longitude);
        
        // Check if location is within bounds
        if (!PH_BOUNDS.contains(latLng)) {
          console.warn(`Connection ${connection.displayName} location outside Philippines bounds, skipping`);
          return;
        }
        
        // Create profile image URL
        const profileImageUrl = connection.photoURL || 
          `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(connection.displayName)}`;
        
        // Create marker with profile image
        const isSelected = selectedConnectionId === connection.id;
        const marker = L.marker([latitude, longitude], {
          icon: createProfileMarker(profileImageUrl, connection.displayName, isSelected),
          zIndexOffset: isSelected ? 2000 : 0
        }).addTo(map);
        
        // Add tooltip
        marker.bindTooltip(`${connection.displayName} - Last update: ${new Date(connection.location.timestamp).toLocaleTimeString()}`);
        
        // Store marker reference
        markersRef.current[connection.id] = marker;
      }
    });
    
    // Store for any manual routes created
    let manualRoutes = [];
    
    // If there's a selected connection with location, create a route
    if (selectedConnectionId && currentLocation) {
      const selectedConnection = allConnections.find(c => c.id === selectedConnectionId);
      
      if (selectedConnection?.location) {
        const { latitude: fromLat, longitude: fromLng } = currentLocation;
        const { latitude: toLat, longitude: toLng } = selectedConnection.location;
        
        // Source and destination coordinates
        const from = L.latLng(fromLat, fromLng);
        const to = L.latLng(toLat, toLng);
        
        // Check if both points are within Philippines bounds
        if (PH_BOUNDS.contains(from) && PH_BOUNDS.contains(to)) {
          try {
            // Always use road routing for all devices (mobile and desktop)
            const routingControl = L.Routing.control({
              waypoints: [from, to],
              routeWhileDragging: false,
              showAlternatives: false,
              addWaypoints: false,
              fitSelectedRoutes: true,
              createMarker: () => null, // Don't create default markers
              lineOptions: {
                styles: [
                  {color: '#0284c7', opacity: 0.8, weight: 6},
                  {color: 'white', opacity: 0.3, weight: 2}
                ],
                extendToWaypoints: true,
                missingRouteTolerance: 0
              }
            }).addTo(map);
            
            // For mobile, make the routing container smaller or hidden
            if (window.innerWidth < 768) {
              setTimeout(() => {
                const container = document.querySelector('.leaflet-routing-container');
                if (container) {
                  // Hide instructions but keep the routing line
                  (container as HTMLElement).style.display = 'none';
                }
              }, 100);
            } else {
              // Style the routing container for desktop experience
              setTimeout(() => {
                const container = document.querySelector('.leaflet-routing-container');
                if (container) {
                  (container as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                  (container as HTMLElement).style.width = '280px';
                  (container as HTMLElement).style.maxHeight = '300px';
                  (container as HTMLElement).style.overflowY = 'auto';
                  (container as HTMLElement).style.fontSize = '12px';
                  (container as HTMLElement).style.zIndex = '1000';
                }
              }, 500);
            }
            
            // Store routing control reference
            routingControlRef.current = routingControl;
            
            // If routing fails, create a simple line as fallback
            routingControl.on('routingerror', () => {
              console.warn('Routing failed, creating simple line instead');
              const { routeLine, decorator } = createRouteLine(from, to, map);
              manualRoutes.push({ line: routeLine, decorator });
            });
            
            // Fit map bounds to include both points
            map.fitBounds(L.latLngBounds([from, to]), {
              padding: [50, 50],
              animate: false // Disable animation for faster response
            });
          } catch (error) {
            console.error('Error creating route:', error);
            // Fallback to simple line if routing fails
            const { routeLine, decorator } = createRouteLine(from, to, map);
            manualRoutes.push({ line: routeLine, decorator });
          }
        } else {
          console.warn('Route endpoints outside Philippines bounds');
        }
      }
    }
    
    // Cleanup function to remove manual routes
    return () => {
      if (manualRoutes.length > 0) {
        manualRoutes.forEach(route => {
          if (map) {
            if (route.line) map.removeLayer(route.line);
            if (route.decorator) map.removeLayer(route.decorator);
          }
        });
      }
    };
  }, [allConnections, selectedConnectionId, currentLocation]);
  
  // Utility function to trigger location update
  const handleRefreshLocation = () => {
    onUpdateLocation();
  };
  
  return (
    <div className="relative w-full h-full">
      {/* Map container */}
      <div ref={mapContainerRef} className="w-full h-full absolute inset-0" />
      
      {/* Loading indicator */}
      {isMapLoading && (
        <div className="absolute inset-0 bg-gray-100 bg-opacity-60 flex items-center justify-center z-[999]">
          <div className="bg-white p-4 rounded-lg shadow-lg flex items-center space-x-3">
            <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
            <span>Loading map...</span>
          </div>
        </div>
      )}
      
      {/* Refresh location button */}
      <button 
        onClick={handleRefreshLocation}
        className="absolute bottom-4 right-4 bg-white rounded-full p-3 shadow-md z-[1000]"
        aria-label="Refresh location"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className="h-5 w-5"
        >
          <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c-2.85 0-5.485-.89-7.636-2.404M3 12a9 9 0 0 1 9-9m-9 9c0-2.85.89-5.485 2.404-7.636M12 3h9" />
        </svg>
      </button>
    </div>
  );
} 