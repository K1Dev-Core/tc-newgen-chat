export type ChatServer = { id: string; name: string };
export type ChatRoom = { id: string; server_id: string; slug: string; name: string };
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
  replyToId?: string | null;
  replyToSender?: string | null;
  replyToText?: string | null;
  isAi?: boolean;
  isStreaming?: boolean;
};

export type MessageReaction = {
  message_id: string;
  user_id: string;
  emoji: string;
};
