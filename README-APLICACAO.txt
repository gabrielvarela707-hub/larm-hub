Substitua na raiz do repositório frontend apenas:
- package.json
- package-lock.json

Depois execute:
  git add package.json package-lock.json
  git commit -m "Corrige package do frontend para deploy na Vercel"
  git push origin main

Na Vercel, o Root Directory deve apontar para a pasta onde este package.json está localizado.
