#!/usr/bin/env python3
"""Crop 22.png to its visible mark (x 109-526, y 266-382) → public/assets/22-crop.png.
Writes a spec-compliant PNG: every row is prefixed with filter byte 0."""
import struct, zlib

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
    return w, h, channels, bytes(out), depth

def write_png(path, w, h, depth, color, raw_rows):
    # raw_rows: h * (1 + stride) with filter byte 0 prefix per row.
    def chunk(ctype, data):
        c = struct.pack(">I", len(data)) + ctype + data
        c += struct.pack(">I", zlib.crc32(ctype + data) & 0xFFFFFFFF)
        return c
    ihdr = struct.pack(">IIBBBBB", w, h, depth, color, 0, 0, 0)
    out = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(bytes(raw_rows), 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(out)

with open("public/assets/22.png", "rb") as f:
    data = f.read()

w, h, ch, px, depth = read_png(data)
minx, maxx = 109, 526
miny, maxy = 266, 382
cw = maxx - minx + 1   # 418
chh = maxy - miny + 1  # 117

stride = cw * ch
rows = bytearray()
for y in range(miny, maxy + 1):
    rows.append(0)  # filter byte: None
    src = y * w * ch
    rows += px[src + minx*ch : src + (maxx + 1)*ch]

write_png("public/assets/22-crop.png", cw, chh, depth, 6, bytes(rows))
print(f"wrote public/assets/22-crop.png ({cw}x{chh}), raw={len(rows)} bytes (expect {chh*(1+stride)})")
