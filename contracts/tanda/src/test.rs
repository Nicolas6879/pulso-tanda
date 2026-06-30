#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env, String,
};

/// Crea un token de prueba (Stellar Asset Contract) y devuelve clientes de
/// lectura y de emisión (mint).
fn create_token<'a>(
    env: &Env,
    admin: &Address,
) -> (Address, TokenClient<'a>, StellarAssetClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let address = sac.address();
    (
        address.clone(),
        TokenClient::new(env, &address),
        StellarAssetClient::new(env, &address),
    )
}

struct Setup {
    env: Env,
    client: TandaManagerClient<'static>,
    token: TokenClient<'static>,
    token_addr: Address,
    vault_addr: Address,
    members: [Address; 3],
}

/// Monta una tanda de 3 miembros, contribución 100, colateral 300, y los une.
/// Cada miembro arranca con 1000 de saldo. El colateral se deposita en el vault.
fn setup_active() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (token_addr, token, token_admin) = create_token(&env, &admin);

    // Vault de yield (mock con la misma interfaz que DeFindex).
    let vault_addr = env.register(mock_vault::MockVault, (token_addr.clone(),));

    let contract_id = env.register(TandaManager, ());
    let client = TandaManagerClient::new(&env, &contract_id);

    let members = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];
    for m in members.iter() {
        token_admin.mint(m, &1000);
    }

    let creator = members[0].clone();
    let id = client.create_tanda(
        &creator,
        &String::from_str(&env, "ABCDEF"),
        &String::from_str(&env, "Natillera del barrio"),
        &token_addr,
        &vault_addr,
        &100,
        &300,
        &3,
    );
    assert_eq!(id, 0);

    for m in members.iter() {
        client.join(&0, m);
    }

    let tanda = client.get_tanda(&0);
    assert_eq!(tanda.status, Status::Active);
    // Cada miembro bloqueó 300 de colateral.
    for m in members.iter() {
        assert_eq!(token.balance(m), 700);
    }

    Setup {
        env,
        client,
        token,
        token_addr,
        vault_addr,
        members,
    }
}

#[test]
fn happy_path_full_rotation() {
    let s = setup_active();
    let [a, b, c] = s.members.clone();

    // 3 rondas: en cada una todos pagan y uno recibe el pozo (300).
    for _round in 0..3u32 {
        for m in [&a, &b, &c] {
            s.client.contribute(&0, m);
        }
        s.client.payout(&0);
    }

    s.client.finish(&0);

    // Tanda interés-cero: cada quien puso 3×100 = 300 en cuotas y recibió 300
    // una vez; el colateral (300) se devuelve íntegro. Saldo final = 1000.
    for m in [&a, &b, &c] {
        assert_eq!(s.token.balance(m), 1000);
    }
    assert_eq!(s.client.get_tanda(&0).status, Status::Completed);
}

#[test]
fn default_covered_by_collateral() {
    // EL "MOMENTO GANADOR": el miembro C no paga la ronda 0. El contrato cubre
    // su cuota desde su colateral; el del turno (A) cobra el pozo completo igual.
    let s = setup_active();
    let [a, b, c] = s.members.clone();

    // Ronda 0: A y B pagan, C NO paga.
    s.client.contribute(&0, &a);
    s.client.contribute(&0, &b);
    // C no llama contribute.

    let a_before = s.token.balance(&a);
    s.client.payout(&0);

    // A (turno 0) recibió el pozo completo: 3 × 100 = 300.
    assert_eq!(s.token.balance(&a), a_before + 300);

    // C quedó marcado como moroso y su colateral bajó en 100 (la cuota cubierta).
    let c_state = s.client.get_member(&0, &c);
    assert!(c_state.defaulted);
    assert_eq!(c_state.collateral_locked, 200);

    // A y B no son morosos.
    assert!(!s.client.get_member(&0, &a).defaulted);
    assert!(!s.client.get_member(&0, &b).defaulted);
}

#[test]
fn collateral_earns_yield_in_vault() {
    // El colateral genera yield mientras está en el vault. Simulamos yield
    // emitiendo token extra a la dirección del vault (sube el ratio).
    let s = setup_active();
    let [a, b, c] = s.members.clone();

    // Rotación completa sin morosos (el colateral queda intacto en el vault).
    for _round in 0..3u32 {
        for m in [&a, &b, &c] {
            s.client.contribute(&0, m);
        }
        s.client.payout(&0);
    }

    // Yield: 300 de token extra al vault (los 3 miembros lo reparten parejo).
    let token_admin = StellarAssetClient::new(&s.env, &s.token_addr);
    token_admin.mint(&s.vault_addr, &300);

    s.client.finish(&0);

    // Cada miembro recupera su colateral (300) + su parte del yield (100) → 1100.
    for m in [&a, &b, &c] {
        assert_eq!(s.token.balance(m), 1100);
    }
}

#[test]
fn member_can_be_in_multiple_tandas_isolated() {
    let s = setup_active();
    let a = s.members[0].clone();

    // A crea y entra a una segunda tanda con otros miembros.
    let x = Address::generate(&s.env);
    let y = Address::generate(&s.env);
    let token_admin = StellarAssetClient::new(&s.env, &s.token_addr);
    token_admin.mint(&x, &1000);
    token_admin.mint(&y, &1000);

    let id2 = s.client.create_tanda(
        &a,
        &String::from_str(&s.env, "WORK01"),
        &String::from_str(&s.env, "Tanda del trabajo"),
        &s.token_addr,
        &s.vault_addr,
        &50,
        &150,
        &3,
    );
    assert_eq!(id2, 1);
    s.client.join(&id2, &a);
    s.client.join(&id2, &x);
    s.client.join(&id2, &y);

    // A pertenece a ambas tandas; colaterales independientes.
    let memberships = s.client.get_memberships(&a);
    assert_eq!(memberships.len(), 2);
    assert_eq!(s.client.get_member(&0, &a).collateral_locked, 300);
    assert_eq!(s.client.get_member(&id2, &a).collateral_locked, 150);
}
