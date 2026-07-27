from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

ROOT = Path(r"C:\Users\alderighif\Documents\Capraia")
OUT = ROOT / "instagram_royal_casino"
BACKGROUND = Path(r"C:\Users\alderighif\.codex\generated_images\019f9dff-0421-74b0-94b9-bb542c253b63\exec-a4ca81f4-02c9-4fa9-b1df-2ded493dfd48.png")
TMP = Path(r"C:\Users\ALDERI~1\AppData\Local\Temp")

FILES = [
    "codex-clipboard-0b307cfd-b4b4-4372-bb88-d221a4e6410e.jpg",
    "codex-clipboard-70719dd7-d5ff-4002-aaa9-e77795f83fbb.jpg",
    "codex-clipboard-f06742d3-635c-4b4f-bcd9-393091f20690.jpg",
    "codex-clipboard-e4bb449c-27e5-4a39-a293-94d171c38321.jpg",
    "codex-clipboard-54cf6f12-467b-42f7-9248-197b10821c14.jpg",
    "codex-clipboard-bf28cbcc-b068-4533-bd46-03e504e6019a.jpg",
    "codex-clipboard-c635abad-8dce-40f5-a12b-5db185643480.jpg",
    "codex-clipboard-ca2905b6-94d9-4012-a47d-1057085c495c.jpg",
    "codex-clipboard-64db81ae-b83c-4223-bc0a-c41ef8427eed.jpg",
    "codex-clipboard-2eec3123-74a8-464d-9e4f-b8acc083130e.jpg",
    "codex-clipboard-68f9c1cf-7971-46b7-a8cd-65051a84867d.jpg",
    "codex-clipboard-8366c2e0-8c20-41ec-9cd8-467d4a3c39eb.jpg",
    "codex-clipboard-7a14246a-05c2-446f-ac31-5f0c067123b7.jpg",
    "codex-clipboard-57c5b1e8-51e2-4eaf-9ff0-0d871a40c1ec.jpg",
    "codex-clipboard-459217f3-a5f8-411d-ae89-79ca1d94232b.jpg",
    "codex-clipboard-6d58a229-ee7a-4516-9c88-38285b282811.jpg",
    "codex-clipboard-f6f8c9b8-288a-4413-8232-47e300c42a0e.jpg",
    "codex-clipboard-2b094a9e-6930-4571-b901-2379f7a270d5.jpg",
    "codex-clipboard-c93e9374-4141-4c80-982a-fc20a34fb620.jpg",
    "codex-clipboard-f272e4b1-2df0-415a-b925-40d793e36167.jpg",
    "codex-clipboard-7d09d2b3-399c-4bef-979a-60fa1d065615.jpg",
    "codex-clipboard-24da8329-3ecc-4ec5-a083-454e7449561f.jpg",
    "codex-clipboard-aa3f8010-82f7-400e-b985-f2599c911368.jpg",
    "codex-clipboard-169191a7-e94b-41c7-a7ad-23b263bbcf7c.jpg",
]

# The three kit portraits form the "new signings" carousel; the remaining
# pictures are distributed in chronological order across four carousels.
GROUPS = [
    ("01_nuovi_acquisti", [5, 7, 10]),
    ("02_royal_casino", [1, 2, 3, 4, 6]),
    ("03_royal_casino", [8, 9, 11, 12, 13]),
    ("04_royal_casino", [14, 15, 16, 17, 18]),
    ("05_royal_casino", [19, 20, 21, 22, 23, 24]),
]

W, H = 1080, 1350
GOLD = (211, 169, 87)
WHITE_GOLD = (243, 223, 175)
FONT_BOLD = Path(r"C:\Windows\Fonts\georgiab.ttf")
FONT_REG = Path(r"C:\Windows\Fonts\georgia.ttf")


