import { User } from 'firebase/auth';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ConnectionWithLocation, ConnectionRequest } from '../contexts/LocationContext';
import { Badge } from './ui/badge';
import { useLocation } from '../contexts/LocationContext';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';

export interface SidebarProps {
  user: User | null;
  connections: ConnectionWithLocation[];
  connectionRequests: ConnectionRequest[];
  isOpen: boolean;
  onToggle: () => void;
  onAddConnection: () => void;
  onSelectConnection: (id: string) => void;
  selectedConnection: string | null;
  isTracking: boolean;
  onStartTracking: () => void;
  onStopTracking: () => void;
  onLogout: () => Promise<void>;
}

export function Sidebar({
  user,
  connections,
  connectionRequests,
  isOpen,
  onToggle,
  onAddConnection,
  onSelectConnection,
  selectedConnection,
  isTracking,
  onStartTracking,
  onStopTracking,
  onLogout
}: SidebarProps) {
  const { respondToConnectionRequest } = useLocation();
  const [isMobile, setIsMobile] = useState(false);
  // Track if user deliberately closed sidebar to avoid auto-reopening
  const [userClosedSidebar, setUserClosedSidebar] = useState(false);
  
  const pendingRequests = connectionRequests.filter(req => req.status === 'pending');

  // Detect mobile devices
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Custom toggle handler to track user intent
  const handleToggle = () => {
    setUserClosedSidebar(!isOpen);
    onToggle();
  };

  const handleSelectConnection = (id: string) => {
    // Select the connection without automatically closing sidebar
    onSelectConnection(id);
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await respondToConnectionRequest(requestId, true);
      toast.success('Connection request accepted');
    } catch (error: any) {
      toast.error(`Error accepting request: ${error.message}`);
    }
  };
  
  const handleRejectRequest = async (requestId: string) => {
    try {
      await respondToConnectionRequest(requestId, false);
      toast.success('Connection request rejected');
    } catch (error: any) {
      toast.error(`Error rejecting request: ${error.message}`);
    }
  };

  return (
    <>
      {/* Mobile toggle button - outside sidebar to always be visible */}
      <button
        onClick={handleToggle}
        className={`md:hidden fixed top-4 ${isOpen ? 'right-4' : 'left-4'} bg-background rounded-full p-3 shadow-md z-[1000] transition-all duration-300`}
        aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {isOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* Backdrop for mobile */}
      {isMobile && isOpen && (
        <div 
          className="fixed inset-0 bg-black/30 z-40"
          onClick={handleToggle}
          aria-hidden="true"
        />
      )}
      
      {/* Main sidebar */}
      <div 
        className={`bg-background border-r border-border flex flex-col h-full transition-all duration-300 z-50 ${
          isOpen 
            ? 'w-[85vw] max-w-[320px] translate-x-0' 
            : 'w-[85vw] max-w-[320px] -translate-x-full'
        } md:translate-x-0 ${isMobile ? 'fixed top-0 left-0 shadow-xl' : 'relative'}`}
      >
        {/* User profile header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user?.photoURL || undefined} />
              <AvatarFallback>
                {user?.displayName
                  ? user.displayName.substring(0, 2).toUpperCase()
                  : user?.email
                  ? user.email.substring(0, 2).toUpperCase()
                  : 'US'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="font-medium truncate">
                {user?.displayName || user?.email || 'User'}
              </p>
              {user?.email && (
                <p className="text-xs text-muted-foreground truncate">
                  {user.email}
                </p>
              )}
            </div>
          </div>
        </div>
        
        {/* Main sidebar content */}
        <div className="flex-1 overflow-y-auto p-4">
          <Tabs defaultValue="connections">
            <TabsList className="w-full mb-4 grid grid-cols-2">
              <TabsTrigger value="connections" className="relative">
                Connections
                {connections.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center">
                    {connections.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="requests" className="relative">
                Requests
                {pendingRequests.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-primary">
                    {pendingRequests.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="connections" className="space-y-4">
              <Button onClick={onAddConnection} className="w-full">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="h-4 w-4 mr-2"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="16" y1="11" x2="22" y2="11" />
                </svg>
                Add Connection
              </Button>
              
              {connections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground bg-secondary/20 rounded-lg">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className="h-12 w-12 mx-auto mb-2 text-muted-foreground"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <p>No connections yet</p>
                  <p className="text-sm mt-1">Add connections to track them on the map</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {connections.map((connection) => (
                    <div
                      key={connection.id}
                      onClick={() => handleSelectConnection(connection.id)}
                      className={`p-3 rounded-lg cursor-pointer transition-all ${
                        selectedConnection === connection.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent hover:scale-[1.02]'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10 border-2 border-white">
                          <AvatarImage src={`https://api.dicebear.com/7.x/thumbs/svg?seed=${connection.displayName}`} />
                          <AvatarFallback>
                            {connection.displayName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {connection.displayName}
                          </p>
                          <div className="flex items-center mt-1">
                            <div className={`h-2 w-2 rounded-full mr-2 ${connection.location ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                            <p className="text-xs truncate">
                              {connection.location 
                                ? `Last updated: ${new Date(connection.location.timestamp).toLocaleTimeString()}` 
                                : 'Offline'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="requests" className="space-y-4">
              {pendingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground bg-secondary/20 rounded-lg">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className="h-12 w-12 mx-auto mb-2 text-muted-foreground"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M19 8l-2 3" />
                    <path d="M14 8l2 3" />
                    <path d="M15 11h-2" />
                  </svg>
                  <p>No pending requests</p>
                  <p className="text-sm mt-1">New connection requests will appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="p-4 border border-border rounded-lg bg-card"
                    >
                      <div className="flex items-center space-x-3 mb-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            {request.fromName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">
                            {request.fromName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {request.fromEmail}
                          </p>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          className="flex-1" 
                          variant="secondary"
                          onClick={() => handleRejectRequest(request.id)}
                        >
                          Decline
                        </Button>
                        <Button 
                          className="flex-1"
                          onClick={() => handleAcceptRequest(request.id)}
                        >
                          Accept
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Footer with location tracking and logout */}
        <div className="p-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/20">
            <span className="flex items-center">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className="h-4 w-4 mr-2"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="1" />
                <line x1="12" y1="9" x2="12" y2="2" />
                <line x1="12" y1="22" x2="12" y2="15" />
                <line x1="15" y1="12" x2="22" y2="12" />
                <line x1="2" y1="12" x2="9" y2="12" />
              </svg>
              Location Tracking
            </span>
            <Button
              variant={isTracking ? "destructive" : "default"}
              size="sm"
              onClick={isTracking ? onStopTracking : onStartTracking}
              className="text-xs"
            >
              {isTracking ? 'Stop' : 'Start'}
            </Button>
          </div>
          <Button variant="outline" className="w-full" onClick={onLogout}>
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className="h-4 w-4 mr-2"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </Button>
        </div>
      </div>
    </>
  );
} 