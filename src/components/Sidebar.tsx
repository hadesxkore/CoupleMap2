import { User } from 'firebase/auth';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ConnectionWithLocation, ConnectionRequest } from '../contexts/LocationContext';
import { Badge } from './ui/badge';
import { useLocation } from '../contexts/LocationContext';
import { toast } from 'sonner';

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
  
  const pendingRequests = connectionRequests.filter(req => req.status === 'pending');

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
    <div className={`bg-background border-r border-border flex flex-col h-full transition-all ${isOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
      {/* Mobile toggle button */}
      <button
        onClick={onToggle}
        className="md:hidden absolute top-4 right-4 bg-background rounded-full p-2 shadow z-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
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
      
      {/* User profile header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center space-x-3">
          <Avatar>
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
            <p className="text-sm font-medium truncate">
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
          <TabsList className="w-full mb-4">
            <TabsTrigger value="connections" className="flex-1">
              Connections
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex-1 relative">
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
              Add Connection
            </Button>
            
            {connections.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No connections yet</p>
                <p className="text-sm">Add connections to see them here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    onClick={() => onSelectConnection(connection.id)}
                    className={`p-3 rounded-md cursor-pointer transition-colors ${
                      selectedConnection === connection.id
                        ? 'bg-secondary'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {connection.displayName.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {connection.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {connection.email}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <Badge
                          variant={connection.location ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {connection.location ? 'Online' : 'Offline'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="requests" className="space-y-4">
            {pendingRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No pending requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="p-4 border border-border rounded-md"
                  >
                    <div className="flex items-center space-x-3 mb-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          {request.fromName.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
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
                        Reject
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
      <div className="p-4 border-t border-border space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm">Location Tracking</span>
          <Button
            variant={isTracking ? 'secondary' : 'default'}
            size="sm"
            onClick={isTracking ? onStopTracking : onStartTracking}
          >
            {isTracking ? 'Stop Tracking' : 'Start Tracking'}
          </Button>
        </div>
        <Button variant="ghost" className="w-full" onClick={onLogout}>
          Logout
        </Button>
      </div>
    </div>
  );
} 