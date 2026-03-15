import { keccak256, encodeAbiParameters, parseAbiParameters, toBytes, toHex } from 'viem';

/** Generate a cryptographically random UUID v4 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Convert a UUID v4 string to a bytes32 hex string (0x-prefixed).
 * The UUID is stripped of dashes, left-padded to 32 bytes.
 */
export function uuidToBytes32(uuid: string): `0x${string}` {
  const hex = uuid.replace(/-/g, '');
  // hex is 32 chars = 16 bytes; zero-pad to 32 bytes
  const padded = hex.padEnd(64, '0');
  return `0x${padded}`;
}

/**
 * Generate a fresh bytes32 salt from a random UUID.
 */
export function generateSalt(): `0x${string}` {
  return uuidToBytes32(generateUUID());
}

/**
 * Compute the commit hash used on-chain:
 *   keccak256(abi.encodePacked(uint8[], bytes32))
 *
 * @param lineup  Array of card IDs (uint8 each, values 0-255)
 * @param salt    bytes32 hex string
 */
export function computeCommitHash(lineup: number[], salt: `0x${string}`): `0x${string}` {
  // Encode lineup as tightly packed uint8 bytes, followed by salt bytes32
  const lineupBytes = new Uint8Array(lineup);
  const saltBytes = toBytes(salt);

  const packed = new Uint8Array(lineupBytes.length + saltBytes.length);
  packed.set(lineupBytes, 0);
  packed.set(saltBytes, lineupBytes.length);

  return keccak256(packed);
}
