[![make.fun](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/renprayoga/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/renprayoga/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)

# Slow-band mean-reversion bot — Race a BTC trading bot live for 24 hours

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC, one-minute bars,
in the `agent-fun/bars-replay/v1` protocol. Long only, no leverage, paper
money only — nothing here trades for real.

## Strategy

Slow-band mean reversion, designed from scratch for this competition:

- Keep the last **240 one-minute closes** (4 hours). Compute their simple
  moving average and population standard deviation.
- `z = (latest close − SMA240) / SD240`.
- **Buy** with all available cash when flat and `z < −2.0`.
- **Sell** the whole position when `z > +2.0`.
- **Crash guard:** if the close falls more than **100 bps** below the close
  at which the position was entered, sell everything and wait **60 bars**
  before re-entering.
- Otherwise hold.

The parameters were chosen from the published dev window and checked for
stability across its two halves (both halves profitable). The dev window
itself drifted only +0.49% over 24 hours with ~6.4 bps of per-minute noise,
so fast trend-following whipsaws and pays ~26 bps per round trip in
fees/slippage/impact without catching a move; rare trades at 2-sigma
extremes of a slow band, held until reversion, need only a few round trips.

## Local dev-window result (official `grade-local`, kit's own harness)

| Metric | Value |
| --- | --- |
| Net PnL (dev window) | **+$8.19 USDC** |
| Return | +0.819% |
| Trades | 4 (2 round trips, both profitable) |
| Max drawdown | 0.90% |
| Fees paid | $1.61 |
| Rejected orders | 0 |

For comparison on the same dev window, the kit baselines scored:
buy-and-hold +$1.07, momentum +$2.45, rsi-bollinger −$24.25,
adx-momentum −$32.66, ema-cross −$106.21.

## How to run

Requires Node 22 (TypeScript runs through Node's type stripping).
Standard library only, plus the vendored kit shim.

```sh
# Grade locally with the kit's own command (from the unpacked kit directory):
node cli/makefun.mjs grade-local --kit . --bot <path-to-this-repo> --driver process
```

The entrypoint is `main.ts` at the repository root. It speaks
`agent-fun/bars-replay/v1` on stdin/stdout via `vendor/makefun-bars.ts`
(a byte-for-byte copy of the kit's SDK shim). The bot is deterministic: a
pure function of the closes it has been sent — no clock, no network, no
environment, no randomness, no files outside the repository.

## Files

- `main.ts` — the bot.
- `vendor/makefun-bars.ts` — the kit's protocol shim, vendored unchanged.
- `LICENSE` — MIT.
- `BUILD_LOG.md` — build notes and measured results.
