# Texture atlas (sharp face from the close-up), skeleton fitted to the mesh,
# skin weights, and a skinned, textured .glb.
import os, sys
# Usage: python3 tools/avatar/build_glb.py [model folder]   (default: tools/avatar/alv)
# The folder holds mesh.glb (untextured shape), turnaround.jpg (front / side /
# back sheet), front_cutout.png and closeup.jpg. Intermediate files go to
# <folder>/build/ (git-ignored). See tools/avatar/README.md.
SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'alv'))
WORK = os.path.join(SRC, 'build') + '/'
os.makedirs(WORK, exist_ok=True)
IN = SRC + '/'
import json, struct, io, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage, sparse

P = np.load(WORK + 'paint_P.npy').astype(np.float64)
F = np.load(WORK + 'paint_F.npy').astype(np.int64)
N = np.load(WORK + 'paint_N.npy').astype(np.float64)
C = np.load(WORK + 'paint_C.npy').astype(np.float64)  # linear vertex colours (fallback)
n = len(P)
mn, mx = P.min(0), P.max(0)

# ---------------- images
t = np.array(Image.open(IN + 'turnaround.jpg').convert('RGB')).astype(np.float32)
bg = np.median(np.concatenate([t[:, :12], t[:, -12:]], 1), 1)
mxc, mnc = t.max(2), t.min(2)
sat = (mxc - mnc) / np.maximum(mxc, 1); lum = t.mean(2)
tm = (sat > 0.10) | (lum < 150) | ((lum - bg.mean(1)[:, None]) > 18)
tm[:75] = False
for (x0, x1, y0, y1) in [(40, 200, 170, 215), (500, 620, 170, 215), (900, 1030, 170, 215)]: tm[y0:y1, x0:x1] = False
tm = ndimage.binary_opening(tm, iterations=1)
tm = ndimage.binary_erosion(tm, iterations=1)
idx = ndimage.distance_transform_edt(~tm, return_distances=False, return_indices=True)
tf = t[idx[0], idx[1]]
cut = np.array(Image.open(IN + 'front_cutout.png').convert('RGB')).astype(np.float32)
cm = ndimage.binary_erosion(cut.sum(2) > 60, iterations=2)
ci = ndimage.distance_transform_edt(~cm, return_distances=False, return_indices=True)
cutf = cut[ci[0], ci[1]]
z = np.array(Image.open(IN + 'closeup.jpg').convert('RGB')).astype(np.float32)

# affine: turnaround coords -> close-up coords. Pixel positions of the left eye,
# right eye and mouth centre, read off both images by hand.
src = np.array([[262, 134], [288, 134], [275, 161]], float)
dst = np.array([[644, 220], [732, 218], [672, 308]], float)
Am = np.c_[src, np.ones(3)]
Mx = np.linalg.lstsq(Am, dst, rcond=None)[0]  # 3x2

def bilinear(img, x, y):
    H, W = img.shape[:2]
    x = np.clip(x, 0, W - 1.001); y = np.clip(y, 0, H - 1.001)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    return img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy

# Atlas A: front figure x 60..490, y 75..755 at x4, face blended from the close-up.
AX0, AY0, AX1, AY1, AS = 60, 75, 490, 755, 4
aw, ah = (AX1 - AX0) * AS, (AY1 - AY0) * AS
gy, gx = np.mgrid[0:ah, 0:aw].astype(np.float32)
tx = AX0 + (gx + 0.5) / AS - 0.5; ty = AY0 + (gy + 0.5) / AS - 0.5
A_img = bilinear(tf, tx, ty)
# face ellipse in turnaround pixels (centre, radii), feathered
fc, fr = (276.0, 146.5), (21.0, 22.5)
e = np.sqrt(((tx - fc[0]) / fr[0]) ** 2 + ((ty - fc[1]) / fr[1]) ** 2)
wface = np.clip((1.0 - e) / 0.28, 0, 1)
# CLOSEUP=1 blends in the face from closeup.jpg (sharper, but a different face shape).
wface = wface * wface * (3 - 2 * wface) * float(os.environ.get('CLOSEUP', '0'))
zx = tx * Mx[0, 0] + ty * Mx[1, 0] + Mx[2, 0]; zy = tx * Mx[0, 1] + ty * Mx[1, 1] + Mx[2, 1]
Z_img = bilinear(z, zx, zy)
# match close-up colour to the turnaround (mean/std over the blend area)
msk = wface > 0.5
for c in range(3 if msk.any() else 0):
    a, b = Z_img[..., c][msk], A_img[..., c][msk]
    Z_img[..., c] = (Z_img[..., c] - a.mean()) * (b.std() / max(a.std(), 1)) * 0.85 + b.mean() * 0.25 + a.mean() * 0.75
