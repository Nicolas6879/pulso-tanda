# Despliegues — TandaManager

## Testnet
- **TandaManager:** `CDTXLDZMTOYXLXI254YA2CPKGAURPWRLSC6Z6TS6BQUYCQOJEHQJPFY7` (con código de invitación de 6 letras)
- **MockVault:** `CB75TJBDT2M543R3VR7NZBXAZMPQUUSPGLOYHEGKQCKHU5R7IKNT4CWW` (construido sobre el SAC de XLM nativo como placeholder de token)
- Deployer (identidad `deployer`): `GASNBDAQFINKCIFAOBJ6466DKPNMBJ5FFBR6SWOGE34HBN4GFSMIT7WI`
- Explorer: https://stellar.expert/explorer/testnet/contract/CDTXLDZMTOYXLXI254YA2CPKGAURPWRLSC6Z6TS6BQUYCQOJEHQJPFY7
- _Deploys previos (obsoletos): `CABPREZIT…` (Fase 2 sin código), `CBNMYIFMHZ…` (Fase 1)._
- Nota: la UI trabaja en XLM; el contrato guarda stroops (1 XLM = 10⁷). El front convierte.

## Mainnet
- _Pendiente (Fase 5)._

## Comandos útiles
```bash
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
. "$HOME/.cargo/env"
# build
stellar contract build
# tests
cargo test -p tanda
# redeploy testnet
stellar contract deploy --wasm target/wasm32v1-none/release/tanda.wasm \
  --source deployer --network testnet --alias tanda
# deploy mock vault (requiere dirección de token)
stellar contract deploy --wasm target/wasm32v1-none/release/mock_vault.wasm \
  --source deployer --network testnet --alias mock_vault -- --token <TOKEN_ADDR>
```

## Notas
- `create_tanda(creator, name, token, vault, contribution, collateral, size)` — el `vault`
  apunta al MockVault en testnet y apuntará al vault USDC de DeFindex en mainnet
  (`CDB2WMKQQNVZMEBY7Q7GZ5C7E7IAFSNMZ7GGVD6WKTCEWK7XOIAVZSAP`, Fixed Pool USDC).
