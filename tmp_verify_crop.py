#!/usr/bin/env python3
"""Verify 22-crop.png: every edge row/column must contain visible pixels."""
import struct, zlib

data = open("public/assets/22-crop.png", "rb").read()
pos = 8; ihdr = None; idat = b""
while pos < len(data):
    ln = struct.unpack(">I", data[pos:pos+4])[0]
    ct = data[pos+4:pos+8]
    chunk = data[pos+8:pos+8+ln]
    if ct == b"IHDR": ihdr = struct.unpack(">IIBBBBB", chunk)
    elif ct == b"IDAT": idat += chunk
    pos += 12 + ln
w, h, depth, color, _, _, _ = ihdr
raw = zlib.decompress(idat)
ch = 4
stride = w * ch
prev = bytearray(stride)
i = 0
minx, miny, maxx, maxy = w, h, -1, -1
for y in range(h):
    f = raw[i]; i += 1
    line = bytearray(raw[i:i+stride]); i += stride
    if f == 1:
        for x in range(ch, stride): line[x] = (line[x] + line[x-ch]) & 255
    elif f == 2:
        for x in range(stride): line[x] = (line[x] + prev[x]) & 255
    elif f == 3:
        for x in range(stride):
            a = line[x-ch] if x >= ch else 0
            line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
    elif f == 4:
        for x in range(stride):
            a = line[x-ch] if x >= ch else 0
            b = prev[x]; c = prev[x-ch] if x >= ch else 0
            p = a + b - c
            pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
            pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
            line[x] = (line[x] + pr) & 255
    for x in range(w):
        if line[x*ch+3] > 8:
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
    prev = line
ok = minx == 0 and miny == 0 and maxx == w-1 and maxy == h-1
print(f"crop canvas {w}x{h}; visible x {minx}-{maxx}, y {miny}-{maxy}")
print("PASS: mark fills the crop edge-to-edge" if ok else "FAIL: padding remains")
