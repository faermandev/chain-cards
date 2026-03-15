'use client';

import { useAccount } from 'wagmi';
import { useMemo } from 'react';

export function useGameUser() {
  const { address, isConnected, isConnecting } = useAccount();
  const user = useMemo(() => {
    if (!isConnected || !address) return null;
    return {
      id: address.toLowerCase(),
      name: `${address.slice(0, 6)}…${address.slice(-4)}`,
    };
  }, [address, isConnected]);

  return { user, address, isConnected, isConnecting };
}
