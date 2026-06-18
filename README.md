# ⚡ PokeArbitrage Bot v1.0

> Bot backend en **TypeScript** y **Node.js** para detectar discrepancias de precio y oportunidades de arbitraje/market making entre cartas Pokémon tokenizadas (pNFTs respaldados físicamente) en **Collector Crypt** (Solana) y su valor de mercado físico real en **PriceCharting** / **eBay**.

---

## 🏗️ Arquitectura y Flujo del Bot

El bot opera como un pipeline continuo que conecta la actividad de la blockchain y el marketplace con scrapers de precios físicos y motores de análisis financiero:

```
┌────────────────┐     ┌──────────────┐     ┌─────────────┐     ┌───────────┐     ┌──────────┐
│ Magic Eden API │────▶│   Metadata   │────▶│  Matching   │────▶│ Arbitrage │────▶│ Discord  │
│  (Polling 30s) │     │   Parser     │     │   Engine    │     │Calculator │     │ Webhook  │
└────────────────┘     └──────────────┘     └─────────────┘     └───────────┘     └──────────┘
       │                                          │                    │
       ▼                                          ▼                    ▼
  ┌──────────┐                            ┌──────────────┐    ┌──────────────┐
  │  SQLite  │                            │  Catálogo de │    │  SOL/USD     │
  │   DB     │                            │  Cartas +    │    │  Price Feed  │
  └──────────┘                            │  Precios eBay│    └──────────────┘
                                          └──────────────┘
```

### Características Principales:
1. **Monitoreo Dual**:
   - **Listados Activos**: Polling cada 30 segundos de listings a la venta en Magic Eden.
   - **Nuevas Acuñaciones (Mints)**: Polling de blockchain (Solana RPC / DAS API) para detectar nuevos tokens físicos ingresados a la bóveda de Collector Crypt antes de que salgan a la venta.
2. **Motor de Precios de Grado Exacto (PriceCharting)**:
   - Scraper directo mediante `curl` de sistema que extrae precios exactos por certificadora (**PSA**, **CGC**, **BGS**) y grado (**10, 9.5, 9, etc.**), con fallback automático a grados genéricos o *Ungraded*.
   - Sistema de throttle inteligente (1.5s) y caché HTML en memoria para evitar bloqueos y redundancia de red.
3. **Normalización Avanzada con Diccionario**:
   - Limpieza y parseo de títulos complejos que sufren de *layout pollution* (como sets intercalados en japonés, por ejemplo *Mega Inferno X*, o descriptores de grado como *GEM*).
   - Utiliza un catálogo de más de 1000 nombres de Pokémon (Gen 1-9) y entrenadores para aislar de forma exacta la identidad del personaje y realizar consultas precisas.
4. **Calculadora Financiera de Márgenes**:
   - Deduce costos de redención ($25 USD), costos de envío internacional ($15 USD) y comisiones de venta estimadas de eBay (13%).
5. **Consola de Market Making / Bids**:
   - Compara el precio real de mercado contra el valor de recompra de la bóveda (*Buyback* al 85% del *Insured Value*). Si hay una brecha mayor a $25 USD, calcula y sugiere una puja estratégica (*Bid* recomendado = Buyback * 1.05) en SOL.

---

## 🚀 Inicio Rápido

### 1. Clonar e Instalar Dependencias

```bash
cd PokeArbitrage
npm install
```

### 2. Configurar Variables de Entorno

Copia el archivo de ejemplo y configura tus credenciales locales:

```bash
cp .env.example .env
```

Edita `.env` y configura tus claves:
- `DISCORD_WEBHOOK_URL`: La URL del canal de Discord donde quieres recibir los embeds enriquecidos.
- `PRICE_API_KEY` o `TCGAPI_KEYS` *(Opcional)*: Claves API secundarias para fallbacks de precios.
- `SOLANA_RPC_URL`: Endpoint RPC (ej. Helius) para activar el monitoreo de acuñaciones (DAS API).

### 3. Poblar el Catálogo de la Base de Datos

Ejecuta el script de semilla para cargar el catálogo inicial de ~70 cartas Pokémon de alto valor:

```bash
npm run seed
```

### 4. Probar Webhook de Discord

Verifica que tu webhook de Discord está correctamente enlazado enviando una alerta ficticia enriquecida:

```bash
npm run test:discord
```

---

## 🛠️ Scripts para Desarrolladores

El proyecto incluye diversos utilitarios para operar y mantener el bot:

*   **Iniciar el Bot en Modo de Monitoreo Activo:**
    ```bash
    npm run dev
    ```
*   **Visualizar Oportunidades de Puja (Market Making CLI):**
    ```bash
    npx tsx src/scripts/check-market-making.ts
    ```
    Muestra en consola una tabla con las cartas físicas infravaloradas en Collector Crypt y el enlace directo para ir a colocarles un *Bid* en Magic Eden.
*   **Re-normalizar y Limpiar la Base de Datos:**
    ```bash
    npx tsx src/scripts/cleanup-alphanumeric-cards.ts
    ```
    Actualiza los nombres y números del catálogo local bajo las reglas del normalizador optimizado, limpia colisiones de cartas duplicadas y purga los precios obsoletos de la caché.
*   **Ejecutar Pruebas Unitarias (Vitest):**
    ```bash
    npm run test
    ```
    *(Ejecuta los 68 tests unitarios que validan el parseo, lógica de negocio y matching de cartas en aislamiento de red).*
*   **Comprobar Tipos y Sintaxis (Lint):**
    ```bash
    npm run lint
    ```

---

## 📊 Fórmulas de Negocio

### 1. Rentabilidad de Arbitraje (Listings Activos)
Se notifica una oportunidad si la ganancia estimada es positiva y el ROI neto supera el umbral configurado (ej. 20%):

$$\text{Ganancia} = \text{Precio eBay} - \text{Precio CollectorCrypt (USD)} - \text{Redención (\$25)} - \text{Envío (\$15)} - \text{eBay Fee (13\%)}$$

$$\text{ROI} = \frac{\text{Ganancia}}{\text{Precio CollectorCrypt (USD)}} \ge 20\%$$

### 2. Puja de Liquidez / Market Making (Cartas No Listadas)
Se recomienda ofertar si el valor de mercado físico supera la recompra garantizada y hay margen de seguridad:

$$\text{Precio Físico} \ge 1.30 \times \text{Buyback (85\% de Insured Value)}$$

$$\text{Precio Físico} - \text{Buyback} \ge \$25\text{ USD}$$

$$\text{Bid Recomendado} = \text{Buyback} \times 1.05\quad\text{(en SOL)}$$

---

## 🔮 Roadmap de Desarrollo

- [x] **Fase 1**: Monitor de listados activos y notificaciones de arbitraje en Discord.
- [x] **Fase 2**: Integración automática del motor de precios (Scraper síncrono de PriceCharting.com).
- [x] **Fase 3**: Monitor de acuñaciones en Solana (DAS API) y motor/consola de pujas de liquidez (*Market Making*).
- [ ] **Fase 4**: Integración de Solana Wallet para la ejecución e interacción automática de compras y ofertas directo en Mainnet.

---

## ⚠️ Descargos de Responsabilidad (Disclaimers)

- Este bot es una herramienta educativa y de investigación de mercado. **NO constituye asesoramiento financiero**.
- Collector Crypt y eBay aplican términos, condiciones y comisiones que pueden cambiar en cualquier momento. Verifica siempre los datos antes de realizar transacciones.
- El trading de coleccionables físicos tokenizados conlleva riesgos de volatilidad y liquidez. Invierte bajo tu propio riesgo.
