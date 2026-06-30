# Pitch deck — PULSO Tanda

> Contenido listo para pasar a diapositivas (Canva / Slides). Una idea por lámina,
> texto corto, una imagen o captura por lámina. Paleta: verde esmeralda + ámbar.

---

### 1 · Portada
**PULSO Tanda** — La natillera de toda la vida, on-chain y a prueba de incumplidos.
_Hackathon PULSO · Colombia · [nombres del equipo]_

### 2 · El problema (que todos conocen)
- La **natillera/tanda** es ahorro de toda la vida en Colombia: grupo cerrado, cuota
  por ronda, cada quien se lleva el pozo por turnos.
- Pero **se rompe cuando alguien deja de pagar** — y los demás pierden.
- Se lleva en una libreta y en la confianza. No escala, no es segura.

> Frase: _"Todos hemos estado en una cadena. Y todos conocemos al que se voló."_

### 3 · La solución
Una tanda donde **el contrato hace cumplir las reglas**:
- Cada miembro **bloquea un colateral** al entrar.
- Si alguien no paga → el contrato **lo cubre desde su colateral**.
- El del turno **cobra el pozo completo, siempre**.
- El colateral **genera rendimiento** → cero comisión.

### 4 · El momento que lo cambia todo (DEMO en vivo / GIF)
Captura del flujo: _"X no paga → cierro la ronda → el del turno cobra completo → al
moroso se le descuenta del colateral."_ Todo on-chain, **por menos de un centavo**.

### 5 · Por qué Stellar / por qué ahora
- Comisiones de **fracciones de centavo** (mostrar las tx reales: ~0.002 XLM).
- **Privy**: la señora entra con su correo, sin frases semilla.
- Conecta con **dólares digitales** (USDC) y rieles locales vía **anchors SEP-24**
  (el puente natural a Bre-B y la demanda de dólar digital en Colombia).

### 6 · Cómo funciona (arquitectura, 1 diagrama)
Privy (login) → Frontend → Contrato `TandaManager` → Vault de yield (DeFindex) →
Anchor SEP-24 (COP↔USDC). _Todas piezas de la lista SCF, componiendo de verdad._

### 7 · Tracción técnica (lo que YA funciona)
- Contrato desplegado en **testnet**, ciclo completo verificado on-chain
  (join → contribute → payout → finish).
- App funcional: login con Google, crear/unirse por código, la rueda de turnos.
- 4 pruebas automatizadas. Camino a **mainnet** con DeFindex real.

### 8 · Validación (customer discovery)
3 entrevistas a personas que han estado en natilleras: el dolor del incumplido es
unánime. _[Insertar 2–3 citas textuales fuertes]._

### 9 · Mercado e impacto
- Millones de colombianos en natilleras informales hoy.
- Whitespace: **no existe ninguna ROSCA** en el directorio SCF de Stellar.
- Camino: de la cuadra a la app, y de COP a dólar digital.

### 10 · El equipo + cierre
Quiénes somos · qué sigue (mainnet, anchor real, piloto con una natillera real).
**"La natillera de toda la vida, ahora a prueba de incumplidos."**

---

**Tips de pitch IRL (6 de julio, Bogotá):**
- Abre con la pregunta "¿quién ha estado en una cadena?" — levanta manos.
- Haz el demo del default EN VIVO (es lo que se recuerda).
- Cierra con las comisiones reales en pantalla. Tiempo objetivo: 3–4 min.
