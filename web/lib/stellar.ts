import * as StellarSdk from "@stellar/stellar-sdk";
import { Client, type Tanda, type MemberState } from "tanda-client";

export type { Tanda, MemberState };

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org";
export const TANDA_CONTRACT = process.env.NEXT_PUBLIC_TANDA_CONTRACT as string;
export const MOCK_VAULT = process.env.NEXT_PUBLIC_MOCK_VAULT as string;

// Token del pozo. En testnet usamos el SAC de XLM nativo (sobre el que se
// construyó el MockVault). En mainnet (Fase 5) será el SAC de USDC.
export const TOKEN =
  process.env.NEXT_PUBLIC_TOKEN || "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export const rpc = new StellarSdk.rpc.Server(RPC_URL, {
  allowHttp: RPC_URL.startsWith("http://"),
});

/** Firma de hash crudo de Privy (`useSignRawHash`). */
export type RawHashSigner = (args: {
  address: string;
  chainType: "stellar";
  hash: string;
}) => Promise<{ signature: string }>;

const hexToBuf = (hex: string) => Buffer.from(hex.replace(/^0x/, ""), "hex");

/**
 * Construye los callbacks `signTransaction` y `signAuthEntry` que esperan los
 * bindings del contrato, puenteando a la firma de hash crudo de Privy.
 *
 * - `signTransaction`: firma el hash del sobre de la transacción.
 * - `signAuthEntry`: firma las auth entries de Soroban (el `require_auth` del
 *   miembro) usando `authorizeEntry` con el firmante de Privy.
 */
export function buildSigners(address: string, signRawHash: RawHashSigner) {
  const signTransaction = async (xdr: string) => {
    const tx = StellarSdk.TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
    const payload = tx.hash();
    const { signature } = await signRawHash({
      address,
      chainType: "stellar",
      hash: "0x" + payload.toString("hex"),
    });
    const kp = StellarSdk.Keypair.fromPublicKey(address);
    tx.addDecoratedSignature(
      new StellarSdk.xdr.DecoratedSignature({
        hint: kp.signatureHint(),
        signature: hexToBuf(signature),
      })
    );
    return { signedTxXdr: tx.toXDR(), signerAddress: address };
  };

  const signAuthEntry = async (authEntryXdr: string) => {
    const entry = StellarSdk.xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, "base64");
    const validUntil = (await rpc.getLatestLedger()).sequence + 100;
    const signed = await StellarSdk.authorizeEntry(
      entry,
      async (preimage) => {
        const payload = StellarSdk.hash(preimage.toXDR());
        const { signature } = await signRawHash({
          address,
          chainType: "stellar",
          hash: "0x" + Buffer.from(payload).toString("hex"),
        });
        return hexToBuf(signature);
      },
      validUntil,
      NETWORK_PASSPHRASE
    );
    return { signedAuthEntry: signed.toXDR("base64"), signerAddress: address };
  };

  return { signTransaction, signAuthEntry };
}

/** Cliente del contrato. Sin firmante = solo lectura (simulación). */
export function getClient(address?: string, signRawHash?: RawHashSigner): Client {
  const signers =
    address && signRawHash ? buildSigners(address, signRawHash) : {};
  return new Client({
    contractId: TANDA_CONTRACT,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    allowHttp: RPC_URL.startsWith("http://"),
    publicKey: address,
    ...signers,
  });
}

/** Fondea una cuenta en testnet con friendbot (idempotente). */
export async function fundWithFriendbot(address: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org/?addr=${address}`);
  // 400 = ya estaba fondeada; lo tratamos como éxito.
  if (!res.ok && res.status !== 400) {
    throw new Error("Friendbot no pudo fondear la cuenta");
  }
}

const HORIZON =
  process.env.NEXT_PUBLIC_HORIZON_URL || "https://horizon-testnet.stellar.org";

/** Saldo nativo (XLM) de la cuenta, formateado. `null` si no existe aún. */
export async function fetchBalance(address: string): Promise<string | null> {
  try {
    const res = await fetch(`${HORIZON}/accounts/${address}`);
    if (!res.ok) return null;
    const data = await res.json();
    const native = (data.balances ?? []).find((b: any) => b.asset_type === "native");
    return native ? native.balance : "0";
  } catch {
    return null;
  }
}

/** ¿La cuenta existe on-chain (está fondeada)? */
export async function accountExists(address: string): Promise<boolean> {
  try {
    await rpc.getAccount(address);
    return true;
  } catch {
    return false;
  }
}

// ---- Lecturas (simulación, sin firma) ----

export async function fetchMemberships(address: string): Promise<number[]> {
  if (!(await accountExists(address))) return [];
  const client = getClient(address);
  const tx = await client.get_memberships({ member: address });
  return (tx.result as number[]) ?? [];
}

export async function fetchTanda(address: string, tandaId: number): Promise<Tanda> {
  const client = getClient(address);
  const tx = await client.get_tanda({ tanda_id: tandaId });
  return tx.result as Tanda;
}

export async function fetchMember(
  address: string,
  tandaId: number,
  member: string
): Promise<MemberState> {
  const client = getClient(address);
  const tx = await client.get_member({ tanda_id: tandaId, member });
  return tx.result as MemberState;
}

/** Resuelve un código de invitación (p. ej. "DASDRF") a su tanda_id. */
export async function fetchIdByCode(address: string, code: string): Promise<number> {
  const client = getClient(address);
  const tx = await client.id_by_code({ code: code.toUpperCase() });
  return Number(tx.result);
}

// ---- Unidades: la UI trabaja en XLM, el contrato en stroops (1 XLM = 1e7) ----
export const STROOPS_PER_XLM = 10_000_000;
export const toStroops = (xlm: string | number): bigint =>
  BigInt(Math.round(Number(xlm) * STROOPS_PER_XLM));
export const fromStroops = (s: bigint | number | string): number =>
  Number(s) / STROOPS_PER_XLM;

/** Genera un código de invitación de 6 letras (sin caracteres ambiguos). */
export function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I ni O
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
