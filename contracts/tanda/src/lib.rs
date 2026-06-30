#![no_std]
//! TandaManager — tandas / natilleras (ROSCA) on-chain en Soroban.
//!
//! Un solo contrato administra muchas tandas vía `tanda_id`. Cada miembro
//! bloquea un colateral al unirse; si no paga una cuota, el contrato la cubre
//! desde su colateral y el del turno cobra el pozo completo igual. El colateral
//! es por-tanda y está aislado (estar en N tandas = N colaterales independientes).
//!
//! La capa de yield (DeFindex) sobre el colateral se integra en la Fase 2.

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractclient, contracterror, contractimpl, contracttype, token, Address, Env,
    IntoVal, String, Symbol, Val, Vec,
};

/// Interfaz del vault de yield. La firma coincide con el vault real de DeFindex,
/// de modo que el mismo code-path sirve para el MockVault (testnet/tests) y para
/// el vault USDC de DeFindex (mainnet) — solo cambia la dirección.
#[contractclient(name = "VaultClient")]
pub trait VaultInterface {
    fn deposit(
        env: Env,
        amounts_desired: Vec<i128>,
        amounts_min: Vec<i128>,
        from: Address,
        invest: bool,
    ) -> (Vec<i128>, i128, Option<Vec<Val>>);

    fn withdraw(
        env: Env,
        df_amount: i128,
        min_amounts_out: Vec<i128>,
        from: Address,
    ) -> Vec<i128>;
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    TandaNotFound = 1,
    NotOpen = 2,
    AlreadyMember = 3,
    Full = 4,
    NotActive = 5,
    NotMember = 6,
    AlreadyPaid = 7,
    NotCompleted = 8,
    InvalidParams = 9,
    CodeTaken = 10,
}

