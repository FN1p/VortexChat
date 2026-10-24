"""Regenerate browser toolbar icons from the simple VortexChat mark (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
SCALE = 8
def box(*coords):
    return tuple(round(value * SCALE) for value in coords)

canvas = Image.new('RGBA', (128 * SCALE, 128 * SCALE), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle(box(4, 4, 124, 124), radius=29 * SCALE, fill='#111827')
ring = box(24, 24, 104, 104)
draw.arc(ring, 140, 355, fill='#37d8ff', width=12 * SCALE)
draw.arc(ring, 355, 100, fill='#9272ff', width=12 * SCALE)
draw.polygon([box(28, 80)[:2], box(24, 108)[:2], box(54, 96)[:2]], fill='#37d8ff')
draw.line([box(61, 45)[:2], box(83, 64)[:2], box(61, 83)[:2]], fill='white', width=11 * SCALE, joint='curve')
for x, y in [(61, 45), (83, 64), (61, 83)]:
    draw.ellipse(box(x - 5.5, y - 5.5, x + 5.5, y + 5.5), fill='white')
for size in (16, 48, 128):
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(ROOT / f'icon{size}.png')
