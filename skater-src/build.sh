#!/bin/bash
# 打包：src + tpl → out/skate.html（发布时复制成仓库根目录的 skater.html）
set -e
cd "$(dirname "$0")"
ESB=/opt/npm-tools/node_modules/.bin/esbuild; [ -x "$ESB" ] || ESB="npx --yes esbuild@0.28.2"
THREE=/home/claude/mrdoob/three.js/build/three.module.js; [ -f "$THREE" ] || THREE="$PWD/node_modules/three/build/three.module.js"
[ -f "$THREE" ] || { echo "缺 three.js：先在这个文件夹运行 npm install three@0.187.0"; exit 1; }
mkdir -p out
$ESB src/main.js --bundle --minify --format=iife --target=es2020,safari15 \
  --alias:three="$THREE" --loader:.jpg=dataurl --loader:.txt=text --legal-comments=none --outfile=out/game.js --log-level=warning
python3 - <<'PY'
head=open('tpl/head.html').read(); body=open('tpl/body.html').read(); js=open('out/game.js').read()
js=js.replace('</script','<\\/script')
open('out/skate.html','w').write(head+body+'<script>\n'+js+'\n</script>\n</body>\n</html>\n')
PY
ls -la out/skate.html | awk '{print $5" bytes"}'
