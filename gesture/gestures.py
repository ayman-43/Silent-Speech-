"""
Gesture detection logic using MediaPipe hand landmarks.

Recognises 30+ named gestures via a two-pass approach:
  1. Geometry checks  – distance / shape tests (OK, Pinch, Claw, Duck, Vulcan…)
  2. Finger-state patterns – binary [Thumb Index Middle Ring Pinky]

Landmark index reference (MediaPipe 21-point hand model):
  WRIST=0
  THUMB:  CMC=1  MCP=2  IP=3  TIP=4
  INDEX:  MCP=5  PIP=6  DIP=7  TIP=8
  MIDDLE: MCP=9  PIP=10 DIP=11 TIP=12
  RING:   MCP=13 PIP=14 DIP=15 TIP=16
  PINKY:  MCP=17 PIP=18 DIP=19 TIP=20
"""

import math
from dataclasses import dataclass, field
from typing import List

# ── Landmark indices ─────────────────────────────────────────────────────────
WRIST = 0
THUMB_CMC, THUMB_MCP, THUMB_IP, THUMB_TIP   = 1, 2, 3, 4
INDEX_MCP,  INDEX_PIP,  INDEX_DIP,  INDEX_TIP  = 5,  6,  7,  8
MIDDLE_MCP, MIDDLE_PIP, MIDDLE_DIP, MIDDLE_TIP = 9,  10, 11, 12
RING_MCP,   RING_PIP,   RING_DIP,   RING_TIP   = 13, 14, 15, 16
PINKY_MCP,  PINKY_PIP,  PINKY_DIP,  PINKY_TIP  = 17, 18, 19, 20


@dataclass
class GestureResult:
    name: str
    confidence: float
    hand_label: str            # "Left" | "Right"
    emoji: str
    finger_states: List[bool] = field(default_factory=list)  # [T, I, M, R, P]


# ── Internal helpers ─────────────────────────────────────────────────────────

def _dist(a, b) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


# ── HandAnalyzer ─────────────────────────────────────────────────────────────

