"""Match catalog books to spines in shelf photos; output color, size and order per book.

Usage: python extract.py <shelves dir> <books-by-shelf.json> <ocr dir> <out.json> [preview dir]
"""
import json, sys, os, re, unicodedata
from difflib import SequenceMatcher
import numpy as np
import cv2
from scipy.ndimage import gaussian_filter1d
from scipy.signal import find_peaks

SHELVES, BOOKS, OCR, OUT = sys.argv[1:5]
PREVIEW = sys.argv[5] if len(sys.argv) > 5 else None

STOP = set("""the and of a an in on to for with from by at is it its as or into under over
stories story novel novels collected selected complete new edition vol volume book books
press knopf vintage penguin viking harper random house norton books library classics""".split())


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return [t for t in re.findall(r'[a-z0-9]+', s) if len(t) >= 3 and t not in STOP]


def tok_sim(a, b):
    if a == b:
        return 1.0
    if min(len(a), len(b)) < 5:
        return 0.0
    r = SequenceMatcher(None, a, b).ratio()
    return r if r >= 0.8 else 0.0


def est_width(b):
    return 14 + (b['pages'] or 260) / 22


def edge_profile(gray):
    H, W = gray.shape
    gx = np.abs(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3))
    band = gx[int(H * 0.25):int(H * 0.85)]
    # Spine edges are long vertical lines: use the median over rows, not the mean,
    # so lettering (short edges) counts less.
    prof = np.median(band, axis=0) * 0.6 + band.mean(axis=0) * 0.4
    return gaussian_filter1d(prof, 1.5)


def anchors_for(shelf_books, ocr_rows):
    toks = [(norm(b['title']), norm(b['author'])) for b in shelf_books]
    df = {}
    for t, a in toks:
        for u in set(t) | set(a):
            df[u] = df.get(u, 0) + 1
    hits = {}
    for o in ocr_rows:
        if o['conf'] < 0.5:
            continue
        ws = norm(o['text'])
        if not ws:
            continue
        scores = []
        for i, (t, a) in enumerate(toks):
            s = 0.0
            for w in ws:
                best = 0.0
                for u in t:
                    best = max(best, tok_sim(w, u) * len(u) / df[u])
                for u in a:
                    best = max(best, tok_sim(w, u) * len(u) * 0.6 / df[u])
                s += best
            scores.append(s)
        order = np.argsort(scores)[::-1]
        best, second = scores[order[0]], scores[order[1]] if len(order) > 1 else 0
        if best >= 4 and best >= 1.6 * second + 0.5:
            hits.setdefault(int(order[0]), []).append((o['x0'] + o['x1']) / 2)
    return {i: float(np.median(xs)) for i, xs in hits.items()}


def lis(pairs):
    """Longest subsequence of (idx, x) pairs (sorted by idx) with increasing x."""
    n = len(pairs)
    best = [1] * n
    prev = [-1] * n
    for i in range(n):
        for j in range(i):
            if pairs[j][1] < pairs[i][1] and best[j] + 1 > best[i]:
                best[i], prev[i] = best[j] + 1, j
    if not n:
        return []
    k = int(np.argmax(best))
    out = []
    while k >= 0:
        out.append(pairs[k])
        k = prev[k]
    return out[::-1]


def place(shelf_books, anchors, W):
    n = len(shelf_books)
    pairs = sorted(anchors.items())
    # Direction: shelves were catalogued left-to-right or right-to-left.
    reversed_ = False
    if len(pairs) >= 2:
        fwd = len(lis(pairs))
        bwd = len(lis([(i, -x) for i, x in pairs]))
        reversed_ = bwd > fwd
    if reversed_:
        pairs = [(i, W - x) for i, x in pairs]  # work in mirrored coordinates
    kept = dict(lis(pairs))
    # Allow small local swaps: re-add dropped anchors that sit between nearby kept anchors.
    for i, x in pairs:
        if i in kept:
            continue
        lo = [kx for ki, kx in kept.items() if i - 4 <= ki < i]
        hi = [kx for ki, kx in kept.items() if i < ki <= i + 4]
        if lo and hi and min(lo) - 40 < x < max(hi) + 40:
            kept[i] = x
    widths = np.array([est_width(b) for b in shelf_books])
    cum = np.cumsum(widths) - widths / 2
    xs = np.full(n, np.nan)
    ks = sorted(kept.items())
    if len(ks) >= 2:
        ratios = [(x2 - x1) / (cum[i2] - cum[i1]) for (i1, x1), (i2, x2) in zip(ks, ks[1:]) if cum[i2] > cum[i1] and x2 > x1]
        scale = float(np.median(ratios)) if ratios else W / cum[-1]
    else:
        scale = W / (cum[-1] + widths[-1] / 2)
    if not ks:
        ks = [(0, cum[0] * scale)]
    for i, x in ks:
        xs[i] = x
    for (i1, x1), (i2, x2) in zip(ks, ks[1:]):
        for i in range(i1 + 1, i2):
            xs[i] = x1 + (x2 - x1) * (cum[i] - cum[i1]) / (cum[i2] - cum[i1])
    i0, x0 = ks[0]
    for i in range(0, i0):
        xs[i] = x0 - scale * (cum[i0] - cum[i])
    i1, x1 = ks[-1]
    for i in range(i1 + 1, n):
        xs[i] = x1 + scale * (cum[i] - cum[i1])
    if reversed_:
        xs = W - xs
    return xs, reversed_, len(kept), scale


def snap(bounds, prof, spacing):
    peaks, props = find_peaks(prof, prominence=np.percentile(prof, 60) * 0.3)
    out = []
    for b, sp in zip(bounds, spacing):
        tol = max(6, sp * 0.35)
        near = [p for p in peaks if abs(p - b) <= tol]
        out.append(float(max(near, key=lambda p: prof[p] - 0.02 * abs(p - b))) if near else float(b))
    return out


