import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../services/firebase';
import { 
  doc, 
  collection, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  getDoc,
  getDocs,
  addDoc,
  arrayUnion,
  Timestamp,
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore';
import { toast } from 'sonner';

// Define interfaces for the context
interface Location {
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number;
}

export interface ConnectionWithLocation {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  location: Location | null;
}

export interface ConnectionRequest {
  id: string;
  fromId: string;
  fromName: string;
  fromEmail: string;
  toId: string;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: string;
}

export interface LocationContextType {
  currentLocation: Location | null;
  connections: ConnectionWithLocation[];
  connectionRequests: ConnectionRequest[];
  isTracking: boolean;
  updateLocation: () => Promise<Location | undefined>;
  startTrackingLocation: () => void;
  stopTrackingLocation: () => void;
  sendConnectionRequest: (emailOrId: string) => Promise<void>;
  respondToConnectionRequest: (requestId: string, accept: boolean) => Promise<void>;
  searchUsersByEmail: (email: string) => Promise<{id: string, email: string, displayName: string}[]>;
  updateConnectionNickname: (connectionId: string, nickname: string) => Promise<void>;
  updateConnectionPhoto: (connectionId: string, photoURL: string) => Promise<void>;
  removeConnection: (connectionId: string) => Promise<void>;
}

interface LocationProviderProps {
  children: React.ReactNode;
}

// Create context
const LocationContext = createContext<LocationContextType | null>(null);

// Hook to use the context
export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}