class HandAnalyzer:
    """
    Wraps MediaPipe hand landmarks and exposes finger states + geometry helpers.
    All landmark coordinates are normalised [0, 1]; y increases downward.
    """

    def __init__(self, landmarks, handedness: str):
        self.lm = landmarks          # list/sequence of 21 NormalizedLandmark
        self.handedness = handedness # "Left" | "Right"  (person's perspective)
        # Reference scale: wrist → middle MCP distance
        self._scale = _dist(self.lm[WRIST], self.lm[MIDDLE_MCP]) + 1e-9
        self.fingers = self._compute_finger_states()

    # ── Finger state ─────────────────────────────────────────────────────────

    def _compute_finger_states(self) -> List[bool]:
        """Returns [thumb, index, middle, ring, pinky] — True = extended."""
        lm = self.lm
        # Thumb: tip is further from the index MCP than the thumb MCP is.
        # This is handedness-agnostic and works in both mirrored and normal frames.
        thumb_ext = _dist(lm[THUMB_TIP], lm[INDEX_MCP]) > _dist(lm[THUMB_MCP], lm[INDEX_MCP])

        # Other fingers: tip y < PIP y  (y increases downward → smaller y = higher)
        idx_ext = lm[INDEX_TIP].y  < lm[INDEX_PIP].y
        mid_ext = lm[MIDDLE_TIP].y < lm[MIDDLE_PIP].y
        rng_ext = lm[RING_TIP].y   < lm[RING_PIP].y
        pnk_ext = lm[PINKY_TIP].y  < lm[PINKY_PIP].y

        return [thumb_ext, idx_ext, mid_ext, rng_ext, pnk_ext]

    # Convenience properties
    @property
    def T(self): return self.fingers[0]   # Thumb
    @property
    def I(self): return self.fingers[1]   # Index
    @property
    def M(self): return self.fingers[2]   # Middle
    @property
    def R(self): return self.fingers[3]   # Ring
    @property
    def P(self): return self.fingers[4]   # Pinky

    def pat(self) -> str:
        """Binary pattern string 'TIMRP', e.g. '01100' = index+middle extended."""
        return ''.join('1' if f else '0' for f in self.fingers)

    # ── Distance helpers ──────────────────────────────────────────────────────

    def ndist(self, a: int, b: int) -> float:
        """Normalised distance between landmarks a and b (÷ hand scale)."""
        return _dist(self.lm[a], self.lm[b]) / self._scale

    def touching(self, a: int, b: int, thresh: float = 0.22) -> bool:
        return self.ndist(a, b) < thresh

    # ── Direction helpers ─────────────────────────────────────────────────────

    def _vec_dir(self, base: int, tip: int) -> str:
        """Cardinal screen direction of the vector from landmark base → tip."""
        dx = self.lm[tip].x - self.lm[base].x
        dy = self.lm[tip].y - self.lm[base].y  # positive = downward in image
        # Negate dy so that up → positive angle (standard math convention)
        angle = math.degrees(math.atan2(-dy, dx))
        if   45  < angle <= 135:  return "up"
        elif -135 < angle <= -45: return "down"
        elif -45  < angle <= 45:  return "right"
        else:                     return "left"

    def thumb_dir(self) -> str:
        return self._vec_dir(THUMB_MCP, THUMB_TIP)

    def index_dir(self) -> str:
        return self._vec_dir(INDEX_MCP, INDEX_TIP)

    # ── Shape helpers ─────────────────────────────────────────────────────────

    def fingers_crossed(self) -> bool:
        """
        True when index and middle have swapped their x-order at the tips
        compared to their MCPs  (index tip crosses over middle tip).
        Works for both hands in mirrored or normal frames.
        """
        mcp_order = self.lm[INDEX_MCP].x < self.lm[MIDDLE_MCP].x
        tip_order = self.lm[INDEX_TIP].x < self.lm[MIDDLE_TIP].x
        return mcp_order != tip_order

    def vulcan_spread(self) -> bool:
        """
        True when the gap between middle and ring tips is significantly wider
        than the gaps within the index-middle pair and ring-pinky pair.
        """
        mid_ring = abs(self.lm[MIDDLE_TIP].x - self.lm[RING_TIP].x)
        idx_mid  = abs(self.lm[INDEX_TIP].x  - self.lm[MIDDLE_TIP].x)
        rng_pnk  = abs(self.lm[RING_TIP].x   - self.lm[PINKY_TIP].x)
        inner    = (idx_mid + rng_pnk) / 2 + 1e-9
        return mid_ring > inner * 1.4

    def claw_shape(self) -> bool:
        """
        True when all 4 fingers are raised at the PIP joint but bent at the
        DIP (tips curl down — the 'claw' or 'bear paw' shape).
        """
        lm = self.lm
        # PIP joints must be above (smaller y) their MCPs
        pips_raised = all([
            lm[INDEX_PIP].y  < lm[INDEX_MCP].y,
            lm[MIDDLE_PIP].y < lm[MIDDLE_MCP].y,
            lm[RING_PIP].y   < lm[RING_MCP].y,
            lm[PINKY_PIP].y  < lm[PINKY_MCP].y,
        ])
        # Tips must NOT be above PIPs (they curl forward/downward)
        tips_hooked = all([
            lm[INDEX_TIP].y  >= lm[INDEX_PIP].y  - 0.02,
            lm[MIDDLE_TIP].y >= lm[MIDDLE_PIP].y - 0.02,
            lm[RING_TIP].y   >= lm[RING_PIP].y   - 0.02,
            lm[PINKY_TIP].y  >= lm[PINKY_PIP].y  - 0.02,
        ])
        # Distinguish from a fist: PIPs must be well away from wrist
        pips_high = any([
            _dist(lm[INDEX_PIP],  lm[WRIST]) > self._scale * 0.65,
            _dist(lm[MIDDLE_PIP], lm[WRIST]) > self._scale * 0.65,
        ])
        return pips_raised and tips_hooked and pips_high

    def all_tips_bunched(self) -> bool:
        """All 5 fingertips gathered close to the thumb tip (duck / puppet beak)."""
        tips = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP]
        return all(self.touching(THUMB_TIP, t, 0.30) for t in tips)

    def index_middle_apart(self) -> bool:
        """Index and middle tips are spread wide (helps distinguish V from default)."""
        return self.ndist(INDEX_TIP, MIDDLE_TIP) > 0.35

    def ring_pinky_together(self) -> bool:
        return self.ndist(RING_TIP, PINKY_TIP) < 0.20

    def index_middle_together(self) -> bool:
        return self.ndist(INDEX_TIP, MIDDLE_TIP) < 0.20


