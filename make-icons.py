#!/usr/bin/env python3
# Regenerate the app icons (Pillow + DejaVu, no network):  python3 make-icons.py
from PIL import Image, ImageDraw, ImageFont

BG = (15, 23, 42, 255)      # slate-900
BARS = [(74, 222, 128, 255), (96, 165, 250, 255), (250, 204, 21, 255)]  # AUD USD KHR
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def icon(size, path, radius=0.22):
    s = size
    img = Image.new("RGBA", (s, s), BG)
    d = ImageDraw.Draw(img)

    # "A$" headline, then three bars that read like a rate table
    d.text((s * 0.5, s * 0.33), "A$", font=ImageFont.truetype(FONT, int(s * 0.30)),
           fill=(248, 250, 252, 255), anchor="mm")
    for i, (colour, w) in enumerate(zip(BARS, (0.56, 0.42, 0.28))):
        top = s * (0.54 + i * 0.115)
        d.rounded_rectangle([s * 0.22, top, s * (0.22 + w), top + s * 0.06],
                            radius=int(s * 0.03), fill=colour)

    if radius:   # rounded tile with a transparent outside
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius), fill=255)
        out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        img = out

    img.save(path)
    print("wrote", path)


icon(512, "icons/icon-512.png")
icon(192, "icons/icon-192.png")
icon(180, "icons/apple-touch-icon.png", radius=0)   # iOS wants a solid square
