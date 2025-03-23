import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { toast } from 'sonner';
import { useLocation } from '../contexts/LocationContext';
import { ConnectionWithLocation } from '../contexts/LocationContext';

interface ConnectionProfileEditorProps {
  connection: ConnectionWithLocation;
  isOpen: boolean;
  onClose: () => void;
}

export function ConnectionProfileEditor({ connection, isOpen, onClose }: ConnectionProfileEditorProps) {
  const [nickname, setNickname] = useState(connection.displayName || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const { updateConnectionNickname } = useLocation();
  
  // Handle save nickname
  const handleSaveNickname = async () => {
    if (!connection || !nickname.trim()) {
      toast.error('Please enter a valid nickname');
      return;
    }
    
    try {
      setIsUpdating(true);
      
      // Update connection nickname
      await updateConnectionNickname(connection.id, nickname);
      
      toast.success('Connection nickname updated');
      onClose();
    } catch (error: any) {
      toast.error(`Error updating nickname: ${error.message}`);
      console.error('Error updating nickname:', error);
    } finally {
      setIsUpdating(false);
    }
  };
  
  // Get avatar image URL
  const avatarUrl = connection.photoURL || `https://api.dicebear.com/7.x/thumbs/svg?seed=${connection.displayName}`;
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Connection</DialogTitle>
          <DialogDescription>
            Update nickname for this connection
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center space-y-4 py-4">
          {/* Connection Avatar (non-editable) */}
          <Avatar className="h-24 w-24">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="text-xl">
              {connection.displayName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          {/* Email - Read Only */}
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={connection.email || ''}
              readOnly
              disabled
            />
          </div>
          
          {/* Nickname Input */}
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Enter a nickname for this connection"
            />
          </div>
        </div>
        
        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={onClose} disabled={isUpdating}>
            Cancel
          </Button>
          <Button onClick={handleSaveNickname} disabled={isUpdating || !nickname.trim()}>
            {isUpdating ? (
              <div className="flex items-center">
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2"></div>
                <span>Saving...</span>
              </div>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 