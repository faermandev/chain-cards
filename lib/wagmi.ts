import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { createConfig } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { defineChain, http } from 'viem';

function withRpcUrl<T extends { rpcUrls: { default: { http: readonly string[] } } }>(
  chain: T,
  rpcUrl: string | undefined,
) {
  if (!rpcUrl) return chain;
  return {
    ...(chain as unknown as object),
    rpcUrls: {
      ...(chain.rpcUrls as unknown as object),
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  } as unknown as T;
}

export const monadTestnet = withRpcUrl(
  defineChain({
    id: 10143,
    name: 'Monad Testnet',
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://testnet-rpc.monad.xyz'] },
    },
    blockExplorers: {
      default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' },
    },
    testnet: true,
  }),
  process.env.NEXT_PUBLIC_RPC_10143,
);

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = projectId
  ? getDefaultConfig({
      appName: 'Chain Cards',
      projectId,
      chains: [monadTestnet],
      ssr: true,
    })
  : createConfig({
      chains: [monadTestnet],
      ssr: true,
      connectors: [injected()],
      transports: {
        [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0]),
      },
    });
