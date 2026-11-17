/**
 * Slow-band mean-reversion bot for agent-fun/bars-replay/v1 (cbBTC/USDC, 1m bars).
 *
 * Strategy (designed from scratch for this competition, fitted only on the
 * published dev window and checked for stability across its two halves):
 *
 *   - Keep the last 240 one-minute closes. From them compute their simple
 *     moving average and their (population) standard deviation.
 *   - z = (latest close - SMA240) / SD240.
 *   - Flat and z < -2.0  -> buy with all available cash (one full-size
 *     position, long only, no leverage).
 *   - Long and z > +2.0  -> sell the whole position.
 *   - Long and the close falls more than 100 bps below the close at which
 *     the position was entered -> sell the whole position (crash guard)
 *     and do not re-enter for the next 60 bars.
 *   - Otherwise hold: cash when flat, the position when long.
 *
 * Why this shape: on the dev window BTC drifted only +0.49% over 24h with
 * ~6.4 bps of per-minute noise, so fast trend-following whipsaws and pays
 * ~26 bps per round trip in fees/slippage/impact without catching a move.
 * Rare trades at 2-sigma extremes of a slow (4h) band, held until the
 * price reverts to the opposite band, need only a few round trips and keep
 * drawdown small. The parameters sit in the middle of a broad plateau
 * (window 200-360 bars, entry/exit 2.0-2.5 sigma all profitable on the dev
 * window, both halves profitable), not on a single sharp peak.
 *
 * Determinism: the bot is a pure function of the closes it has been sent.
 * No clock, no network, no environment, no randomness, no files outside
 * the repository. Standard library only, plus the vendored kit shim
 * (vendor/makefun-bars.ts, a byte-for-byte copy of the kit's SDK shim).
 */

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Order } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

const WINDOW = 240; // bars in the slow band (4 hours of 1-minute bars)
const ENTRY_Z = -2.0; // buy when the close is this far below the band
const EXIT_Z = 2.0; // sell when the close is this far above the band
const STOP_BPS = 100; // crash guard: sell if close falls this far below entry
const STOP_COOLDOWN = 60; // bars to wait before re-entering after a stop-out
const MAX_SLIPPAGE_BPS = 300; // generous vs the ~9 bps a fill normally moves
const MIN_NOTIONAL = 1_000_000n; // 1 USDC, in quote units

const closes: number[] = [];
let entryClose = 0; // close (price-scale ints) at which we decided to buy
let cooldownUntil = -1; // seq before which no new buy after a stop-out

function onBatch(state: BarsState): Order[] {
  const closeBig = state.close(SYMBOL);
  if (closeBig === null) return [];
  const close = Number(closeBig);
  closes.push(close);
  if (closes.length > WINDOW) closes.shift();

  if (state.warmingUp) return [];
  if (closes.length < WINDOW) return [];

  const mean = closes.reduce((a, b) => a + b, 0) / WINDOW;
  let variance = 0;
  for (const c of closes) variance += (c - mean) * (c - mean);
  variance /= WINDOW;
  const sd = Math.sqrt(variance);
  if (sd <= 0) return [];
  const z = (close - mean) / sd;

  const holding = state.positions.get(SYMBOL);
  const qty = holding ? holding.qty : 0n;

  if (qty === 0n) {
    if (z < ENTRY_Z && state.seq >= cooldownUntil) {
      const room = state.weightRoom(SYMBOL);
      const amount = state.cash < room ? state.cash : room;
      if (amount >= MIN_NOTIONAL) {
        entryClose = close;
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    return [];
  }

  // We hold a position.
  if (z > EXIT_Z) {
    entryClose = 0;
    return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  }
  if (entryClose > 0 && close < entryClose) {
    const dropBps = Math.floor(((entryClose - close) * 10000) / entryClose);
    if (dropBps > STOP_BPS) {
      entryClose = 0;
      cooldownUntil = state.seq + STOP_COOLDOWN;
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
  }
  return [];
}

await runBars({ onBatch });
