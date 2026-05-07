"""
GestureRecognizer — MediaPipe Hands wrapper.

Usage:
    rec = GestureRecognizer()
    gestures, results = rec.process(bgr_frame)
    annotated = rec.annotate(bgr_frame, results, gestures)

    # or as a context manager:
    with GestureRecognizer() as rec:
        ...
"""

import cv2
import numpy as np
import mediapipe as mp
from typing import Any, List, Tuple

from .gestures import HandAnalyzer, GestureResult, detect_gesture

_hands_module       = mp.solutions.hands
_drawing            = mp.solutions.drawing_utils
_drawing_styles     = mp.solutions.drawing_styles

# Colour scheme for annotations  (BGR)
_COLOR_RIGHT = (50,  220, 50)    # green
_COLOR_LEFT  = (50,  160, 240)   # blue
_FONT        = cv2.FONT_HERSHEY_SIMPLEX


class GestureRecognizer:
    """
    Detects and classifies hand gestures in real time via MediaPipe Hands
    and a custom landmark-based gesture classifier.

    Supports up to `max_hands` simultaneous hands, each independently classified.
    """

    def __init__(
        self,
        max_hands: int = 2,
        min_detection_confidence: float = 0.70,
        min_tracking_confidence:  float = 0.50,
    ):
        self._hands = _hands_module.Hands(
            static_image_mode=False,
            max_num_hands=max_hands,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )

    # ── Core API ──────────────────────────────────────────────────────────────

    def process(
        self, frame: np.ndarray
    ) -> Tuple[List[GestureResult], Any]:
        """
        Process a BGR frame.

        Returns
        -------
        gestures : list[GestureResult]
            One entry per detected hand, in the same order as MediaPipe's
            multi_hand_landmarks.
        results : mediapipe.solutions.hands.Hands result object
            Raw MediaPipe output (landmarks, handedness, world landmarks).
        """
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        results = self._hands.process(rgb)
        rgb.flags.writeable = True

        gestures: List[GestureResult] = []
        if results.multi_hand_landmarks:
            for lm, hd in zip(
                results.multi_hand_landmarks,
                results.multi_handedness,
            ):
                label    = hd.classification[0].label   # "Left" | "Right"
                analyzer = HandAnalyzer(lm.landmark, label)
                gestures.append(detect_gesture(analyzer))

        return gestures, results

    def process_image(self, image: np.ndarray) -> Tuple[List[GestureResult], Any]:
        """Same as process() but for static images (sets static_image_mode internally)."""
        self._hands.static_image_mode = True
        out = self.process(image)
        self._hands.static_image_mode = False
        return out

    # ── Drawing ───────────────────────────────────────────────────────────────

    def annotate(
        self,
        frame: np.ndarray,
        results: Any,
        gestures: List[GestureResult],
        draw_skeleton: bool = True,
    ) -> np.ndarray:
        """
        Draw landmarks and gesture labels onto a copy of frame.

        Parameters
        ----------
        draw_skeleton : bool
            Draw the MediaPipe hand skeleton (points + connections).
        """
        out = frame.copy()
        if not results.multi_hand_landmarks:
            return out

        h, w = out.shape[:2]

        for i, lm in enumerate(results.multi_hand_landmarks):
            if draw_skeleton:
                _drawing.draw_landmarks(
                    out,
                    lm,
                    _hands_module.HAND_CONNECTIONS,
                    _drawing_styles.get_default_hand_landmarks_style(),
                    _drawing_styles.get_default_hand_connections_style(),
                )

            if i >= len(gestures):
                continue

            g     = gestures[i]
            color = _COLOR_RIGHT if g.hand_label == "Right" else _COLOR_LEFT

            # Wrist position → anchor for label
            wx = int(lm.landmark[0].x * w)
            wy = int(lm.landmark[0].y * h)

            label = f"{g.name}  {g.confidence:.0%}"
            (tw, th), _ = cv2.getTextSize(label, _FONT, 0.65, 2)

            # Semi-transparent background pill
            x0, y0 = wx - 4, wy + 26 - th - 4
            x1, y1 = wx + tw + 4, wy + 30
            overlay = out.copy()
            cv2.rectangle(overlay, (x0, y0), (x1, y1), (0, 0, 0), -1)
            cv2.addWeighted(overlay, 0.55, out, 0.45, 0, out)

            cv2.putText(out, label, (wx, wy + 26), _FONT, 0.65, color, 2, cv2.LINE_AA)

            # Finger-state dot strip just below label
            finger_names = ["T", "I", "M", "R", "P"]
            for fi, (fname, state) in enumerate(zip(finger_names, g.finger_states)):
                cx = wx + fi * 18
                cy = wy + 42
                dot_color = (0, 200, 0) if state else (0, 0, 200)
                cv2.circle(out, (cx, cy), 7, dot_color, -1)
                cv2.putText(out, fname, (cx - 4, cy + 4),
                            _FONT, 0.32, (255, 255, 255), 1, cv2.LINE_AA)

        return out

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def close(self):
        self._hands.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
