"""Draw the app icons (three rising columns on a blue tile). Needs Pillow."""
from PIL import Image, ImageDraw

BG = (42, 120, 214)          # accent blue
COLS = [(255, 255, 255), (205, 226, 251), (255, 255, 255)]


def draw(size, padding_ratio, rounded):
    scale = 4
    s = size * scale
    img = Image.new('RGB', (s, s), BG)
    d = ImageDraw.Draw(img)
    pad = s * padding_ratio
    inner = s - 2 * pad
    base = pad + inner * 0.82
    widths = inner * 0.18
    gap = inner * 0.09
    heights = [0.38, 0.58, 0.78]
    x = pad + (inner - (3 * widths + 2 * gap)) / 2
    for i, hgt in enumerate(heights):
        top = base - inner * hgt
        d.rounded_rectangle([x, top, x + widths, base], radius=widths * 0.28, fill=COLS[i])
        x += widths + gap
    d.rounded_rectangle([pad, base + inner * 0.03, s - pad, base + inner * 0.07], radius=inner * 0.02, fill=(255, 255, 255))
    img = img.resize((size, size), Image.LANCZOS)
    if rounded:
        mask = Image.new('L', (size * scale, size * scale), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size * scale - 1, size * scale - 1], radius=size * scale * 0.22, fill=255)
        mask = mask.resize((size, size), Image.LANCZOS)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img


draw(180, 0.16, False).save('icons/apple-touch-icon.png')   # iOS rounds the corners itself
draw(192, 0.16, True).save('icons/icon-192.png')
draw(512, 0.16, True).save('icons/icon-512.png')
draw(512, 0.26, False).save('icons/icon-maskable-512.png')  # safe zone for maskable icons
print('icons written')
