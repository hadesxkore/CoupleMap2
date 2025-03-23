import { useState, useRef, ChangeEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useAuth } from '../contexts/AuthContext';
import { User } from 'firebase/auth';
import { toast } from 'sonner';

// Cloudinary configuration
const CLOUDINARY_UPLOAD_PRESET = 'ImageStorage';
const CLOUDINARY_CLOUD_NAME = 'dt7yizyhv';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

interface ProfileEditorProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileEditor({ user, isOpen, onClose }: ProfileEditorProps) {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState<string | null>(user?.photoURL || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { updateUserProfile } = useAuth();
  
  // Handle click on the avatar to open file selector
  const handleAvatarClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle file selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.match(/image\/(jpeg|jpg|png|gif|webp)/i)) {
      toast.error('Please select a valid image file (JPEG, PNG, GIF, WebP)');
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image file is too large. Please select an image under 5MB');
      return;
    }
    
    setSelectedImage(file);
    
    // Create preview URL
    const objectUrl = URL.createObjectURL(file);
    setPreviewURL(objectUrl);
    
    // Clean up the preview URL when component unmounts
    return () => URL.revokeObjectURL(objectUrl);
  };
  
  // Upload image to Cloudinary
  const uploadImageToCloudinary = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    
    try {
      const response = await fetch(CLOUDINARY_UPLOAD_URL, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload image');
      }
      
      const data = await response.json();
      return data.secure_url;
    } catch (error) {
      console.error('Error uploading image to Cloudinary:', error);
      throw error;
    }
  };
  
  // Handle save profile
  const handleSaveProfile = async () => {
    if (!user) return;
    
    try {
      setIsUploading(true);
      
      let photoURL = user.photoURL;
      
      // Upload image to Cloudinary if a new one was selected
      if (selectedImage) {
        photoURL = await uploadImageToCloudinary(selectedImage);
      }
      
      // Update Firebase user profile
      await updateUserProfile({
        displayName: displayName.trim() || user.displayName,
        photoURL
      });
      
      toast.success('Profile updated successfully');
      onClose();
    } catch (error: any) {
      toast.error(`Error updating profile: ${error.message}`);
      console.error('Error updating profile:', error);
    } finally {
      setIsUploading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your profile information
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center space-y-4 py-4">
          {/* Profile Image Upload */}
          <div className="relative cursor-pointer group" onClick={handleAvatarClick}>
            <Avatar className="h-24 w-24 transition-all duration-200 group-hover:opacity-80">
              <AvatarImage src={previewURL || undefined} />
              <AvatarFallback className="text-xl">
                {displayName
                  ? displayName.substring(0, 2).toUpperCase()
                  : user?.email
                  ? user.email.substring(0, 2).toUpperCase()
                  : 'US'}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
              >
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Click to change profile picture</p>
          
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/jpeg,image/png,image/gif,image/webp"
          />
          
          {/* Display Name Input */}
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="displayName">Display Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
            />
          </div>
          
          {/* Email - Read Only */}
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={user?.email || ''}
              readOnly
              disabled
            />
          </div>
        </div>
        
        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={onClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button onClick={handleSaveProfile} disabled={isUploading}>
            {isUploading ? (
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