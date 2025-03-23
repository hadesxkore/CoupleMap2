import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from '../contexts/LocationContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Map } from '../components/Map';
import { Sidebar } from '../components/Sidebar';

export default function Dashboard() {
  const { currentUser, logout } = useAuth();
  const { 
    currentLocation, 
    connections, 
    connectionRequests,
    updateLocation, 
    startTrackingLocation, 
    stopTrackingLocation,
    isTracking,
    sendConnectionRequest,
    searchUsersByEmail,
    respondToConnectionRequest
  } = useLocation();
  
  const [addConnectionOpen, setAddConnectionOpen] = useState(false);
  const [connectionEmail, setConnectionEmail] = useState('');
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  // sidebarOpen state for controlling sidebar visibility
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchResults, setSearchResults] = useState<{id: string, email: string, displayName: string}[]>([]);
  const [searchTimeout, setSearchTimeout] = useState<number | null>(null);

  // Check if device is mobile and adjust sidebar
  useEffect(() => {
    const checkIfMobile = () => {
      const isMobileDevice = window.innerWidth < 768;
      if (isMobileDevice) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Get initial location on mount
  useEffect(() => {
    updateLocation();
    // Start tracking location by default
    startTrackingLocation();
    
    return () => {
      // Cleanup when unmounting
      stopTrackingLocation();
    };
  }, []);

  // Debug log for connections changes
  useEffect(() => {
    console.log("Dashboard connections updated:", connections);
  }, [connections]);

  // Debug log for connection requests
  useEffect(() => {
    console.log("Connection requests updated:", connectionRequests);
  }, [connectionRequests]);

  // Handle search as user types
  const handleSearchEmail = (value: string) => {
    setConnectionEmail(value);
    
    // Clear previous timeout
    if (searchTimeout) {
      window.clearTimeout(searchTimeout);
    }
    
    // Set new timeout to avoid too many requests
    if (value.length >= 3) {
      const timeout = window.setTimeout(async () => {
        try {
          const results = await searchUsersByEmail(value);
          setSearchResults(results);
        } catch (error) {
          console.error('Error searching users:', error);
          setSearchResults([]);
        }
      }, 300);
      
      setSearchTimeout(timeout as unknown as number);
    } else {
      setSearchResults([]);
    }
  };

  // Add a new connection by email
  const handleAddConnection = async () => {
    if (!connectionEmail) {
      toast.error('Please enter an email address');
      return;
    }
    
    if (!currentUser) {
      toast.error('You must be logged in to add connections');
      return;
    }
    
    setConnectionLoading(true);
    
    try {
      await sendConnectionRequest(connectionEmail);
      toast.success(`Connection request sent to ${connectionEmail}`);
      setConnectionEmail('');
      setSearchResults([]);
      setAddConnectionOpen(false);
    } catch (error: any) {
      toast.error(`Error adding connection: ${error.message}`);
      console.error('Error adding connection:', error);
    } finally {
      setConnectionLoading(false);
    }
  };

  // Select a user from the search results
  const selectUserFromResults = (email: string) => {
    setConnectionEmail(email);
    setSearchResults([]);
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <Sidebar
        user={currentUser}
        connections={connections}
        connectionRequests={connectionRequests}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onAddConnection={() => setAddConnectionOpen(true)}
        onSelectConnection={(id: string) => setSelectedConnection(id)}
        selectedConnection={selectedConnection}
        isTracking={isTracking}
        onStartTracking={startTrackingLocation}
        onStopTracking={stopTrackingLocation}
        onLogout={logout}
      />
      
      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <Map
          currentLocation={currentLocation}
          connections={connections}
          connectionRequests={connectionRequests.filter(req => req.status === 'accepted')}
          selectedConnectionId={selectedConnection}
          onUpdateLocation={updateLocation}
        />
      </main>
      
      {/* Add Connection Dialog */}
      <Dialog open={addConnectionOpen} onOpenChange={setAddConnectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Connection</DialogTitle>
            <DialogDescription>
              Enter the email address of the person you want to connect with.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                value={connectionEmail}
                onChange={(e) => handleSearchEmail(e.target.value)}
                placeholder="example@email.com"
                disabled={connectionLoading}
                autoComplete="off"
              />
              
              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="bg-background rounded-md border border-border mt-1 max-h-48 overflow-y-auto">
                  <ul className="py-1">
                    {searchResults.map((user) => (
                      <li 
                        key={user.id}
                        className="px-3 py-2 hover:bg-accent cursor-pointer"
                        onClick={() => selectUserFromResults(user.email)}
                      >
                        <div className="font-medium">{user.displayName}</div>
                        <div className="text-sm text-muted-foreground">{user.email}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <Button
              className="w-full"
              onClick={handleAddConnection}
              disabled={connectionLoading}
            >
              {connectionLoading ? 
                <div className="flex items-center justify-center">
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2"></div>
                  <span>Processing...</span>
                </div>
                : 
                'Add Connection'
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 