def fit_with_scene_preserved(im: Image.Image, backdrop: Image.Image) -> Image.Image:
    im = ImageOps.exif_transpose(im).convert("RGB")
    src_w, src_h = im.size
    # Preserve the complete original frame so tables, cards, chips, trophies,
    # cues and other scene elements are never cropped for the Instagram ratio.
    scale = min(W / src_w, H / src_h)
    new_w, new_h = round(src_w * scale), round(src_h * scale)
    photo = im.resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas = backdrop.resize((W, H), Image.Resampling.LANCZOS).copy()
    canvas = Image.blend(canvas, Image.new("RGB", (W, H), (4, 14, 37)), 0.28)
    canvas.paste(photo, ((W - new_w) // 2, (H - new_h) // 2))
    return canvas


def alpha_gradient(top_alpha: int, bottom_alpha: int, start: int, end: int) -> Image.Image:
    mask = Image.new("L", (W, H), 0)
    px = mask.load()
    for y in range(H):
        if y <= start:
            a = top_alpha
        elif y >= end:
            a = bottom_alpha
        else:
            t = (y - start) / max(1, end - start)
            a = int(top_alpha * (1 - t) + bottom_alpha * t)
        for x in range(W):
            px[x, y] = a
    return mask


def add_gold_frame(im: Image.Image, number: int) -> Image.Image:
    out = im.convert("RGBA")
    draw = ImageDraw.Draw(out, "RGBA")
    # Depth at the edges focuses attention toward the portrait.
    vignette = Image.new("L", (W, H), 0)
    vpx = vignette.load()
    for y in range(H):
        for x in range(W):
            d = min(x, W - 1 - x, y, H - 1 - y)
            vpx[x, y] = max(0, min(92, int((60 - min(60, d)) * 1.45)))
    shadow = Image.new("RGBA", (W, H), (0, 8, 25, 0))
    shadow.putalpha(vignette)
    out = Image.alpha_composite(out, shadow)

    # A restrained art-deco double-line frame with corner geometry.
    draw = ImageDraw.Draw(out, "RGBA")
    draw.rounded_rectangle((22, 22, W - 22, H - 22), radius=16, outline=(*GOLD, 205), width=4)
    draw.rounded_rectangle((38, 38, W - 38, H - 38), radius=12, outline=(*WHITE_GOLD, 112), width=2)
    for left in (38, W - 190):
        for top in (38, H - 190):
            if left < W / 2 and top < H / 2:
                pts = [(left, top + 112), (left + 40, top + 72), (left + 40, top + 26), (left + 112, top + 26)]
            elif left >= W / 2 and top < H / 2:
                pts = [(left + 152, top + 112), (left + 112, top + 72), (left + 112, top + 26), (left + 40, top + 26)]
            elif left < W / 2:
                pts = [(left, top + 40), (left + 40, top + 80), (left + 40, top + 126), (left + 112, top + 126)]
            else:
                pts = [(left + 152, top + 40), (left + 112, top + 80), (left + 112, top + 126), (left + 40, top + 126)]
            draw.line(pts, fill=(*GOLD, 205), width=4, joint="curve")

    # Glassy title plate and subtle suits.
    plate = Image.new("RGBA", (W, 94), (1, 13, 40, 180))
    out.alpha_composite(plate, (0, 48))
    draw = ImageDraw.Draw(out, "RGBA")
    title = "ROYAL CASINÒ"
    subtitle = "CAPRAIA FOOTBALL CLUB"
    ft = ImageFont.truetype(str(FONT_BOLD), 40)
    fs = ImageFont.truetype(str(FONT_REG), 16)
    bbox = draw.textbbox((0, 0), title, font=ft)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, 58), title, font=ft, fill=(*WHITE_GOLD, 245))
    bbox = draw.textbbox((0, 0), subtitle, font=fs)
    sw = bbox[2] - bbox[0]
    draw.text(((W - sw) // 2, 104), subtitle, font=fs, fill=(*GOLD, 220))
    suits = ["♠", "♦", "♣", "♥"]
    suit_font = ImageFont.truetype(str(FONT_REG), 38)
    for pos, suit in zip([(80, 102), (W - 112, 102), (80, H - 110), (W - 112, H - 110)], suits):
        draw.text(pos, suit, font=suit_font, fill=(*GOLD, 150))
    count = f"{number:02d}"
    fnum = ImageFont.truetype(str(FONT_BOLD), 18)
    draw.text((W - 100, H - 80), count, font=fnum, fill=(*WHITE_GOLD, 210))
    return out.convert("RGB")


def stylize(source: Path, number: int, bg: Image.Image) -> Image.Image:
    photo = fit_with_scene_preserved(Image.open(source), bg)
    photo = ImageEnhance.Brightness(photo).enhance(1.14)
    photo = ImageEnhance.Contrast(photo).enhance(1.09)
    photo = ImageEnhance.Color(photo).enhance(1.08)
    # The generated art-deco visual is applied at low opacity to establish a shared visual tone.
    bg_tint = bg.resize((W, H), Image.Resampling.LANCZOS).convert("RGB")
    photo = Image.blend(photo, bg_tint, 0.13)
    # Brighten the central portrait zone without changing the identity or pose.
    glow = Image.new("RGBA", (W, H), (255, 218, 150, 0))
    mask = Image.new("L", (W, H), 0)
    mp = mask.load()
    cx, cy = W // 2, int(H * 0.53)
    for y in range(H):
        for x in range(W):
            dx = (x - cx) / (W * 0.56)
            dy = (y - cy) / (H * 0.42)
            r = dx * dx + dy * dy
            mp[x, y] = int(max(0, 34 * (1 - r)))
    glow.putalpha(mask.filter(ImageFilter.GaussianBlur(14)))
    result = Image.alpha_composite(photo.convert("RGBA"), glow)
    return add_gold_frame(result, number)


def make_contact_sheet(items: list[Path]) -> None:
    thumb_w, thumb_h = 216, 270
    sheet = Image.new("RGB", (thumb_w * 6, thumb_h * 4), (7, 17, 37))
    for idx, p in enumerate(items):
        im = Image.open(p).convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        sheet.paste(im, ((idx % 6) * thumb_w, (idx // 6) * thumb_h))
    sheet.save(OUT / "anteprima_completa.jpg", quality=88, optimize=True)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    bg = Image.open(BACKGROUND).convert("RGB")
    produced = []
    readme = ["POST INSTAGRAM — ROYAL CASINÒ", "Formato: 1080 × 1350 px (4:5)", ""]
    for group, entries in GROUPS:
        folder = OUT / group
        folder.mkdir(exist_ok=True)
        readme.append(group)
        for order, index in enumerate(entries, start=1):
            source = TMP / FILES[index - 1]
            target = folder / f"{order:02d}_royal_casino.jpg"
            image = stylize(source, index, bg)
            image.save(target, quality=92, optimize=True)
            produced.append(target)
            readme.append(f"  {order:02d}  ←  {FILES[index - 1]}")
        readme.append("")
    make_contact_sheet(produced)
    (OUT / "ordine_caroselli.txt").write_text("\n".join(readme), encoding="utf-8")


if __name__ == "__main__":
    main()
