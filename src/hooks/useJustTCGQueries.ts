import { useQuery } from '@tanstack/react-query';

// Placeholder types for the missing database entities
export interface Game {
  id: string;
  name: string;
  jt_game_id?: string;
}

export interface GameSet {
  id: string;
  name: string;
  game_id: string;
}

export interface Card {
  id: string;
  name: string;
  set_id: string;
}

export const useJustTCGQueries = () => {
  const useGames = () => {
    return useQuery<Game[]>({
      queryKey: ['games'],
      queryFn: async (): Promise<Game[]> => {
        // Database tables don't exist, return empty array
        return [];
      },
      enabled: false // Disable the query since tables don't exist
    });
  };

  const useSets = (gameId?: string) => {
    return useQuery<GameSet[]>({
      queryKey: ['sets', gameId],
      queryFn: async (): Promise<GameSet[]> => {
        // Database tables don't exist, return empty array
        return [];
      },
      enabled: false // Disable the query since tables don't exist
    });
  };

  const useCards = (setId?: string) => {
    return useQuery<Card[]>({
      queryKey: ['cards', setId],
      queryFn: async (): Promise<Card[]> => {
        // Database tables don't exist, return empty array
        return [];
      },
      enabled: false // Disable the query since tables don't exist
    });
  };

  return {
    useGames,
    useSets,
    useCards
  };
};