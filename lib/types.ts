export type ViewId = 'Server' | 'Chat';
export type ChatMessage = {
  role: 'self' | 'friend';
  sender: string;
  senderId: string | null;
  avatar: string;
  tone: 'lavender' | 'plum' | 'gold';
  text: string;
  time: string;
  createdAt: string;
  id: string;
};
