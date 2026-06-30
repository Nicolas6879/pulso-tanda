#![no_std]
//! MockVault — vault mínimo compatible con la interfaz de DeFindex, solo para
//! testnet y tests. Implementa `deposit` y `withdraw` con la misma firma del
//! vault real de DeFindex, de modo que el contrato TandaManager use el MISMO
//! code-path en testnet (este mock) y en mainnet (vault real de DeFindex).
//!
//! Modelo de shares: 1 activo subyacente, ratio = balance_subyacente / total_shares.
//! El yield se simula transfiriendo activo extra a la dirección del vault
//! (mint directo en tests), lo que sube el ratio sin emitir shares nuevas.

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, Val, Vec,
};

#[contracttype]
pub enum DataKey {
    Token,
    TotalShares,
}

#[contract]
pub struct MockVault;

#[contractimpl]
impl MockVault {
    pub fn __constructor(env: Env, token: Address) {
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::TotalShares, &0i128);
    }

    /// Deposita `amounts_desired[0]` del activo desde `from` y emite shares.
    /// Misma firma que el vault de DeFindex.
    pub fn deposit(
        env: Env,
        amounts_desired: Vec<i128>,
        _amounts_min: Vec<i128>,
        from: Address,
        _invest: bool,
    ) -> (Vec<i128>, i128, Option<Vec<Val>>) {
        from.require_auth();
        let amount = amounts_desired.get(0).unwrap();
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);

        let contract = env.current_contract_address();
        let balance_before = token_client.balance(&contract);
        let total_shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalShares)
            .unwrap_or(0);

        // shares = amount * total_shares / balance_before (1:1 en el primer depósito).
        let shares = if total_shares == 0 || balance_before == 0 {
            amount
        } else {
            amount * total_shares / balance_before
        };

        token_client.transfer(&from, &contract, &amount);
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &(total_shares + shares));

        let mut out = Vec::new(&env);
        out.push_back(amount);
        (out, shares, None)
    }

    /// Quema `df_amount` shares y devuelve el activo proporcional a `from`.
    /// Misma firma que el vault de DeFindex.
    pub fn withdraw(
        env: Env,
        df_amount: i128,
        _min_amounts_out: Vec<i128>,
        from: Address,
    ) -> Vec<i128> {
        from.require_auth();
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        let contract = env.current_contract_address();

        let balance = token_client.balance(&contract);
        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares).unwrap();

        // amount = df_amount * balance / total_shares (incluye yield acumulado).
        let amount = df_amount * balance / total_shares;
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &(total_shares - df_amount));
        token_client.transfer(&contract, &from, &amount);

        let mut out = Vec::new(&env);
        out.push_back(amount);
        out
    }

    pub fn total_shares(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalShares).unwrap_or(0)
    }
}
