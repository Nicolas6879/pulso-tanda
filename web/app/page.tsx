"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { useCreateWallet } from "@privy-io/react-auth/extended-chains";
import {
  getClient,
  fetchMemberships,
  fetchTanda,
  fetchMember,
  fetchBalance,
  fetchIdByCode,
  fundWithFriendbot,
  accountExists,
  toStroops,
  fromStroops,
  genCode,
  TOKEN,
  MOCK_VAULT,
  type Tanda,
  type MemberState,
  type RawHashSigner,
} from "@/lib/stellar";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const statusTag = (s: any) => String(s?.tag ?? s);
const fmtXlm = (stroops: any) =>
  fromStroops(stroops).toLocaleString("es-CO", { maximumFractionDigits: 2 });

function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn-ghost"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? "¡Copiado!" : label}
    </button>
  );
}

/** Muestra un código de invitación grande con botón de copiar. */
function CodeTag({ code }: { code: string }) {
  return (
    <div className="codebox">
      <div>
        <span className="codebox-label">Código de invitación</span>
        <b className="codebox-code">{code}</b>
      </div>
      <CopyButton value={code} label="Copiar código" />
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="dot">🤝</span> PULSO Tanda
    </div>
  );
}

/** Extrae la dirección Stellar (G...) del usuario de Privy. */
function useStellarAddress(): string | null {
  const { user } = usePrivy();
  return useMemo(() => {
    const accounts = (user?.linkedAccounts ?? []) as any[];
    const wallet = accounts.find((a) => a.type === "wallet" && a.chainType === "stellar");
    return wallet?.address ?? null;
  }, [user]);
}

export default function Home() {
  const { ready, authenticated, logout, user } = usePrivy();
  const { login } = useLogin();
  const { signRawHash } = useSignRawHash();
  const { createWallet } = useCreateWallet();
  const address = useStellarAddress();
  const creatingRef = useRef(false);

  useEffect(() => {
    if (authenticated && user && !address && !creatingRef.current) {
      creatingRef.current = true;
      createWallet({ chainType: "stellar" }).catch(() => {
        creatingRef.current = false;
      });
    }
  }, [authenticated, user, address, createWallet]);

  if (!ready)
    return (
      <div className="container">
        <p className="muted">Abriendo…</p>
      </div>
    );

  if (!authenticated)
    return (
      <div className="container">
        <div className="topbar">
          <Brand />
        </div>
        <section className="hero">
          <div className="hero-grid">
            <div>
              <div className="eyebrow">Natilleras · sobre Stellar</div>
              <h1>
                La natillera de toda la vida, <em>a prueba de incumplidos</em>.
              </h1>
              <p>
                Arma tu grupo de ahorro, pon tu cuota cada ronda y recibe el pozo
                cuando es tu turno. Si alguien no paga, su colateral lo cubre y a
                ti no te dejan colgado. Tu ahorro hasta genera rendimiento mientras
                espera su turno.
              </p>
              <div className="row">
                <button className="btn-primary" onClick={() => login()}>
                  Entrar con correo o Google
                </button>
                <span className="muted">sin app · sin frases raras</span>
              </div>
            </div>
            <div className="hero-art">
              <HeroWheel size={300} />
            </div>
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <b>0%</b>
              <span>de comisión — es tu plata</span>
            </div>
            <div className="hero-stat">
              <b>Colateral</b>
              <span>cubre al que no paga</span>
            </div>
            <div className="hero-stat">
              <b>Rendimiento</b>
              <span>tu ahorro trabaja mientras espera</span>
            </div>
          </div>
        </section>
      </div>
    );

  return (
    <div className="container">
      <div className="topbar">
        <Brand />
      </div>
      {!address ? (
        <div className="card">Creando tu billetera…</div>
      ) : (
        <Dashboard
          address={address}
          signRawHash={signRawHash as RawHashSigner}
          onLogout={logout}
        />
      )}
    </div>
  );
}

