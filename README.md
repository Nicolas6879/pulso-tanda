<div align="center">

# 🤝 PULSO Tanda

### La natillera de toda la vida, on-chain y a prueba de incumplidos

Ahorro rotativo de grupo (tanda / natillera / cadena) como contrato inteligente en
**Stellar / Soroban**, con **colateral que cubre al que no paga** y **rendimiento**
sobre las garantías mientras esperan su turno.

_Hackathon PULSO · NearX × Stellar Development Foundation · Track Colombia_

</div>

---

## El problema

Millones de colombianos ahorran en **natilleras / tandas**: un grupo cerrado aporta
una cuota cada ronda y, por turnos, cada quien se lleva el pozo completo. Es ahorro
sin banco, sin intereses, basado en confianza. Pero tiene una grieta: **cuando
alguien deja de pagar, rompe la cadena** y los demás pierden. Y todo se lleva en una
libreta o en la cabeza del organizador.

## La solución

PULSO Tanda lleva ese mismo acuerdo a un contrato Soroban que **hace cumplir las
reglas sin un intermediario**:

- Cada miembro **bloquea un colateral** al entrar.
- Si alguien **no paga** su cuota, el contrato la **cubre desde su colateral** y
  quien tiene el turno **recibe el pozo completo igual** — nadie queda colgado.
- El colateral **genera rendimiento** en un vault de yield mientras espera, lo que
  permite **cero comisión** y premia a quien cumple.
- Al final, cada quien recupera su colateral restante **+ su parte del rendimiento**.

> **El momento que lo cambia todo:** un miembro no paga → al cerrar la ronda, el
> contrato descuenta la cuota de su colateral → el del turno cobra completo → el
> moroso pierde esa porción. Todo on-chain, verificable, por menos de un centavo.

## Integraciones (load-bearing, de la lista SCF)

| Pieza | Rol en el producto | Estado |
|---|---|---|
| **Contrato Soroban `TandaManager`** | Lógica de la tanda, colateral y cobertura de default | Testnet ✅ |
| **Vault de yield (interfaz DeFindex)** | Rendimiento sobre el colateral | MockVault en testnet · DeFindex USDC en mainnet |
| **Privy** | Login con Google/correo → wallet de Stellar **sin frase semilla** | Integrado ✅ |
| **Anchor SEP-24** | On/off-ramp COP ↔ dólar digital (Anchor Platform; alfredpay en prod) | Diseñado |

El vault implementa **la misma interfaz `deposit`/`withdraw` que DeFindex**, así que
el mismo código corre contra el MockVault (testnet) y contra el vault USDC real de
DeFindex en mainnet — solo cambia la dirección.

## Arquitectura

```
Usuario (Google / correo)
   │  Privy → embedded wallet de Stellar (sin seed)
   ▼
[ Frontend Next.js ] ──firma (Privy) + invoca──► [ Soroban / Stellar ]
   │                                                    │
   │  SEP-24 (COP → USDC)                               ▼
   ▼                                          [ TandaManager ]
[ Anchor SEP-24 ]                                       │  colateral
   (Anchor Platform / alfredpay)                        ▼
                                              [ Vault de yield (DeFindex) ]
```

**Flujo de valor:** COP → anchor (on-ramp) → USDC → `join`/`contribute` →
colateral al vault (yield) → al cobrar, el del turno recibe el pozo; si alguien no
pagó, se cubre desde su colateral → al terminar, off-ramp USDC → COP.

## El contrato `TandaManager`

Un solo contrato administra muchas tandas (por `tanda_id`), cada una con un **código
de invitación de 6 letras único**.

| Función | Qué hace |
|---|---|
| `create_tanda(creator, code, name, token, vault, contribution, collateral, size)` | Crea una tanda |
| `join(tanda_id, member)` | Entra y **bloquea su colateral en el vault** |
| `contribute(tanda_id, member)` | Paga su cuota de la ronda |
| `payout(tanda_id)` | Cierra la ronda: cubre morosos desde su colateral y paga el pozo al del turno |
| `finish(tanda_id)` | Devuelve colateral + rendimiento a cada quien |
| `id_by_code(code)` · `get_tanda` · `get_member` · `get_memberships` | Lecturas |

- **Colateral por-tanda y aislado:** estar en N tandas = N colaterales independientes.
- **`payout` y `finish` son permissionless:** cualquiera los dispara, pero el contrato
  es quien aplica las reglas (no se puede hacer trampa).
- **4 pruebas** cubren: rotación feliz, cobertura de default, rendimiento y multi-tanda.

## Tech stack

- **Contrato:** Rust + `soroban-sdk` 26, `stellar-cli` 27.
- **Frontend:** Next.js 15 + TypeScript, `@stellar/stellar-sdk`, Privy (`useSignRawHash`).
- **Bindings:** generados con `stellar contract bindings typescript`.

## Cómo correr

**Contrato**
```bash
# requiere Rust + target wasm32v1-none + stellar-cli
cargo test                  # 4 tests: happy · default · yield · multi-tanda
stellar contract build
```

**Frontend**
```bash
cd web
cp .env.local.example .env.local
npm install
npm run dev                 # http://localhost:3000
```
> En testnet, cada wallet se activa con XLM de prueba (botón **"Activar billetera"**
> que usa friendbot). Los montos se muestran en XLM; el contrato guarda stroops.

## Despliegues (testnet)

| Contrato | Dirección |
|---|---|
| `TandaManager` | `CDTXLDZMTOYXLXI254YA2CPKGAURPWRLSC6Z6TS6BQUYCQOJEHQJPFY7` |
| `MockVault` (DeFindex-compatible) | `CB75TJBDT2M543R3VR7NZBXAZMPQUUSPGLOYHEGKQCKHU5R7IKNT4CWW` |

[Ver `TandaManager` en stellar.expert](https://stellar.expert/explorer/testnet/contract/CDTXLDZMTOYXLXI254YA2CPKGAURPWRLSC6Z6TS6BQUYCQOJEHQJPFY7)
· Más detalle en [`DEPLOYMENTS.md`](./DEPLOYMENTS.md).

## Cómo encaja en los criterios

- **Integración y complejidad técnica (35%)** — compone contrato Soroban custom +
  vault de yield (DeFindex) + onboarding sin seed (Privy) + anchor SEP-24, con
  lógica no trivial de colateral y cobertura de default.
- **Impacto en el ecosistema (25%)** — conecta el ahorro informal colombiano con
  dólares digitales en Stellar; whitespace real (no hay ROSCAs en el directorio SCF).
- **Customer discovery (20%)** — entrevistas a personas que han estado en natilleras;
  el dolor del incumplido es unánime y el colateral es la pieza que faltaba.
- **Deploy (20%)** — funcionando en testnet (contrato + vault), camino a mainnet con
  DeFindex real.

## Documentación

- [`docs/PITCH.md`](./docs/PITCH.md) — contenido del pitch deck.
- [Pitch deck (HTML)](./docs/pitch.html) — versión presentable, exportable a PDF.
- [`web/README.md`](./web/README.md) — detalle del frontend.

## Equipo

Charaleños · PULSO Hackathon 2026.