# ── Gesture catalogue (for legend / UI) ──────────────────────────────────────

GESTURE_CATALOG = [
    # (name, emoji, pattern, description)
    ("Closed_Fist",      "FIST",   "00000", "All fingers curled"),
    ("Open_Palm",        "PALM",   "11111", "All fingers extended"),
    ("Vulcan_Salute",    "VULCAN", "11111", "All extended, M/R spread apart"),
    ("Thumbs_Up",        "THU+",   "10000", "Thumb up, others curled"),
    ("Thumbs_Down",      "THU-",   "10000", "Thumb down, others curled"),
    ("Thumbs_Side",      "THU>",   "10000", "Thumb sideways"),
    ("Pointing_Up",      "UP",     "01000", "Index up"),
    ("Pointing_Left",    "LEFT",   "01000", "Index left"),
    ("Pointing_Right",   "RIGHT",  "01000", "Index right"),
    ("Pointing_Down",    "DOWN",   "01000", "Index down"),
    ("Peace",            "PEACE",  "01100", "Index + middle extended"),
    ("Crossed_Fingers",  "CROSS",  "01100", "Index crosses over middle"),
    ("Three",            "THREE",  "01110", "Index + middle + ring"),
    ("Four",             "FOUR",   "01111", "4 fingers, no thumb"),
    ("Rock",             "ROCK",   "01001", "Index + pinky (horns)"),
    ("ILoveYou",         "ILY",    "11001", "Thumb + index + pinky"),
    ("Call_Me",          "CALL",   "10001", "Thumb + pinky"),
    ("Gun",              "GUN",    "11000", "Thumb + index"),
    ("Middle_Finger",    "MF",     "00100", "Middle only"),
    ("Ring_Up",          "RING",   "00010", "Ring only"),
    ("Pinky_Up",         "PINKY",  "00001", "Pinky only"),
    ("OK",               "OK",     "geo",   "Thumb+index touch, others open"),
    ("Pinch",            "PINCH",  "geo",   "Thumb+index touch, others closed"),
    ("Snap",             "SNAP",   "geo",   "Thumb+middle touch"),
    ("Duck",             "DUCK",   "geo",   "All 5 tips bunched together"),
    ("Claw",             "CLAW",   "geo",   "Fingers raised but hooked at DIP"),
    ("Spider_Man",       "SPIDY",  "00101", "Middle + pinky"),
    ("Three_Thumb",      "THR3",   "11100", "Thumb + index + middle"),
    ("Four_Thumb",       "THR4",   "11110", "Thumb + 4 fingers"),
    ("Inner_Three",      "3IN",    "00111", "Middle + ring + pinky"),
]


# ── Main classifier ───────────────────────────────────────────────────────────

