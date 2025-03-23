import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useLocation } from '../contexts/LocationContext';
import { ConnectionWithLocation } from '../contexts/LocationContext';
import { toast } from 'sonner';

interface ConnectionEditProps {
  connection: ConnectionWithLocation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionEdit({ connection, open, onOpenChange }: ConnectionEditProps) {
  const { updateConnectionNickname } = useLocation();
  const [nickname, setNickname] = useState(connection.displayName);
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nickname.trim()) {
      toast.error('Please enter a nickname');
      return;
    }
    
    setLoading(true);
    
    try {
      await updateConnectionNickname(connection.id, nickname.trim());
      toast.success('Connection updated successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to update connection');
      console.error('Error updating connection:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Connection</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Enter a nickname"
              className="w-full"
              disabled={loading}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Saving...
                </div>
              ) : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 