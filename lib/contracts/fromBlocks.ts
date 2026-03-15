export function getCardRegistryFromBlock(chainId: number): bigint | undefined {
  const valueByChainId: Record<number, string | undefined> = {
    10143: process.env.NEXT_PUBLIC_CARDREGISTRY_FROM_BLOCK_10143,
    31337: process.env.NEXT_PUBLIC_CARDREGISTRY_FROM_BLOCK_31337,
    11155111: process.env.NEXT_PUBLIC_CARDREGISTRY_FROM_BLOCK_11155111,
  };
  const raw = valueByChainId[chainId];
  if (!raw) return undefined;
  try {
    return BigInt(raw);
  } catch {
    return undefined;
  }
}

