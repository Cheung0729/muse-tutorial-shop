#!/usr/bin/env python3
# 生成单文件版 all-in-one.html（CSS/JS/二维码图片全部内联），备用链接用。
import base64, re, pathlib
root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "style.css").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "\n</style>")
def inline_js(m):
    src = (root / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return "<script>\n" + src + "\n</script>"
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)
img = base64.b64encode((root / "assets/alipay-qr.jpg").read_bytes()).decode()
html = html.replace('src="assets/alipay-qr.jpg"', 'src="data:image/jpeg;base64,' + img + '"')
(root / "all-in-one.html").write_text(html, encoding="utf-8")
print("all-in-one.html", len(html))
