import { useCallback, useEffect, useState } from 'react';

import { getChatRoomByTransportRequestId } from '@/lib/api';
import type { ChatRoom } from '@/types/chat';

function isMissingChatRoomError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('not found');
}

interface UseTransportRequestChatRoomOptions {
  transportRequestId: string;
  enabled?: boolean;
}

export function useTransportRequestChatRoom({
  transportRequestId,
  enabled = true,
}: UseTransportRequestChatRoomOptions) {
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const refresh = useCallback(async (): Promise<ChatRoom | null> => {
    if (!enabled || !transportRequestId.trim()) {
      setRoom(null);
      setErrorMessage('');
      return null;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const nextRoom = await getChatRoomByTransportRequestId(transportRequestId.trim());
      setRoom(nextRoom);
      return nextRoom;
    } catch (error) {
      if (isMissingChatRoomError(error)) {
        setRoom(null);
        return null;
      }

      setRoom(null);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load chat room.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [enabled, transportRequestId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void refresh();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [refresh]);

  return {
    room,
    isLoading,
    errorMessage,
    refresh,
  };
}