function Dashboard({
  address,
  signRawHash,
  onLogout,
}: {
  address: string;
  signRawHash: RawHashSigner;
  onLogout: () => void;
}) {
  const [tandas, setTandas] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [funded, setFunded] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const exists = await accountExists(address);
      setFunded(exists);
      setBalance(exists ? await fetchBalance(address) : "0");
      setTandas(exists ? await fetchMemberships(address) : []);
    } catch (e: any) {
      setStatus("No pudimos cargar tus tandas: " + e.message);
    }
  }, [address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const fund = useCallback(async () => {
    setBusy(true);
    setStatus("Activando tu billetera con saldo de prueba…");
    try {
      await fundWithFriendbot(address);
      setStatus("Billetera activada. Ya puedes crear o unirte a una tanda.");
      await refresh();
    } catch (e: any) {
      setStatus("No se pudo activar: " + e.message);
    } finally {
      setBusy(false);
    }
  }, [address, refresh]);

  const send = useCallback(
    async (
      label: string,
      fn: (client: ReturnType<typeof getClient>) => Promise<any>
    ): Promise<any> => {
      setBusy(true);
      setStatus(label + "…");
      console.log("[PULSO] →", label);
      try {
        const client = getClient(address, signRawHash);
        const at = await fn(client);
        console.log("[PULSO] simulación lista, firmando…", label);
        const sent = await at.signAndSend();
        console.log("[PULSO] enviado ✓", label, sent);
        setStatus(label + " — listo ✓");
        await refresh();
        return sent?.result;
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        console.error("[PULSO] ERROR en:", label, e);
        setStatus("Algo falló: " + msg);
        alert("Error al " + label.toLowerCase() + ":\n\n" + msg);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [address, signRawHash, refresh]
  );

  const fmtBalance = (b: string | null) => {
    if (b === null) return "—";
    const n = Number(b);
    return n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <>
      <div className="walletcard rise rise-1">
        <div className="wc-top">
          <span className="wc-label">Mi billetera</span>
          <span className="chip">{funded ? "● activa" : "○ sin activar"}</span>
        </div>
        <div className="wc-balance">
          <b>{fmtBalance(balance)}</b>
          <span className="unit">XLM</span>
        </div>
        <div className="wc-bottom">
          <a
            className="wc-addr"
            href={`https://stellar.expert/explorer/testnet/account/${address}`}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "underline" }}
            title="Ver historial de movimientos"
          >
            {short(address)} ↗
          </a>
          <div className="row">
            <button className="iconbtn" onClick={() => navigator.clipboard?.writeText(address)}>
              Copiar
            </button>
            <button className="iconbtn" onClick={onLogout}>
              Salir
            </button>
          </div>
        </div>
      </div>

      {funded === false && (
        <div className="card rise rise-2">
          <div className="card-eyebrow">
            <span className="ic">✨</span> Primer paso
          </div>
          <h3>Activa tu billetera</h3>
          <p className="sub">Es nueva. La activamos con saldo de prueba para que puedas empezar.</p>
          <button className="btn-primary" disabled={busy} onClick={fund}>
            Activar con saldo de prueba
          </button>
        </div>
      )}

      <div className="section-label">Acciones</div>

      <CreateTanda busy={busy} send={send} address={address} onPick={setSelected} />
      <JoinTanda busy={busy} send={send} address={address} onPick={setSelected} />

      <div className="section-label">Mis tandas</div>
      <div className="card rise rise-4">
        {tandas.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>
            Todavía no estás en ninguna. Crea una arriba o únete con un código.
          </p>
        ) : (
          tandas.map((id, i) => (
            <div key={id}>
              {i > 0 && <div className="divider" />}
              <div className="row between">
                <span className="mono">Tanda #{id}</span>
                <button className="btn-ghost" onClick={() => setSelected(id)}>
                  Abrir
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {selected !== null && (
        <TandaDetail tandaId={selected} address={address} busy={busy} send={send} />
      )}

      {status && <div className="status">{status}</div>}
    </>
  );
}

function CreateTanda({ busy, send, address, onPick }: any) {
  const [name, setName] = useState("Natillera del barrio");
  const [contribution, setContribution] = useState("100");
  const [collateral, setCollateral] = useState("300");
  const [size, setSize] = useState("3");
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  return (
    <div className="card lift rise rise-2">
      <div className="card-eyebrow">
        <span className="ic">🫙</span> Nueva tanda
      </div>
      <h3>Crear una tanda</h3>
      <p className="sub">Define la cuota, el colateral y cuántos son. Tú también te unes después.</p>

      {createdCode && <CodeTag code={createdCode} />}

      <div className="field">
        <label>Nombre</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid-3">
        <div className="field">
          <label>Cuota por ronda (XLM)</label>
          <input className="amount" value={contribution} onChange={(e) => setContribution(e.target.value)} />
        </div>
        <div className="field">
          <label>Colateral (XLM)</label>
          <input className="amount" value={collateral} onChange={(e) => setCollateral(e.target.value)} />
        </div>
        <div className="field">
          <label>Nº de miembros</label>
          <input className="amount" value={size} onChange={(e) => setSize(e.target.value)} />
        </div>
      </div>
      <button
        className="btn-primary"
        disabled={busy}
        onClick={async () => {
          const code = genCode();
          const id = await send("Creando la tanda", (client: any) =>
            client.create_tanda({
              creator: address,
              code,
              name,
              token: TOKEN,
              vault: MOCK_VAULT,
              contribution: toStroops(contribution),
              collateral: toStroops(collateral),
              size: Number(size),
            })
          );
          if (id !== undefined && id !== null) {
            setCreatedCode(code);
            onPick?.(Number(id));
          }
        }}
      >
        Crear tanda
      </button>
    </div>
  );
}

function JoinTanda({ busy, send, address, onPick }: any) {
  const [id, setId] = useState("");
  return (
    <div className="card lift rise rise-3">
      <div className="card-eyebrow">
        <span className="ic">🔑</span> Con código
      </div>
      <h3>Unirme a una tanda</h3>
      <p className="sub">Pega el código que te compartieron. Al entrar bloqueas tu colateral.</p>
      <div className="row">
        <input
          style={{ flex: 1, minWidth: 160, letterSpacing: "0.18em", textTransform: "uppercase" }}
          className="amount"
          value={id}
          maxLength={6}
          onChange={(e) => setId(e.target.value.toUpperCase())}
          placeholder="DASDRF"
        />
        <button
          className="btn-primary"
          disabled={busy || id.length < 6}
          onClick={async () => {
            let tandaId: number | undefined;
            try {
              await send("Uniéndote a la tanda", async (client: any) => {
                tandaId = await fetchIdByCode(address, id);
                return client.join({ tanda_id: tandaId, member: address });
              });
              if (tandaId !== undefined) onPick(tandaId);
            } catch {
              /* el estado ya lo muestra send */
            }
          }}
        >
          Unirme
        </button>
      </div>
    </div>
  );
}

/** Coloca asientos alrededor de un círculo de tamaño `size`. */
function seatPos(i: number, n: number, size: number) {
  const c = size / 2;
  const r = c - 34;
  const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
  return { left: c + r * Math.cos(angle), top: c + r * Math.sin(angle) };
}

/** Rueda de la tanda: miembros alrededor, pozo en el centro, turno resaltado. */
function TurnWheel({
  tanda,
  states,
  size = 300,
}: {
  tanda: Tanda;
  states: Record<string, MemberState>;
  size?: number;
}) {
  const n = tanda.members.length;
  const pot = fromStroops(tanda.contribution) * n;
  const active = statusTag(tanda.status) === "Active";
  return (
    <>
      <div className="wheel-stage">
        <div className="wheel" style={{ width: size, height: size }}>
          <div className="wheel-center">
            <small>Pozo · XLM</small>
            <b>{pot.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</b>
            <small style={{ marginTop: 2 }}>ronda {tanda.current_round + 1}</small>
          </div>
          {tanda.members.map((m, i) => {
            const isTurn = i === tanda.current_round;
            const paid = states[m]?.paid_this_round;
            const cls = isTurn ? "turn" : paid ? "paid" : active ? "due" : "";
            return (
              <div key={m} className={`seat ${cls}`} style={seatPos(i, n, size)} title={m}>
                {isTurn ? "★" : i + 1}
              </div>
            );
          })}
        </div>
      </div>
      {active && (
        <div className="wheel-legend">
          <span><i style={{ background: "var(--amber)" }} /> le toca</span>
          <span><i style={{ background: "var(--emerald)" }} /> ya pagó</span>
          <span><i style={{ background: "var(--danger)" }} /> debe</span>
        </div>
      )}
    </>
  );
}

/** Línea de tiempo de las rondas: a quién le toca en cada una y su estado. */
function RoundsTimeline({ tanda, me }: { tanda: Tanda; me: string }) {
  const cur = tanda.current_round;
  const completed = statusTag(tanda.status) === "Completed";
  return (
    <div className="rounds">
      {tanda.payout_order.map((addr, i) => {
        const done = completed || i < cur;
        const active = !completed && i === cur;
        return (
          <div key={i} className={`round ${done ? "done" : active ? "active" : ""}`}>
            <span className="round-n">{i + 1}</span>
            <span className="round-addr">
              {short(addr)}
              {addr === me ? " · tú" : ""}
            </span>
            <span className="round-state">
              {done ? "cobró ✓" : active ? "en curso" : "por venir"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Rueda decorativa para el hero (sin datos). */
function HeroWheel({ size = 300 }: { size?: number }) {
  const seats = [
    { c: "turn", n: "★" },
    { c: "paid", n: "2" },
    { c: "paid", n: "3" },
    { c: "due", n: "4" },
    { c: "paid", n: "5" },
  ];
  return (
    <div className="wheel-stage">
      <div className="wheel" style={{ width: size, height: size }}>
        <div className="wheel-center">
          <small>Pozo</small>
          <b>500</b>
          <small style={{ marginTop: 2 }}>ronda 1</small>
        </div>
        {seats.map((s, i) => (
          <div key={i} className={`seat ${s.c}`} style={seatPos(i, seats.length, size)}>
            {s.n}
          </div>
        ))}
      </div>
    </div>
  );
}

function TandaDetail({ tandaId, address, busy, send }: any) {
  const [tanda, setTanda] = useState<Tanda | null>(null);
  const [states, setStates] = useState<Record<string, MemberState>>({});

  const load = useCallback(async () => {
    try {
      const t = await fetchTanda(address, tandaId);
      setTanda(t);
      const entries = await Promise.all(
        t.members.map(async (m) => [m, await fetchMember(address, tandaId, m).catch(() => null)] as const)
      );
      const map: Record<string, MemberState> = {};
      for (const [m, s] of entries) if (s) map[m] = s;
      setStates(map);
    } catch {
      /* noop */
    }
  }, [address, tandaId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!tanda) return <div className="card">Abriendo tanda #{tandaId}…</div>;

  const me = states[address];
  const status = statusTag(tanda.status);
  const recipient = tanda.payout_order[tanda.current_round];

  return (
    <div className="card">
      <div className="row between">
        <h3>{tanda.name}</h3>
        <span
          className={`pill ${status === "Active" ? "pill-emerald" : status === "Completed" ? "pill-amber" : "pill-amber"}`}
        >
          {status === "Open" ? `${tanda.members.length}/${tanda.size} unidos` : status === "Active" ? "en marcha" : "terminada"}
        </span>
      </div>
      <p className="sub" style={{ marginTop: 6 }}>
        cuota <span className="mono">{fmtXlm(tanda.contribution)} XLM</span> · colateral{" "}
        <span className="mono">{fmtXlm(tanda.collateral)} XLM</span>
      </p>

      <CodeTag code={tanda.code} />

      <TurnWheel tanda={tanda} states={states} />

      {status === "Active" && recipient && (
        <p className="muted" style={{ textAlign: "center" }}>
          Le toca a <span className="addr">{short(recipient)}</span>
          {recipient === address && " — ¡eres tú!"}
        </p>
      )}

      {status !== "Open" && (
        <>
          <div className="section-label" style={{ margin: "18px 4px 8px" }}>
            Rondas — turno de cobro
          </div>
          <RoundsTimeline tanda={tanda} me={address} />
        </>
      )}

      <div className="divider" />

      {status === "Open" ? (
        me ? (
          <p className="muted">
            Ya estás dentro. Faltan {tanda.size - tanda.members.length} para arrancar —
            comparte el código <b className="mono">{tanda.code}</b>.
          </p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
              Únete y bloquea tu colateral (<span className="mono">{fmtXlm(tanda.collateral)} XLM</span>)
              para entrar a esta tanda.
            </p>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() =>
                send("Uniéndote a la tanda", (c: any) =>
                  c.join({ tanda_id: tandaId, member: address })
                ).then(load)
              }
            >
              Unirme y bloquear colateral
            </button>
          </>
        )
      ) : status === "Completed" ? (
        <button
          className="btn-amber"
          disabled={busy}
          onClick={() => send("Cerrando y devolviendo colaterales", (c: any) => c.finish({ tanda_id: tandaId })).then(load)}
        >
          Repartir colaterales + rendimiento
        </button>
      ) : (
        <>
          <div className="row">
            <button
              className="btn-primary"
              disabled={busy || me?.paid_this_round === true}
              onClick={() =>
                send("Pagando tu cuota", (c: any) => c.contribute({ tanda_id: tandaId, member: address })).then(load)
              }
            >
              {me?.paid_this_round ? "Cuota pagada ✓" : "Pagar mi cuota"}
            </button>
            <button
              className="btn-amber"
              disabled={busy}
              onClick={() =>
                send("Cerrando la ronda", (c: any) => c.payout({ tanda_id: tandaId })).then(load)
              }
            >
              Cerrar ronda y entregar el pozo
            </button>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            Al cerrar la ronda, si alguien no pagó, su colateral cubre la cuota y
            quien tiene el turno recibe el pozo completo igual.
          </p>
        </>
      )}
    </div>
  );
}
