export function getDuelGameAddress(chainId: number): `0x${string}` {
  const valueByChainId: Record<number, string | undefined> = {
    10143: process.env.NEXT_PUBLIC_DUELGAME_ADDRESS_10143,
    31337: process.env.NEXT_PUBLIC_DUELGAME_ADDRESS_31337,
    11155111: process.env.NEXT_PUBLIC_DUELGAME_ADDRESS_11155111,
  };
  const value = valueByChainId[chainId];
  if (!value) {
    throw new Error(
      `Missing env var NEXT_PUBLIC_DUELGAME_ADDRESS_${chainId}. Add it to .env.local (example: NEXT_PUBLIC_DUELGAME_ADDRESS_${chainId}=0x...).`,
    );
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Invalid address in NEXT_PUBLIC_DUELGAME_ADDRESS_${chainId}: ${value}`);
  }
  return value as `0x${string}`;
}

export function getCardRegistryAddress(chainId: number): `0x${string}` {
  const valueByChainId: Record<number, string | undefined> = {
    10143: process.env.NEXT_PUBLIC_CARDREGISTRY_ADDRESS_10143,
    31337: process.env.NEXT_PUBLIC_CARDREGISTRY_ADDRESS_31337,
    11155111: process.env.NEXT_PUBLIC_CARDREGISTRY_ADDRESS_11155111,
  };
  const value = valueByChainId[chainId];
  if (!value) {
    throw new Error(
      `Missing env var NEXT_PUBLIC_CARDREGISTRY_ADDRESS_${chainId}. Either set it, or rely on DuelGame.cardRegistry() instead.`,
    );
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Invalid address in NEXT_PUBLIC_CARDREGISTRY_ADDRESS_${chainId}: ${value}`);
  }
  return value as `0x${string}`;
}
