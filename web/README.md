# PULSO Tanda — Frontend

Next.js + Privy (login Google/email, embedded wallet de Stellar) + bindings del
contrato TandaManager.

## Correr

```bash
cd web
cp .env.local.example .env.local   # ya trae el App ID de Privy y los contratos de testnet
npm install
npm run dev
# http://localhost:3000
```

## Flujo

1. **Entrar** con Google/correo (Privy crea el wallet de Stellar, sin seed phrase).
2. **Crear tanda** (cuota, colateral, nº de miembros) → `create_tanda`.
3. Compartir el **ID**; cada miembro **se une** → `join` (bloquea su colateral en el vault de yield).
4. En el detalle: **Pagar mi cuota** → `contribute`.
5. **Cerrar ronda y pagar** → `payout`: si alguien no pagó, el contrato cubre su
   cuota desde su colateral y el del turno cobra el pozo completo (**el momento ganador**).

## Notas / por verificar en navegador

- **Firma Privy↔Soroban** (`lib/stellar.ts`): se firma el hash del sobre con
  `useSignRawHash({ chainType: "stellar" })` y las auth entries con
  `authorizeEntry`. Es el punto a validar en el primer run real.
- **Fondeo:** el wallet de cada miembro necesita saldo del token del pozo. En
  testnet el token es el SAC de XLM nativo → fondear el wallet con friendbot
  (XLM de testnet). Montos pequeños (ej. cuota 100) para que alcance.
- **Mainnet (Fase 5):** cambiar en `.env.local` el `NEXT_PUBLIC_TANDA_CONTRACT`,
  `NEXT_PUBLIC_TOKEN` (USDC SAC) y apuntar el `vault` al vault USDC real de DeFindex.