#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum Status {
    Open,
    Active,
    Completed,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Tanda {
    pub id: u32,
    /// Código corto único para compartir e invitar (p. ej. "DASDRF").
    pub code: String,
    pub name: String,
    pub token: Address,
    /// Vault de yield (MockVault en testnet, DeFindex en mainnet).
    pub vault: Address,
    pub contribution: i128,
    pub collateral: i128,
    pub size: u32,
    pub members: Vec<Address>,
    pub payout_order: Vec<Address>,
    pub current_round: u32,
    pub status: Status,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct MemberState {
    /// Principal del colateral aún comprometido (en unidades del token).
    pub collateral_locked: i128,
    /// Shares del vault que respaldan a este miembro (colateral + yield).
    pub shares: i128,
    pub paid_this_round: bool,
    pub defaulted: bool,
}

#[contracttype]
pub enum DataKey {
    Counter,
    Tanda(u32),
    Code(String),
    Member(u32, Address),
    Memberships(Address),
}

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

#[contract]
pub struct TandaManager;

#[contractimpl]
impl TandaManager {
    /// Crea una tanda nueva y devuelve su `tanda_id`. El creador no queda
    /// inscrito automáticamente: debe llamar `join` como cualquier otro.
    pub fn create_tanda(
        env: Env,
        creator: Address,
        code: String,
        name: String,
        token: Address,
        vault: Address,
        contribution: i128,
        collateral: i128,
        size: u32,
    ) -> u32 {
        creator.require_auth();

        // Validaciones: grupo de al menos 2, montos positivos y colateral
        // suficiente para cubrir al menos una cuota impaga.
        if size < 2 || contribution <= 0 || collateral < contribution {
            panic_err(&env, Error::InvalidParams);
        }
        // El código debe ser único entre todas las tandas.
        if env.storage().persistent().has(&DataKey::Code(code.clone())) {
            panic_err(&env, Error::CodeTaken);
        }

        let id = env
            .storage()
            .instance()
            .get(&DataKey::Counter)
            .unwrap_or(0u32);
        env.storage().instance().set(&DataKey::Counter, &(id + 1));
        env.storage()
            .persistent()
            .set(&DataKey::Code(code.clone()), &id);

        let tanda = Tanda {
            id,
            code,
            name,
            token,
            vault,
            contribution,
            collateral,
            size,
            members: Vec::new(&env),
            payout_order: Vec::new(&env),
            current_round: 0,
            status: Status::Open,
        };
        save_tanda(&env, &tanda);
        id
    }

    /// Un miembro se une a la tanda: bloquea su colateral (transferido al
    /// contrato). Cuando se completa `size`, la tanda pasa a `Active` y se
    /// congela el orden de cobro.
    pub fn join(env: Env, tanda_id: u32, member: Address) {
        member.require_auth();
        let mut tanda = load_tanda(&env, tanda_id);

        if tanda.status != Status::Open {
            panic_err(&env, Error::NotOpen);
        }
        if tanda.members.contains(&member) {
            panic_err(&env, Error::AlreadyMember);
        }
        if tanda.members.len() >= tanda.size {
            panic_err(&env, Error::Full);
        }

        // Bloquea el colateral: lo pasa al contrato y lo deposita en el vault
        // de yield. Las shares recibidas respaldan a este miembro.
        let contract = env.current_contract_address();
        token::Client::new(&env, &tanda.token).transfer(&member, &contract, &tanda.collateral);
        let shares = vault_deposit(&env, &tanda.token, &tanda.vault, tanda.collateral);

        tanda.members.push_back(member.clone());
        save_member(
            &env,
            tanda_id,
            &member,
            &MemberState {
                collateral_locked: tanda.collateral,
                shares,
                paid_this_round: false,
                defaulted: false,
            },
        );
        add_membership(&env, &member, tanda_id);

        // Si se llenó, arranca: el orden de cobro = orden de inscripción.
        if tanda.members.len() == tanda.size {
            tanda.payout_order = tanda.members.clone();
            tanda.status = Status::Active;
        }
        save_tanda(&env, &tanda);
    }

    /// El miembro paga su cuota de la ronda actual.
    pub fn contribute(env: Env, tanda_id: u32, member: Address) {
        member.require_auth();
        let tanda = load_tanda(&env, tanda_id);
        if tanda.status != Status::Active {
            panic_err(&env, Error::NotActive);
        }
        let mut state = load_member(&env, tanda_id, &member);
        if state.paid_this_round {
            panic_err(&env, Error::AlreadyPaid);
        }

        let contract = env.current_contract_address();
        token::Client::new(&env, &tanda.token).transfer(
            &member,
            &contract,
            &tanda.contribution,
        );

        state.paid_this_round = true;
        save_member(&env, tanda_id, &member, &state);
    }

    /// Cierra la ronda actual (crank permisionless): cubre con colateral a quien
    /// no pagó, paga el pozo completo al miembro del turno y avanza la ronda.
    /// Si era la última ronda, la tanda queda `Completed`.
    pub fn payout(env: Env, tanda_id: u32) {
        let mut tanda = load_tanda(&env, tanda_id);
        if tanda.status != Status::Active {
            panic_err(&env, Error::NotActive);
        }

        let contract = env.current_contract_address();
        let token_client = token::Client::new(&env, &tanda.token);
        let vault = VaultClient::new(&env, &tanda.vault);
        let recipient = tanda.payout_order.get(tanda.current_round).unwrap();

        // Cubrir a los morosos: se retira su colateral del vault, se toma la
        // cuota para financiar el pozo y el resto (con su yield) se re-deposita.
        for member in tanda.members.iter() {
            let mut state = load_member(&env, tanda_id, &member);
            if !state.paid_this_round {
                let got = vault
                    .withdraw(&state.shares, &vec1(&env, 0), &contract)
                    .get(0)
                    .unwrap();
                let remaining = got - tanda.contribution;
                if remaining > 0 {
                    state.shares = vault_deposit(&env, &tanda.token, &tanda.vault, remaining);
                } else {
                    state.shares = 0;
                }
                state.collateral_locked -= tanda.contribution;
                state.defaulted = true;
            }
            // Reset para la siguiente ronda.
            state.paid_this_round = false;
            save_member(&env, tanda_id, &member, &state);
        }

        // Paga el pozo completo: contribución × tamaño del grupo.
        let pot = tanda.contribution * (tanda.size as i128);
        token_client.transfer(&contract, &recipient, &pot);

        tanda.current_round += 1;
        if tanda.current_round == tanda.size {
            tanda.status = Status::Completed;
        }
        save_tanda(&env, &tanda);
    }

    /// Al terminar, devuelve a cada miembro el colateral que le quede.
    /// (En la Fase 2 se suma el yield generado en DeFindex.)
    pub fn finish(env: Env, tanda_id: u32) {
        let tanda = load_tanda(&env, tanda_id);
        if tanda.status != Status::Completed {
            panic_err(&env, Error::NotCompleted);
        }
        let contract = env.current_contract_address();
        let token_client = token::Client::new(&env, &tanda.token);
        let vault = VaultClient::new(&env, &tanda.vault);

        for member in tanda.members.iter() {
            let mut state = load_member(&env, tanda_id, &member);
            if state.shares > 0 {
                // Retira colateral restante + yield acumulado y lo devuelve.
                let got = vault
                    .withdraw(&state.shares, &vec1(&env, 0), &contract)
                    .get(0)
                    .unwrap();
                token_client.transfer(&contract, &member, &got);
                state.shares = 0;
                state.collateral_locked = 0;
                save_member(&env, tanda_id, &member, &state);
            }
        }
    }

    // ----- Views -----

    pub fn get_tanda(env: Env, tanda_id: u32) -> Tanda {
        load_tanda(&env, tanda_id)
    }

    /// Resuelve un código de invitación al `tanda_id` correspondiente.
    pub fn id_by_code(env: Env, code: String) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Code(code))
            .unwrap_or_else(|| panic_err(&env, Error::TandaNotFound))
    }

    pub fn get_member(env: Env, tanda_id: u32, member: Address) -> MemberState {
        load_member(&env, tanda_id, &member)
    }

    pub fn get_memberships(env: Env, member: Address) -> Vec<u32> {
        env.storage()
            .persistent()
            .get(&DataKey::Memberships(member))
            .unwrap_or(Vec::new(&env))
    }
}

