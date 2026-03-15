import ERC20Artifact from '@/lib/abi/ERC20.json';
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import type { Abi, Address, Hash } from 'viem';

export const ERC20_ABI = ERC20Artifact.abi as Abi;

export function useErc20Balance(token: Address | undefined, owner: Address | undefined) {
  return useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: token && owner ? [owner] : undefined,
    query: { enabled: Boolean(token && owner) },
  });
}

export function useErc20Allowance(
  token: Address | undefined,
  owner: Address | undefined,
  spender: Address | undefined,
) {
  return useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: token && owner && spender ? [owner, spender] : undefined,
    query: { enabled: Boolean(token && owner && spender) },
  });
}

export function useErc20Symbol(token: Address | undefined) {
  return useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'symbol',
    query: { enabled: Boolean(token) },
  });
}

export function useErc20Decimals(token: Address | undefined) {
  return useReadContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: { enabled: Boolean(token) },
  });
}

export function useApproveErc20(token: Address | undefined, opts?: { confirmations?: number }) {
  const { writeContract, data: txHash, isPending, error } = useWriteContract();

  const wait = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: opts?.confirmations,
    query: { enabled: Boolean(txHash) },
  });

  function approve(spender: Address, amount: bigint) {
    if (!token) throw new Error('Missing ERC20 token address.');
    writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, amount],
    });
  }

  return {
    approve,
    txHash: txHash as Hash | undefined,
    isPending,
    isConfirming: wait.isLoading,
    isSuccess: wait.isSuccess,
    receipt: wait.data,
    error,
  };
}
