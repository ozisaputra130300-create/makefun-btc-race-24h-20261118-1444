# makefun-btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/ozisaputra130300-create/makefun-btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/ozisaputra130300-create/makefun-btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

Dip-buy with a fixed bracket exit, long only, one symbol (CBBTC). The dev window falls ~2.8% over 24h: a sharp early drop, a recovery to a new local high, then a long slow drift down. Trend followers churn here — the EMA-cross baseline makes 80 trades and loses ~148 USDC, and a trailing stop gets whipsawed by the chop. This bot waits for a real dip — the close at least 2% below the rolling peak, already bouncing (above the previous close and green, above its own open) — buys with the whole cash, then exits on a fixed bracket: +2% profit target or −1% stop, measured from the price the buy actually filled at. It trades at most twice and never enters in the last 4 hours of the window. Dev window: net PnL +18.06 USDC on 1,000 USDC (2 trades, 100% win rate, max drawdown 1.50%), beating every baseline (best baseline hold-cash 0.00 USDC; best trading baseline momentum −23.87 USDC).

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=sy0tw1m4&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