A_img = A_img * (1 - wface[..., None]) + np.nan_to_num(Z_img) * wface[..., None]
# Atlas B: side + back x 560..1376, y 75..755 at x2
BX0, BY0, BX1, BY1, BS = 560, 75, 1376, 755, 2
bw, bh = (BX1 - BX0) * BS, (BY1 - BY0) * BS
gy, gx = np.mgrid[0:bh, 0:bw].astype(np.float32)
B_img = bilinear(tf, BX0 + (gx + 0.5) / BS - 0.5, BY0 + (gy + 0.5) / BS - 0.5)
TW, TH = 4096, 2720
tex = np.full((TH, TW, 3), 255, np.float32)
tex[:ah, :aw] = A_img
tex[:bh, 1760:1760 + bw] = B_img
CX0, CY0, CX1, CY1 = 300, 820, 1110, 1380
tex[1400:1400 + (CY1 - CY0), 1760:1760 + (CX1 - CX0)] = cutf[CY0:CY1, CX0:CX1]
WHITE = ((TW - 20 + 0.5) / TW, (TH - 20 + 0.5) / TH)
tex_img = Image.fromarray(np.clip(tex, 0, 255).astype(np.uint8))
tex_img.resize((TW // 2, TH // 2)).save(WORK + 'atlas_preview.jpg', quality=85)
buf = io.BytesIO(); tex_img.save(buf, 'JPEG', quality=90); tex_bytes = buf.getvalue()
print('texture', len(tex_bytes) // 1024, 'KB')

# ---------------- projection per view (same mapping as paint.py)
views = {
    'front': dict(box=(75, 478, 82, 748), h=lambda p: (p[:, 0] - mn[0]) / (mx[0] - mn[0]), d=np.array([0, 0, 1.0]), dep=lambda p: p[:, 2], atlas='A'),
    'low': dict(box=(311, 1094, 40, 1358), h=lambda p: (p[:, 0] - mn[0]) / (mx[0] - mn[0]), d=np.array([0, 0, 1.0]), dep=lambda p: p[:, 2], atlas='C'),
    'back': dict(box=(931, 1328, 82, 747), h=lambda p: (mx[0] - p[:, 0]) / (mx[0] - mn[0]), d=np.array([0, 0, -1.0]), dep=lambda p: -p[:, 2], atlas='B'),
    'left': dict(box=(620, 770, 83, 748), h=lambda p: (mx[2] - p[:, 2]) / (mx[2] - mn[2]), d=np.array([1.0, 0, 0]), dep=lambda p: p[:, 0], atlas='B'),
    'right': dict(box=(620, 770, 83, 748), h=lambda p: (mx[2] - p[:, 2]) / (mx[2] - mn[2]), d=np.array([-1.0, 0, 0]), dep=lambda p: -p[:, 0], atlas='B'),
}
def proj(v, p):
    x0, x1, y0, y1 = v['box']
    return x0 + v['h'](p) * (x1 - x0), y0 + (mx[1] - p[:, 1]) / (mx[1] - mn[1]) * (y1 - y0)
def to_uv(v, ix, iy):
    if v['atlas'] == 'C':
        return (1760 + ix - CX0) / TW, (1400 + iy - CY0) / TH
    if v['atlas'] == 'A':
        px = (ix - AX0) * AS; py = (iy - AY0) * AS
        return px / TW, py / TH
    px = 1760 + (ix - BX0) * BS; py = (iy - BY0) * BS
    return px / TW, py / TH
def zbuf(v, H=1400, W=1400):
    px, py = proj(v, P); dz = v['dep'](P)
    Zb = np.full((H, W), -1e9)
    for a, b, c in F:
        xs = px[[a, b, c]]; ys = py[[a, b, c]]
        xa, xb = int(np.floor(xs.min())), int(np.ceil(xs.max())); ya, yb = int(np.floor(ys.min())), int(np.ceil(ys.max()))
        gxx, gyy = np.meshgrid(np.arange(max(xa, 0), min(xb, W - 1) + 1), np.arange(max(ya, 0), min(yb, H - 1) + 1))
        d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(d) < 1e-12 or gxx.size == 0: continue
        l0 = ((ys[1] - ys[2]) * (gxx - xs[2]) + (xs[2] - xs[1]) * (gyy - ys[2])) / d
        l1 = ((ys[2] - ys[0]) * (gxx - xs[2]) + (xs[0] - xs[2]) * (gyy - ys[2])) / d
        l2 = 1 - l0 - l1
        ins = (l0 >= -1e-3) & (l1 >= -1e-3) & (l2 >= -1e-3)
        if not ins.any(): continue
        zz = (l0 * dz[a] + l1 * dz[b] + l2 * dz[c])[ins]
        gi, gj = gxx[ins], gyy[ins]
        cur = Zb[gj, gi]; up = zz > cur
        Zb[gj[up], gi[up]] = zz[up]
    return ndimage.maximum_filter(Zb, size=3)

vis, pxy = {}, {}
for k, v in views.items():
    Zb = zbuf(v)
    px, py = proj(v, P)
    xi = np.clip(np.round(px).astype(int), 0, 1399); yi = np.clip(np.round(py).astype(int), 0, 1399)
    vis[k] = v['dep'](P) >= Zb[yi, xi] - 0.012
    pxy[k] = (px, py)

# per triangle: best view by face normal, textured only if all 3 vertices are visible there
fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
names = list(views)
score = np.stack([fn @ views[k]['d'] * {'front': 1.25, 'back': 1.1}.get(k, 1.0) for k in names], 1)
cy = P[F].mean(1)
li, fi_ = names.index('low'), names.index('front')
score[:, li] = np.where(cy[:, 1] < 0.6, score[:, fi_] + 0.01, -9)
score[:, fi_] = np.where(cy[:, 1] < 0.6, -9, score[:, fi_])
headFront = cy[:, 1] > 1.33
for k in ('left', 'right'): score[:, names.index(k)] = np.where(headFront, -9, score[:, names.index(k)])
best = score.argmax(1)
key2vid = {}
outP, outN, outUV, outC, outI, src_v = [], [], [], [], [], []
textured = 0
for fi, tri in enumerate(F):
    k = names[best[fi]]
    ok = score[fi, best[fi]] > (0.15 if k in ('front', 'back', 'low') else 0.75) and all(vis[k][v] for v in tri)
    if ok and k not in ('front', 'low'):
        for v in tri:
            u, w = to_uv(views[k], pxy[k][0][v], pxy[k][1][v])
            ts = tex[min(TH - 1, int(w * TH)), min(TW - 1, int(u * TW))] / 255.0
            vc = np.where(C[v] <= 0.0031308, C[v] * 12.92, 1.055 * np.power(np.maximum(C[v], 0), 1 / 2.4) - 0.055)
            if np.abs(ts - vc).mean() > 0.16: ok = False; break
    textured += ok
    for v in tri:
        key = (v, best[fi]) if ok else (v, -1)
        vid = key2vid.get(key)
        if vid is None:
            vid = len(outP); key2vid[key] = vid
            outP.append(P[v]); outN.append(N[v]); src_v.append(v)
            if ok:
                u, w = to_uv(views[k], pxy[k][0][v], pxy[k][1][v]); outUV.append((u, w)); outC.append((1, 1, 1))
            else:
                outUV.append(WHITE); outC.append(C[v])
        outI.append(vid)
outP = np.array(outP, np.float32); outN = np.array(outN, np.float32); outUV = np.array(outUV, np.float32); outC = np.array(outC, np.float32)
outI = np.array(outI, np.uint32); src_v = np.array(src_v)
print('verts', len(outP), 'tris', len(outI) // 3, 'textured', round(textured / len(F), 3))

# ---------------- skeleton fitted to this mesh (A-pose)
def leg_x(y):
    m = (np.abs(P[:, 1] - y) < 0.012) & (P[:, 0] > 0.02) & (P[:, 0] < 0.2)
    return P[m, 0].mean(), P[m, 2].mean()
bones = []
def bone(name, parent, pos): bones.append(dict(name=name, parent=parent, pos=np.array(pos, float)))
bone('hips', None, [0, 0.93, 0.0])
bone('spine', 'hips', [0, 1.04, -0.005])
bone('chest', 'spine', [0, 1.2, -0.01])
bone('neck', 'chest', [0, 1.38, -0.01])
bone('head', 'neck', [0, 1.46, 0.0])
for s, sd in ((1, 'L'), (-1, 'R')):
    J = np.array([s * 0.165, 1.31, -0.01]); Wr = np.array([s * 0.452, 0.925, 0.07]); E = J + 0.53 * (Wr - J) + [0, 0, -0.015]
    bone('shoulder' + sd, 'chest', [s * 0.06, 1.34, -0.01])
    bone('upperArm' + sd, 'shoulder' + sd, J)
    bone('foreArm' + sd, 'upperArm' + sd, E)
    bone('hand' + sd, 'foreArm' + sd, Wr)
    hx, hz = leg_x(0.86); kx, kz = leg_x(0.47); ax, az = leg_x(0.085)
    bone('thigh' + sd, 'hips', [s * hx, 0.86, hz])
    bone('shin' + sd, 'thigh' + sd, [s * kx, 0.47, kz])
    bone('foot' + sd, 'shin' + sd, [s * ax, 0.085, az - 0.01])
    bone('toe' + sd, 'foot' + sd, [s * ax, 0.03, az + 0.08])
bi = {b['name']: i for i, b in enumerate(bones)}
handTip = {'L': np.array([0.512, 0.83, 0.09]), 'R': np.array([-0.512, 0.83, 0.09])}
# segments for distance weighting: (bone, a, b)
segs = []
def child_pos(name):
    for b in bones:
        if b['parent'] == name: return b['pos']
for b in bones:
    nm = b['name']
    end = child_pos(nm)
    if nm.startswith('hand'): end = handTip[nm[-1]]
    if nm.startswith('toe'): end = b['pos'] + [0, 0, 0.06]
    if nm == 'head': end = b['pos'] + [0, 0.16, 0]
    if nm.startswith('shoulder'): end = bones[bi['upperArm' + nm[-1]]]['pos']
    if nm == 'chest': end = bones[bi['neck']]['pos']
    segs.append((bi[nm], b['pos'], end))

def segdist(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)
D = np.stack([segdist(P, a, b) for _, a, b in segs], 1)
boneOf = np.array([s[0] for s in segs])
# masks: hair (dark), skirt zone, arms only reachable away from the torso
lumv = C.mean(1)
hair = (lumv < 0.03) & (P[:, 1] > 0.95)
isArm = np.array([bones[b]['name'][:-1] in ('upperArm', 'foreArm', 'hand') for b in boneOf])
isLeg = np.array([bones[b]['name'][:-1] in ('thigh', 'shin', 'foot', 'toe') for b in boneOf])
armOK = (np.abs(P[:, 0]) > 0.15) & ~hair
D[:, isArm] += np.where(armOK, 0, 1.0)[:, None]
# the skirt hangs from the hips: legs only influence it weakly near the hem
skirt = (P[:, 1] > 0.5) & (P[:, 1] < 0.93) & (np.abs(P[:, 0]) < 0.3)
legDist = D[:, isLeg].min(1)
inSkirtShell = skirt & (legDist > 0.025)
D[:, isLeg] += np.where(inSkirtShell, 0.05, 0)[:, None]
# hair follows head / neck / chest only
nonHead = np.array([bones[b]['name'] not in ('head', 'neck', 'chest', 'spine') for b in boneOf])
D[:, nonHead] += np.where(hair, 1.0, 0)[:, None]
Wt = 1.0 / np.maximum(D, 0.004) ** 4
# smooth weights over the surface
I = np.concatenate([F[:, 0], F[:, 1], F[:, 2], F[:, 1], F[:, 2], F[:, 0]]); Jj = np.concatenate([F[:, 1], F[:, 2], F[:, 0], F[:, 0], F[:, 1], F[:, 2]])
Adj = sparse.coo_matrix((np.ones(len(I)), (I, Jj)), shape=(n, n)).tocsr(); Adj.data[:] = 1
L = sparse.diags(1 / np.asarray(Adj.sum(1)).ravel()) @ Adj
Wt /= Wt.sum(1, keepdims=True)
for it in range(6): Wt = 0.5 * Wt + 0.5 * (L @ Wt)
order = np.argsort(-Wt, 1)[:, :4]
w4 = np.take_along_axis(Wt, order, 1); w4 /= w4.sum(1, keepdims=True)
j4 = boneOf[order]
J4 = j4[src_v].astype(np.uint16); W4 = w4[src_v].astype(np.float32)

# ---------------- write glb
chunks = []; views_ = []; accs = []
def add_buf(arr, target=None):
    b = arr.tobytes(); off = sum(len(c) for c in chunks)
    pad = (-len(b)) % 4; chunks.append(b + b'\0' * pad)
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(b)}
    if target: v['target'] = target
    views_.append(v); return len(views_) - 1
def add_acc(arr, ctype, typ, target=None, minmax=False, norm=False):
    bv = add_buf(arr, target)
    a = {'bufferView': bv, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if norm: a['normalized'] = True
    if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
aP = add_acc(outP, 5126, 'VEC3', 34962, True)
aN = add_acc(outN, 5126, 'VEC3', 34962)
aT = add_acc(outUV, 5126, 'VEC2', 34962)
aC = add_acc(outC, 5126, 'VEC3', 34962)
aJ = add_acc(J4, 5123, 'VEC4', 34962)
aW = add_acc(W4, 5126, 'VEC4', 34962)
aI = add_acc(outI, 5125, 'SCALAR', 34963)
ibm = []
for b in bones:
    m = np.eye(4, dtype=np.float32); m[:3, 3] = -b['pos']; ibm.append(m.T.reshape(-1))
aB = add_acc(np.array(ibm, np.float32), 5126, 'MAT4')
img_bv = add_buf(np.frombuffer(tex_bytes, np.uint8))
nodes = [{'name': 'Alven', 'mesh': 0, 'skin': 0}]
for b in bones:
    par = b['parent']
    rel = b['pos'] - (bones[bi[par]]['pos'] if par else 0)
    nodes.append({'name': b['name'], 'translation': rel.tolist()})
for i, b in enumerate(bones):
    kids = [j + 1 for j, c in enumerate(bones) if c['parent'] == b['name']]
    if kids: nodes[i + 1]['children'] = kids
root = {'name': 'AlvenRig', 'children': [0, 1]}
nodes.append(root)
gl = {
    'asset': {'version': '2.0', 'generator': 'Duskwood avatar builder'},
    'scene': 0, 'scenes': [{'nodes': [len(nodes) - 1]}], 'nodes': nodes,
    'meshes': [{'name': 'Alven', 'primitives': [{'attributes': {'POSITION': aP, 'NORMAL': aN, 'TEXCOORD_0': aT, 'COLOR_0': aC, 'JOINTS_0': aJ, 'WEIGHTS_0': aW}, 'indices': aI, 'material': 0}]}],
    'skins': [{'joints': list(range(1, len(bones) + 1)), 'inverseBindMatrices': aB, 'skeleton': 1}],
    'materials': [{'name': 'Alven', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 0.75}, 'doubleSided': True}],
    'textures': [{'source': 0, 'sampler': 0}], 'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
    'images': [{'bufferView': img_bv, 'mimeType': 'image/jpeg'}],
    'accessors': accs, 'bufferViews': views_,
}
binb = b''.join(chunks)
gl['buffers'] = [{'byteLength': len(binb)}]
js = json.dumps(gl).encode(); js += b' ' * ((-len(js)) % 4)
out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binb), b'BIN\0') + binb
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'avatars', os.path.basename(SRC) + '.glb'), 'wb').write(out)
print('glb', len(out) // 1024, 'KB', 'bones', len(bones))
