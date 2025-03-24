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
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

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
const createProfileMarker = (profileImageUrl: string, userName: string, isSelected: boolean, mood?: UserMood) => {
  const iconSize = isSelected ? 50 : 40;
  
  // Show mood emoji if available - positioned separately above the marker
  let moodHtml = '';
  if (mood) {
    console.log(`DEBUG - Creating marker with mood for ${userName}:`, mood);
    moodHtml = `
      <div style="
        position: absolute;
        top: -45px;
        left: 50%;
        transform: translateX(-50%);
        background: white;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        z-index: 1001;
        border: 3px solid ${isSelected ? '#0284c7' : '#3b82f6'};
        box-shadow: 0 4px 10px rgba(0,0,0,0.4);
        animation: floatAndPulse 3s ease-in-out infinite;
      ">
        ${mood.emoji || '😊'}
      </div>
      <style>
        @keyframes floatAndPulse {
          0% { 
            transform: translateX(-50%) translateY(0px) scale(1); 
            box-shadow: 0 4px 10px rgba(0,0,0,0.4);
          }
          50% { 
            transform: translateX(-50%) translateY(-8px) scale(1.1); 
            box-shadow: 0 8px 16px rgba(0,0,0,0.3);
          }
          100% { 
            transform: translateX(-50%) translateY(0px) scale(1); 
            box-shadow: 0 4px 10px rgba(0,0,0,0.4);
          }
        }
      </style>
    `;
  }
  
  return L.divIcon({
    className: 'custom-profile-marker',
    html: `
      ${moodHtml}
      <div style="
        width: ${iconSize}px;
        height: ${iconSize}px;
        border-radius: 50%;
        overflow: hidden;
        border: 4px solid ${isSelected ? '#0284c7' : 'white'};
        box-shadow: 0 3px 14px rgba(0,0,0,0.4);
        transition: all 0.3s ease;
        position: relative;
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
    popupAnchor: [0, -90]  // Fixed position for popup to appear above the marker
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

// Create a responsive popup template that's more compact and guaranteed to display
const createMoodPopupContent = (emoji, text, timestamp, name, lastActiveTime) => {
  return `
    <div style="padding: 12px; text-align: center; width: 100%;">
      <div style="font-size: 32px; margin-bottom: 8px;">${emoji}</div>
      <div style="font-weight: bold; font-size: 16px; margin-bottom: 6px;">${text}</div>
      <div style="border-top: 1px solid #eee; margin-top: 8px; padding-top: 8px;">
        <div style="font-size: 12px; color: #666;">
          <strong>${name}</strong><br/>
          Status: ${timestamp.split(',')[0]}<br/>
          Active: ${lastActiveTime.split(',')[0]}
        </div>
      </div>
    </div>
  `;
};

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
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [mapType, setMapType] = useState<'streets' | 'satellite'>('streets');
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [tileError, setTileError] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [activeMessage, setActiveMessage] = useState<string | null>(null);
  const [connectionMessages, setConnectionMessages] = useState<{[userId: string]: string}>({});
  const [messageTargetId, setMessageTargetId] = useState<string | null>(null);
  const { currentUser } = useAuth();
  
  // Replace the custom popup state and function with a simpler more reliable approach
  // Add a state for selected connection info for the modal
  const [selectedConnectionInfo, setSelectedConnectionInfo] = useState<{
    id: string;
    displayName: string;
    lastActive: string;
    hasMood: boolean;
    mood?: {
      emoji: string;
      text: string;
      timestamp: string;
    };
    formattedMood: string;
    freshMood?: {
      emoji: string;
      text: string;
      timestamp: string;
    };
  } | null>(null);
  
  // Replace the showCustomPopup function with a function to show the connection info modal
  const showConnectionInfo = (connection) => {
    console.log("DEBUG - Showing info for connection:", connection);
    console.log("DEBUG - Connection mood:", connection.mood);
    
    // Check if the user clicked on their own marker
    if (currentUser && connection.id === currentUser.uid) {
      console.log("DEBUG - User clicked their own marker, showing message modal");
      setMessageModalOpen(true);
      return;
    }
    
    // Get the connection data from the latest connections array
    // This ensures we have the most up-to-date mood info
    const latestConnectionData = connections.find(c => c.id === connection.id) || connection;
    console.log("DEBUG - Latest connection data:", latestConnectionData);
    
    // Attempt to fetch the latest mood data directly from Firestore
    const fetchLatestMood = async () => {
      try {
        const db = getFirestore();
        const userRef = doc(db, 'users', connection.userId);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log("DEBUG - Fresh Firestore data for user:", userData);
          
          if (userData.mood) {
            console.log("DEBUG - Found fresh mood data:", userData.mood);
            
            // Create a formatted mood string with the fresh data
            let moodText = '';
            if (userData.mood.emoji) moodText += userData.mood.emoji + ' ';
            if (userData.mood.text) moodText += userData.mood.text;
            
            // Add timestamp if available
            if (userData.mood.timestamp) {
              const timestamp = new Date(userData.mood.timestamp);
              moodText += ` (${timestamp.toLocaleString()})`;
            }
            
            console.log("DEBUG - Formatted fresh mood:", moodText);
            
            // Set the modal with fresh data
            setSelectedConnectionInfo({
              ...latestConnectionData,
              freshMood: userData.mood,
              formattedMood: moodText
            });
            
            // Also update the marker with this fresh mood data if it exists
            if (markersRef.current[connection.id] && mapRef.current) {
              const profilePic = latestConnectionData.photoURL || 
                `https://api.dicebear.com/7.x/thumbs/svg?seed=${latestConnectionData.displayName}`;
              
              // Update marker with fresh mood data
              const isSelected = connection.id === selectedConnectionId;
              markersRef.current[connection.id].setIcon(
                createProfileMarker(profilePic, latestConnectionData.displayName, isSelected, userData.mood)
              );
              
              console.log("DEBUG - Updated marker with fresh mood data:", userData.mood);
            }
            
            return; // We've handled the mood with fresh data
          }
        }
        
        // Fall back to existing data if fresh fetch fails
        fallbackMoodFormat();
        
      } catch (error) {
        console.error("Error fetching fresh mood data:", error);
        fallbackMoodFormat();
      }
    };
    
    // Fallback to use the data we already have
    const fallbackMoodFormat = () => {
      // Create a formatted mood string
      let moodInfo = 'No status';
      if (latestConnectionData.mood && (latestConnectionData.mood.emoji || latestConnectionData.mood.text)) {
        moodInfo = '';
        if (latestConnectionData.mood.emoji) moodInfo += latestConnectionData.mood.emoji + ' ';
        if (latestConnectionData.mood.text) moodInfo += latestConnectionData.mood.text;
        
        // Add timestamp if available
        if (latestConnectionData.mood.timestamp) {
          const timestamp = new Date(latestConnectionData.mood.timestamp);
          moodInfo += ` (${timestamp.toLocaleString()})`;
        }
      }
      
      console.log("DEBUG - Formatted mood (fallback):", moodInfo);
      
      setSelectedConnectionInfo({
        ...latestConnectionData,
        formattedMood: moodInfo
      });
    };
    
    // Fetch the latest mood data
    fetchLatestMood();
  };
  
  // Get Firestore reference
  const db = getFirestore();
  
  // Track tile loading attempts
  const loadingAttemptsRef = useRef(0);

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
  
  // Create or update tile layer with better error handling
  const createTileLayer = (map: L.Map, type: 'streets' | 'satellite' = 'streets') => {
    // Remove existing tile layer if any
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }
    
    // Reset tile error state
    setTileError(false);
    
    // Set loading state
    setIsMapLoading(true);
    
    let url: string, options: any;
    
    // Cartocdn is more reliable for mobile
    if (type === 'streets') {
      // Primary source - CartoDB Voyager
      url = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
      options = {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
        className: 'fast-tiles',
      };
    } else {
      // Satellite view
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      options = {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19,
        className: 'fast-tiles',
      };
    }
    
    // Add common options
    options = {
      ...options,
      updateWhenIdle: false,
      updateWhenZooming: false,
      keepBuffer: 8,
      tileSize: 256,
      crossOrigin: true,
    };
    
    // Create and add the tile layer
    const tileLayer = L.tileLayer(url, options).addTo(map);
    
    // Save reference
    tileLayerRef.current = tileLayer;
    
    // Handle successful loading
    tileLayer.on('load', () => {
      console.log('Tile layer loaded successfully');
      setIsMapLoading(false);
      loadingAttemptsRef.current = 0;
    });
    
    // Handle tile load errors - try OpenStreetMap as fallback if Carto fails
    tileLayer.on('tileerror', (error) => {
      console.error('Tile error:', error);
      loadingAttemptsRef.current += 1;
      
      // Only try fallback if we haven't reached max attempts
      if (loadingAttemptsRef.current < 3 && type === 'streets') {
        console.log('Trying fallback tile source');
        
        // Remove the error tile layer
        map.removeLayer(tileLayer);
        
        // Try OpenStreetMap directly as fallback
        const fallbackLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
          keepBuffer: 8,
          updateWhenIdle: false,
          updateWhenZooming: false,
          className: 'fast-tiles',
        }).addTo(map);
        
        tileLayerRef.current = fallbackLayer;
        
        fallbackLayer.on('load', () => {
          console.log('Fallback tile layer loaded');
          setIsMapLoading(false);
        });
        
        fallbackLayer.on('tileerror', () => {
          console.error('Fallback tile source also failed');
          setTileError(true);
          setIsMapLoading(false);
        });
      } else if (loadingAttemptsRef.current >= 3) {
        console.error('Max loading attempts reached');
        setTileError(true);
        setIsMapLoading(false);
      }
    });
    
    return tileLayer;
  };
  
  // Initialize map
  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      try {
        // Show loading state
        setIsMapLoading(true);
        
        // Create the map with reduced initial zoom level for faster loading
        const map = L.map(mapContainerRef.current, {
          center: currentLocation 
            ? [currentLocation.latitude, currentLocation.longitude] 
            : DEFAULT_CENTER,
          zoom: 7, // Lower initial zoom for faster loading
          maxBounds: PH_BOUNDS,
          maxBoundsViscosity: 1.0,
          minZoom: 5,
          preferCanvas: true, // Use canvas rendering for better performance
          renderer: L.canvas(),
          zoomControl: false,
          fadeAnimation: false,
          zoomAnimation: window.innerWidth > 768, // Disable zoom animation on mobile
          markerZoomAnimation: window.innerWidth > 768,
          attributionControl: true,
          tap: true,
        });
        
        // Add the tile layer with better error handling
        createTileLayer(map, 'streets');
        
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
          if (isMapLoading) {
            console.log('Forced loading complete after timeout');
            setIsMapLoading(false);
          }
        }, 5000);
        
        // Force a resize event after a delay to help mobile browsers calculate size correctly
        setTimeout(() => {
          if (map) {
            console.log('Triggering map resize event');
            map.invalidateSize();
          }
        }, 1000);
      } catch (error) {
        console.error('Error initializing map:', error);
        setIsMapLoading(false);
        setTileError(true);
      }
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
        
        /* Fix for tile loading issues on iOS */
        .leaflet-tile {
          transform: translate3d(0, 0, 0);
          backface-visibility: hidden;
        }
      `;
      document.head.appendChild(style);
    };
    
    addRoutingStyles();
    
    // Clean up on unmount
    return () => {
      if (mapRef.current) {
        console.log('Cleaning up map instance');
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);
  
  // Make sure map gets recalculated when device orientation changes
  useEffect(() => {
    const handleOrientationChange = () => {
      if (mapRef.current) {
        console.log('Orientation changed, invalidating map size');
        setTimeout(() => {
          mapRef.current?.invalidateSize();
        }, 200);
      }
    };
    
    window.addEventListener('orientationchange', handleOrientationChange);
    
    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);
  
  // Update map type (satellite or streets)
  const updateMapType = (map: L.Map, type: 'streets' | 'satellite') => {
    if (!map) return;
    
    // Show loading indicator during tile switch
    setIsMapLoading(true);
    
    // Create new tile layer
    createTileLayer(map, type);
    
    // Update button text
    const button = document.getElementById('map-type-toggle');
    if (button) {
      button.innerHTML = type === 'satellite' 
        ? `<img src="/map.svg" alt="Toggle Streets" style="width: 16px; height: 16px; margin-right: 6px;"/>Streets`
        : `<img src="/satellite.svg" alt="Toggle Satellite" style="width: 16px; height: 16px; margin-right: 6px;"/>Satellite`;
    }
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
    
    let marker; // Declare the marker variable at this scope so it's accessible throughout the useEffect

    // Update current user marker
    if (markersRef.current['currentUser']) {
      markersRef.current['currentUser'].setLatLng([latitude, longitude]);
      
      // Update the icon if needed for mood changes
      const userMood = connections.find(c => c.id === currentUser?.uid)?.mood;
      const userPhoto = currentUser?.photoURL || `https://api.dicebear.com/7.x/thumbs/svg?seed=${currentUser?.displayName || 'You'}`;
      markersRef.current['currentUser'].setIcon(createProfileMarker(userPhoto, 'You', false, userMood));
      
      // Update the click handler
      marker = markersRef.current['currentUser'];
      marker.off('click');
      marker.on('click', () => {
        const currentUserConnection = connections.find(c => c.id === currentUser?.uid);
        if (currentUserConnection) {
          showConnectionInfo(currentUserConnection);
        } else {
          // If we don't have a connection object for the current user, just open the message modal
          setMessageModalOpen(true);
        }
      });
    } else {
      // Create a profile marker for the current user
      const userPhoto = currentUser?.photoURL || `https://api.dicebear.com/7.x/thumbs/svg?seed=${currentUser?.displayName || 'You'}`;
      const userMood = connections.find(c => c.id === currentUser?.uid)?.mood;
      
      marker = L.marker([latitude, longitude], {
        icon: createProfileMarker(userPhoto, 'You', false, userMood),
        zIndexOffset: 1000
      }).addTo(mapRef.current);
      
      // Add click event to show mood popup or message modal
      marker.on('click', () => {
        const currentUserConnection = connections.find(c => c.id === currentUser?.uid);
        if (currentUserConnection) {
          showConnectionInfo(currentUserConnection);
        } else {
          // If we don't have a connection object for the current user, just open the message modal
          setMessageModalOpen(true);
        }
      });
      
      // Add to markers ref
      markersRef.current['currentUser'] = marker;
    }
    
    // Show active message if exists
    if (activeMessage && markersRef.current['currentUser'] && mapRef.current) {
      // Create or update popup with message
      const popup = L.popup({
        className: 'message-popup',
        closeButton: true,
        autoClose: false,
        closeOnEscapeKey: true,
        closeOnClick: false,
        offset: [0, -50]
      })
      .setLatLng([latitude, longitude])
      .setContent(`
        <div class="message-bubble">
          <p>${activeMessage}</p>
        </div>
      `)
      .openOn(mapRef.current);
      
      // Auto close after 10 seconds
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.closePopup(popup);
        }
      }, 10000);
    }
    
    // Center map on first location update
    if (!mapRef.current.getCenter().equals([latitude, longitude])) {
      mapRef.current.setView([latitude, longitude], DEFAULT_ZOOM, {
        animate: false // Disable animation for faster response
      });
    }
    
    // Force reload tiles if there was a tile error
    if (tileError && mapRef.current) {
      createTileLayer(mapRef.current, mapType);
    }
  }, [currentLocation, currentUser, tileError, mapType, activeMessage, selectedConnectionId, connections]);
  
  // Load user's active message from Firestore
  useEffect(() => {
    if (!currentUser) return;
    
    // Listen for the current user's message
    const messageRef = doc(db, 'userMessages', currentUser.uid);
    
    const unsubscribe = onSnapshot(messageRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        if (data.message && data.expiresAt && new Date(data.expiresAt) > new Date()) {
          // Only show message above your location if it's not targeted
          // or if it's targeted to the selected connection
          if (!data.targetUserId || data.targetUserId === selectedConnectionId) {
            setActiveMessage(data.message);
            
            // Set a timer to clear the message when it expires
            const expiryTime = new Date(data.expiresAt).getTime() - new Date().getTime();
            if (expiryTime > 0) {
              setTimeout(() => {
                setActiveMessage(null);
              }, expiryTime);
            }
          } else {
            setActiveMessage(null);
          }
        } else {
          setActiveMessage(null);
        }
      } else {
        setActiveMessage(null);
      }
    });
    
    return () => unsubscribe();
  }, [currentUser, db, selectedConnectionId]);
  
  // Listen for messages from connections
  useEffect(() => {
    if (!connections.length || !currentUser) return;
    
    const unsubscribes: (() => void)[] = [];
    const newMessages: {[userId: string]: string} = {};
    
    // Listen for each connection's message
    connections.forEach(connection => {
      const messageRef = doc(db, 'userMessages', connection.id);
      
      const unsubscribe = onSnapshot(messageRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          // Only show message if it's meant for current user (targetUserId is current user or null)
          if (data.message && data.expiresAt && new Date(data.expiresAt) > new Date() && 
              (!data.targetUserId || data.targetUserId === currentUser.uid)) {
            // Store the message with the connection ID as the key
            newMessages[connection.id] = data.message;
            setConnectionMessages(prev => ({
              ...prev,
              [connection.id]: data.message
            }));
            
            // Update marker popup if marker exists
            if (markersRef.current[connection.id] && mapRef.current && connection.location) {
              updateMarkerPopup(connection.id, data.message);
            }
            
            // Set a timer to clear the message when it expires
            const expiryTime = new Date(data.expiresAt).getTime() - new Date().getTime();
            if (expiryTime > 0) {
              setTimeout(() => {
                setConnectionMessages(prev => {
                  const updated = {...prev};
                  delete updated[connection.id];
                  return updated;
                });
                
                // Clear popup when message expires
                if (markersRef.current[connection.id] && mapRef.current) {
                  markersRef.current[connection.id].closePopup();
                }
              }, expiryTime);
            }
          }
        }
      });
      
      unsubscribes.push(unsubscribe);
    });
    
    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [connections, db, currentUser]);
  
  // Helper function to update marker popup with message
  const updateMarkerPopup = (connectionId: string, message: string) => {
    if (!mapRef.current || !markersRef.current[connectionId]) return;
    
    const marker = markersRef.current[connectionId];
    
    // Create message popup content
    const popupContent = `
      <div style="padding: 12px; text-align: center;">
        <div class="message-bubble">
          <p style="margin: 0; font-size: 14px;">${message}</p>
        </div>
      </div>
    `;
    
    // Use our custom popup
    showConnectionInfo(connections.find(c => c.id === connectionId));
  };
  
  // Update markers for connections and show their messages if available
  useEffect(() => {
    if (!mapRef.current || !currentLocation) return;
    const map = mapRef.current;
    
    // Process all connections
    allConnections.forEach(connection => {
      if (!connection.location) return;
      
      const { latitude, longitude } = connection.location;
      
      // Create or update marker
      if (markersRef.current[connection.id]) {
        markersRef.current[connection.id].setLatLng([latitude, longitude]);
        } else {
        const profilePic = connection.photoURL || `https://api.dicebear.com/7.x/thumbs/svg?seed=${connection.displayName}`;
        
        const marker = L.marker([latitude, longitude], {
          icon: createProfileMarker(profilePic, connection.displayName, connection.id === selectedConnectionId, connection.mood),
          zIndexOffset: connection.id === selectedConnectionId ? 900 : 800
        }).addTo(map);
        
        // Add click handler to show profile information popup
        marker.on('click', () => {
          showConnectionInfo(connection);
        });
        
        // Add to markers ref
        markersRef.current[connection.id] = marker;
      }
      
      // Update marker style if selected
      if (connection.id === selectedConnectionId) {
        const profilePic = connection.photoURL || `https://api.dicebear.com/7.x/thumbs/svg?seed=${connection.displayName}`;
        markersRef.current[connection.id].setIcon(
          createProfileMarker(profilePic, connection.displayName, true, connection.mood)
        );
        markersRef.current[connection.id].setZIndexOffset(900);
      } else {
        const profilePic = connection.photoURL || `https://api.dicebear.com/7.x/thumbs/svg?seed=${connection.displayName}`;
        markersRef.current[connection.id].setIcon(
          createProfileMarker(profilePic, connection.displayName, false, connection.mood)
        );
        markersRef.current[connection.id].setZIndexOffset(800);
      }
      
      // Show message if connection has an active message
      if (connectionMessages[connection.id]) {
        updateMarkerPopup(connection.id, connectionMessages[connection.id]);
      }
    });
    
    // Clean up markers for connections that are no longer in the list
    Object.keys(markersRef.current).forEach(id => {
      if (id === 'currentUser') return;
      
      const stillExists = allConnections.some(conn => conn.id === id);
      if (!stillExists) {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
    });
  }, [allConnections, selectedConnectionId, connectionMessages]);
  
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
          icon: createProfileMarker(profileImageUrl, connection.displayName, isSelected, connection.mood),
          zIndexOffset: isSelected ? 2000 : 0
        }).addTo(map);
        
        // Add click handler to show profile information popup
        marker.on('click', () => {
          showConnectionInfo(connection);
        });
        
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
    // Also forces a map refresh if tiles aren't loading
    if (tileError && mapRef.current) {
      createTileLayer(mapRef.current, mapType);
    }
    
    onUpdateLocation();
  };
  
  // Handle sending a new message
  const handleSendMessage = async () => {
    if (!message.trim() || !currentUser) return;
    
    try {
      // Create expiry time (1 minute from now)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 1);
      
      // Reference to the user's message document
      const messageRef = doc(db, 'userMessages', currentUser.uid);
      
      // Save message to Firestore with target info
      await setDoc(messageRef, {
        userId: currentUser.uid,
        message: message.trim(),
        timestamp: serverTimestamp(),
        expiresAt: expiresAt.toISOString(),
        targetUserId: messageTargetId || selectedConnectionId || null // Target the selected connection
      });
      
      // Clear local message input
      setMessage('');
      setMessageModalOpen(false);
      setMessageTargetId(null);
      
      toast.success(messageTargetId || selectedConnectionId 
        ? 'Message sent to connection'
        : 'Message shared with all connections');
    } catch (error) {
      console.error('Error sharing message:', error);
      toast.error('Failed to share message');
    }
  };
  
  // Add this debugger function
  const debugMood = (connectionId, mood) => {
    console.log(`DEBUG - Connection ID: ${connectionId}`);
    console.log(`DEBUG - Has mood: ${!!mood}`);
    if (mood) {
      console.log(`DEBUG - Mood emoji: ${mood.emoji}`);
      console.log(`DEBUG - Mood text: ${mood.text}`);
      console.log(`DEBUG - Mood timestamp: ${mood.timestamp}`);
    }
  };
  
  // Update the locationContext useEffect to add deeper debugging and fix mood data
  useEffect(() => {
    // Log all connections to check if mood data is present
    console.log("DEBUG - ALL CONNECTIONS:", connections);
    connections.forEach((connection, index) => {
      console.log(`DEBUG - CONNECTION ${index}:`, {
        id: connection.id,
        displayName: connection.displayName,
        mood: connection.mood ? {
          emoji: connection.mood.emoji,
          text: connection.mood.text,
          timestamp: connection.mood.timestamp
        } : 'No mood set',
        rawConnection: connection // Log the entire raw connection object
      });
    });
    
    // Directly fetch the latest mood data for each connection
    const fetchMoodData = async () => {
      if (!connections.length) return;
      
      try {
        const db = getFirestore();
        const updatedConnections = [...connections];
        let moodDataChanged = false;
        
        for (let i = 0; i < connections.length; i++) {
          const connection = connections[i];
          const userRef = doc(db, 'users', connection.userId);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log(`DEBUG - Direct fetch for ${connection.displayName}:`, userData.mood);
            
            if (userData.mood && (!connection.mood || 
                userData.mood.timestamp !== connection.mood.timestamp)) {
              updatedConnections[i] = {
                ...connection,
                mood: userData.mood
              };
              moodDataChanged = true;
              console.log(`DEBUG - Updated mood for ${connection.displayName}:`, userData.mood);
            }
          }
        }
        
        if (moodDataChanged) {
          console.log("DEBUG - Connections updated with fresh mood data:", updatedConnections);
          setConnections(updatedConnections);
        }
      } catch (error) {
        console.error("Error fetching mood data:", error);
      }
    };
    
    fetchMoodData();
  }, [connections]);
  
  return (
    <div className="relative w-full h-full">
      {/* Map container */}
      <div ref={mapContainerRef} className="w-full h-full absolute inset-0" />
      
      {/* Connection Info Modal */}
      {selectedConnectionInfo && (
        <div className="connection-modal">
          <div className="modal-content">
            <button className="close-button" onClick={() => setSelectedConnectionInfo(null)}>×</button>
            <h3>{selectedConnectionInfo.displayName}</h3>
            
            <div className="mood-container">
              <p className="mood-title">Mood:</p>
              
              {selectedConnectionInfo.freshMood ? (
                <div className="fresh-mood">
                  <p className="mood-emoji">{selectedConnectionInfo.freshMood.emoji}</p>
                  <p className="mood-text">{selectedConnectionInfo.freshMood.text}</p>
                  <p className="mood-time">
                    {new Date(selectedConnectionInfo.freshMood.timestamp).toLocaleString()}
                  </p>
                </div>
              ) : (
                <p className="mood-status">{selectedConnectionInfo.formattedMood}</p>
              )}
            </div>
            
            <p className="last-active">
              Last active: {selectedConnectionInfo.location ? new Date(selectedConnectionInfo.location.timestamp).toLocaleString() : 'Unknown'}
            </p>
          </div>
        </div>
      )}
      
      {/* Loading indicator */}
      {isMapLoading && (
        <div className="absolute inset-0 bg-gray-100 bg-opacity-60 flex items-center justify-center z-[999]">
          <div className="bg-white p-4 rounded-lg shadow-lg flex items-center space-x-3">
            <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
            <span>Loading map...</span>
          </div>
        </div>
      )}
      
      {/* Tile Error Message */}
      {tileError && (
        <div className="absolute inset-0 bg-gray-100 bg-opacity-80 flex items-center justify-center z-[999]">
          <div className="bg-white p-4 rounded-lg shadow-lg flex flex-col items-center space-y-3 max-w-xs mx-auto text-center">
            <div className="text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="font-bold text-lg">Map Loading Error</h3>
            <p className="text-sm text-gray-600">We couldn't load the map tiles. This might be due to network connectivity issues.</p>
            <button 
              onClick={handleRefreshLocation}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
            >
              Refresh Map
            </button>
          </div>
        </div>
      )}
      
      {/* Message Modal */}
      {messageModalOpen && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-[1001]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h2 className="font-bold text-lg">
                {messageTargetId || selectedConnectionId 
                  ? `Send Message to ${connections.find(c => c.id === (messageTargetId || selectedConnectionId))?.displayName || 'Connection'}`
                  : 'Share Your Status Message'}
              </h2>
              <button 
                onClick={() => setMessageModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-2">
                    {messageTargetId || selectedConnectionId 
                      ? `This message will be visible only to ${connections.find(c => c.id === (messageTargetId || selectedConnectionId))?.displayName}.`
                      : 'This message will appear above your location on the map for all your connections to see.'}
                  </p>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What's on your mind? Share a quick update..."
                    className="w-full border border-gray-300 rounded-md px-4 py-2 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    maxLength={200}
                  />
                  <div className="text-xs text-right text-gray-500">
                    {message.length}/200 characters
                  </div>
                </div>
                
                {/* Add connection selector if none selected */}
                {!messageTargetId && !selectedConnectionId && connections.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Choose who can see this message:
                    </label>
                    <div className="relative">
                      <select
                        className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        value={messageTargetId || ''}
                        onChange={(e) => setMessageTargetId(e.target.value || null)}
                      >
                        <option value="">Everyone</option>
                        {connections.map(conn => (
                          <option key={conn.id} value={conn.id}>
                            Only {conn.displayName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                
                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    onClick={() => {
                      setMessageModalOpen(false);
                      setMessageTargetId(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendMessage}
                    disabled={!message.trim()}
                    className={`px-4 py-2 rounded-md text-white ${message.trim() ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-300 cursor-not-allowed'}`}
                  >
                    Send Message
                  </button>
                </div>
              </div>
            </div>
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
      
      {/* Add message styles */}
      <style jsx global>{`
        .message-popup .leaflet-popup-content-wrapper {
          background: #0284c7;
          color: white;
          border-radius: 20px;
          padding: 0;
          box-shadow: 0 3px 14px rgba(0,0,0,0.4);
        }
        
        .message-popup .leaflet-popup-content {
          margin: 10px 14px;
          line-height: 1.4;
          font-weight: 500;
        }
        
        .message-popup .leaflet-popup-tip {
          background: #0284c7;
        }
        
        .message-popup .leaflet-popup-close-button {
          color: rgba(255,255,255,0.8);
        }
        
        .message-popup .leaflet-popup-close-button:hover {
          color: white;
        }
        
        .mood-popup {
          position: absolute !important;  /* Force absolute positioning */
          transform: none !important;     /* Prevent transformations */
          left: auto !important;          /* Reset left position */
          max-width: 250px !important;    /* Control max width */
          z-index: 2000 !important;       /* Ensure high z-index */
        }
        
        .mood-popup .leaflet-popup-content-wrapper {
          background: white;
          color: black;
          border-radius: 15px;
          padding: 0;
          box-shadow: 0 4px 15px rgba(0,0,0,0.4);
          border: 2px solid #3b82f6;
          overflow-x: hidden;
          max-height: 80vh;
          overflow-y: auto;
          width: auto !important;
          max-width: 240px !important;
        }
        
        .mood-popup .leaflet-popup-content {
          margin: 0;
          line-height: 1.3;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          padding: 0;
          width: auto !important;
        }
        
        .mood-popup .leaflet-popup-tip-container {
          left: 50%;
          margin-left: -10px;
          position: absolute;
          width: 20px;
          height: 20px;
          bottom: -20px;
        }
        
        .mood-popup .leaflet-popup-tip {
          background: white;
          border: 2px solid #3b82f6;
          box-shadow: 0 4px 15px rgba(0,0,0,0.4);
          width: 15px;
          height: 15px;
        }
        
        .mood-popup .leaflet-popup-close-button {
          color: #0284c7;
          font-size: 16px;
          padding: 4px;
          font-weight: bold;
          top: 3px;
          right: 3px;
        }
        
        .mood-popup .leaflet-popup-close-button:hover {
          color: #0369a1;
          background: none;
          text-decoration: none;
        }
        
        /* Animation for popup appearance - keep it simple */
        .leaflet-popup {
          opacity: 0;
          animation: simplePopupFadeIn 0.2s forwards;
        }
        
        @keyframes simplePopupFadeIn {
          to {
            opacity: 1;
          }
        }
        
        .message-bubble {
          max-width: 200px;
          word-wrap: break-word;
        }
        
        .mood-popup-fixed {
          z-index: 9999 !important;
        }
        
        .mood-popup-fixed .leaflet-popup-content-wrapper {
          background: white;
          color: black;
          border-radius: 12px;
          padding: 0;
          box-shadow: 0 6px 20px rgba(0,0,0,0.5);
          border: 3px solid #3b82f6;
          max-width: 250px;
        }
        
        .mood-popup-fixed .leaflet-popup-content {
          margin: 0;
          padding: 0;
          width: 100% !important;
          max-width: 100% !important;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        
        .mood-popup-fixed .leaflet-popup-tip {
          background: white;
          border: 2px solid #3b82f6;
          box-shadow: 0 6px 20px rgba(0,0,0,0.5);
        }
        
        .mood-popup-fixed .leaflet-popup-close-button {
          color: #000;
          font-size: 20px;
          font-weight: bold;
          padding: 5px;
          right: 5px;
          top: 5px;
        }
        
        .mood-popup-fixed .leaflet-popup-close-button:hover {
          color: #3b82f6;
          background: none;
        }
        
        /* Add this CSS right after the map container styles */
        .connection-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }
        
        .modal-content {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
          padding: 20px;
          width: 280px;
          max-width: 90vw;
          position: relative;
          animation: fadeIn 0.3s ease;
        }
        
        .close-button {
          position: absolute;
          top: 10px;
          right: 10px;
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.2s;
        }
        
        .close-button:hover {
          color: #000;
        }
        
        .modal-content h3 {
          text-align: center;
          margin-bottom: 15px;
          font-size: 20px;
          font-weight: bold;
        }
        
        .mood-container {
          text-align: center;
          margin-bottom: 20px;
        }
        
        .mood-title {
          font-weight: bold;
          margin-bottom: 5px;
          color: #666;
        }
        
        .mood-status {
          font-size: 16px;
        }
        
        .last-active {
          text-align: center;
          font-size: 14px;
          color: #666;
          border-top: 1px solid #eee;
          padding-top: 10px;
          margin-top: 10px;
        }
        
        .fresh-mood {
          display: flex;
          flex-direction: column;
          align-items: center;
          animation: fadeIn 0.3s ease;
        }
        
        .mood-emoji {
          font-size: 32px;
          margin-bottom: 5px;
        }
        
        .mood-text {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 5px;
        }
        
        .mood-time {
          font-size: 12px;
          color: #666;
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
} 