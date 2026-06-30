import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDTXLDZMTOYXLXI254YA2CPKGAURPWRLSC6Z6TS6BQUYCQOJEHQJPFY7",
  }
} as const

export const Errors = {
  1: {message:"TandaNotFound"},
  2: {message:"NotOpen"},
  3: {message:"AlreadyMember"},
  4: {message:"Full"},
  5: {message:"NotActive"},
  6: {message:"NotMember"},
  7: {message:"AlreadyPaid"},
  8: {message:"NotCompleted"},
  9: {message:"InvalidParams"},
  10: {message:"CodeTaken"}
}


export interface Tanda {
  /**
 * Código corto único para compartir e invitar (p. ej. "DASDRF").
 */
code: string;
  collateral: i128;
  contribution: i128;
  current_round: u32;
  id: u32;
  members: Array<string>;
  name: string;
  payout_order: Array<string>;
  size: u32;
  status: Status;
  token: string;
  /**
 * Vault de yield (MockVault en testnet, DeFindex en mainnet).
 */
vault: string;
}

export type Status = {tag: "Open", values: void} | {tag: "Active", values: void} | {tag: "Completed", values: void};

export type DataKey = {tag: "Counter", values: void} | {tag: "Tanda", values: readonly [u32]} | {tag: "Code", values: readonly [string]} | {tag: "Member", values: readonly [u32, string]} | {tag: "Memberships", values: readonly [string]};


export interface MemberState {
  /**
 * Principal del colateral aún comprometido (en unidades del token).
 */
collateral_locked: i128;
  defaulted: boolean;
  paid_this_round: boolean;
  /**
 * Shares del vault que respaldan a este miembro (colateral + yield).
 */
shares: i128;
}

