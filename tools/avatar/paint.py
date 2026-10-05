# Smooth the downloaded mesh and paint it from the reference images.
import os, sys
# Usage: python3 tools/avatar/paint.py [model folder]   (default: tools/avatar/alv)
# The folder holds mesh.glb (untextured shape), turnaround.jpg (front / side /
# back sheet), front_cutout.png and closeup.jpg. Intermediate files go to
# <folder>/build/ (git-ignored). See tools/avatar/README.md.
SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'alv'))
WORK = os.path.join(SRC, 'build') + '/'
os.makedirs(WORK, exist_ok=True)
IN = SRC + '/'
import json, struct, numpy as np
from PIL import Image
from scipy import ndimage, sparse


# ---------- load glb
f = open(IN + 'mesh.glb', 'rb').read()
cl = struct.unpack('<I', f[12:16])[0]
j = json.loads(f[20:20 + cl])
bin0 = 20 + cl + 8
def acc(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    off = bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    dt = {5125: np.uint32, 5123: np.uint16, 5126: np.float32}[a['componentType']]
    n = {'SCALAR': 1, 'VEC3': 3}[a['type']]
    return np.frombuffer(f, dt, a['count'] * n, off).reshape(-1, n) if n > 1 else np.frombuffer(f, dt, a['count'], off)
prim = j['meshes'][0]['primitives'][0]
P = acc(prim['attributes']['POSITION']).astype(np.float64)
F = acc(prim['indices']).astype(np.int64).reshape(-1, 3)
# node transform?
for nd in j['nodes']:
    if 'matrix' in nd: print('node matrix', nd['matrix'])
    if 'rotation' in nd or 'scale' in nd or 'translation' in nd: print('node trs', nd)

# ---------- normalise: feet on y=0, height 1.65 m, centred
mn, mx = P.min(0), P.max(0)
s = 1.65 / (mx[1] - mn[1])
P = (P - [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2]) * s
P0, F0 = P.copy(), F.copy()

# ---------- subdivide once (midpoints) and smooth (Taubin)
def subdivide(P, F):
    edges = {}
    newP = [p for p in P]
    def mid(a, b):
        k = (a, b) if a < b else (b, a)
        if k not in edges:
            edges[k] = len(newP); newP.append((P[a] + P[b]) / 2)
        return edges[k]
    NF = []
    for a, b, c in F:
        ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
        NF += [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
    return np.array(newP), np.array(NF)
P, F = subdivide(P, F)
n = len(P)
I = np.concatenate([F[:, 0], F[:, 1], F[:, 2], F[:, 1], F[:, 2], F[:, 0]])
J = np.concatenate([F[:, 1], F[:, 2], F[:, 0], F[:, 0], F[:, 1], F[:, 2]])
A = sparse.coo_matrix((np.ones(len(I)), (I, J)), shape=(n, n)).tocsr()
A.data[:] = 1
deg = np.asarray(A.sum(1)).ravel()
L = sparse.diags(1 / deg) @ A
for it in range(12):
    P = P + 0.5 * (L @ P - P)
    P = P - 0.53 * (L @ P - P)

# symmetric head + smooth face so the painted face is not bent by lumpy geometry
from scipy.spatial import cKDTree
head = P[:, 1] > 1.38
tree = cKDTree(P * [-1, 1, 1])
dd, ii = tree.query(P[head])
Ph = P[head].copy()
mir = P[ii] * [-1, 1, 1]
blend = np.clip(1 - dd / 0.01, 0, 1)[:, None]
P[head] = Ph * (1 - 0.5 * blend) + mir * 0.5 * blend
face_w = np.clip((P[:, 2] - 0.0) / 0.03, 0, 1) * np.clip(1 - np.abs(P[:, 0]) / 0.085, 0, 1) * np.clip((P[:, 1] - 1.40) / 0.03, 0, 1) * np.clip((1.62 - P[:, 1]) / 0.03, 0, 1)
fw = face_w[:, None]
for it in range(int(os.environ.get('FACE_SMOOTH', '25'))):
    P = P + fw * 0.5 * (L @ P - P)
    P = P - fw * 0.53 * (L @ P - P)

def normals(P, F):
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    N = np.zeros_like(P)
    for k in range(3): np.add.at(N, F[:, k], fn)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
N = normals(P, F)
mn, mx = P.min(0), P.max(0)
print('verts', n, 'tris', len(F), 'bbox', mn.round(3), mx.round(3))

# ---------- reference images (foreground filled outward so edges never sample background)
def prep(img, mask):
    idx = ndimage.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    return img[idx[0], idx[1]]
cut = np.array(Image.open(IN + 'front_cutout.png').convert('RGB')).astype(np.float32)
cut_m = cut.sum(2) > 60
cut_m = ndimage.binary_erosion(cut_m, iterations=2)
cut_f = prep(cut, cut_m)
t = np.array(Image.open(IN + 'turnaround.jpg').convert('RGB')).astype(np.float32)
bg = np.median(np.concatenate([t[:, :12], t[:, -12:]], 1), 1)
mxc, mnc = t.max(2), t.min(2)
sat = (mxc - mnc) / np.maximum(mxc, 1); lum = t.mean(2)
tm = (sat > 0.10) | (lum < 150) | ((lum - bg.mean(1)[:, None]) > 18)
tm[:75] = False
for (x0, x1, y0, y1) in [(40, 200, 170, 215), (500, 620, 170, 215), (900, 1030, 170, 215)]: tm[y0:y1, x0:x1] = False
tm = ndimage.binary_opening(tm, iterations=1)
tm = ndimage.binary_erosion(tm, iterations=1)
t_f = prep(t, tm)

# The figure's bounding box in each image, in pixels (x0, x1, y0, y1): measured
# by masking the non-background pixels (see `tm`) and taking their extent.
# view: name, image, figure bbox (x0,x1,y0,y1), horizontal axis function, view direction
views = [
    dict(name='front', img=t_f, box=(75, 478, 82, 748), h=lambda p: (p[:, 0] - mn[0]) / (mx[0] - mn[0]), d=np.array([0, 0, 1.0]), depth=lambda p: p[:, 2]),
    dict(name='back', img=t_f, box=(931, 1328, 82, 747), h=lambda p: (mx[0] - p[:, 0]) / (mx[0] - mn[0]), d=np.array([0, 0, -1.0]), depth=lambda p: -p[:, 2]),
    dict(name='left', img=t_f, box=(620, 770, 83, 748), h=lambda p: (mx[2] - p[:, 2]) / (mx[2] - mn[2]), d=np.array([1.0, 0, 0]), depth=lambda p: p[:, 0]),
    dict(name='right', img=t_f, box=(620, 770, 83, 748), h=lambda p: (mx[2] - p[:, 2]) / (mx[2] - mn[2]), d=np.array([-1.0, 0, 0]), depth=lambda p: -p[:, 0]),
]

def project(v, p):
    x0, x1, y0, y1 = v['box']
    u = v['h'](p); w = (mx[1] - p[:, 1]) / (mx[1] - mn[1])
    return x0 + u * (x1 - x0), y0 + w * (y1 - y0)

def zbuffer(v, P, F, res=2):
    # rasterise at half-pixel steps of the image, keep max depth (closest to camera)
    px, py = project(v, P)
    dz = v['depth'](P)
    H, W = v['img'].shape[:2]
    Z = np.full((H * res, W * res), -1e9)
    X, Y = px * res, py * res
    for a, b, c in F:
        xs = X[[a, b, c]]; ys = Y[[a, b, c]]
        xa, xb = int(np.floor(xs.min())), int(np.ceil(xs.max())); ya, yb = int(np.floor(ys.min())), int(np.ceil(ys.max()))
        if xb < 0 or yb < 0 or xa >= W * res or ya >= H * res: continue
        gx, gy = np.meshgrid(np.arange(max(xa, 0), min(xb, W * res - 1) + 1), np.arange(max(ya, 0), min(yb, H * res - 1) + 1))
        d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(d) < 1e-12: continue
        l0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d
        l1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d
        l2 = 1 - l0 - l1
        inside = (l0 >= -1e-3) & (l1 >= -1e-3) & (l2 >= -1e-3)
        if not inside.any(): continue
        z = l0 * dz[a] + l1 * dz[b] + l2 * dz[c]
        gxi, gyi, zi = gx[inside], gy[inside], z[inside]
        cur = Z[gyi, gxi]
        upd = zi > cur
        Z[gyi[upd], gxi[upd]] = zi[upd]
    return Z

def bilinear(img, x, y):
    H, W = img.shape[:2]
    x = np.clip(x, 0, W - 1.001); y = np.clip(y, 0, H - 1.001)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)

col = np.zeros((n, 3)); wsum = np.zeros(n)
for v in views:
    # visibility on the smoothed, subdivided mesh at image resolution
    Z = zbuffer(v, P, F, res=1)
    px, py = project(v, P)
    dz = v['depth'](P)
    H, W = v['img'].shape[:2]
    xi = np.clip(np.round(px).astype(int), 0, W - 1); yi = np.clip(np.round(py).astype(int), 0, H - 1)
    # compare against the closest depth in a small neighbourhood
    Zm = ndimage.maximum_filter(Z, size=3)
    vis = dz >= Zm[yi, xi] - 0.012 * (1 if v['name'] == 'front' else 1.5)
    ndot = np.clip(N @ v['d'], 0, 1)
    w = (ndot ** 3) * vis * {'front': 2.0, 'back': 1.4}.get(v['name'], 0.5)
    if v['name'] in ('left', 'right'): w = w * (P[:, 1] < 1.33)
    c = bilinear(v['img'], px, py)
    col += c * w[:, None]; wsum += w
    print(v['name'], 'visible', vis.mean().round(3))
known = wsum > 0.02
col[known] /= wsum[known, None]
# fill unknown vertices from neighbours
Abin = A.copy()
for it in range(60):
    if known.all(): break
    s = Abin @ (col * known[:, None]); c = Abin @ known.astype(float)
    newk = (~known) & (c > 0)
    col[newk] = s[newk] / c[newk, None]; known |= newk
# light smoothing of colours (reduces speckle, keeps edges mostly)
for it in range(1):
    col = 0.7 * col + 0.3 * (L @ col)
col = np.clip(col / 255.0, 0, 1)
col = np.where(col <= 0.04045, col / 12.92, ((col + 0.055) / 1.055) ** 2.4)  # sRGB -> linear
print('unknown left', (~known).sum())

np.save(WORK + 'paint_P.npy', P.astype(np.float32)); np.save(WORK + 'paint_F.npy', F.astype(np.uint32))
np.save(WORK + 'paint_C.npy', col.astype(np.float32)); np.save(WORK + 'paint_N.npy', N.astype(np.float32))
open(WORK + 'paint.bin', 'wb').write(P.astype(np.float32).tobytes() + N.astype(np.float32).tobytes() + col.astype(np.float32).tobytes() + F.astype(np.uint32).tobytes())
json.dump({'nv': int(n), 'nf': int(len(F)), 'bboxMin': mn.tolist(), 'bboxMax': mx.tolist()}, open(WORK + 'paint.json', 'w'))
print('done')
