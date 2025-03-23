import { createContext, useContext, useState, useEffect } from 'react';
import { getFirestore, doc, onSnapshot, updateDoc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from './AuthContext';

// Define the shape of location data
export interface Location {
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number;
}

// Define what a connection with location looks like
export interface ConnectionWithLocation {
  id: string;
  email: string;
  displayName: string;
  location: Location | null;
  status: 'pending' | 'accepted' | 'rejected';
}

// Define what a connection request looks like
export interface ConnectionRequest {
  id: string;
  fromEmail: string;
  fromName: string;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: string;
}

// Create the context with default values
interface LocationContextType {
  currentLocation: Location | null;
  connections: ConnectionWithLocation[];
  connectionRequests: ConnectionRequest[];
  isTracking: boolean;
  updateLocation: () => Promise<Location | undefined>;
  startTrackingLocation: () => void;
  stopTrackingLocation: () => void;
  sendConnectionRequest: (email: string) => Promise<boolean>;
  respondToConnectionRequest: (requestId: string, accept: boolean) => Promise<boolean>;
  searchUsersByEmail: (query: string) => Promise<{id: string, email: string, displayName: string}[]>;
}

// Create the context with default values
const LocationContext = createContext<LocationContextType>({
  currentLocation: null,
  connections: [],
  connectionRequests: [],
  isTracking: false,
  updateLocation: async () => undefined,
  startTrackingLocation: () => {},
  stopTrackingLocation: () => {},
  sendConnectionRequest: async () => false,
  respondToConnectionRequest: async () => false,
  searchUsersByEmail: async () => [],
});

// Provider component that wraps the app and provides the context value
export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [connections, setConnections] = useState<ConnectionWithLocation[]>([]);
  const [connectionRequests, setConnectionRequests] = useState<ConnectionRequest[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingId, setTrackingId] = useState<number | null>(null);
  const { currentUser } = useAuth();
  const db = getFirestore();

  // Function to get the current location using the Geolocation API
  const updateLocation = async (): Promise<Location | undefined> => {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by your browser');
      return;
    }

    try {
      // Clear the cached position data to force a fresh location
      // For mobile browsers, this forces the device to get a fresh GPS reading
      if ('clearWatch' in navigator.geolocation) {
        const tempWatchId = navigator.geolocation.watchPosition(() => {});
        navigator.geolocation.clearWatch(tempWatchId);
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve, 
          reject, 
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0 // Force fresh location
          }
        );
      });

      const { latitude, longitude, accuracy } = position.coords;
      const timestamp = new Date().toISOString();
      
      console.log('Location updated:', { 
        latitude, 
        longitude, 
        accuracy,
        coords: position.coords
      });
      
      const locationData = {
        latitude,
        longitude,
        accuracy,
        timestamp
      };

      // Update state
      setCurrentLocation(locationData);

      // If user is logged in, update their location in Firestore
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          location: locationData
        });
      }

      return locationData;
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  // Function to start continuous location tracking
  const startTrackingLocation = () => {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by your browser');
      return;
    }

    // Stop any existing tracking
    stopTrackingLocation();

    // Start a new tracking session
    const id = window.setInterval(updateLocation, 60000); // Update every minute
    setTrackingId(id);
    setIsTracking(true);

    // Get initial location immediately
    updateLocation();
  };

  // Function to stop location tracking
  const stopTrackingLocation = () => {
    if (trackingId !== null) {
      clearInterval(trackingId);
      setTrackingId(null);
      setIsTracking(false);
    }
  };

  // Function to search for users by email prefix
  const searchUsersByEmail = async (query: string): Promise<{id: string, email: string, displayName: string}[]> => {
    if (!query || query.length < 3 || !currentUser) return [];

    try {
      const usersRef = collection(db, 'users');
      
      // This is simplified - in a real app you would use a proper search mechanism
      // Firebase doesn't support startsWith queries directly, this is just an example
      const querySnapshot = await getDocs(collection(db, 'users'));
      
      const results: {id: string, email: string, displayName: string}[] = [];
      
      querySnapshot.forEach((doc) => {
        const userData = doc.data() as { 
          email?: string;
          displayName?: string;
        };
        // Only include users whose email starts with the query and is not the current user
        if (userData.email && 
            userData.email.toLowerCase().includes(query.toLowerCase()) && 
            doc.id !== currentUser.uid) {
          results.push({
            id: doc.id,
            email: userData.email,
            displayName: userData.displayName || userData.email
          });
        }
      });
      
      return results;
    } catch (error) {
      console.error('Error searching for users:', error);
      return [];
    }
  };

  // Function to send a connection request
  const sendConnectionRequest = async (email: string): Promise<boolean> => {
    if (!currentUser) return false;

    try {
      // Find user by email
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        throw new Error('User not found');
      }
      
      const targetUser = querySnapshot.docs[0];
      const targetUserId = targetUser.id;
      
      if (targetUserId === currentUser.uid) {
        throw new Error('You cannot connect with yourself');
      }
      
      // Check if a request already exists
      const requestsRef = collection(db, 'users', targetUserId, 'connectionRequests');
      const existingRequestQuery = query(requestsRef, where('fromId', '==', currentUser.uid));
      const existingRequests = await getDocs(existingRequestQuery);
      
      if (!existingRequests.empty) {
        throw new Error('Connection request already sent');
      }
      
      // Get current user data for the request
      const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
      const currentUserData = currentUserDoc.data();
      
      if (!currentUserData) {
        throw new Error('Your user profile is not complete');
      }
      
      // Create the connection request
      const requestRef = doc(collection(db, 'users', targetUserId, 'connectionRequests'));
      await setDoc(requestRef, {
        id: requestRef.id,
        fromId: currentUser.uid,
        fromEmail: currentUserData.email,
        fromName: currentUserData.displayName || currentUserData.email,
        status: 'pending',
        timestamp: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      console.error('Error sending connection request:', error);
      throw error;
    }
  };

  // Function to respond to a connection request
  const respondToConnectionRequest = async (requestId: string, accept: boolean): Promise<boolean> => {
    if (!currentUser) return false;

    try {
      // Get the request
      const requestRef = doc(db, 'users', currentUser.uid, 'connectionRequests', requestId);
      const requestSnap = await getDoc(requestRef);
      
      if (!requestSnap.exists()) {
        throw new Error('Request not found');
      }
      
      const requestData = requestSnap.data();
      
      // Update the request status
      await updateDoc(requestRef, {
        status: accept ? 'accepted' : 'rejected'
      });
      
      if (accept) {
        // Add to current user's connections
        const currentUserConnectionsRef = doc(db, 'users', currentUser.uid);
        const currentUserDoc = await getDoc(currentUserConnectionsRef);
        const currentUserConnections = currentUserDoc.data()?.connections || [];
        
        // Only add if not already connected
        if (!currentUserConnections.includes(requestData.fromId)) {
          await updateDoc(currentUserConnectionsRef, {
            connections: [...currentUserConnections, requestData.fromId]
          });
        }
        
        // Add to requester's connections
        const requesterConnectionsRef = doc(db, 'users', requestData.fromId);
        const requesterDoc = await getDoc(requesterConnectionsRef);
        const requesterConnections = requesterDoc.data()?.connections || [];
        
        // Only add if not already connected
        if (!requesterConnections.includes(currentUser.uid)) {
          await updateDoc(requesterConnectionsRef, {
            connections: [...requesterConnections, currentUser.uid]
          });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error responding to connection request:', error);
      throw error;
    }
  };

  // Effect to listen for user's connections when user changes
  useEffect(() => {
    if (!currentUser) {
      setConnections([]);
      setConnectionRequests([]);
      return;
    }

    // Listen for connection requests
    const requestsUnsubscribe = onSnapshot(
      collection(db, 'users', currentUser.uid, 'connectionRequests'),
      (snapshot) => {
        const requests: ConnectionRequest[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          requests.push({
            id: doc.id,
            fromEmail: data.fromEmail,
            fromName: data.fromName,
            status: data.status,
            timestamp: data.timestamp
          });
        });
        setConnectionRequests(requests);
      },
      (error) => {
        console.error('Error fetching connection requests:', error);
      }
    );

    // Get current user's connections
    const userRef = doc(db, 'users', currentUser.uid);
    
    const userUnsubscribe = onSnapshot(userRef, async (userDoc) => {
      const userData = userDoc.data();
      if (!userData) return;
      
      const userConnections = userData.connections || [];
      const connectionDetails: ConnectionWithLocation[] = [];
      
      // For each connection ID, get their details and location
      for (const connectionId of userConnections) {
        try {
          const connectionRef = doc(db, 'users', connectionId);
          const connectionSnap = await getDoc(connectionRef);
          
          if (connectionSnap.exists()) {
            const connectionData = connectionSnap.data();
            connectionDetails.push({
              id: connectionId,
              email: connectionData.email,
              displayName: connectionData.displayName || connectionData.email,
              location: connectionData.location || null,
              status: 'accepted'
            });
          }
        } catch (error) {
          console.error(`Error fetching connection ${connectionId}:`, error);
        }
      }
      
      setConnections(connectionDetails);
    });

    return () => {
      requestsUnsubscribe();
      userUnsubscribe();
    };
  }, [currentUser, db]);

  // The value to provide in the context
  const value = {
    currentLocation,
    connections,
    connectionRequests,
    isTracking,
    updateLocation,
    startTrackingLocation,
    stopTrackingLocation,
    sendConnectionRequest,
    respondToConnectionRequest,
    searchUsersByEmail
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

// Custom hook to use the Location context
export function useLocation() {
  return useContext(LocationContext);
} 