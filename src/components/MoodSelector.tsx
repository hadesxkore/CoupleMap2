import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useLocation } from '@/contexts/LocationContext';
import { toast } from 'sonner';
import { useState } from 'react';

const PRESET_MOODS = [
  { emoji: '😊', text: 'Happy' },
  { emoji: '😴', text: 'Sleepy' },
  { emoji: '🎮', text: 'Gaming' },
  { emoji: '📚', text: 'Studying' },
  { emoji: '🏃', text: 'Working out' },
  { emoji: '🎵', text: 'Listening to music' },
  { emoji: '🍽️', text: 'Eating' },
  { emoji: '💼', text: 'Working' },
  { emoji: '🎬', text: 'Watching something' },
  { emoji: '🤔', text: 'Thinking' },
];

interface MoodSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MoodSelector({ open, onOpenChange }: MoodSelectorProps) {
  const { updateUserMood } = useLocation();
  const [customMood, setCustomMood] = useState('');
  const [customEmoji, setCustomEmoji] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handlePresetMoodSelect = async (emoji: string, text: string) => {
    try {
      setIsLoading(true);
      await updateUserMood(emoji, text);
      onOpenChange(false);
      toast.success('Status updated successfully');
    } catch (error) {
      toast.error('Failed to update status');
      console.error('Error updating mood:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomMoodSubmit = async () => {
    if (!customMood.trim()) {
      toast.error('Please enter a status message');
      return;
    }

    if (!customEmoji.trim()) {
      toast.error('Please enter an emoji');
      return;
    }

    try {
      setIsLoading(true);
      await updateUserMood(customEmoji, customMood);
      onOpenChange(false);
      setCustomMood('');
      setCustomEmoji('');
      toast.success('Status updated successfully');
    } catch (error) {
      toast.error('Failed to update status');
      console.error('Error updating mood:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Your Status</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-2 my-4">
          {PRESET_MOODS.map(({ emoji, text }) => (
            <Button
              key={text}
              variant="outline"
              className="flex items-center gap-2 justify-start"
              onClick={() => handlePresetMoodSelect(emoji, text)}
              disabled={isLoading}
            >
              <span className="text-xl">{emoji}</span>
              <span className="text-sm">{text}</span>
            </Button>
          ))}
        </div>

        <div className="space-y-4 pt-4 border-t">
          <h4 className="text-sm font-medium">Custom Status</h4>
          <div className="flex gap-2">
            <Input
              placeholder="Emoji"
              value={customEmoji}
              onChange={(e) => setCustomEmoji(e.target.value)}
              className="w-20"
              maxLength={2}
            />
            <Input
              placeholder="What's on your mind?"
              value={customMood}
              onChange={(e) => setCustomMood(e.target.value)}
              maxLength={50}
            />
          </div>
          <Button
            onClick={handleCustomMoodSubmit}
            className="w-full"
            disabled={isLoading}
          >
            Set Custom Status
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 