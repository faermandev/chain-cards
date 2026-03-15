'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

/**
 * Game-styled wallet button using RainbowKit's render prop.
 * Handles: not connected → connected → wrong network states.
 */
export default function ConnectWallet() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' },
            })}
          >
            {!connected ? (
              <button
                onClick={openConnectModal}
                type="button"
                className="rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2 text-sm font-bold text-white transition-colors"
              >
                Connect Wallet
              </button>
            ) : chain.unsupported ? (
              <button
                onClick={openChainModal}
                type="button"
                className="rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-bold text-white transition-colors"
              >
                Wrong Network
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {/* Chain badge */}
                <button
                  onClick={openChainModal}
                  type="button"
                  className="hidden sm:flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 px-3 py-2 text-xs font-medium text-gray-300 transition-colors"
                >
                  {chain.hasIcon && chain.iconUrl && (
                    <img
                      src={chain.iconUrl}
                      alt={chain.name}
                      className="w-3.5 h-3.5 rounded-full"
                    />
                  )}
                  {chain.name}
                </button>

                {/* Account button */}
                <button
                  onClick={openAccountModal}
                  type="button"
                  className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 px-3 py-2 text-sm transition-colors"
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 shrink-0" />
                  <span className="font-medium text-white">{account.displayName}</span>
                  {account.displayBalance && (
                    <span className="text-gray-400 text-xs hidden sm:inline">
                      {account.displayBalance}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