// Provider component
export function LocationProvider({ children }: LocationProviderProps) {
  const { currentUser } = useAuth();
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [connections, setConnections] = useState<ConnectionWithLocation[]>([]);
  const [connectionRequests, setConnectionRequests] = useState<ConnectionRequest[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingInterval, setTrackingInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Get current location
  const updateLocation = async (): Promise<Location | undefined> => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
      });
      
      const { latitude, longitude, accuracy } = position.coords;
      
      // Format location data
      const locationData = {
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
        accuracy
      };
      
      // Update state
      setCurrentLocation(locationData);
      
      // If user is logged in, update their location in Firestore
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, {
          location: {
            latitude,
            longitude,
            timestamp: serverTimestamp(),
            accuracy
          }
        });
      }
      
      return locationData;
    } catch (error: any) {
      if (error.code === 1) { // Permission denied
        toast.error('Location permission denied. Please enable location services.');
      } else {
        toast.error(`Error getting location: ${error.message}`);
        console.error('Error getting location:', error);
      }
    }
  };
  
  // Start tracking location at intervals
  const startTrackingLocation = () => {
    if (isTracking) return;
    
    // Update location immediately
    updateLocation();
    
    // Set up interval for continuous updates
    const interval = setInterval(updateLocation, 60000); // Update every minute
    setTrackingInterval(interval);
    setIsTracking(true);
    
    toast.success('Location tracking started');
  };
  
  // Stop tracking location
  const stopTrackingLocation = () => {
    if (trackingInterval) {
      clearInterval(trackingInterval);
      setTrackingInterval(null);
    }
    
    setIsTracking(false);
    toast.success('Location tracking stopped');
  };
  
  // Send connection request
  const sendConnectionRequest = async (emailOrId: string) => {
    if (!currentUser) {
      throw new Error('You must be logged in to send a connection request');
    }
    
    if (emailOrId.toLowerCase() === currentUser.email?.toLowerCase()) {
      throw new Error('You cannot send a connection request to yourself');
    }
    
    try {
      // Find user by email or ID
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', emailOrId.toLowerCase()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        throw new Error('User not found. Make sure the email address or ID is correct.');
      }
      
      const recipientDoc = querySnapshot.docs[0];
      const recipientId = recipientDoc.id;
      
      // Check if a connection request already exists
      const requestsRef = collection(db, 'connectionRequests');
      const existingRequestQuery = query(
        requestsRef, 
        where('fromId', '==', currentUser.uid),
        where('toId', '==', recipientId)
      );
      
      const existingRequests = await getDocs(existingRequestQuery);
      
      if (!existingRequests.empty) {
        const existingRequest = existingRequests.docs[0].data();
        if (existingRequest.status === 'pending') {
          throw new Error('You already have a pending request to this user');
        } else if (existingRequest.status === 'accepted') {
          throw new Error('You are already connected with this user');
        }
      }
      
      // Check if recipient already sent a request
      const reciprocalRequestQuery = query(
        requestsRef,
        where('fromId', '==', recipientId),
        where('toId', '==', currentUser.uid)
      );
      
      const reciprocalRequests = await getDocs(reciprocalRequestQuery);
      
      if (!reciprocalRequests.empty) {
        const reciprocalRequest = reciprocalRequests.docs[0].data();
        if (reciprocalRequest.status === 'pending') {
          throw new Error('This user has already sent you a connection request. Check your requests tab.');
        } else if (reciprocalRequest.status === 'accepted') {
          throw new Error('You are already connected with this user');
        }
      }
      
      // Create connection request
      await addDoc(requestsRef, {
        fromId: currentUser.uid,
        fromName: currentUser.displayName || 'Anonymous',
        fromEmail: currentUser.email,
        toId: recipientId,
        status: 'pending',
        timestamp: Timestamp.now()
      });
    } catch (error) {
      console.error('Error sending connection request:', error);
      throw error;
    }
  };
  
  // Respond to connection request
  const respondToConnectionRequest = async (requestId: string, accept: boolean) => {
    if (!currentUser) {
      throw new Error('You must be logged in to respond to a connection request');
    }
    
    try {
      const requestRef = doc(db, 'connectionRequests', requestId);
      const requestDoc = await getDoc(requestRef);
      
      if (!requestDoc.exists()) {
        throw new Error('Connection request not found');
      }
      
      const requestData = requestDoc.data();
      
      if (requestData.toId !== currentUser.uid) {
        throw new Error('You are not authorized to respond to this request');
      }
      
      // Update request status
      await updateDoc(requestRef, {
        status: accept ? 'accepted' : 'rejected',
        respondedAt: serverTimestamp() // Add timestamp when responded
      });
      
      // If accepted, add to connections for both users
      if (accept) {
        const fromUserRef = doc(db, 'users', requestData.fromId);
        const toUserRef = doc(db, 'users', currentUser.uid);
        
        // Get user data
        const fromUserDoc = await getDoc(fromUserRef);
        const toUserDoc = await getDoc(toUserRef);
        
        if (!fromUserDoc.exists() || !toUserDoc.exists()) {
          throw new Error('User data not found');
        }
        
        const fromUserData = fromUserDoc.data();
        const toUserData = toUserDoc.data();
        
        // Check if connections arrays exist, create them if not
        const fromConnections = fromUserData.connections || [];
        const toConnections = toUserData.connections || [];
        
        // Prepare connection objects
        const fromConnectionObj = {
          id: currentUser.uid,
          displayName: currentUser.displayName || 'Anonymous',
          email: currentUser.email
        };
        
        const toConnectionObj = {
          id: requestData.fromId,
          displayName: requestData.fromName,
          email: requestData.fromEmail
        };
        
        // Check if connection already exists to avoid duplicates
        const fromHasConnection = fromConnections.some((conn: any) => conn.id === fromConnectionObj.id);
        const toHasConnection = toConnections.some((conn: any) => conn.id === toConnectionObj.id);
        
        // Add connection to sender's connections if not exists
        if (!fromHasConnection) {
          await updateDoc(fromUserRef, {
            connections: arrayUnion(fromConnectionObj)
          });
        }
        
        // Add connection to recipient's connections if not exists
        if (!toHasConnection) {
          await updateDoc(toUserRef, {
            connections: arrayUnion(toConnectionObj)
          });
        }
        
        // Update local state
        // Show immediate feedback by adding connection to local state
        if (!toHasConnection) {
          setConnections(prev => [
            ...prev,
            {
              id: requestData.fromId,
              userId: requestData.fromId,
              displayName: requestData.fromName,
              email: requestData.fromEmail,
              photoURL: null,
              location: null
            }
          ]);
        }
      }
      
      // Show success notification for the user
      toast.success(accept ? 'Connection accepted! You can now see each other on the map.' : 'Connection request rejected');
    } catch (error) {
      console.error('Error responding to connection request:', error);
      throw error;
    }
  };
  
  // Search users by email
  const searchUsersByEmail = async (email: string): Promise<{id: string, email: string, displayName: string}[]> => {
    if (!currentUser) {
      throw new Error('You must be logged in to search users');
    }
    
    if (email.length < 3) {
      return [];
    }
    
    try {
      // Search for users with email or display name containing query
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);
      
      const results = querySnapshot.docs
        .map(doc => ({ 
          id: doc.id, 
          ...doc.data() as { email: string, displayName: string }
        }))
        .filter(user => 
          user.id !== currentUser.uid && // Exclude current user
          (
            user.email?.toLowerCase().includes(email.toLowerCase()) ||
            user.displayName?.toLowerCase().includes(email.toLowerCase())
          )
        )
        .slice(0, 5); // Limit to 5 results
      
      return results;
    } catch (error) {
      console.error('Error searching users:', error);
      throw error;
    }
  };
  
  // Update connection nickname
  const updateConnectionNickname = async (connectionId: string, nickname: string) => {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    
    try {
      // Get the connection document reference
      const connectionRef = doc(db, 'connections', connectionId);
      
      // Update the connection document with the new nickname
      await updateDoc(connectionRef, {
        displayName: nickname
      });
      
      // Update local state
      setConnections(prev => 
        prev.map(conn => 
          conn.id === connectionId 
            ? { ...conn, displayName: nickname } 
            : conn
        )
      );
      
      console.log(`Nickname updated for connection ${connectionId}`);
    } catch (error) {
      console.error('Error updating connection nickname:', error);
      throw error;
    }
  };
  
  /**
   * Update connection profile photo
   */
  const updateConnectionPhoto = async (connectionId: string, photoURL: string) => {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    
    try {
      // Get the connection document reference
      const connectionRef = doc(db, 'connections', connectionId);
      
      // Update the connection document with the new photo URL
      await updateDoc(connectionRef, {
        photoURL: photoURL
      });
      
      // Update local state
      setConnections(prev => 
        prev.map(conn => 
          conn.id === connectionId 
            ? { ...conn, photoURL: photoURL } 
            : conn
        )
      );
      
      console.log(`Photo updated for connection ${connectionId}`);
    } catch (error) {
      console.error('Error updating connection photo:', error);
      throw error;
    }
  };
  
  // Listen for changes in the current user's data
  useEffect(() => {
    if (!currentUser) {
      setConnections([]);
      setConnectionRequests([]);
      setCurrentLocation(null);
      return;
    }
    
    const userRef = doc(db, 'users', currentUser.uid);
    
    // Listen for user document changes
    const unsubscribeUser = onSnapshot(userRef, async (docSnapshot) => {
      if (docSnapshot.exists()) {
        const userData = docSnapshot.data();
        
        console.log("User data updated:", userData); // Debug log
        
        // If user has connections, fetch their current locations
        if (userData.connections && Array.isArray(userData.connections)) {
          console.log("Connections found:", userData.connections.length); // Debug log
          
          const connectionsWithLocations = await Promise.all(
            userData.connections.map(async (connection: any) => {
              // Skip if connection doesn't have an id
              if (!connection || !connection.id) {
                console.warn("Invalid connection found:", connection);
                return null;
              }
              
              try {
                const connectionRef = doc(db, 'users', connection.id);
                const connectionDoc = await getDoc(connectionRef);
                
                if (connectionDoc.exists()) {
                  const connectionData = connectionDoc.data();
                  return {
                    id: connection.id,
                    userId: connection.id,
                    displayName: connection.displayName || 'Unknown User',
                    email: connection.email || 'no-email',
                    photoURL: connectionData.photoURL,
                    location: connectionData.location ? {
                      ...connectionData.location,
                      // Convert Firebase timestamp to ISO string if needed
                      timestamp: connectionData.location.timestamp instanceof Timestamp 
                        ? connectionData.location.timestamp.toDate().toISOString()
                        : connectionData.location.timestamp
                    } : null
                  };
                }
                
                return {
                  id: connection.id,
                  userId: connection.id,
                  displayName: connection.displayName || 'Unknown User',
                  email: connection.email || 'no-email',
                  photoURL: null,
                  location: null
                };
              } catch (error) {
                console.error(`Error fetching connection ${connection.id}:`, error);
                return null;
              }
            })
          );
          
          // Filter out null values from failed connections
          const validConnections = connectionsWithLocations.filter(conn => conn !== null) as ConnectionWithLocation[];
          console.log("Valid connections processed:", validConnections.length); // Debug log
          
          setConnections(validConnections);
        } else {
          console.log("No connections array found in user data"); // Debug log
          
          // Initialize connections array if it doesn't exist
          if (!userData.connections) {
            await updateDoc(userRef, { connections: [] });
          }
          
          setConnections([]);
        }
      } else {
        console.log("User document doesn't exist"); // Debug log
        setConnections([]);
      }
    });
    
    // Listen for connection requests - modified to not filter by status in the query
    const requestsRef = collection(db, 'connectionRequests');
    const q = query(requestsRef, where('toId', '==', currentUser.uid));
    
    const unsubscribeRequests = onSnapshot(q, (querySnapshot) => {
      const requests: ConnectionRequest[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        requests.push({
          id: doc.id,
          fromId: data.fromId,
          fromName: data.fromName,
          fromEmail: data.fromEmail,
          toId: data.toId,
          status: data.status,
          timestamp: data.timestamp instanceof Timestamp 
            ? data.timestamp.toDate().toISOString()
            : data.timestamp
        });
      });
      
      setConnectionRequests(requests);
    });
    
    return () => {
      unsubscribeUser();
      unsubscribeRequests();
    };
  }, [currentUser]);
  
  // Clean up tracking on unmount
  useEffect(() => {
    return () => {
      if (trackingInterval) {
        clearInterval(trackingInterval);
      }
    };
  }, [trackingInterval]);
  
  /**
   * Remove connection between users
   */
  const removeConnection = async (connectionId: string) => {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    
    try {
      // Find the connection in the current user's connections array
      const userConnection = connections.find(conn => conn.id === connectionId);
      
      if (!userConnection) {
        throw new Error('Connection not found');
      }
      
      // Reference to both users' documents
      const currentUserRef = doc(db, 'users', currentUser.uid);
      const otherUserRef = doc(db, 'users', connectionId);
      
      // Get current data for both users
      const currentUserDoc = await getDoc(currentUserRef);
      const otherUserDoc = await getDoc(otherUserRef);
      
      if (!currentUserDoc.exists()) {
        throw new Error('Current user document not found');
      }
      
      // Update current user's connections - remove the connection
      const currentUserData = currentUserDoc.data();
      const updatedConnections = (currentUserData.connections || [])
        .filter((conn: any) => conn.id !== connectionId);
      
      await updateDoc(currentUserRef, {
        connections: updatedConnections
      });
      
      // If the other user exists, also remove the current user from their connections
      if (otherUserDoc.exists()) {
        const otherUserData = otherUserDoc.data();
        const otherUserUpdatedConnections = (otherUserData.connections || [])
          .filter((conn: any) => conn.id !== currentUser.uid);
        
        await updateDoc(otherUserRef, {
          connections: otherUserUpdatedConnections
        });
      }
      
      // Find and delete any connection requests between the users
      const requestsRef = collection(db, 'connectionRequests');
      const q1 = query(
        requestsRef,
        where('fromId', '==', currentUser.uid),
        where('toId', '==', connectionId)
      );
      const q2 = query(
        requestsRef,
        where('fromId', '==', connectionId),
        where('toId', '==', currentUser.uid)
      );
      
      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(q1),
        getDocs(q2)
      ]);
      
      // Delete any found connection requests
      const deletePromises: Promise<void>[] = [];
      
      snapshot1.forEach(doc => {
        deletePromises.push(deleteDoc(doc.ref));
      });
      
      snapshot2.forEach(doc => {
        deletePromises.push(deleteDoc(doc.ref));
      });
      
      await Promise.all(deletePromises);
      
      // Update local state to remove the connection
      setConnections(prev => prev.filter(conn => conn.id !== connectionId));
      
      toast.success(`Connection with ${userConnection.displayName} removed`);
      console.log(`Connection ${connectionId} removed successfully`);
    } catch (error) {
      console.error('Error removing connection:', error);
      toast.error('Failed to remove connection');
      throw error;
    }
  };
  
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
    searchUsersByEmail,
    updateConnectionNickname,
    updateConnectionPhoto,
    removeConnection
  };
  
  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
} 