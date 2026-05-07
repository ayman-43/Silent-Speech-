"""
Live webcam gesture recognition demo.

Run from the repo root:
    python -m gesture.demo
    python -m gesture.demo --camera 1
    python gesture/demo.py

Controls:
    Q / ESC   — quit
    L         — toggle gesture legend panel
    S         — toggle hand skeleton
    F         — toggle FPS counter
    SPACE     — freeze / unfreeze frame
"""

import sys
import os
import time
import argparse

import cv2
import numpy as np

# Support both `python gesture/demo.py` and `python -m gesture.demo`
try:
    from .recognizer import GestureRecognizer
    from .gestures import GESTURE_CATALOG
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from gesture.recognizer import GestureRecognizer
    from gesture.gestures import GESTURE_CATALOG

# ── Constants ────────────────────────────────────────────────────────────────

FONT   = cv2.FONT_HERSHEY_SIMPLEX
C_G    = (50,  220,  50)   # green  — right hand / active
C_B    = (50,  160, 240)   # blue   — left hand
C_W    = (230, 230, 230)   # white  — neutral text
C_Y    = (50,  220, 220)   # yellow — headers
C_DIM  = (120, 120, 120)   # dim    — hints

_LEGEND_LINES = [(row[0], row[1]) for row in GESTURE_CATALOG]  # (emoji_tag, name)

# ── Helper ────────────────────────────────────────────────────────────────────

def _txt(img, text, pos, scale=0.55, color=C_W, thickness=1, bg=True, bg_alpha=0.55):
    (tw, th), bl = cv2.getTextSize(text, FONT, scale, thickness)
    x, y = pos
    if bg:
        overlay = img.copy()
        cv2.rectangle(overlay, (x - 3, y - th - 3), (x + tw + 3, y + bl + 3), (0, 0, 0), -1)
        cv2.addWeighted(overlay, bg_alpha, img, 1 - bg_alpha, 0, img)
    cv2.putText(img, text, (x, y), FONT, scale, color, thickness, cv2.LINE_AA)
    return tw, th


# ── Main demo loop ────────────────────────────────────────────────────────────

def run_demo(camera_id: int = 0):
    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open camera {camera_id}")
        sys.exit(1)

    # Try higher resolution; fall back silently if unsupported
    for w, h in [(1280, 720), (960, 540), (640, 480)]:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  w)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
        if cap.get(cv2.CAP_PROP_FRAME_WIDTH) == w:
            break

    show_legend   = True
    show_skeleton = True
    show_fps      = True
    frozen        = False
    frozen_frame  = None

    prev_t    = time.perf_counter()
    fps_smooth = 30.0

    print("Gesture Recognizer started — press Q or ESC to quit.")
    print("Keys: L=legend  S=skeleton  F=fps  SPACE=freeze")

    with GestureRecognizer(max_hands=2) as rec:
        while True:
            if not frozen:
                ok, frame = cap.read()
                if not ok:
                    print("[WARN] Frame read failed — retrying…")
                    continue
                frame = cv2.flip(frame, 1)   # mirror for natural feel

            else:
                frame = frozen_frame.copy()

            gestures, results = rec.process(frame)
            annotated = rec.annotate(frame, results, gestures,
                                     draw_skeleton=show_skeleton)

            h_img, w_img = annotated.shape[:2]

            # ── FPS ──────────────────────────────────────────────────────────
            now   = time.perf_counter()
            dt    = max(now - prev_t, 1e-9)
            prev_t = now
            fps_smooth = 0.85 * fps_smooth + 0.15 * (1 / dt)

            if show_fps:
                _txt(annotated, f"FPS {fps_smooth:.1f}", (10, 26),
                     scale=0.65, color=C_Y, thickness=2)

            # ── Freeze indicator ─────────────────────────────────────────────
            if frozen:
                _txt(annotated, "[ FROZEN ]", (w_img // 2 - 50, 28),
                     scale=0.65, color=(0, 0, 220), thickness=2)

            # ── Gesture readout ───────────────────────────────────────────────
            if gestures:
                for idx, g in enumerate(gestures):
                    color = C_G if g.hand_label == "Right" else C_B
                    base_y = 55 + idx * 60

                    hand_tag = f"{g.hand_label} hand"
                    _txt(annotated, hand_tag, (10, base_y - 2),
                         scale=0.48, color=C_DIM, thickness=1)

                    _txt(annotated, g.name, (10, base_y + 22),
                         scale=0.85, color=color, thickness=2)

                    conf_bar_x = 10
                    conf_bar_y = base_y + 30
                    bar_w      = int(150 * g.confidence)
                    cv2.rectangle(annotated,
                                  (conf_bar_x, conf_bar_y),
                                  (conf_bar_x + 150, conf_bar_y + 6),
                                  (60, 60, 60), -1)
                    cv2.rectangle(annotated,
                                  (conf_bar_x, conf_bar_y),
                                  (conf_bar_x + bar_w, conf_bar_y + 6),
                                  color, -1)
                    _txt(annotated, f"{g.confidence:.0%}",
                         (conf_bar_x + 155, conf_bar_y + 6),
                         scale=0.42, color=C_DIM, thickness=1, bg=False)

                    # Finger-state dots  T I M R P
                    labels = ["T", "I", "M", "R", "P"]
                    for fi, (lbl, state) in enumerate(zip(labels, g.finger_states)):
                        cx = 10 + fi * 22
                        cy = base_y + 50
                        dot_c = (0, 210, 0) if state else (0, 0, 180)
                        cv2.circle(annotated, (cx, cy), 8, dot_c, -1)
                        cv2.putText(annotated, lbl, (cx - 4, cy + 4),
                                    FONT, 0.32, (255, 255, 255), 1, cv2.LINE_AA)

            else:
                _txt(annotated, "No hand detected", (10, 60),
                     scale=0.60, color=C_DIM)

            # ── Legend panel ──────────────────────────────────────────────────
            if show_legend:
                panel_x = w_img - 185
                _txt(annotated, "GESTURE LIST", (panel_x, 24),
                     scale=0.52, color=C_Y, thickness=1)
                for li, (tag, name) in enumerate(_LEGEND_LINES):
                    ly = 44 + li * 18
                    if ly > h_img - 20:
                        break
                    _txt(annotated, f"{tag:<6}  {name}", (panel_x, ly),
                         scale=0.38, color=C_W, thickness=1)

            # ── Bottom hint bar ───────────────────────────────────────────────
            hint = "Q/ESC quit  |  L legend  |  S skeleton  |  F fps  |  SPACE freeze"
            _txt(annotated, hint, (10, h_img - 10),
                 scale=0.38, color=C_DIM, thickness=1)

            cv2.imshow("MediaPipe Gesture Recognizer", annotated)

            key = cv2.waitKey(1) & 0xFF
            if key in (ord('q'), 27):       # Q or ESC
                break
            elif key == ord('l'):
                show_legend = not show_legend
            elif key == ord('s'):
                show_skeleton = not show_skeleton
            elif key == ord('f'):
                show_fps = not show_fps
            elif key == ord(' '):
                frozen = not frozen
                if frozen:
                    frozen_frame = frame.copy()

    cap.release()
    cv2.destroyAllWindows()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MediaPipe Gesture Recognizer demo")
    parser.add_argument("--camera", type=int, default=0,
                        help="Camera index (default: 0)")
    args = parser.parse_args()
    run_demo(camera_id=args.camera)