def spine_measure(img_lab, img_rgb, l, r):
    H = img_rgb.shape[0]
    w = r - l
    c0, c1 = int(l + w * 0.2), int(r - w * 0.2)
    if c1 - c0 < 2:
        c0, c1 = int(l), int(max(r, l + 2))
    crop = img_lab[:, c0:c1].astype(np.float32)
    rows = gaussian_filter1d(crop.mean(axis=1), 2, axis=0)
    d = np.linalg.norm(rows[4:] - rows[:-4], axis=1)
    top_zone = d[int(H * 0.01):int(H * 0.55)]
    # The spine top is the first strong change coming down from the top of the photo
    # (later ones are usually labels or lettering).
    top = 0
    if top_zone.size and top_zone.max() >= 8:
        strong = np.nonzero(top_zone >= max(10, 0.45 * top_zone.max()))[0]
        top = int(strong[0]) + int(H * 0.01) + 2
    bot_zone = d[int(H * 0.82):]
    bottom = int(np.argmax(bot_zone)) + int(H * 0.82) + 2 if bot_zone.size and bot_zone.max() > 8 else H
    hh = bottom - top
    px = img_rgb[int(top + hh * 0.12):int(bottom - hh * 0.1), c0:c1].reshape(-1, 3).astype(np.float32)
    if len(px) < 10:
        px = img_rgb[:, c0:c1].reshape(-1, 3).astype(np.float32)
    k = 3 if len(px) > 30 else 1
    _, labels, centers = cv2.kmeans(px, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0), 3, cv2.KMEANS_PP_CENTERS)
    counts = np.bincount(labels.ravel(), minlength=k)
    rgb = centers[int(np.argmax(counts))]
    return rgb, top, bottom


def hexc(rgb):
    return '#' + ''.join(f'{int(max(0, min(255, round(v)))):02x}' for v in rgb)


def lum(rgb):
    c = np.array(rgb) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def main():
    cv2.setRNGSeed(0)
    books = json.load(open(BOOKS))
    result, report = {}, []
    for f in sorted(os.listdir(SHELVES)):
        sid = f[:-4]
        sb = books.get(sid)
        if not sb:
            continue
        bgr = cv2.imread(os.path.join(SHELVES, f))
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
        H, W = rgb.shape[:2]
        prof = edge_profile(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32))
        ocr_rows = [json.loads(l) for l in open(os.path.join(OCR, sid + '.jsonl'))]
        anchors = anchors_for(sb, ocr_rows)
        xs, rev, nkept, scale = place(sb, anchors, W)

        order = [i for i in np.argsort(xs) if -0.01 * W < xs[i] < 1.01 * W]
        cx = [xs[i] for i in order]
        bounds = [cx[0] - (cx[1] - cx[0]) / 2 if len(cx) > 1 else cx[0] - 20]
        bounds += [(a + b) / 2 for a, b in zip(cx, cx[1:])]
        bounds.append(cx[-1] + (cx[-1] - cx[-2]) / 2 if len(cx) > 1 else cx[0] + 20)
        bounds = [min(max(b, 0), W - 1) for b in bounds]
        spacing = [bounds[1] - bounds[0]] + [(bounds[j + 1] - bounds[j - 1]) / 2 for j in range(1, len(bounds) - 1)] + [bounds[-1] - bounds[-2]]
        bounds = snap(bounds, prof, spacing)
        bounds = list(np.maximum.accumulate(bounds))

        measured = []
        for j, i in enumerate(order):
            l, r = bounds[j], bounds[j + 1]
            if r - l < 4:
                continue
            c, top, bottom = spine_measure(lab, rgb, l, r)
            measured.append((i, l, r, c, top, bottom))
        if not measured:
            continue
        pw = np.array([m[2] - m[1] for m in measured])
        ph = np.array([m[5] - m[4] for m in measured])
        wk = 28 / np.median(pw)
        hk = 182 / np.percentile(ph, 90)
        for i, l, r, c, top, bottom in measured:
            b = sb[i]
            result[str(b['id'])] = {
                'bg': hexc(c),
                'fg': '#2a2019' if lum(c) > 0.3 else '#f3ead7',
                'w': int(np.clip(round((r - l) * wk), 14, 64)),
                'h': int(np.clip(round((bottom - top) * hk), 112, 192)),
                'pos': round(((l + r) / 2) / W, 4),
            }
        report.append(f"{sid}: {len(sb)} books, {len(anchors)} matched by text, {nkept} kept, {'right-to-left' if rev else 'left-to-right'}, {len(measured)} placed")

        if PREVIEW:
            os.makedirs(PREVIEW, exist_ok=True)
            strip = np.full((140, W, 3), 245, np.uint8)
            for i, l, r, c, top, bottom in measured:
                cv2.rectangle(strip, (int(l), 10), (int(r) - 1, 130), tuple(int(v) for v in c), -1)
                cv2.putText(strip, str(i + 1), (int(l) + 2, 125), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255) if lum(c) < 0.3 else (0, 0, 0), 1)
            vis = rgb.copy()
            for i, x in anchors.items():
                cv2.circle(vis, (int(x), 12), 6, (255, 0, 0), -1)
            for b in bounds:
                cv2.line(vis, (int(b), H - 30), (int(b), H - 1), (0, 255, 0), 2)
            cv2.imwrite(os.path.join(PREVIEW, sid + '.png'), cv2.cvtColor(np.vstack([vis, strip]), cv2.COLOR_RGB2BGR))

    json.dump(result, open(OUT, 'w'), indent=None, separators=(',', ':'))
    print('\n'.join(report))
    print(f'{len(result)} books styled from photos')


main()
