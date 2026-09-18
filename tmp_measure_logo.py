#!/usr/bin/env python3
"""Crop 22.png to its visible mark and report dimensions for the waybill."""
import struct, zlib, io

def read_png(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos = 8
    ihdr = None
    idat = b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos+4])[0]
        ctype = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+length]
        if ctype == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", chunk)
        elif ctype == b"IDAT":
            idat += chunk
        pos += 12 + length
    w, h, depth, color, comp, filt, inter = ihdr
    raw = zlib.decompress(idat)
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
    stride = w * channels
    # un-filter
    out = bytearray()
    prev = bytearray(stride)
    i = 0
    for y in range(h):
        f = raw[i]; i += 1
        line = bytearray(raw[i:i+stride]); i += stride
        if f == 1:
            for x in range(channels, stride):
                line[x] = (line[x] + line[x-channels]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x-channels] if x >= channels else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x-channels] if x >= channels else 0
                b = prev[x]
                c = prev[x-channels] if x >= channels else 0
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        out += line
        prev = line
    return w, h, channels, bytes(out)

with open("public/assets/22.png", "rb") as f:
    data = f.read()

w, h, ch, px = read_png(data)
minx, miny, maxx, maxy = w, h, -1, -1
for y in range(h):
    row = y * w * ch
    for x in range(w):
        a = px[row + x*ch + (ch - 1)] if ch == 2 or ch == 4 else 255
        if a > 8:
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y

print(f"canvas: {w}x{h}, channels={ch}")
print(f"visible mark: x {minx}-{maxx} ({maxx-minx+1} px), y {miny}-{maxy} ({maxy-miny+1} px)")
print(f"aspect (w/h): {(maxx-minx+1)/(maxy-miny+1):.4f}")
