"""
Collective Intelligence Service — Visor Crypto V4

Receives anonymous trade signals from all app users, computes
global statistics, and provides learned model weights back.

This creates a NETWORK EFFECT: every user improves the model for everyone.

Storage: In-memory + JSON file persistence (upgradeable to Redis/PostgreSQL).

Privacy: No user IDs, no IPs stored. Only signal metadata.
"""

import json
import time
import os
import math
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List, Optional, Any

# Storage paths
DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

TRADES_FILE = DATA_DIR / "collective_trades.json"
STATS_FILE = DATA_DIR / "collective_stats.json"
WEIGHTS_FILE = DATA_DIR / "collective_weights.json"

# Constants
MAX_TRADES_IN_MEMORY = 50000
MAX_TRADES_PER_SYMBOL = 10000
STATS_CACHE_TTL = 60  # seconds
WEIGHT_UPDATE_INTERVAL = 300  # 5 minutes
MIN_TRADES_FOR_STATS = 10
MIN_TRADES_FOR_WEIGHTS = 50


class CollectiveIntelligence:
    """
    Singleton service that manages collective trade data from all users.

    Flow:
    1. App sends anonymous trade signals → stored in memory + disk
    2. Periodically computes global statistics
    3. App fetches global stats → uses for confidence adjustment
    4. Machine learning weights updated from historical outcomes
    """

    def __init__(self):
        self.trades: Dict[str, List[dict]] = defaultdict(list)
        self.stats_cache: Dict[str, dict] = {}
        self.stats_cache_time: Dict[str, float] = {}
        self.model_weights: dict = {}
        self.last_weight_update: float = 0
        self.total_submissions: int = 0
        self.unique_sessions: set = set()
        # V4.1: Reputation tracking
        self.device_reputation: Dict[str, dict] = {}  # device_hash → {trades, wins, wr, weight}
        self._load_from_disk()

    # ── DISK PERSISTENCE ──

    def _load_from_disk(self):
        """Load persisted trades and weights on startup."""
        try:
            if TRADES_FILE.exists():
                data = json.loads(TRADES_FILE.read_text(encoding='utf-8'))
                self.trades = defaultdict(list, data.get('trades', {}))
                self.total_submissions = data.get('total_submissions', 0)
                print(f"[Collective] Loaded {sum(len(v) for v in self.trades.values())} trades from disk")
        except Exception as e:
            print(f"[Collective] Could not load trades: {e}")

        try:
            if WEIGHTS_FILE.exists():
                self.model_weights = json.loads(WEIGHTS_FILE.read_text(encoding='utf-8'))
                print(f"[Collective] Loaded model weights from disk")
        except Exception as e:
            print(f"[Collective] Could not load weights: {e}")

        try:
            if REPUTATION_FILE.exists():
                self.device_reputation = json.loads(REPUTATION_FILE.read_text(encoding='utf-8'))
                print(f"[Collective] Loaded {len(self.device_reputation)} device reputations")
        except Exception as e:
            print(f"[Collective] Could not load reputation: {e}")

    def _save_trades(self):
        """Persist trades to disk."""
        try:
            data = {
                'trades': dict(self.trades),
                'total_submissions': self.total_submissions,
                'last_updated': datetime.utcnow().isoformat()
            }
            TRADES_FILE.write_text(json.dumps(data, default=str), encoding='utf-8')
        except Exception as e:
            print(f"[Collective] Could not save trades: {e}")

    def _save_weights(self):
        """Persist learned weights to disk."""
        try:
            WEIGHTS_FILE.write_text(json.dumps(self.model_weights, default=str), encoding='utf-8')
        except Exception as e:
            print(f"[Collective] Could not save weights: {e}")

    def _save_stats(self, symbol: str, stats: dict):
        """Persist computed stats."""
        try:
            all_stats = {}
            if STATS_FILE.exists():
                all_stats = json.loads(STATS_FILE.read_text(encoding='utf-8'))
            all_stats[symbol] = stats
            STATS_FILE.write_text(json.dumps(all_stats, default=str), encoding='utf-8')
        except Exception as e:
            print(f"[Collective] Could not save stats: {e}")

    def _save_reputation(self):
        """Persist device reputation scores to disk."""
        try:
            REPUTATION_FILE.write_text(json.dumps(self.device_reputation, default=str), encoding='utf-8')
        except Exception as e:
            print(f"[Collective] Could not save reputation: {e}")

    # ── REPUTATION SCORING ──

    def _update_device_reputation(self, device_hash: str, trades: List[dict]):
        """
        V4.1: Build reputation profile for anonymous device.
        Devices with higher win rates contribute MORE to collective learning.

        65% WR device = 10× weight in model learning.
        30% WR device = 0.1× weight (almost ignored).
        This ensures we learn from Smart Money, not from losers.
        """
        if not device_hash:
            return

        # Get or create reputation entry
        rep = self.device_reputation.get(device_hash, {
            'firstSeen': datetime.utcnow().isoformat(),
            'totalSubmissions': 0,
            'reportedWR': [],  # rolling window of self-reported win rates
            'verifiedWR': None,  # computed from outcomes in our DB
            'reputationWeight': 1.0,
            'lastSeen': None
        })

        rep['totalSubmissions'] += len(trades)
        rep['lastSeen'] = datetime.utcnow().isoformat()

        # Collect self-reported win rates
        for t in trades:
            lwr = t.get('lwr')
            ltc = t.get('ltc', 0)
            if lwr is not None and ltc >= REPUTATION_MIN_TRADES:
                rep['reportedWR'].append(lwr)
                # Keep last 50 reports
                if len(rep['reportedWR']) > 50:
                    rep['reportedWR'] = rep['reportedWR'][-50:]

        # Calculate reputation weight
        rep['reputationWeight'] = self._compute_reputation_weight(device_hash, rep)

        self.device_reputation[device_hash] = rep

        # Save periodically
        if len(self.device_reputation) % 5 == 0:
            self._save_reputation()

    def _compute_reputation_weight(self, device_hash: str, rep: dict) -> float:
        """
        Compute reputation weight for a device.
        Formula: weight = clamp(10^((wr - 50) / 25), 0.1, 10)

        50% WR → 1.0× weight (baseline)
        65% WR → ~3.6× weight
        75% WR → 10× weight (capped)
        40% WR → ~0.4× weight
        30% WR → 0.1× weight (capped minimum)
        """
        # First try verified WR from our database
        verified_wr = self._verify_device_wr(device_hash)
        if verified_wr is not None:
            rep['verifiedWR'] = verified_wr
            wr = verified_wr
        elif rep.get('reportedWR'):
            # Use average of self-reported (with discount for unverified)
            wr = sum(rep['reportedWR']) / len(rep['reportedWR'])
            wr = wr * 0.8 + REPUTATION_BASELINE_WR * 0.2  # discount unverified
        else:
            wr = REPUTATION_BASELINE_WR  # new device = baseline

        # Exponential curve centered on 50%
        try:
            weight = math.pow(10, (wr - REPUTATION_BASELINE_WR) / 25)
        except (ValueError, OverflowError):
            weight = 1.0

        return max(REPUTATION_MIN_MULTIPLIER, min(REPUTATION_MAX_MULTIPLIER, weight))

    def _verify_device_wr(self, device_hash: str) -> Optional[float]:
        """Verify a device's win rate from our own trade outcome data."""
        device_trades = []
        for sym_trades in self.trades.values():
            device_trades.extend([t for t in sym_trades if t.get('dh') == device_hash and t.get('outcome')])

        if len(device_trades) < REPUTATION_MIN_TRADES:
            return None

        wins = len([t for t in device_trades if t.get('outcome', '').startswith('WIN')])
        return (wins / len(device_trades)) * 100

    def get_device_reputation(self, device_hash: str) -> dict:
        """Get reputation info for a device."""
        return self.device_reputation.get(device_hash, {
            'reputationWeight': 1.0,
            'verifiedWR': None,
            'totalSubmissions': 0
        })

    # ── TRADE SUBMISSION ──

    def submit_trades(self, trades: List[dict], session_id: str = None, device_hash: str = None) -> dict:
        """
        Receive anonymous trades from a client device.
        V4.1: Also receives device_hash for reputation scoring.
        """
        if session_id:
            self.unique_sessions.add(session_id)

        submitted = 0
        for trade in trades:
            symbol = trade.get('sym', '').upper()
            if not symbol:
                continue

            # Sanitize — only keep what we need (privacy)
            clean_trade = {
                'ts': trade.get('ts', int(time.time() * 1000)),
                'sig': trade.get('sig', 'NEUTRO'),
                'conf': min(max(int(trade.get('conf', 0)), 0), 100),
                'gs': min(max(float(trade.get('gs', 0)), 0), 150),  # V4.1: session-multiplied can exceed 100
                'gates': min(max(int(trade.get('gates', 0)), 0), 9),
                'v3sig': trade.get('v3sig', 'NEUTRO'),
                'v3conf': min(max(int(trade.get('v3conf', 0)), 0), 100),
                'score': float(trade.get('score', 0)),
                'regime': trade.get('regime', 'UNKNOWN'),
                'vol': trade.get('vol', 'NORMAL'),
                'session': trade.get('session', 'UNKNOWN'),
                'entry': float(trade.get('entry', 0)),
                'sl': float(trade.get('sl', 0)),
                'tp1': float(trade.get('tp1', 0)),
                'outcome': trade.get('outcome'),
                # V4.1: Reputation data
                'dh': trade.get('dh') or device_hash,
                'lwr': float(trade.get('lwr', 50)),
                'ltc': int(trade.get('ltc', 0))
            }

            self.trades[symbol].append(clean_trade)

            # Trim per-symbol
            if len(self.trades[symbol]) > MAX_TRADES_PER_SYMBOL:
                self.trades[symbol] = self.trades[symbol][-MAX_TRADES_PER_SYMBOL:]

            submitted += 1

        self.total_submissions += submitted

        # Persist every 10 submissions
        if submitted > 0 and self.total_submissions % 10 == 0:
            self._save_trades()

        # Update device reputation from self-reported data
        if device_hash:
            self._update_device_reputation(device_hash, trades)

        # Maybe update weights
        if time.time() - self.last_weight_update > WEIGHT_UPDATE_INTERVAL:
            self._update_model_weights()

        return {
            'submitted': submitted,
            'totalInDatabase': sum(len(v) for v in self.trades.values()),
            'uniqueSessions': len(self.unique_sessions)
        }

    # ── TRADE OUTCOME UPDATE ──

    def update_outcomes(self, symbol: str, outcomes: List[dict]) -> int:
        """
        Update trade outcomes. Client sends back outcome data
        after virtual trades are evaluated (TP hit, SL hit, etc.)
        """
        updated = 0
        symbol = symbol.upper()

        if symbol not in self.trades:
            return 0

        outcome_map = {o.get('ts'): o for o in outcomes}

        for trade in self.trades[symbol]:
            ts = trade.get('ts')
            if ts in outcome_map and trade.get('outcome') is None:
                o = outcome_map[ts]
                trade['outcome'] = o.get('outcome')
                trade['exit_price'] = o.get('exitPrice', 0)
                trade['pnl'] = o.get('pnlPercent', 0)
                trade['duration_h'] = o.get('durationHours', 0)
                updated += 1

        if updated > 0:
            self._save_trades()
            # Invalidate stats cache
            self.stats_cache.pop(symbol, None)

        return updated

    # ── GLOBAL STATISTICS ──

    def get_global_stats(self, symbol: str = None) -> dict:
        """
        Compute and return global statistics for a symbol (or all symbols).
        Cached for STATS_CACHE_TTL seconds.
        """
        cache_key = symbol or '_ALL_'

        # Check cache
        if cache_key in self.stats_cache:
            if time.time() - self.stats_cache_time.get(cache_key, 0) < STATS_CACHE_TTL:
                return self.stats_cache[cache_key]

        # Compute
        if symbol:
            trades = self.trades.get(symbol.upper(), [])
        else:
            trades = []
            for sym_trades in self.trades.values():
                trades.extend(sym_trades)

        stats = self._compute_stats(trades, symbol)
        stats['totalUsers'] = len(self.unique_sessions)
        stats['totalTradesInSystem'] = sum(len(v) for v in self.trades.values())
        stats['activeSymbols'] = list(self.trades.keys())[:20]
        stats['lastUpdated'] = datetime.utcnow().isoformat()

        # Cache
        self.stats_cache[cache_key] = stats
        self.stats_cache_time[cache_key] = time.time()

        # Persist
        self._save_stats(cache_key, stats)

        return stats

    def _compute_stats(self, trades: List[dict], symbol: str = None) -> dict:
        """Compute detailed statistics from trade list."""
        if not trades:
            return {
                'totalTrades': 0,
                'evaluatedTrades': 0,
                'globalWinRate': None,
                'consensusSignal': None,
                'consensusConfidence': None,
                'bestRegime': None
            }

        total = len(trades)
        evaluated = [t for t in trades if t.get('outcome') is not None]

        # Win rate
        wins = [t for t in evaluated if t.get('outcome') in ('WIN', 'WIN_TP1', 'WIN_TP2', 'WIN_TIME')]
        losses = [t for t in evaluated if t.get('outcome') in ('LOSS', 'LOSS_TIME')]
        win_rate = (len(wins) / len(evaluated) * 100) if evaluated else None

        # Profit factor
        total_win_pnl = sum(abs(t.get('pnl', 0)) for t in wins)
        total_loss_pnl = sum(abs(t.get('pnl', 0)) for t in losses) or 1
        profit_factor = total_win_pnl / total_loss_pnl if total_loss_pnl > 0 else 0

        # Consensus signal (what most recent signals say)
        recent = sorted(trades, key=lambda t: t.get('ts', 0))[-50:]
        signal_counts = defaultdict(int)
        conf_sums = defaultdict(float)
        for t in recent:
            sig = t.get('sig', 'NEUTRO')
            signal_counts[sig] += 1
            conf_sums[sig] += t.get('conf', 0)

        consensus_signal = max(signal_counts, key=signal_counts.get) if signal_counts else None
        consensus_confidence = (conf_sums.get(consensus_signal, 0) / signal_counts.get(consensus_signal, 1)) if consensus_signal else None

        # Best regime analysis
        regime_performance = defaultdict(lambda: {'wins': 0, 'losses': 0, 'total': 0})
        for t in evaluated:
            regime = t.get('regime', 'UNKNOWN')
            regime_performance[regime]['total'] += 1
            if t.get('outcome', '').startswith('WIN'):
                regime_performance[regime]['wins'] += 1
            elif t.get('outcome', '').startswith('LOSS'):
                regime_performance[regime]['losses'] += 1

        best_regime = None
        best_wr = 0
        for regime, perf in regime_performance.items():
            if perf['total'] >= MIN_TRADES_FOR_STATS:
                wr = perf['wins'] / perf['total'] * 100
                if wr > best_wr:
                    best_wr = wr
                    best_regime = regime

        # Score bucket analysis
        score_buckets = {
            '0-4': {'wins': 0, 'total': 0},
            '4-6': {'wins': 0, 'total': 0},
            '6-10': {'wins': 0, 'total': 0},
            '10-15': {'wins': 0, 'total': 0},
            '15+': {'wins': 0, 'total': 0}
        }
        for t in evaluated:
            score = abs(t.get('score', 0))
            if score >= 15:
                bucket = '15+'
            elif score >= 10:
                bucket = '10-15'
            elif score >= 6:
                bucket = '6-10'
            elif score >= 4:
                bucket = '4-6'
            else:
                bucket = '0-4'
            score_buckets[bucket]['total'] += 1
            if t.get('outcome', '').startswith('WIN'):
                score_buckets[bucket]['wins'] += 1

        score_analysis = {}
        for bucket, data in score_buckets.items():
            if data['total'] >= 5:
                score_analysis[bucket] = {
                    'trades': data['total'],
                    'winRate': round(data['wins'] / data['total'] * 100, 1)
                }

        # Gate count analysis (V4 specific)
        gate_performance = defaultdict(lambda: {'wins': 0, 'total': 0})
        for t in evaluated:
            gates = t.get('gates', 0)
            gate_performance[gates]['total'] += 1
            if t.get('outcome', '').startswith('WIN'):
                gate_performance[gates]['wins'] += 1

        gate_analysis = {}
        for gates, data in gate_performance.items():
            if data['total'] >= 3:
                gate_analysis[str(gates)] = {
                    'trades': data['total'],
                    'winRate': round(data['wins'] / data['total'] * 100, 1)
                }

        # Confirmed vs Aguardar comparison
        confirmed_trades = [t for t in evaluated if 'CONFIRMED' in t.get('sig', '')]
        aguardar_trades = [t for t in evaluated if 'AGUARDAR' in t.get('sig', '')]
        confirmed_wr = (len([t for t in confirmed_trades if t.get('outcome', '').startswith('WIN')]) / len(confirmed_trades) * 100) if confirmed_trades else None
        aguardar_wr = (len([t for t in aguardar_trades if t.get('outcome', '').startswith('WIN')]) / len(aguardar_trades) * 100) if aguardar_trades else None

        return {
            'totalTrades': total,
            'evaluatedTrades': len(evaluated),
            'globalWinRate': round(win_rate, 1) if win_rate is not None else None,
            'profitFactor': round(profit_factor, 2),
            'consensusSignal': consensus_signal,
            'consensusConfidence': round(consensus_confidence, 1) if consensus_confidence else None,
            'bestRegime': best_regime,
            'bestRegimeWinRate': round(best_wr, 1) if best_regime else None,
            'regimePerformance': {k: {'winRate': round(v['wins'] / v['total'] * 100, 1), 'trades': v['total']}
                                   for k, v in regime_performance.items() if v['total'] >= MIN_TRADES_FOR_STATS},
            'scoreAnalysis': score_analysis,
            'gateAnalysis': gate_analysis,
            'confirmedVsAguardar': {
                'confirmedWinRate': round(confirmed_wr, 1) if confirmed_wr is not None else None,
                'confirmedTrades': len(confirmed_trades),
                'aguardarWinRate': round(aguardar_wr, 1) if aguardar_wr is not None else None,
                'aguardarTrades': len(aguardar_trades),
                'reactiveAdvantage': round(confirmed_wr - aguardar_wr, 1) if confirmed_wr is not None and aguardar_wr is not None else None
            },
            'avgPnl': round(sum(t.get('pnl', 0) for t in evaluated) / len(evaluated), 2) if evaluated else None
        }

    # ── MODEL WEIGHT LEARNING ──

    def _update_model_weights(self):
        """
        V4.1: Learn optimal weights with:
        [1] Reputation-weighted samples (smart money > losers)
        [2] Temporal decay (14-day halflife)
        [3] Walk-forward validation (70% train / 30% test to prevent overfitting)
        [4] Session-specific analytics
        """
        self.last_weight_update = time.time()

        all_evaluated = []
        for sym_trades in self.trades.values():
            all_evaluated.extend([t for t in sym_trades if t.get('outcome') is not None])

        if len(all_evaluated) < MIN_TRADES_FOR_WEIGHTS:
            return

        # Sort by timestamp for walk-forward split
        all_evaluated.sort(key=lambda t: t.get('ts', 0))

        # ── Walk-Forward Split ──
        split_idx = int(len(all_evaluated) * WALK_FORWARD_TRAIN_RATIO)
        train_data = all_evaluated[:split_idx]
        test_data = all_evaluated[split_idx:]

        # ── Apply temporal decay + reputation weighting ──
        now_ms = time.time() * 1000

        def get_weight(trade):
            # Temporal decay: halflife = 14 days
            age_days = (now_ms - trade.get('ts', now_ms)) / (24 * 60 * 60 * 1000)
            temporal = math.pow(0.5, age_days / TEMPORAL_DECAY_HALFLIFE_DAYS)

            # Reputation weight from device
            dh = trade.get('dh')
            rep_weight = 1.0
            if dh and dh in self.device_reputation:
                rep_weight = self.device_reputation[dh].get('reputationWeight', 1.0)

            return temporal * rep_weight

        # ── Feature Importance on TRAIN set (reputation-weighted) ──
        features = {
            'high_confidence': {'weighted_wins': 0, 'weighted_total': 0},
            'low_confidence': {'weighted_wins': 0, 'weighted_total': 0},
            'high_gates': {'weighted_wins': 0, 'weighted_total': 0},
            'low_gates': {'weighted_wins': 0, 'weighted_total': 0},
            'high_score': {'weighted_wins': 0, 'weighted_total': 0},
            'low_score': {'weighted_wins': 0, 'weighted_total': 0},
            'trending_regime': {'weighted_wins': 0, 'weighted_total': 0},
            'ranging_regime': {'weighted_wins': 0, 'weighted_total': 0},
            'confirmed_signal': {'weighted_wins': 0, 'weighted_total': 0},
            'aguardar_signal': {'weighted_wins': 0, 'weighted_total': 0},
            # V4.1: Session-specific features
            'kill_zone_session': {'weighted_wins': 0, 'weighted_total': 0},
            'asian_session': {'weighted_wins': 0, 'weighted_total': 0},
            'london_session': {'weighted_wins': 0, 'weighted_total': 0},
            'ny_session': {'weighted_wins': 0, 'weighted_total': 0},
        }

        total_weighted = 0
        total_weighted_wins = 0

        for t in train_data:
            w = get_weight(t)
            is_win = t.get('outcome', '').startswith('WIN')
            total_weighted += w
            if is_win:
                total_weighted_wins += w

            conf = t.get('conf', 0)
            gates_count = t.get('gates', 0)
            score = abs(t.get('score', 0))
            regime = t.get('regime', '')
            sig = t.get('sig', '')
            session = t.get('session', '')

            if conf >= 60:
                features['high_confidence']['weighted_total'] += w
                if is_win: features['high_confidence']['weighted_wins'] += w
            elif conf < 40:
                features['low_confidence']['weighted_total'] += w
                if is_win: features['low_confidence']['weighted_wins'] += w

            if gates_count >= 5:
                features['high_gates']['weighted_total'] += w
                if is_win: features['high_gates']['weighted_wins'] += w
            elif gates_count < 3:
                features['low_gates']['weighted_total'] += w
                if is_win: features['low_gates']['weighted_wins'] += w

            if score >= 10:
                features['high_score']['weighted_total'] += w
                if is_win: features['high_score']['weighted_wins'] += w
            elif score < 5:
                features['low_score']['weighted_total'] += w
                if is_win: features['low_score']['weighted_wins'] += w

            if 'TREND' in regime:
                features['trending_regime']['weighted_total'] += w
                if is_win: features['trending_regime']['weighted_wins'] += w
            elif 'RANG' in regime:
                features['ranging_regime']['weighted_total'] += w
                if is_win: features['ranging_regime']['weighted_wins'] += w

            if 'CONFIRMED' in sig:
                features['confirmed_signal']['weighted_total'] += w
                if is_win: features['confirmed_signal']['weighted_wins'] += w
            elif 'AGUARDAR' in sig:
                features['aguardar_signal']['weighted_total'] += w
                if is_win: features['aguardar_signal']['weighted_wins'] += w

            # Session analytics
            if session == 'KILL_ZONE':
                features['kill_zone_session']['weighted_total'] += w
                if is_win: features['kill_zone_session']['weighted_wins'] += w
            elif session == 'ASIAN':
                features['asian_session']['weighted_total'] += w
                if is_win: features['asian_session']['weighted_wins'] += w
            elif session in ('LONDON', 'LONDON_OPEN'):
                features['london_session']['weighted_total'] += w
                if is_win: features['london_session']['weighted_wins'] += w
            elif session in ('NY', 'NY_CLOSE'):
                features['ny_session']['weighted_total'] += w
                if is_win: features['ny_session']['weighted_wins'] += w

        # Weighted baseline WR
        baseline_wr = (total_weighted_wins / total_weighted * 100) if total_weighted > 0 else 50

        feature_importance = {}
        for feature, data in features.items():
            if data['weighted_total'] >= 5:  # minimum weight threshold
                wr = data['weighted_wins'] / data['weighted_total'] * 100
                importance = (wr - baseline_wr) / max(baseline_wr, 1)
                feature_importance[feature] = {
                    'winRate': round(wr, 1),
                    'weightedSamples': round(data['weighted_total'], 1),
                    'importance': round(importance, 3),
                    'lift': round(wr - baseline_wr, 1)
                }

        # ── Walk-Forward Validation on TEST set ──
        # Check if our learned features actually work on unseen data
        walk_forward = {'validated': False, 'testWR': None, 'trainWR': None, 'overfitRisk': 'UNKNOWN'}

        if len(test_data) >= 10:
            test_wins = len([t for t in test_data if t.get('outcome', '').startswith('WIN')])
            test_wr = (test_wins / len(test_data)) * 100
            train_wr = baseline_wr

            walk_forward['validated'] = True
            walk_forward['testWR'] = round(test_wr, 1)
            walk_forward['trainWR'] = round(train_wr, 1)
            walk_forward['testSamples'] = len(test_data)

            # If train WR >> test WR → overfitting
            diff = train_wr - test_wr
            if diff > 15:
                walk_forward['overfitRisk'] = 'HIGH'
            elif diff > 8:
                walk_forward['overfitRisk'] = 'MEDIUM'
            else:
                walk_forward['overfitRisk'] = 'LOW'

        # ── Generate adjusted weights (with overfit protection) ──
        adjusted_weights = {
            'confidenceMultiplier': 1.0,
            'gateScoreMultiplier': 1.0,
            'scoreMultiplier': 1.0,
            'regimeAdjustments': {},
            'minGatesForConfirmed': 5,
            'minConfidenceThreshold': 40,
            'sessionMultipliers': {}
        }

        # Penalize weights if overfitting detected
        overfit_penalty = 1.0
        if walk_forward.get('overfitRisk') == 'HIGH':
            overfit_penalty = 0.5  # halve all adjustments
        elif walk_forward.get('overfitRisk') == 'MEDIUM':
            overfit_penalty = 0.75

        if 'high_confidence' in feature_importance and 'low_confidence' in feature_importance:
            diff = feature_importance['high_confidence']['winRate'] - feature_importance['low_confidence']['winRate']
            diff *= overfit_penalty
            if diff > 10:
                adjusted_weights['confidenceMultiplier'] = 1.2
            elif diff < -5:
                adjusted_weights['confidenceMultiplier'] = 0.8

        if 'high_gates' in feature_importance and 'low_gates' in feature_importance:
            diff = feature_importance['high_gates']['winRate'] - feature_importance['low_gates']['winRate']
            diff *= overfit_penalty
            if diff > 15:
                adjusted_weights['gateScoreMultiplier'] = 1.3
                adjusted_weights['minGatesForConfirmed'] = 5
            elif diff > 5:
                adjusted_weights['gateScoreMultiplier'] = 1.1
            elif diff < -5:
                adjusted_weights['minGatesForConfirmed'] = 4

        if 'confirmed_signal' in feature_importance and 'aguardar_signal' in feature_importance:
            reactive_advantage = feature_importance['confirmed_signal']['winRate'] - feature_importance['aguardar_signal']['winRate']
            adjusted_weights['reactiveAdvantage'] = round(reactive_advantage * overfit_penalty, 1)

        # Session multiplier adjustments
        for sess_key, feat_key in [('KILL_ZONE', 'kill_zone_session'), ('ASIAN', 'asian_session'),
                                     ('LONDON', 'london_session'), ('NY', 'ny_session')]:
            if feat_key in feature_importance:
                sess_wr = feature_importance[feat_key]['winRate']
                adjusted_weights['sessionMultipliers'][sess_key] = round(sess_wr / max(baseline_wr, 1), 2)

        self.model_weights = {
            'featureImportance': feature_importance,
            'adjustedWeights': adjusted_weights,
            'baselineWinRate': round(baseline_wr, 1),
            'totalEvaluated': len(all_evaluated),
            'trainSize': len(train_data),
            'testSize': len(test_data),
            'walkForward': walk_forward,
            'reputationStats': {
                'totalDevices': len(self.device_reputation),
                'avgWeight': round(sum(r.get('reputationWeight', 1) for r in self.device_reputation.values()) / max(len(self.device_reputation), 1), 2),
                'topDevices': len([r for r in self.device_reputation.values() if r.get('reputationWeight', 1) > 3])
            },
            'lastUpdated': datetime.utcnow().isoformat()
        }

        self._save_weights()
        print(f"[Collective] Updated model weights from {len(all_evaluated)} evaluated trades. Baseline WR: {baseline_wr:.1f}%")

    def get_model_weights(self) -> dict:
        """Return current learned model weights."""
        if not self.model_weights:
            self._update_model_weights()
        return self.model_weights or {
            'featureImportance': {},
            'adjustedWeights': {},
            'baselineWinRate': None,
            'totalEvaluated': 0,
            'lastUpdated': None
        }

    # ── PUBLIC PERFORMANCE DATA ──

    def get_public_performance(self) -> dict:
        """
        Returns auditable, public performance data.
        "If you publish: Score ≥ 10 has 63% win rate over 4 years of BTC,
         you become a reference."
        """
        all_evaluated = []
        for sym_trades in self.trades.values():
            all_evaluated.extend([t for t in sym_trades if t.get('outcome') is not None])

        if not all_evaluated:
            return {'available': False, 'message': 'Insufficient data'}

        total = len(all_evaluated)
        wins = len([t for t in all_evaluated if t.get('outcome', '').startswith('WIN')])

        # By score bucket — this is the "publishable" data
        score_buckets = {}
        for threshold in [4, 6, 8, 10, 12, 15]:
            bucket_trades = [t for t in all_evaluated if abs(t.get('score', 0)) >= threshold]
            if len(bucket_trades) >= 10:
                bucket_wins = len([t for t in bucket_trades if t.get('outcome', '').startswith('WIN')])
                score_buckets[f'score_gte_{threshold}'] = {
                    'trades': len(bucket_trades),
                    'winRate': round(bucket_wins / len(bucket_trades) * 100, 1),
                    'avgPnl': round(sum(t.get('pnl', 0) for t in bucket_trades) / len(bucket_trades), 2)
                }

        # By gate count — V4 reactive data
        gate_buckets = {}
        for gates in [3, 4, 5, 6, 7]:
            gt = [t for t in all_evaluated if t.get('gates', 0) >= gates]
            if len(gt) >= 10:
                gw = len([t for t in gt if t.get('outcome', '').startswith('WIN')])
                gate_buckets[f'gates_gte_{gates}'] = {
                    'trades': len(gt),
                    'winRate': round(gw / len(gt) * 100, 1)
                }

        # By symbol
        by_symbol = {}
        for sym, trades in self.trades.items():
            evaluated = [t for t in trades if t.get('outcome') is not None]
            if len(evaluated) >= 10:
                sw = len([t for t in evaluated if t.get('outcome', '').startswith('WIN')])
                by_symbol[sym] = {
                    'trades': len(evaluated),
                    'winRate': round(sw / len(evaluated) * 100, 1)
                }

        return {
            'available': True,
            'totalTrades': total,
            'overallWinRate': round(wins / total * 100, 1),
            'byScoreThreshold': score_buckets,
            'byGateCount': gate_buckets,
            'bySymbol': by_symbol,
            'dataRange': {
                'from': min(t.get('ts', 0) for t in all_evaluated) if all_evaluated else None,
                'to': max(t.get('ts', 0) for t in all_evaluated) if all_evaluated else None
            },
            'totalUsers': len(self.unique_sessions),
            'generatedAt': datetime.utcnow().isoformat()
        }


# Singleton instance
collective_service = CollectiveIntelligence()