def detect_gesture(hand: HandAnalyzer) -> GestureResult:
    """
    Classify a hand pose into a named gesture.

    Strategy:
      Pass 1 — Geometry-specific checks (distance / shape)
      Pass 2 — Finger-state pattern matching
    """

    def R(name: str, conf: float, emoji: str) -> GestureResult:
        return GestureResult(name, conf, hand.handedness, emoji, list(hand.fingers))

    # ── Pass 1: Geometry-specific gestures ────────────────────────────────────

    # Duck / puppet beak — all tips bunched regardless of finger states
    if hand.all_tips_bunched():
        return R("Duck", 0.85, "DUCK")

    # Claw — PIP raised but DIP curled (must check before fist)
    if hand.claw_shape():
        return R("Claw", 0.82, "CLAW")

    # OK — thumb + index touch, middle/ring/pinky open
    if hand.touching(THUMB_TIP, INDEX_TIP, 0.20) and hand.M and hand.R and hand.P:
        return R("OK", 0.90, "OK")

    # Pinch — thumb + index touch, others closed
    if hand.touching(THUMB_TIP, INDEX_TIP, 0.20) and not hand.M and not hand.R and not hand.P:
        return R("Pinch", 0.90, "PINCH")

    # Pinch-three — thumb + index touch, middle open, ring/pinky closed
    if hand.touching(THUMB_TIP, INDEX_TIP, 0.20) and hand.M and not hand.R and not hand.P:
        return R("Pinch_Three", 0.78, "PINCH3")

    # Snap position — thumb + middle touch, index/ring/pinky closed
    if (hand.touching(THUMB_TIP, MIDDLE_TIP, 0.20)
            and not hand.I and not hand.R and not hand.P):
        return R("Snap", 0.80, "SNAP")

    # ── Pass 2: Finger-state patterns ─────────────────────────────────────────

    p = hand.pat()   # 5-char binary string: T I M R P

    # ·· Zero / Five ··
    if p == "00000":
        return R("Closed_Fist", 0.95, "FIST")

    if p == "11111":
        if hand.vulcan_spread():
            return R("Vulcan_Salute", 0.88, "VULCAN")
        return R("Open_Palm", 0.95, "PALM")

    # ·· Thumb-only ··
    if p == "10000":
        d = hand.thumb_dir()
        if d == "up":   return R("Thumbs_Up",   0.92, "THU+")
        if d == "down": return R("Thumbs_Down", 0.92, "THU-")
        return              R("Thumbs_Side",  0.78, "THU>")

    # ·· Single non-thumb finger ··
    if p == "01000":
        d = hand.index_dir()
        return {
            "up":    R("Pointing_Up",    0.92, "UP"),
            "down":  R("Pointing_Down",  0.88, "DOWN"),
            "left":  R("Pointing_Left",  0.88, "LEFT"),
            "right": R("Pointing_Right", 0.88, "RIGHT"),
        }.get(d, R("Pointing_Up", 0.75, "UP"))

    if p == "00100": return R("Middle_Finger", 0.92, "MF")
    if p == "00010": return R("Ring_Up",       0.82, "RING")
    if p == "00001": return R("Pinky_Up",      0.88, "PINKY")

    # ·· Two-finger combos ··
    if p == "11000": return R("Gun",            0.88, "GUN")
    if p == "10001": return R("Call_Me",        0.92, "CALL")
    if p == "01001": return R("Rock",           0.92, "ROCK")

    if p == "01100":
        if hand.fingers_crossed():
            return R("Crossed_Fingers", 0.85, "CROSS")
        return R("Peace", 0.92, "PEACE")

    if p == "01010": return R("ASL_R",          0.72, "ASL-R")   # index + ring
    if p == "00110": return R("Middle_Ring",    0.72, "M+R")
    if p == "00011": return R("Ring_Pinky",     0.72, "R+P")
    if p == "00101": return R("Spider_Man",     0.78, "SPIDY")   # middle + pinky
    if p == "10100": return R("Thumb_Middle",   0.72, "T+M")
    if p == "10010": return R("Thumb_Ring",     0.68, "T+R")

    # ·· Three-finger combos ··
    if p == "11001": return R("ILoveYou",       0.92, "ILY")
    if p == "01110": return R("Three",          0.90, "3")
    if p == "11100": return R("Three_Thumb",    0.82, "T+3")
    if p == "00111": return R("Inner_Three",    0.78, "3IN")      # middle+ring+pinky
    if p == "10011": return R("Thumb_Ring_Pinky", 0.72, "T+R+P")
    if p == "10101": return R("Alternating",    0.72, "ALT")      # thumb+middle+pinky
    if p == "01101": return R("Idx_Mid_Pinky",  0.72, "I+M+P")
    if p == "01011": return R("Idx_Ring_Pinky", 0.70, "I+R+P")
    if p == "11010": return R("Thumb_Idx_Ring", 0.70, "T+I+R")

    # ·· Four-finger combos ··
    if p == "01111": return R("Four",           0.92, "4")
    if p == "11110": return R("Four_Thumb",     0.82, "T+4")
    if p == "11101": return R("Four_No_Ring",   0.75, "4-R")
    if p == "10111": return R("Thumb_Three",    0.75, "T+3B")
    if p == "11011": return R("No_Middle",      0.72, "4-M")      # all except middle

    return R("Unknown", 0.40, "???")
