// Dip-buy with a bracket exit, long only, one symbol (CBBTC).
//
// This dev window falls ~2.8% over 24h: a sharp early drop (h00-h01),
// a recovery to a new local high (h06-h08), then a long slow drift down
// (h09-h23). Trend followers churn here — the EMA-cross baseline makes
// 80 trades and loses ~148 USDC, and a trailing stop gets whipsawed by
// the chop (a brief spike sets the peak, the pullback stops it out).
// This bot trades the other way: it buys a real dip, then exits on a
// fixed bracket — a profit target or a stop — and it trades at most
// twice, so it never grinds through the drift.
//
//   - Reference high: the highest close seen so far. While flat it is
//     the rolling high; on a buy it is reset to the entry close, so the
//     dip is always measured from the position's own context, never
//     from a stale high before the dip.
//   - Entry, on a bar's close (filled at the next open): the close is
//     at least DROP below the reference high (a real dip, not noise)
//     and bouncing — above the previous close and green (above its own
//     open), so a single up-tick on a red bar does not count as a
//     recovery starting — on a symbol it does not hold. It needs
//     MIN_BARS of history first, and it sends no order while warming
//     up (the replay would reject every one, warmup). It stops
//     entering after MAX_TRADES buys, and it stops entering entirely
//     in the last LATE_CUTOFF_BAR bars of the window: a trade opened
//     that late has no room to reach its target before the window
//     flattens it, so it can only lose to fees and the drift.
//   - Exit, the whole position: the close reaches the profit target
//     (TARGET above the price the buy actually filled at) or falls to
//     the stop (STOP below it), whichever comes first — a 2:1
//     reward-to-risk bracket. The bracket is measured from the FILL
//     price — read from the batch's fills when the buy lands — not
//     from the close the buy was decided on, because on a volatile bar
//     the fill can sit far from that close and a bracket struck from
//     the wrong base exits at the wrong prices. A fixed bracket cannot
//     be whipsawed by a spike the way a trailing stop can: the exit
//     prices are set at entry and do not move. The signal is re-read
//     on every bar, so a sell the market refuses (a price past the
//     slippage cap at the next open) is sent again on the next bar
//     while the reason still holds.
//   - Stake: the whole cash on each buy, capped by caps.max_weight_bps
//     of equity; below fees.min_notional_quote_units it buys nothing.
//     A reply carries at most caps.max_orders_per_bar orders.
//   - Slippage is capped at MAX_SLIPPAGE_BPS = 100, 1% past the close
//     it was decided on, so an order into a liquidity gap is refused
//     (and sent again) rather than filled for almost nothing.
//   - The high, the fill price and the closes run in float64 on
//     + - * / alone, each correctly rounded (IEEE 754), so the same
//     bars give the same orders, run after run. It never reads the
//     clock, the environment, or Math.random, so the two grading runs
//     match byte for byte.
//
// Laid out like an entrant's repository: the grader runs `node /bot/main.ts`
// with this directory mounted at /bot; vendor/makefun-bars.ts is a
// byte-identical copy of the kit's sdk/makefun-bars.ts.

import { BPS, runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

/** How far below the reference high a close must be to count as a dip (2%). */
const DROP_BPS = 200;
/** Profit target above the fill price (2%). */
const TARGET_BPS = 200;
/** Stop below the fill price (1%). */
const STOP_BPS = 100;
/** The most buys this bot ever sends in one window. */
const MAX_TRADES = 2;
/** Bars of history before the first entry is allowed. */
const MIN_BARS = 30;
/** No entries once this many bars have passed (the last 4 hours). */
const LATE_CUTOFF_BAR = 1200;
const MAX_SLIPPAGE_BPS = 100;
/** Basis points per unit as a plain number (the SDK's BPS is a bigint). */
const BPS_NUM = 10_000;

/** The highest close seen so far (reset to the entry close on every buy). */
let refHigh = 0;
/** The previous bar's close, for the bounce check. */
let lastClose: number | null = null;
/** The price the current position's buy actually filled at (0 while flat). */
let fillPrice = 0;
/** Buys sent so far. */
let buysSent = 0;
/** Bars processed so far (warm-up bars included). */
let barsSeen = 0;

await runBars({
  onBatch(state, batch) {
    // One bar per symbol per batch; read this batch's close and the
    // previous one. The hello names the universe; this bot only ever
    // trades the single symbol it holds or is about to hold.
    const symbol = state.hello.symbols[0]!.symbol;
    const bar = batch.bars.find((b) => b.symbol === symbol);
    if (bar === undefined) return [];
    const close = Number(bar.c);
    barsSeen++;
    const rising = lastClose !== null && close > lastClose;
    if (barsSeen > 1) refHigh = Math.max(refHigh, close);
    lastClose = close;

    // The fills of the orders sent on the previous batch: when a buy
    // lands, its fill price is the base the bracket is struck from.
    // (A buy decided on a close fills at the next open, and on a
    // volatile bar that open can sit far from the close.)
    for (const fill of batch.fills) {
      if (fill.symbol === symbol && fill.side === 'buy' && fill.status === 'filled') fillPrice = Number(fill.price);
    }
    if (state.warmingUp) return [];

    const { caps, fees } = state.hello;
    const held = state.positions.get(symbol);
    if (held !== undefined) {
      // Holding: exit on the bracket — the target above the fill
      // price, or the stop below it, whichever the close reaches
      // first. Until the fill is known (the batch right after the
      // buy) there is nothing to measure against, so hold.
      if (fillPrice !== 0 && (close * BPS_NUM >= fillPrice * (BPS_NUM + TARGET_BPS) || close * BPS_NUM <= fillPrice * (BPS_NUM - STOP_BPS))) {
        return [{ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput];
      }
      return [];
    }

    // Flat: enter on a dip below the reference high that is already bouncing.
    // The bounce needs two signs: the close above the previous close,
    // and the bar itself green (close above its open), so a single
    // up-tick on a red bar does not count as a recovery starting.
    // After MAX_TRADES buys, or in the last LATE_CUTOFF_BAR bars of the
    // window, the bot stops entering entirely.
    if (barsSeen < MIN_BARS || refHigh === 0 || buysSent >= MAX_TRADES || barsSeen > LATE_CUTOFF_BAR) return [];
    const green = close > Number(bar.o);
    if (!(close * BPS_NUM < refHigh * (BPS_NUM - DROP_BPS) && rising && green)) return [];
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    let slice = state.cash < byWeight ? state.cash : byWeight;
    if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) return [];
    refHigh = close;
    fillPrice = 0;
    buysSent++;
    return [{ side: 'buy', symbol, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies BuyInput];
  },
});