export interface Client {
  /**
   * Construct and simulate a join transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Un miembro se une a la tanda: bloquea su colateral (transferido al
   * contrato). Cuando se completa `size`, la tanda pasa a `Active` y se
   * congela el orden de cobro.
   */
  join: ({tanda_id, member}: {tanda_id: u32, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a finish transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Al terminar, devuelve a cada miembro el colateral que le quede.
   * (En la Fase 2 se suma el yield generado en DeFindex.)
   */
  finish: ({tanda_id}: {tanda_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a payout transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cierra la ronda actual (crank permisionless): cubre con colateral a quien
   * no pagó, paga el pozo completo al miembro del turno y avanza la ronda.
   * Si era la última ronda, la tanda queda `Completed`.
   */
  payout: ({tanda_id}: {tanda_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_tanda transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_tanda: ({tanda_id}: {tanda_id: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Tanda>>

  /**
   * Construct and simulate a contribute transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * El miembro paga su cuota de la ronda actual.
   */
  contribute: ({tanda_id, member}: {tanda_id: u32, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_member transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_member: ({tanda_id, member}: {tanda_id: u32, member: string}, options?: MethodOptions) => Promise<AssembledTransaction<MemberState>>

  /**
   * Construct and simulate a id_by_code transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Resuelve un código de invitación al `tanda_id` correspondiente.
   */
  id_by_code: ({code}: {code: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a create_tanda transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Crea una tanda nueva y devuelve su `tanda_id`. El creador no queda
   * inscrito automáticamente: debe llamar `join` como cualquier otro.
   */
  create_tanda: ({creator, code, name, token, vault, contribution, collateral, size}: {creator: string, code: string, name: string, token: string, vault: string, contribution: i128, collateral: i128, size: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_memberships transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_memberships: ({member}: {member: string}, options?: MethodOptions) => Promise<AssembledTransaction<Array<u32>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACgAAAAAAAAANVGFuZGFOb3RGb3VuZAAAAAAAAAEAAAAAAAAAB05vdE9wZW4AAAAAAgAAAAAAAAANQWxyZWFkeU1lbWJlcgAAAAAAAAMAAAAAAAAABEZ1bGwAAAAEAAAAAAAAAAlOb3RBY3RpdmUAAAAAAAAFAAAAAAAAAAlOb3RNZW1iZXIAAAAAAAAGAAAAAAAAAAtBbHJlYWR5UGFpZAAAAAAHAAAAAAAAAAxOb3RDb21wbGV0ZWQAAAAIAAAAAAAAAA1JbnZhbGlkUGFyYW1zAAAAAAAACQAAAAAAAAAJQ29kZVRha2VuAAAAAAAACg==",
        "AAAAAQAAAAAAAAAAAAAABVRhbmRhAAAAAAAADAAAAEBDw7NkaWdvIGNvcnRvIMO6bmljbyBwYXJhIGNvbXBhcnRpciBlIGludml0YXIgKHAuIGVqLiAiREFTRFJGIikuAAAABGNvZGUAAAAQAAAAAAAAAApjb2xsYXRlcmFsAAAAAAALAAAAAAAAAAxjb250cmlidXRpb24AAAALAAAAAAAAAA1jdXJyZW50X3JvdW5kAAAAAAAABAAAAAAAAAACaWQAAAAAAAQAAAAAAAAAB21lbWJlcnMAAAAD6gAAABMAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAxwYXlvdXRfb3JkZXIAAAPqAAAAEwAAAAAAAAAEc2l6ZQAAAAQAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAZTdGF0dXMAAAAAAAAAAAAFdG9rZW4AAAAAAAATAAAAO1ZhdWx0IGRlIHlpZWxkIChNb2NrVmF1bHQgZW4gdGVzdG5ldCwgRGVGaW5kZXggZW4gbWFpbm5ldCkuAAAAAAV2YXVsdAAAAAAAABM=",
        "AAAAAgAAAAAAAAAAAAAABlN0YXR1cwAAAAAAAwAAAAAAAAAAAAAABE9wZW4AAAAAAAAAAAAAAAZBY3RpdmUAAAAAAAAAAAAAAAAACUNvbXBsZXRlZAAAAA==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAAAAAAAB0NvdW50ZXIAAAAAAQAAAAAAAAAFVGFuZGEAAAAAAAABAAAABAAAAAEAAAAAAAAABENvZGUAAAABAAAAEAAAAAEAAAAAAAAABk1lbWJlcgAAAAAAAgAAAAQAAAATAAAAAQAAAAAAAAALTWVtYmVyc2hpcHMAAAAAAQAAABM=",
        "AAAAAAAAAKFVbiBtaWVtYnJvIHNlIHVuZSBhIGxhIHRhbmRhOiBibG9xdWVhIHN1IGNvbGF0ZXJhbCAodHJhbnNmZXJpZG8gYWwKY29udHJhdG8pLiBDdWFuZG8gc2UgY29tcGxldGEgYHNpemVgLCBsYSB0YW5kYSBwYXNhIGEgYEFjdGl2ZWAgeSBzZQpjb25nZWxhIGVsIG9yZGVuIGRlIGNvYnJvLgAAAAAAAARqb2luAAAAAgAAAAAAAAAIdGFuZGFfaWQAAAAEAAAAAAAAAAZtZW1iZXIAAAAAABMAAAAA",
        "AAAAAQAAAAAAAAAAAAAAC01lbWJlclN0YXRlAAAAAAQAAABCUHJpbmNpcGFsIGRlbCBjb2xhdGVyYWwgYcO6biBjb21wcm9tZXRpZG8gKGVuIHVuaWRhZGVzIGRlbCB0b2tlbikuAAAAAAARY29sbGF0ZXJhbF9sb2NrZWQAAAAAAAALAAAAAAAAAAlkZWZhdWx0ZWQAAAAAAAABAAAAAAAAAA9wYWlkX3RoaXNfcm91bmQAAAAAAQAAAEJTaGFyZXMgZGVsIHZhdWx0IHF1ZSByZXNwYWxkYW4gYSBlc3RlIG1pZW1icm8gKGNvbGF0ZXJhbCArIHlpZWxkKS4AAAAAAAZzaGFyZXMAAAAAAAs=",
        "AAAAAAAAAHVBbCB0ZXJtaW5hciwgZGV2dWVsdmUgYSBjYWRhIG1pZW1icm8gZWwgY29sYXRlcmFsIHF1ZSBsZSBxdWVkZS4KKEVuIGxhIEZhc2UgMiBzZSBzdW1hIGVsIHlpZWxkIGdlbmVyYWRvIGVuIERlRmluZGV4LikAAAAAAAAGZmluaXNoAAAAAAABAAAAAAAAAAh0YW5kYV9pZAAAAAQAAAAA",
        "AAAAAAAAAMZDaWVycmEgbGEgcm9uZGEgYWN0dWFsIChjcmFuayBwZXJtaXNpb25sZXNzKTogY3VicmUgY29uIGNvbGF0ZXJhbCBhIHF1aWVuCm5vIHBhZ8OzLCBwYWdhIGVsIHBvem8gY29tcGxldG8gYWwgbWllbWJybyBkZWwgdHVybm8geSBhdmFuemEgbGEgcm9uZGEuClNpIGVyYSBsYSDDumx0aW1hIHJvbmRhLCBsYSB0YW5kYSBxdWVkYSBgQ29tcGxldGVkYC4AAAAAAAZwYXlvdXQAAAAAAAEAAAAAAAAACHRhbmRhX2lkAAAABAAAAAA=",
        "AAAAAAAAAAAAAAAJZ2V0X3RhbmRhAAAAAAAAAQAAAAAAAAAIdGFuZGFfaWQAAAAEAAAAAQAAB9AAAAAFVGFuZGEAAAA=",
        "AAAAAAAAACxFbCBtaWVtYnJvIHBhZ2Egc3UgY3VvdGEgZGUgbGEgcm9uZGEgYWN0dWFsLgAAAApjb250cmlidXRlAAAAAAACAAAAAAAAAAh0YW5kYV9pZAAAAAQAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAKZ2V0X21lbWJlcgAAAAAAAgAAAAAAAAAIdGFuZGFfaWQAAAAEAAAAAAAAAAZtZW1iZXIAAAAAABMAAAABAAAH0AAAAAtNZW1iZXJTdGF0ZQA=",
        "AAAAAAAAAEFSZXN1ZWx2ZSB1biBjw7NkaWdvIGRlIGludml0YWNpw7NuIGFsIGB0YW5kYV9pZGAgY29ycmVzcG9uZGllbnRlLgAAAAAAAAppZF9ieV9jb2RlAAAAAAABAAAAAAAAAARjb2RlAAAAEAAAAAEAAAAE",
        "AAAAAAAAAIVDcmVhIHVuYSB0YW5kYSBudWV2YSB5IGRldnVlbHZlIHN1IGB0YW5kYV9pZGAuIEVsIGNyZWFkb3Igbm8gcXVlZGEKaW5zY3JpdG8gYXV0b23DoXRpY2FtZW50ZTogZGViZSBsbGFtYXIgYGpvaW5gIGNvbW8gY3VhbHF1aWVyIG90cm8uAAAAAAAADGNyZWF0ZV90YW5kYQAAAAgAAAAAAAAAB2NyZWF0b3IAAAAAEwAAAAAAAAAEY29kZQAAABAAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABXZhdWx0AAAAAAAAEwAAAAAAAAAMY29udHJpYnV0aW9uAAAACwAAAAAAAAAKY29sbGF0ZXJhbAAAAAAACwAAAAAAAAAEc2l6ZQAAAAQAAAABAAAABA==",
        "AAAAAAAAAAAAAAAPZ2V0X21lbWJlcnNoaXBzAAAAAAEAAAAAAAAABm1lbWJlcgAAAAAAEwAAAAEAAAPqAAAABA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    join: this.txFromJSON<null>,
        finish: this.txFromJSON<null>,
        payout: this.txFromJSON<null>,
        get_tanda: this.txFromJSON<Tanda>,
        contribute: this.txFromJSON<null>,
        get_member: this.txFromJSON<MemberState>,
        id_by_code: this.txFromJSON<u32>,
        create_tanda: this.txFromJSON<u32>,
        get_memberships: this.txFromJSON<Array<u32>>
  }
}