// ---------------------------------------------------------------------------
// Helpers de storage
// ---------------------------------------------------------------------------

fn panic_err(env: &Env, err: Error) -> ! {
    soroban_sdk::panic_with_error!(env, err)
}

/// Construye un `Vec<i128>` de un solo elemento (para los argumentos del vault).
fn vec1(env: &Env, x: i128) -> Vec<i128> {
    let mut v = Vec::new(env);
    v.push_back(x);
    v
}

/// Deposita `amount` del token en el vault a nombre del contrato y devuelve las
/// shares recibidas. Autoriza la transferencia interna que el vault hace desde
/// el contrato (require_auth a dos niveles de profundidad).
fn vault_deposit(env: &Env, token: &Address, vault: &Address, amount: i128) -> i128 {
    let contract = env.current_contract_address();

    // Autoriza el token.transfer(contract -> vault, amount) que ocurre dentro
    // de vault.deposit.
    let args: Vec<Val> = (contract.clone(), vault.clone(), amount).into_val(env);
    let mut auths = Vec::new(env);
    auths.push_back(InvokerContractAuthEntry::Contract(SubContractInvocation {
        context: ContractContext {
            contract: token.clone(),
            fn_name: Symbol::new(env, "transfer"),
            args,
        },
        sub_invocations: Vec::new(env),
    }));
    env.authorize_as_current_contract(auths);

    let (_, shares, _) = VaultClient::new(env, vault).deposit(
        &vec1(env, amount),
        &vec1(env, 0),
        &contract,
        &false,
    );
    shares
}

fn save_tanda(env: &Env, tanda: &Tanda) {
    env.storage()
        .persistent()
        .set(&DataKey::Tanda(tanda.id), tanda);
}

fn load_tanda(env: &Env, tanda_id: u32) -> Tanda {
    env.storage()
        .persistent()
        .get(&DataKey::Tanda(tanda_id))
        .unwrap_or_else(|| panic_err(env, Error::TandaNotFound))
}

fn save_member(env: &Env, tanda_id: u32, member: &Address, state: &MemberState) {
    env.storage()
        .persistent()
        .set(&DataKey::Member(tanda_id, member.clone()), state);
}

fn load_member(env: &Env, tanda_id: u32, member: &Address) -> MemberState {
    env.storage()
        .persistent()
        .get(&DataKey::Member(tanda_id, member.clone()))
        .unwrap_or_else(|| panic_err(env, Error::NotMember))
}

fn add_membership(env: &Env, member: &Address, tanda_id: u32) {
    let key = DataKey::Memberships(member.clone());
    let mut list: Vec<u32> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(Vec::new(env));
    list.push_back(tanda_id);
    env.storage().persistent().set(&key, &list);
}

mod test;
