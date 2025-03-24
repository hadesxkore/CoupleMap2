import { User } from 'firebase/auth';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ConnectionWithLocation, ConnectionRequest } from '../contexts/LocationContext';
import { Badge } from './ui/badge';
import { useLocation } from '../contexts/LocationContext';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { ProfileEditor } from './ProfileEditor';
import { ConnectionProfileEditor } from './ConnectionProfileEditor';
import { cn } from '../lib/utils';
import { ConnectionEdit } from './ConnectionEdit';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { MoodSelector } from './MoodSelector';

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
  const { respondToConnectionRequest, removeConnection } = useLocation();
  const [isMobile, setIsMobile] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [connectionEditorOpen, setConnectionEditorOpen] = useState(false);
  const [selectedConnectionForEdit, setSelectedConnectionForEdit] = useState<ConnectionWithLocation | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [connectionToDelete, setConnectionToDelete] = useState<ConnectionWithLocation | null>(null);
  const [moodSelectorOpen, setMoodSelectorOpen] = useState(false);
  
  // Filter requests by status
  const pendingRequests = connectionRequests.filter(req => req.status === 'pending');
  const acceptedRequests = connectionRequests.filter(req => req.status === 'accepted');

  // Create a merged connections list that includes both connections and accepted requests
  const allConnections = [...connections];
  
  // Add accepted requests to connections if they're not already there
  acceptedRequests.forEach(request => {
    // Check if this accepted request is already in connections by ID
    const alreadyInConnections = connections.some(conn => conn.id === request.fromId);
    
    if (!alreadyInConnections) {
      // Add as a connection
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

  // Detect mobile devices
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);
  
  // Debug log for connections
  useEffect(() => {
    console.log("Sidebar connections:", connections);
    console.log("Sidebar accepted requests:", acceptedRequests);
    console.log("Sidebar all connections:", allConnections);
  }, [connections, acceptedRequests]);

  // Custom toggle handler
  const handleToggle = () => {
    onToggle();
    // Close sidebar after selecting a connection on mobile
    if (isMobile && selectedConnection) {
      setTimeout(() => onToggle(), 300);
    }
  };

  const handleSelectConnection = (id: string) => {
    // Select the connection
    onSelectConnection(id);
    
    // Close sidebar automatically on mobile when selecting a connection
    if (isMobile) {
      setTimeout(() => onToggle(), 300);
    }
  };
  
  // Handle opening profile editor
  const handleOpenProfileEditor = () => {
    setProfileEditorOpen(true);
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await respondToConnectionRequest(requestId, true);
      toast.success('Connection request accepted');
      
      // Force update of user connections
      // This is a workaround to ensure the UI updates immediately
      const acceptedRequest = connectionRequests.find(req => req.id === requestId);
      if (acceptedRequest) {
        console.log("Manually updating connections after accept:", acceptedRequest);
      }
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

  // Function to get the timestamp in readable format
  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch (error) {
      return 'Unknown time';
    }
  };

  // Prepare edit modal
  const handleEditConnection = (e: React.MouseEvent, connection: ConnectionWithLocation) => {
    e.stopPropagation(); // Prevent click from selecting the connection
    setSelectedConnectionForEdit(connection);
    setEditOpen(true);
  };
  
  // Handle delete confirmation dialog
  const handleDeleteConnection = (e: React.MouseEvent, connection: ConnectionWithLocation) => {
    e.stopPropagation(); // Prevent click from selecting the connection
    setConnectionToDelete(connection);
    setDeleteConfirmOpen(true);
  };
  
  // Process the actual connection deletion
  const confirmDeleteConnection = async () => {
    if (connectionToDelete) {
      try {
        await removeConnection(connectionToDelete.id);
        // If the deleted connection was selected, deselect it
        if (selectedConnection === connectionToDelete.id) {
          onSelectConnection('');
        }
      } catch (error) {
        console.error("Error removing connection:", error);
      }
    }
    setDeleteConfirmOpen(false);
    setSelectedConnectionForEdit(null);
  };

  // Format date to show time only if today, otherwise show date
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <>
      {/* Mobile toggle button - outside sidebar to always be visible */}
      <button
        onClick={handleToggle}
        className={cn(
          "md:hidden fixed top-4 bg-background rounded-full p-3 shadow-md z-[1000] transition-all duration-300",
          isOpen ? "right-4" : "left-4"
        )}
        aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
        style={{ position: 'fixed' }}
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
        className={cn(
          "bg-background border-r border-border flex flex-col h-full transition-all duration-300 z-50",
          isOpen 
            ? 'w-[85vw] max-w-[320px] translate-x-0' 
            : 'w-[85vw] max-w-[320px] -translate-x-full',
          "md:translate-x-0",
          isMobile ? 'fixed top-0 left-0 shadow-xl' : 'relative'
        )}
      >
        {/* User profile header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center space-x-3">
            <div className="cursor-pointer" onClick={handleOpenProfileEditor}>
              <Avatar className="h-10 w-10 transition-all duration-200 hover:opacity-80">
                <AvatarImage src={user?.photoURL || undefined} />
                <AvatarFallback>
                  {user?.displayName
                    ? user.displayName.substring(0, 2).toUpperCase()
                    : user?.email
                    ? user.email.substring(0, 2).toUpperCase()
                    : 'US'}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1 overflow-hidden cursor-pointer" onClick={handleOpenProfileEditor}>
              <p className="font-medium truncate">
                {user?.displayName || user?.email || 'User'}
              </p>
              {user?.email && (
                <p className="text-xs text-muted-foreground truncate">
                  {user.email}
                </p>
              )}
              
              {/* Display user's current mood if available */}
              {connections.length > 0 && connections.find(c => c.id === user?.uid)?.mood && (
                <div className="flex items-center mt-1 text-xs">
                  <span className="mr-1">
                    {connections.find(c => c.id === user?.uid)?.mood?.emoji}
                  </span>
                  <span className="text-muted-foreground truncate">
                    {connections.find(c => c.id === user?.uid)?.mood?.text}
                  </span>
                </div>
              )}
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 mr-1" 
              onClick={() => setMoodSelectorOpen(true)}
              title="Set Status"
            >
              {connections.length > 0 && connections.find(c => c.id === user?.uid)?.mood ? (
                <span className="text-lg">
                  {connections.find(c => c.id === user?.uid)?.mood?.emoji}
                </span>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                  <line x1="9" y1="9" x2="9.01" y2="9"></line>
                  <line x1="15" y1="9" x2="15.01" y2="9"></line>
                </svg>
              )}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8" 
              onClick={handleOpenProfileEditor}
              title="Edit Profile"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </Button>
          </div>
        </div>
        
        {/* Main sidebar content */}
        <div className="flex-1 overflow-y-auto p-4">
          <Tabs defaultValue="connections">
            <TabsList className="w-full mb-4 grid grid-cols-3">
              <TabsTrigger value="connections" className="relative">
                Connections
                {allConnections.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center">
                    {allConnections.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="requests" className="relative">
                Pending
                {pendingRequests.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-primary">
                    {pendingRequests.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="accepted" className="relative">
                Accepted
                {acceptedRequests.length > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-green-500">
                    {acceptedRequests.length}
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
              
              {allConnections.length === 0 ? (
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
                  {allConnections.map((connection) => (
                    <div
                      key={connection.id}
                      onClick={() => handleSelectConnection(connection.id)}
                      className={cn(
                        "p-3 rounded-lg cursor-pointer transition-all",
                        selectedConnection === connection.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent hover:scale-[1.02]'
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-10 w-10 border-2 border-white">
                          <AvatarImage src={connection.photoURL || `https://api.dicebear.com/7.x/thumbs/svg?seed=${connection.displayName}`} />
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
                                ? `Last updated: ${formatDate(connection.location.timestamp)}` 
                                : 'Offline'}
                            </p>
                          </div>
                          {/* Display connection mood if available */}
                          {connection.mood && (
                            <div className="flex items-center mt-1 text-xs">
                              <span className="mr-1">{connection.mood.emoji}</span>
                              <span className="truncate">{connection.mood.text}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => handleEditConnection(e, connection)}
                            title="Edit connection"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </Button>
                          
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => handleDeleteConnection(e, connection)}
                            title="Remove connection"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18"></path>
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                            </svg>
                          </Button>
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
                          <p className="text-xs text-muted-foreground mt-1">
                            Requested: {formatTimestamp(request.timestamp)}
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

            <TabsContent value="accepted" className="space-y-4">
              {acceptedRequests.length === 0 ? (
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
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  <p>No accepted requests</p>
                  <p className="text-sm mt-1">Accepted connection requests will appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {acceptedRequests.map((request) => (
                    <div
                      key={request.id}
                      className="p-4 border border-border rounded-lg bg-card"
                    >
                      <div className="flex items-center space-x-3">
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
                          <div className="flex items-center mt-1">
                            <div className="h-2 w-2 rounded-full mr-2 bg-green-500"></div>
                            <p className="text-xs text-muted-foreground">
                              Accepted: {formatTimestamp(request.timestamp)}
                            </p>
                          </div>
                        </div>
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
      
      {/* Profile Editor Dialog */}
      {user && (
        <ProfileEditor 
          user={user} 
          isOpen={profileEditorOpen} 
          onClose={() => setProfileEditorOpen(false)} 
        />
      )}
      
      {/* Connection Editor Dialog */}
      {selectedConnectionForEdit && (
        <ConnectionProfileEditor
          connection={selectedConnectionForEdit}
          isOpen={connectionEditorOpen}
          onClose={() => {
            setConnectionEditorOpen(false);
            setSelectedConnectionForEdit(null);
          }}
        />
      )}
      
      {/* Connection edit dialog */}
      {selectedConnectionForEdit && (
        <ConnectionEdit
          connection={selectedConnectionForEdit}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      
      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {connectionToDelete?.displayName} from your connections? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteConnection}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Mood Selector */}
      <MoodSelector 
        open={moodSelectorOpen} 
        onOpenChange={setMoodSelectorOpen} 
      />
    </>
  );
} 